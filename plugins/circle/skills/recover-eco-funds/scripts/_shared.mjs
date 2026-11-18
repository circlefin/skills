// Shared helpers for the recovery scripts. They need Node.js 20.18.2+ and the
// public @circle-fin/cli, logged in with `circle wallet login`; no Circle CLI
// source checkout.

import { execFile } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { homedir, platform } from "node:os";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export function parseArgs(argv, { booleanFlags = [] } = {}) {
  const booleans = new Set(booleanFlags);
  const result = { _: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (!item.startsWith("--")) {
      result._.push(item);
      continue;
    }
    const name = item.slice(2);
    const next = argv[index + 1];
    if (booleans.has(name)) {
      if (next && !next.startsWith("--")) {
        throw new Error(
          `--${name} is a bare boolean flag and does not accept the value ${next}.`,
        );
      }
      result[name] = true;
      continue;
    }
    if (!next || next.startsWith("--")) {
      result[name] = true;
      continue;
    }
    result[name] = next;
    index += 1;
  }
  return result;
}

export function required(args, name) {
  const value = args[name];
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Missing required flag --${name}.`);
  }
  return value;
}

export function requireHex(value, bytes, label) {
  const expected = bytes * 2;
  if (!new RegExp(`^0x[0-9a-fA-F]{${expected}}$`).test(value)) {
    throw new Error(`${label} must be a ${bytes}-byte 0x-prefixed hex value.`);
  }
  return value;
}

export function requireAddress(value, label) {
  return requireHex(value, 20, label);
}

const SHELL_UNSAFE = /[\s'"`$;|&()<>\\]/;

export function requireRpcUrl(value, label) {
  if (SHELL_UNSAFE.test(value) || !/^https?:\/\/[^/?#]+/.test(value)) {
    throw new Error(`${label} must be an http(s) URL without whitespace, quotes, or shell metacharacters.`);
  }
  return value;
}

export function requireChainCode(value, label) {
  if (!/^[A-Z0-9-]+$/.test(value)) {
    throw new Error(`${label} must be a Circle CLI chain code such as BASE or ARB-SEPOLIA.`);
  }
  return value;
}

export function requireChainId(value, label) {
  if (!/^[1-9][0-9]*$/.test(value)) {
    throw new Error(`${label} must be a positive integer chain ID.`);
  }
  return BigInt(value);
}

export function requireUint(value, label) {
  if (!/^(0|[1-9][0-9]*)$/.test(String(value))) {
    throw new Error(`${label} must be a non-negative whole number.`);
  }
  return String(value);
}

export function requireHexBytes(value, label) {
  if (!/^0x(?:[0-9a-fA-F]{2})*$/.test(value)) {
    throw new Error(`${label} must be 0x-prefixed hex bytes.`);
  }
  return value;
}

export function requireSafePath(value, label) {
  if (SHELL_UNSAFE.test(value)) {
    throw new Error(`${label} must be a path without whitespace, quotes, or shell metacharacters.`);
  }
  return value;
}

export function json(value) {
  return JSON.stringify(
    sanitize(value),
    (_key, item) => (typeof item === "bigint" ? item.toString() : item),
    2,
  );
}

export function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

export async function rpc(rpcUrl, method, params) {
  const response = await fetch(rpcUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: randomUUID(), method, params }),
    signal: AbortSignal.timeout(30_000),
  });
  const body = await response.json();
  if (!response.ok || body.error) {
    throw new Error(
      `RPC ${method} failed: ${JSON.stringify(body.error ?? body)}`,
    );
  }
  return body.result;
}

export function rpcOrigin(rpcUrl) {
  const parsed = new URL(rpcUrl);
  return `${parsed.protocol}//${parsed.host}`;
}

export function sanitize(value) {
  if (Array.isArray(value)) return value.map(sanitize);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => {
      const lowered = key.toLowerCase();
      const secret = [
        /^signature$/,
        /^signatures$/,
        /^rawsignature$/,
        /(user|session|access|refresh|bearer|auth|id)[-_]?token$/,
        /^otp$/,
        /^pin$/,
        /secret/,
        /password/,
        /private[-_]?key/,
        /encryption[-_]?key/,
        /api[-_]?key/,
        /credential/,
        /^authorization$/,
        /^cookie$/,
      ].some((pattern) => pattern.test(lowered));
      return [key, secret ? "[REDACTED]" : sanitize(item)];
    }),
  );
}

