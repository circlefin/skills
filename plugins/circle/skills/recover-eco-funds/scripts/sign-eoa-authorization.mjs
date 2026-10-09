#!/usr/bin/env node
// Sign a USDC ERC-3009 authorization with a Circle Agent Wallet's backing EOA
// that moves the EOA's USDC into the Agent Wallet, then print the
// `circle wallet execute` commands that submit it. Needs Node.js 20.18.2+ and
// the public @circle-fin/cli, logged in with `circle wallet login`.

import { execFile } from "node:child_process";
import {
  constants,
  createHash,
  createPublicKey,
  publicEncrypt,
  randomBytes,
  randomUUID,
  webcrypto,
} from "node:crypto";
import { existsSync, readFileSync, realpathSync } from "node:fs";
import { createRequire } from "node:module";
import { homedir, platform } from "node:os";
import { delimiter, dirname, join } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

// Circle chain code -> [EVM chain ID, testnet]
const CHAINS = {
  ETH: [1, false], MATIC: [137, false], ARB: [42161, false], AVAX: [43114, false],
  OP: [10, false], BASE: [8453, false], UNI: [130, false], MONAD: [143, false],
  ARC: [5042, false], "ETH-SEPOLIA": [11155111, true], "MATIC-AMOY": [80002, true],
  "ARB-SEPOLIA": [421614, true], "AVAX-FUJI": [43113, true], "OP-SEPOLIA": [11155420, true],
  "BASE-SEPOLIA": [84532, true], "UNI-SEPOLIA": [1301, true], "ARC-TESTNET": [5042002, true],
};
const TRANSFER_WITH_AUTHORIZATION =
  "transferWithAuthorization(address,address,uint256,uint256,uint256,bytes32,uint8,bytes32,bytes32)";
const AUTHORIZATION_TYPES = {
  TransferWithAuthorization: [
    { name: "from", type: "address" },
    { name: "to", type: "address" },
    { name: "value", type: "uint256" },
    { name: "validAfter", type: "uint256" },
    { name: "validBefore", type: "uint256" },
    { name: "nonce", type: "bytes32" },
  ],
};
const DOMAIN_TYPE = [
  { name: "name", type: "string" },
  { name: "version", type: "string" },
  { name: "chainId", type: "uint256" },
  { name: "verifyingContract", type: "address" },
];

// --- Inputs ------------------------------------------------------------------

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 2) {
    if (!argv[index].startsWith("--") || argv[index + 1] === undefined) {
      throw new Error(`Unexpected argument ${argv[index]}.`);
    }
    args[argv[index].slice(2)] = argv[index + 1];
  }
  for (const name of ["chain", "eoa", "sca", "usdc", "amount-atomic"]) {
    if (!args[name]) throw new Error(`Missing --${name}.`);
  }
  for (const name of ["eoa", "sca", "usdc"]) {
    if (!/^0x[0-9a-fA-F]{40}$/.test(args[name])) throw new Error(`--${name} must be an address.`);
  }
  if (!/^[1-9][0-9]*$/.test(args["amount-atomic"])) {
    throw new Error("--amount-atomic must be a positive whole number (USDC x 1,000,000).");
  }
  args.chain = args.chain.toUpperCase();
  if (!CHAINS[args.chain]) throw new Error(`Unsupported chain ${args.chain}.`);
  return args;
}

// --- Session saved by `circle wallet login` ----------------------------------

async function keychainLoad(account) {
  const command = {
    darwin: ["/usr/bin/security", ["find-generic-password", "-s", "circle-cli", "-a", account, "-w"]],
    linux: ["/usr/bin/secret-tool", ["lookup", "app", "circle-cli", "account", account]],
  }[platform()];
  if (!command) return null;
  try {
    return (await execFileAsync(command[0], command[1], { timeout: 5_000 })).stdout.trim() || null;
  } catch {
    return null;
  }
}

async function loadSession(testnet) {
  const home = process.env.CIRCLE_CLI_HOME ?? join(homedir(), ".circle-cli");
  const file = join(home, "profiles", "agent", "session.json");
  const slotName = testnet ? "testnet" : "mainnet";
  const slot = existsSync(file) ? JSON.parse(readFileSync(file, "utf8"))[slotName] : undefined;
  if (!slot) return null;
  const secrets = slot.userToken
    ? slot
    : JSON.parse((await keychainLoad(`agent-session-${slotName}`)) ?? "null");
  const session = { ...slot, ...secrets };
  const complete = ["userToken", "encryptionKey", "encryptedUserSecret", "storageKey", "deviceId"]
    .every((field) => session[field]);
  return complete && Date.now() < session.expiresAt ? session : null;
}

// --- Circle API --------------------------------------------------------------

function circleApi(baseUrl, userToken) {
  return async (method, path, { body, headers = {}, auth = true } = {}) => {
    const response = await fetch(`${baseUrl}${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(auth ? { "X-User-Token": userToken } : {}),
        ...headers,
      },
      body,
      signal: AbortSignal.timeout(30_000),
    });
    const text = await response.text();
    if (!response.ok) {
      throw new Error(`Circle ${method} ${path.split("?")[0]} failed (${response.status}): ${text.slice(0, 300)}`);
    }
    return text ? JSON.parse(text) : {};
  };
}

// --- Challenge approval (same scheme as the Circle CLI) ----------------------

const sha256 = (bytes) => createHash("sha256").update(bytes).digest();
const upperHex = (bytes) => Buffer.from(bytes).toString("hex").toUpperCase();

async function aesKey(base64OrBytes, usage) {
  const raw = typeof base64OrBytes === "string" ? Buffer.from(base64OrBytes, "base64") : base64OrBytes;
  return webcrypto.subtle.importKey("raw", raw, { name: "AES-GCM" }, false, [usage]);
}

async function aesEncrypt(plaintext, key) {
  const iv = randomBytes(12);
  const sealed = await webcrypto.subtle.encrypt({ name: "AES-GCM", iv }, await aesKey(key, "encrypt"), plaintext);
  return Buffer.concat([iv, Buffer.from(sealed)]).toString("base64");
}

async function aesDecrypt(sealedBase64, key) {
  const sealed = Buffer.from(sealedBase64, "base64");
  const plain = await webcrypto.subtle.decrypt(
    { name: "AES-GCM", iv: sealed.subarray(0, 12) },
    await aesKey(key, "decrypt"),
    sealed.subarray(12),
  );
  return Buffer.from(plain).toString("utf8");
}

// The challenge key may be SPKI or PKCS#1, with or without PEM armor.
function rsaPublicKey(text) {
  const normalized = String(text).replace(/\\n/g, "\n");
  try {
    return createPublicKey(normalized);
  } catch {
    const der = Buffer.from(normalized.replace(/-----[A-Z ]+-----/g, "").replace(/\s+/g, ""), "base64");
    try {
      return createPublicKey({ key: der, format: "der", type: "spki" });
    } catch {
      return createPublicKey({ key: der, format: "der", type: "pkcs1" });
    }
  }
}

async function encryptPinHash(pinHash, publicKey) {
  const oneTimeKey = randomBytes(32);
  const pinHashStruct = await aesEncrypt(Buffer.from(JSON.stringify({ pinhash: pinHash })), oneTimeKey);
  const otkey = publicEncrypt(
    { key: publicKey, padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: "sha256" },
    oneTimeKey,
  ).toString("base64");
  return Buffer.from(JSON.stringify({ pinhash_struct: pinHashStruct, otkey })).toString("base64");
}

async function approveChallenge(api, session, challengeId) {
  const { appId } = await api("GET", "/config", { auth: false });
  const headers = {
    "X-App-Id": appId,
    "X-Device-Id": session.deviceId,
    Authorization: `Bearer ${session.userToken}`,
  };
  const fetched = await api("GET", `/v1/w3s/sdk/user/challenges/${challengeId}`, { headers });
  const challenge = JSON.parse(await aesDecrypt(fetched.data.encrypt, session.encryptionKey));

  const userSecret = await aesDecrypt(session.encryptedUserSecret, session.storageKey);
  const pinMaterial = `${userSecret.split(":")[0]}${challenge.pinCodeUserShare ?? ""}`;
  const pin = sha256(Buffer.from(pinMaterial, "latin1")).toString("base64");
  const pinHash = sha256(Buffer.from(pin));
  const legacyPinHash = Buffer.from(upperHex(pinHash));
  const publicKey = rsaPublicKey(challenge.publicKey);
  const payload = {
    idempotencyKey: randomUUID(),
    pinhash: await encryptPinHash(pinHash.toString("base64"), publicKey),
    hashPinhash: sha256(pinHash).toString("base64"),
    additionalPinhash: {
      version: 0,
      pinhash: await encryptPinHash(legacyPinHash.toString("base64"), publicKey),
      hashPinhash: Buffer.from(upperHex(sha256(legacyPinHash))).toString("base64"),
    },
    deviceInfo: {
      os: { model: "", version: "" },
      browser: { model: "WebSDK", version: "" },
      device: { model: "Desktop", version: "" },
      sdk: { model: "Web", version: "" },
    },
    pinType: "AUTO",
  };
  const body = await aesEncrypt(Buffer.from(JSON.stringify(payload)), session.encryptionKey);
  const approved = await api("POST", `/v1/w3s/sdk/user/challenges/${challengeId}/approve`, { headers, body });
  return approved?.data?.encrypt
    ? JSON.parse(await aesDecrypt(approved.data.encrypt, session.encryptionKey))
    : approved;
}

// --- viem: local install, else the copy bundled with @circle-fin/cli ---------

async function loadViem() {
  try {
    return await import("viem");
  } catch {
    // fall back to the CLI's copy
  }
  const roots = (process.env.PATH ?? "").split(delimiter).map((dir) => {
    try {
      return dirname(dirname(realpathSync(join(dir, "circle"))));
    } catch {
      return undefined;
    }
  });
  try {
    const { stdout } = await execFileAsync("npm", ["root", "-g"], { shell: platform() === "win32" });
    roots.push(join(stdout.trim(), "@circle-fin", "cli"));
  } catch {
    // npm not available
  }
  for (const root of roots.filter(Boolean)) {
    try {
      return createRequire(join(root, "package.json"))("viem");
    } catch {
      // not a @circle-fin/cli install
    }
  }
  throw new Error("viem not found. Install the Circle CLI: npm install -g @circle-fin/cli");
}

// --- Main ----------------------------------------------------------------------

const PROXY = "https://agentic-wallet.circle.com";

async function main() {
  const args = parseArgs(process.argv.slice(2));
  // Production only. Refuse rather than ignore an override: the printed
  // `circle wallet execute` commands honor CIRCLE_PROXY_URL too, and would send
  // the session token and the signed authorization to that origin.
  if (process.env.CIRCLE_PROXY_URL !== undefined) {
    throw new Error(`CIRCLE_PROXY_URL is set. This script only talks to ${PROXY}. Unset it, run circle wallet login again, then re-run.`);
  }
  const { chain, eoa, sca, usdc } = args;
  const [chainId, testnet] = CHAINS[chain];
  const viem = await loadViem();

  const session = await loadSession(testnet);
  if (!session) {
    throw new Error(`No active Circle login for ${chain}. Run: circle wallet login <email>${testnet ? " --testnet" : ""}`);
  }
  const api = circleApi(`${PROXY}/proxy/${testnet ? "test" : "live"}`, session.userToken);

  // The SCA must be one of your Agent Wallets, and the EOA must be its backing EOA.
  const query = new URLSearchParams({ pageSize: "50", blockchain: chain, address: sca });
  const wallets = (await api("GET", `/v1/w3s/wallets?${query}`)).data?.wallets ?? [];
  const wallet = wallets.find((candidate) => viem.isAddressEqual(candidate.address, sca));
  if (!wallet) throw new Error(`${sca} is not one of your Agent Wallets on ${chain}.`);
  const backingEoa = (await api("GET", `/v1/w3s/wallets/${wallet.id}`)).data?.wallet?.eoaOwnerAddress;
  if (!backingEoa || !viem.isAddressEqual(backingEoa, eoa)) {
    throw new Error(`The backing EOA of ${sca} is ${backingEoa}, not ${eoa}. Stop and contact Circle Support.`);
  }

  // USDC's EIP-712 domain name differs by chain ("USDC" vs "USD Coin"), so read it.
  const readString = async (fn) => {
    const body = JSON.stringify({ address: usdc, blockchain: chain, abiFunctionSignature: `${fn}()` });
    const { data } = await api("POST", "/v1/w3s/contracts/query", { body, auth: false });
    return viem.decodeAbiParameters([{ type: "string" }], data.outputData)[0];
  };
  const domain = { name: await readString("name"), version: await readString("version"), chainId: BigInt(chainId), verifyingContract: usdc };

  const message = {
    from: eoa,
    to: sca,
    value: BigInt(args["amount-atomic"]),
    validAfter: 0n,
    validBefore: BigInt(Math.floor(Date.now() / 1000) + 3600),
    nonce: `0x${randomBytes(32).toString("hex")}`,
  };
  const typedData = JSON.stringify({
    types: { EIP712Domain: DOMAIN_TYPE, ...AUTHORIZATION_TYPES },
    primaryType: "TransferWithAuthorization",
    domain: { ...domain, chainId: String(chainId) },
    message: { ...message, value: String(message.value), validAfter: "0", validBefore: String(message.validBefore) },
  });

  // Sign by walletAddress so Circle returns the backing EOA's own signature.
  const signRequest = JSON.stringify({ walletAddress: eoa, blockchain: chain, data: typedData });
  const { data } = await api("POST", "/v1/w3s/user/sign/typedData", { body: signRequest });
  const result = await approveChallenge(api, session, data.challengeId);
  const signature = result?.data?.signature ?? result?.signature;
  const signer = await viem.recoverTypedDataAddress({
    domain,
    types: AUTHORIZATION_TYPES,
    primaryType: "TransferWithAuthorization",
    message,
    signature,
  });
  if (!viem.isAddressEqual(signer, eoa)) throw new Error(`Signature is from ${signer}, not ${eoa}. Do not submit.`);

  const { r, s, v, yParity } = viem.parseSignature(signature);
  const params = [eoa, sca, message.value, 0, message.validBefore, message.nonce, v ?? 27n + BigInt(yParity), r, s].join(" ");
  const execute = `circle wallet execute "${TRANSFER_WITH_AUTHORIZATION}" ${params} --contract ${usdc} --address ${sca} --chain ${chain}`;
  const expires = new Date(Number(message.validBefore) * 1000).toISOString();
  process.stdout.write(`Signed by backing EOA ${eoa}: moves ${viem.formatUnits(message.value, 6)} USDC to ${sca}.
Run the commands below before ${expires}, when this authorization expires.

1. Check the authorization is unused (expect outputData ending in 0):
circle contract query "authorizationState(address,bytes32)" ${eoa} ${message.nonce} --contract ${usdc} --chain ${chain}

2. Estimate the network fee:
${execute} --estimate

3. Submit once:
${execute} --idempotency-key ${randomUUID()} --output json

4. Verify (backing EOA down, Agent Wallet up, authorization used = ...01):
circle contract query "balanceOf(address)" ${eoa} --contract ${usdc} --chain ${chain}
circle contract query "balanceOf(address)" ${sca} --contract ${usdc} --chain ${chain}
circle contract query "authorizationState(address,bytes32)" ${eoa} ${message.nonce} --contract ${usdc} --chain ${chain}
`);
}

main().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
});