export function safeErrorMessage(error) {
  const text =
    error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  return text
    .replace(/0x[0-9a-f]{130}\b/gi, "[REDACTED_SIGNATURE]")
    .replace(
      /((?:user|session|access|refresh|bearer|auth|id)[-_ ]?token|otp|pin|(?:private|encryption|api)[-_ ]?key|credential|authorization|cookie|password|secret)(["']?\s*[:=]\s*["']?)([^"',}\]\s]+)/gi,
      "$1$2[REDACTED]",
    );
}

export async function writeEvidence(directory, label, value) {
  if (!directory) return undefined;
  const target = isAbsolute(directory) ? directory : resolve(directory);
  await mkdir(target, { recursive: true, mode: 0o700 });
  const timestamp = new Date().toISOString().replaceAll(":", "-");
  const filename = `${timestamp}-${label}.json`;
  const outputPath = join(target, filename);
  const payload = sanitize({ capturedAt: new Date().toISOString(), ...value });
  await writeFile(outputPath, `${json(payload)}\n`, { mode: 0o600 });
  return outputPath;
}

// The idempotency key already saved for this intent's refund in the evidence
// directory, so a re-run of the confirm step prints the same single submit
// instead of a new one. Refuses when the directory holds conflicting keys.
export async function savedIdempotencyKey(directory, intentHash, label = "eco-self-refund-submission-intent") {
  if (!directory) return undefined;
  const target = isAbsolute(directory) ? directory : resolve(directory);
  if (!existsSync(target)) return undefined;
  const keys = new Set();
  for (const name of (await readdir(target)).filter((file) => file.endsWith(`-${label}.json`))) {
    let saved;
    try {
      saved = JSON.parse(await readFile(join(target, name), "utf8"));
    } catch {
      throw new Error(`Could not read ${name} in the evidence directory; fix or move it before confirming.`);
    }
    if (!saved || typeof saved !== "object") {
      throw new Error(`Could not read ${name} in the evidence directory; fix or move it before confirming.`);
    }
    if (String(saved.intentHash).toLowerCase() === intentHash.toLowerCase() && saved.idempotencyKey) {
      const key = String(saved.idempotencyKey);
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(key)) {
        throw new Error(`${name} in the evidence directory has an invalid saved idempotency key; fix or move it before confirming.`);
      }
      keys.add(key.toLowerCase());
    }
  }
  if (keys.size > 1) {
    throw new Error(
      "The evidence directory has more than one saved idempotency key for this intent. Check which submit ran (circle wallet status and the explorer), move the submission-intent file for the submit that did not run out of --evidence-dir, then re-run.",
    );
  }
  return [...keys][0];
}

export function freshIdempotencyKey(value) {
  if (value) {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
      throw new Error("--idempotency-key must be a UUID.");
    }
    return value;
  }
  return randomUUID();
}

// --- Circle CLI chains, session, and API --------------------------------------

// Circle chain code -> [EVM chain ID, testnet]
export const CHAINS = {
  ETH: [1, false], MATIC: [137, false], ARB: [42161, false], AVAX: [43114, false],
  OP: [10, false], BASE: [8453, false], UNI: [130, false], MONAD: [143, false],
  ARC: [5042, false], "ETH-SEPOLIA": [11155111, true], "MATIC-AMOY": [80002, true],
  "ARB-SEPOLIA": [421614, true], "AVAX-FUJI": [43113, true], "OP-SEPOLIA": [11155420, true],
  "BASE-SEPOLIA": [84532, true], "UNI-SEPOLIA": [1301, true], "ARC-TESTNET": [5042002, true],
};

export const PROXY = "https://agentic-wallet.circle.com";

// Production only. Refuse rather than ignore an override: the printed
// `circle wallet execute` commands honor CIRCLE_PROXY_URL too, and would send
// the session token to that origin.
export function refuseProxyOverride() {
  if (process.env.CIRCLE_PROXY_URL !== undefined) {
    throw new Error(`CIRCLE_PROXY_URL is set. This script only talks to ${PROXY}. Unset it, run circle wallet login again, then re-run.`);
  }
}

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

// The session saved by `circle wallet login`. Never print or save it.
export async function loadSession(testnet) {
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

export function circleApi(baseUrl, userToken) {
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

// The published @circle-fin/cli bundles viem into its build and does not ship
// it as a package, so the skill installs viem into its own directory from the
// committed package-lock.json, where `import("viem")` finds it.

export async function loadViem() {
  try {
    return await import("viem");
  } catch {
    const skillDir = dirname(dirname(fileURLToPath(import.meta.url)));
    const target = /^[^'\n]+$/.test(skillDir) ? `'${skillDir}'` : "'<SKILL_DIR>'";
    throw new Error(
      `viem not found. Install the pinned dependencies into the skill directory, then re-run: npm ci --prefix ${target} --ignore-scripts`,
    );
  }
}

// Require the installed `circle` to be at least `minimum` (for example 1.2.3).
export async function requireCliVersion(minimum) {
  let stdout = "";
  try {
    ({ stdout } = await execFileAsync("circle", ["--version"], {
      timeout: 15_000,
      shell: platform() === "win32",
    }));
  } catch {
    // reported below
  }
  const found = /(\d+)\.(\d+)\.(\d+)/.exec(stdout);
  if (!found) {
    throw new Error(`Circle CLI not found. Install @circle-fin/cli ${minimum} or newer: npm install -g @circle-fin/cli@latest`);
  }
  const have = found.slice(1).map(Number);
  const want = minimum.split(".").map(Number);
  const index = have.findIndex((part, i) => part !== want[i]);
  if (index !== -1 && have[index] < want[index]) {
    throw new Error(`Circle CLI ${found[0]} is older than ${minimum}. Update it: npm install -g @circle-fin/cli@latest`);
  }
  return found[0];
}

// --- Refund eligibility (pure; the refund script fetches the inputs) --------

export const REWARD_STATUS_NAMES = ["Initial", "Funded", "Withdrawn", "Refunded"];

const sameAddress = (a, b) => typeof a === "string" && typeof b === "string" && a.toLowerCase() === b.toLowerCase();

// Withdrawn and Refunded are terminal: there is nothing left to refund.
export function rewardStatus(status) {
  if (!Number.isInteger(status) || status < 0 || status > 3) throw new Error(`Unknown Eco reward status ${status}.`);
  return { terminalStatus: status === 2 || status === 3, statusName: REWARD_STATUS_NAMES[status] };
}

export function requireDeadlinePassed({ terminalStatus, refundTimestamp, deadline }) {
  if (!terminalStatus && refundTimestamp < deadline) {
    throw new Error(`Refund deadline has not passed: block=${refundTimestamp}, deadline=${deadline}.`);
  }
}

// The vault's native balance always counts as recoverable, whatever the
// nominal reward.nativeAmount.
export function requireRecoverable({ terminalStatus, vault, nativeVaultBalance, tokenVaultBalances }) {
  const recoverable = nativeVaultBalance > 0n || tokenVaultBalances.some((balance) => balance > 0n);
  if (!terminalStatus && !recoverable) {
    throw new Error(`The computed vault ${vault} has no recoverable reward balance on the selected refund chain.`);
  }
}

// A legacy intent's fixed refund recipient must be the SCA's Circle-verified backing EOA.
export function requireBackingEoaRecipient({ creator, sca, backingEoa }) {
  if (!backingEoa || !sameAddress(backingEoa, creator)) {
    throw new Error(
      `Refusing to spend gas: fixed refund recipient ${creator} is neither Circle wallet SCA ${sca} nor its verified backing EOA${backingEoa ? ` ${backingEoa}` : " (not returned by Circle)"}.`,
    );
  }
  return { checked: true, match: "backing-eoa", backingEoa };
}

export function isCreatorSca({ creator, sca }) {
  return sameAddress(creator, sca);
}

// Only a non-terminal legacy intent whose recipient is the verified backing EOA
// gets a refund command; everything else prints nothing to submit.
export function refundDecision({ terminalStatus, statusName, creatorIsSca, creator, recipientOwnership }) {
  const eligible = !terminalStatus && recipientOwnership?.match === "backing-eoa";
  return {
    eligible,
    action: terminalStatus ? "stop-no-broadcast" : creatorIsSca ? "stop-current-direct-to-sca" : "eligible-after-approval",
    refusedReason: terminalStatus
      ? `Intent reward status is already ${statusName}.`
      : creatorIsSca
        ? `Fixed refund recipient ${creator} is the selected Circle wallet SCA. This is the current direct-to-SCA flow; reconcile balances or escalate instead.`
        : undefined,
  };
}

// Exit code when nothing is printed to submit: 2 on a confirm run, so a
// caller can tell "refused" from success.
export function notEligibleExitCode(confirming) {
  return confirming ? 2 : 0;
}
