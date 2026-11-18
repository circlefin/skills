#!/usr/bin/env node
// Check a legacy Eco intent onchain and print the `circle wallet execute`
// commands that self-issue its permissionless Portal refund. The script never
// submits: it reads chain state over JSON-RPC and the selected Agent Wallet from
// the Circle API. Needs Node.js 20.18.2+ and the public @circle-fin/cli 1.2.3 or
// newer (array and tuple ABI arguments as JSON), logged in with
// `circle wallet login`.

import {
  CHAINS,
  PROXY,
  circleApi,
  freshIdempotencyKey,
  isCreatorSca,
  notEligibleExitCode,
  refundDecision,
  requireBackingEoaRecipient,
  requireDeadlinePassed,
  requireRecoverable,
  rewardStatus,
  savedIdempotencyKey,
  json,
  loadSession,
  loadViem,
  parseArgs,
  refuseProxyOverride,
  required,
  requireAddress,
  requireChainCode,
  requireChainId,
  requireCliVersion,
  requireHex,
  requireHexBytes,
  requireRpcUrl,
  requireSafePath,
  requireUint,
  rpc,
  rpcOrigin,
  safeErrorMessage,
  sha256,
  writeEvidence,
} from "./_shared.mjs";

const MIN_CLI_VERSION = "1.2.3";
const REWARD_TUPLE = "(uint64,address,address,uint256,(address,uint256)[])";
const REFUND_SIGNATURE = `refund(uint64,bytes32,${REWARD_TUPLE})`;
const VAULT_SIGNATURE = `intentVaultAddress(uint64,bytes,${REWARD_TUPLE})`;
const FLAGS = new Set([
  "_", "help", "h", "chain", "event-chain-id", "refund-chain-id", "event-rpc-url",
  "refund-rpc-url", "sca", "event-portal", "portal", "creation-tx", "intent-hash",
  "evidence-dir", "confirm-intent", "idempotency-key",
]);

const HELP = `Usage:
  node scripts/eco-self-refund.mjs \\
    --chain <Circle refund-chain code> \\
    --event-chain-id <id> --refund-chain-id <id> \\
    --event-rpc-url <url> --refund-rpc-url <url> \\
    --sca <address> --event-portal <address> --portal <address> \\
    --creation-tx <hash> --intent-hash <hash> [--evidence-dir <path>]

Read-only. Rebuilds the intent from IntentPublished, checks it onchain,
verifies that the fixed refund recipient is the SCA's backing EOA, simulates the
exact refund from the SCA, and prints the Circle ABI parser check and the
\`circle wallet execute ... --estimate\` command. Nothing is submitted.

After the user approves the preflight and fee for this one intent, re-run with:
  --confirm-intent <intent-hash> --evidence-dir <path> [--idempotency-key <uuid>]
to save an idempotency key and print the single submit command and the
verification queries. Pass --idempotency-key to reuse a saved key.

Needs @circle-fin/cli ${MIN_CLI_VERSION} or newer and an active circle wallet login.
Refuses to run while CIRCLE_PROXY_URL is set.

Exit codes: 0 = done, 1 = error, 2 = --confirm-intent given but the intent is
  not eligible for a refund (nothing printed to submit).
`;

const intentPublishedAbi = {
  type: "event",
  name: "IntentPublished",
  inputs: [
    { name: "intentHash", type: "bytes32", indexed: true },
    { name: "destination", type: "uint64", indexed: false },
    { name: "route", type: "bytes", indexed: false },
    { name: "creator", type: "address", indexed: true },
    { name: "prover", type: "address", indexed: true },
    { name: "rewardDeadline", type: "uint64", indexed: false },
    { name: "rewardNativeAmount", type: "uint256", indexed: false },
    {
      name: "rewardTokens",
      type: "tuple[]",
      indexed: false,
      components: [
        { name: "token", type: "address" },
        { name: "amount", type: "uint256" },
      ],
    },
  ],
};

const rewardComponents = [
  { name: "deadline", type: "uint64" },
  { name: "creator", type: "address" },
  { name: "prover", type: "address" },
  { name: "nativeAmount", type: "uint256" },
  {
    name: "tokens",
    type: "tuple[]",
    components: [
      { name: "token", type: "address" },
      { name: "amount", type: "uint256" },
    ],
  },
];

const portalAbi = [
  {
    type: "function",
    name: "getRewardStatus",
    stateMutability: "view",
    inputs: [{ name: "intentHash", type: "bytes32" }],
    outputs: [{ name: "status", type: "uint8" }],
  },
  {
    type: "function",
    name: "intentVaultAddress",
    stateMutability: "view",
    inputs: [
      { name: "destination", type: "uint64" },
      { name: "route", type: "bytes" },
      { name: "reward", type: "tuple", components: rewardComponents },
    ],
    outputs: [{ name: "vault", type: "address" }],
  },
  {
    type: "function",
    name: "refund",
    stateMutability: "nonpayable",
    inputs: [
      { name: "destination", type: "uint64" },
      { name: "routeHash", type: "bytes32" },
      { name: "reward", type: "tuple", components: rewardComponents },
    ],
    outputs: [],
  },
];

const erc20Abi = [
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "balance", type: "uint256" }],
  },
  {
    type: "function",
    name: "decimals",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "decimals", type: "uint8" }],
  },
  {
    type: "function",
    name: "symbol",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "symbol", type: "string" }],
  },
];

function normalizeReward(decoded) {
  return {
    deadline: BigInt(decoded.rewardDeadline),
    creator: decoded.creator,
    prover: decoded.prover,
    nativeAmount: BigInt(decoded.rewardNativeAmount),
    tokens: decoded.rewardTokens.map((entry) => ({
      token: entry.token,
      amount: BigInt(entry.amount),
    })),
  };
}

// Single-quote a value for a printed shell command. Every value is validated
// first, and this rejects anything outside the characters those values use.
function quote(value) {
  const text = String(value);
  if (!/^[0-9A-Za-z[\]",-]+$/.test(text)) {
    throw new Error(`Refusing to print an unexpected command value: ${text.slice(0, 80)}`);
  }
  return `'${text}'`;
}

// The reward tuple as the JSON array the Circle CLI takes for a tuple argument:
// fields in ABI order, every integer as a quoted string.
function rewardArgument(reward) {
  return JSON.stringify([
    requireUint(reward.deadline, "reward.deadline"),
    requireAddress(reward.creator, "reward.creator"),
    requireAddress(reward.prover, "reward.prover"),
    requireUint(reward.nativeAmount, "reward.nativeAmount"),
    reward.tokens.map(({ token, amount }) => [
      requireAddress(token, "reward token"),
      requireUint(amount, "reward token amount"),
    ]),
  ]);
}

async function verifyRecipientOwnership({ chain, testnet, sca, creator, viem }) {
  const session = await loadSession(testnet);
  if (!session) {
    throw new Error(`No active Circle login for ${chain}. Run: circle wallet login <email>${testnet ? " --testnet" : ""}`);
  }
  const api = circleApi(`${PROXY}/proxy/${testnet ? "test" : "live"}`, session.userToken);
  const query = new URLSearchParams({ pageSize: "50", blockchain: chain, address: sca });
  const wallets = (await api("GET", `/v1/w3s/wallets?${query}`)).data?.wallets ?? [];
  const wallet = wallets.find((candidate) => viem.isAddressEqual(candidate.address, sca));
  if (!wallet) throw new Error(`${sca} is not one of your Agent Wallets on ${chain}.`);
  const detail = await api("GET", `/v1/w3s/wallets/${encodeURIComponent(wallet.id)}`);
  const reported = detail.data?.wallet?.eoaOwnerAddress;
  const backingEoa = reported
    ? requireAddress(reported, "Circle wallet eoaOwnerAddress")
    : undefined;
  return requireBackingEoaRecipient({ creator, sca, backingEoa });
}

async function main() {
  const args = parseArgs(process.argv.slice(2), { booleanFlags: ["help", "h"] });
  if (args.help || args.h) {
    process.stdout.write(HELP);
    return;
  }
  const unknown = Object.keys(args).filter((name) => !FLAGS.has(name));
  if (unknown.length > 0 || args._.length > 0) {
    throw new Error(
      `Unknown argument ${unknown.length > 0 ? `--${unknown[0]}` : args._[0]}. This script only prints commands; run it with --help.`,
    );
  }

  const chain = requireChainCode(required(args, "chain").toUpperCase(), "--chain");
  if (!CHAINS[chain]) throw new Error(`Unsupported chain ${chain}.`);
  const [circleChainId, testnet] = CHAINS[chain];
  const eventRpcUrl = requireRpcUrl(required(args, "event-rpc-url"), "--event-rpc-url");
  const refundRpcUrl = requireRpcUrl(required(args, "refund-rpc-url"), "--refund-rpc-url");
  const eventChainId = requireChainId(required(args, "event-chain-id"), "--event-chain-id");
  const refundChainId = requireChainId(required(args, "refund-chain-id"), "--refund-chain-id");
  if (BigInt(circleChainId) !== refundChainId) {
    throw new Error(`Circle chain ${chain} uses EVM chain ID ${circleChainId}, not ${refundChainId}.`);
  }
  const sca = requireAddress(required(args, "sca"), "--sca");
  const eventPortal = requireAddress(required(args, "event-portal"), "--event-portal");
  const portal = requireAddress(required(args, "portal"), "--portal");
  const creationTx = requireHex(required(args, "creation-tx"), 32, "--creation-tx");
  const expectedIntent = requireHex(required(args, "intent-hash"), 32, "--intent-hash");
  const evidenceDir =
    typeof args["evidence-dir"] === "string"
      ? requireSafePath(args["evidence-dir"], "--evidence-dir")
      : undefined;
  const confirming = args["confirm-intent"] !== undefined;
  if (confirming) {
    const confirmedIntent = requireHex(required(args, "confirm-intent"), 32, "--confirm-intent");
    if (confirmedIntent.toLowerCase() !== expectedIntent.toLowerCase()) {
      throw new Error("--confirm-intent must exactly match --intent-hash after the user approves the preflight.");
    }
    if (!evidenceDir) {
      throw new Error("--evidence-dir is required with --confirm-intent so the idempotency key is saved before the submit command is printed.");
    }
  }
  // On confirm, reuse the key already saved for this intent so a re-run (after a
  // timeout or lost context) prints the same single submit, never a second one.
  const savedKey = confirming ? await savedIdempotencyKey(evidenceDir, expectedIntent) : undefined;
  const passedKey = args["idempotency-key"] === undefined ? undefined : freshIdempotencyKey(args["idempotency-key"]);
  if (savedKey && passedKey && savedKey.toLowerCase() !== passedKey.toLowerCase()) {
    throw new Error(
      "--idempotency-key does not match the key already saved for this intent in --evidence-dir. Use the saved key so the refund is submitted only once.",
    );
  }
  const idempotencyKey = confirming ? (passedKey ?? savedKey ?? freshIdempotencyKey()) : passedKey;
  if (confirming && savedKey && !passedKey) {
    console.error(
      "Reusing the idempotency key already saved for this intent in --evidence-dir. If its submit ended FAILED, DENIED or CANCELLED and the reward is still Funded, move its submission-intent file into a released/ folder in --evidence-dir and re-run for a new key.",
    );
  }

  refuseProxyOverride();
  const cliVersion = await requireCliVersion(MIN_CLI_VERSION);
  const viem = await loadViem();
  const {
    decodeEventLog,
    decodeFunctionResult,
    encodeAbiParameters,
    encodeFunctionData,
    encodePacked,
    formatUnits,
    keccak256,
  } = viem;

  const observedEventChainId = BigInt(await rpc(eventRpcUrl, "eth_chainId", []));
  const observedRefundChainId = BigInt(await rpc(refundRpcUrl, "eth_chainId", []));
  if (observedEventChainId !== eventChainId) {
    throw new Error(`Event RPC chain ID ${observedEventChainId} does not match --event-chain-id ${eventChainId}.`);
  }
  if (observedRefundChainId !== refundChainId) {
    throw new Error(`Refund RPC chain ID ${observedRefundChainId} does not match --refund-chain-id ${refundChainId}.`);
  }

  const receipt = await rpc(eventRpcUrl, "eth_getTransactionReceipt", [creationTx]);
  if (!receipt) throw new Error(`Creation transaction ${creationTx} was not found.`);
  if (BigInt(receipt.status) !== 1n) {
    throw new Error(`Creation transaction ${creationTx} did not succeed.`);
  }

  const decodedEvents = [];
  for (const logEntry of receipt.logs) {
    if (logEntry.address.toLowerCase() !== eventPortal.toLowerCase()) continue;
    try {
      const decoded = decodeEventLog({
        abi: [intentPublishedAbi],
        data: logEntry.data,
        topics: logEntry.topics,
        strict: true,
      });
      if (decoded.eventName === "IntentPublished") decodedEvents.push(decoded.args);
    } catch {
      // Ignore unrelated Portal events.
    }
  }

  const matches = decodedEvents.filter(
    (event) => event.intentHash.toLowerCase() === expectedIntent.toLowerCase(),
  );
  if (matches.length !== 1) {
    throw new Error(`Expected exactly one IntentPublished event for ${expectedIntent}; found ${matches.length}.`);
  }

  const event = matches[0];
  const destination = BigInt(event.destination);
  const route = requireHexBytes(event.route, "IntentPublished route");
  const routeHash = keccak256(route);
  const reward = normalizeReward(event);
  const rewardHash = keccak256(
    encodeAbiParameters([{ name: "reward", type: "tuple", components: rewardComponents }], [reward]),
  );
  const computedIntent = keccak256(
    encodePacked(["uint64", "bytes32", "bytes32"], [destination, routeHash, rewardHash]),
  );
  if (computedIntent.toLowerCase() !== expectedIntent.toLowerCase()) {
    throw new Error(`Reconstructed intent ${computedIntent} does not match ${expectedIntent}.`);
  }

  const portalCode = await rpc(refundRpcUrl, "eth_getCode", [portal, "latest"]);
  if (!portalCode || portalCode === "0x") {
    throw new Error(`No Portal bytecode exists at ${portal} on the refund chain.`);
  }

  const call = async (to, abi, functionName, fnArgs = [], from) => {
    const data = encodeFunctionData({ abi, functionName, args: fnArgs });
    const raw = await rpc(refundRpcUrl, "eth_call", [{ ...(from ? { from } : {}), to, data }, "latest"]);
    return decodeFunctionResult({ abi, functionName, data: raw });
  };

  const status = Number(await call(portal, portalAbi, "getRewardStatus", [expectedIntent]));
  const { terminalStatus, statusName } = rewardStatus(status);

  const latestBlock = await rpc(refundRpcUrl, "eth_getBlockByNumber", ["latest", false]);
  const refundTimestamp = BigInt(latestBlock.timestamp);
  requireDeadlinePassed({ terminalStatus, refundTimestamp, deadline: reward.deadline });

  const vault = await call(portal, portalAbi, "intentVaultAddress", [destination, route, reward]);

  const nativeVaultBalance = BigInt(await rpc(refundRpcUrl, "eth_getBalance", [vault, "latest"]));
  const tokenBalances = [];
  for (const tokenReward of reward.tokens) {
    const balance = BigInt(await call(tokenReward.token, erc20Abi, "balanceOf", [vault]));
    const recipientBalance = BigInt(await call(tokenReward.token, erc20Abi, "balanceOf", [reward.creator]));
    let decimals;
    let symbol;
    try {
      decimals = Number(await call(tokenReward.token, erc20Abi, "decimals"));
    } catch {
      decimals = undefined;
    }
    try {
      symbol = await call(tokenReward.token, erc20Abi, "symbol");
    } catch {
      symbol = undefined;
    }
    const format = (value) => (decimals === undefined ? undefined : formatUnits(value, decimals));
    tokenBalances.push({
      token: tokenReward.token,
      symbol,
      decimals,
      nominalAmountAtomic: tokenReward.amount,
      nominalAmount: format(tokenReward.amount),
      vaultBalanceAtomic: balance,
      vaultBalance: format(balance),
      recipientBalanceAtomic: recipientBalance,
      recipientBalance: format(recipientBalance),
    });
  }
  requireRecoverable({
    terminalStatus,
    vault,
    nativeVaultBalance,
    tokenVaultBalances: tokenBalances.map(({ vaultBalanceAtomic }) => vaultBalanceAtomic),
  });

  const callData = encodeFunctionData({
    abi: portalAbi,
    functionName: "refund",
    args: [destination, routeHash, reward],
  });
  let simulation = "skipped-terminal-status";
  if (!terminalStatus) {
    simulation = await rpc(refundRpcUrl, "eth_call", [{ from: sca, to: portal, data: callData }, "latest"]);
    if (simulation !== "0x") throw new Error(`Unexpected Eco refund simulation result ${simulation}.`);
  }

  const creatorIsSca = isCreatorSca({ creator: reward.creator, sca });
  let recipientOwnership = creatorIsSca
    ? { checked: true, match: "sca", backingEoa: undefined }
    : { checked: false, match: undefined, backingEoa: undefined };
  if (!terminalStatus && !creatorIsSca) {
    recipientOwnership = await verifyRecipientOwnership({
      chain,
      testnet,
      sca,
      creator: reward.creator,
      viem,
    });
  }
  const { eligible, action, refusedReason } = refundDecision({
    terminalStatus,
    statusName,
    creatorIsSca,
    creator: reward.creator,
    recipientOwnership,
  });

  let commands;
  if (eligible) {
    const tuple = [
      quote(requireUint(destination, "destination")),
      quote(requireHex(routeHash, 32, "routeHash")),
      quote(rewardArgument(reward)),
    ].join(" ");
    const target = `--contract ${quote(portal)} --address ${quote(sca)} --chain ${quote(chain)}`;
    const execute = `circle wallet execute "${REFUND_SIGNATURE}" ${tuple} ${target}`;
    const readOn = (address) => `--contract ${quote(address)} --chain ${quote(chain)}`;
    commands = {
      parserCheck: `circle contract query "${VAULT_SIGNATURE}" ${quote(destination)} ${quote(route)} ${quote(rewardArgument(reward))} ${readOn(portal)}`,
      parserCheckExpect: `outputData ends in ${vault.slice(2).toLowerCase()}`,
      estimate: `${execute} --estimate`,
      submit: confirming ? `${execute} --idempotency-key ${quote(idempotencyKey)} --output json` : undefined,
      verify: [
        `circle contract query "getRewardStatus(bytes32)" ${quote(expectedIntent)} ${readOn(portal)}`,
        ...reward.tokens.flatMap(({ token }) => [
          `circle contract query "balanceOf(address)" ${quote(vault)} ${readOn(token)}`,
          `circle contract query "balanceOf(address)" ${quote(reward.creator)} ${readOn(token)}`,
        ]),
      ],
    };
  }

  const preflight = {
    operation: "eco-self-refund",
    mode: confirming ? "confirm" : "preflight",
    action,
    refusedReason,
    cliVersion,
    circleChain: chain,
    eventChainId,
    refundChainId,
    eventRpcOrigin: rpcOrigin(eventRpcUrl),
    refundRpcOrigin: rpcOrigin(refundRpcUrl),
    sca,
    eventPortal,
    portal,
    portalCodeSha256: sha256(portalCode),
    creationTx,
    intentHash: expectedIntent,
    routeHash,
    rewardHash,
    destination: destination.toString(),
    rewardStatus: { value: status, name: statusName },
    reward: {
      deadline: reward.deadline,
      deadlineIso: new Date(Number(reward.deadline) * 1000).toISOString(),
      creator: reward.creator,
      prover: reward.prover,
      nativeAmount: reward.nativeAmount,
      tokens: reward.tokens,
    },
    vault,
    nativeVaultBalance,
    tokenBalances,
    callData,
    callDataSha256: sha256(callData),
    simulation,
    recipientOwnership,
    commands: commands && { ...commands, submit: undefined },
  };
  const preflightEvidence = await writeEvidence(evidenceDir, "eco-self-refund-preflight", preflight);

  let submissionEvidence;
  if (confirming && eligible) {
    // Save the key before printing the submit command, so a retry reuses it.
    submissionEvidence = await writeEvidence(evidenceDir, "eco-self-refund-submission-intent", {
      operation: "eco-self-refund",
      circleChain: chain,
      intentHash: expectedIntent,
      sca,
      portal,
      fixedRecipient: reward.creator,
      idempotencyKey,
      callDataSha256: sha256(callData),
      submit: commands.submit,
    });
  }

  process.stdout.write(`${json({ data: { ...preflight, preflightEvidence, submissionEvidence } })}\n`);

  if (!eligible) {
    process.stdout.write(`\nNot eligible for a refund: ${preflight.refusedReason} Nothing to submit.\n`);
    process.exitCode = notEligibleExitCode(confirming);
    return;
  }

  const summary = `Fixed refund recipient ${reward.creator} is the verified backing EOA of ${sca}. Nothing has been submitted.`;
  if (!confirming) {
    process.stdout.write(`
${summary}

1. Tuple check: Circle must read the same reward tuple (expect ${commands.parserCheckExpect}):
${commands.parserCheck}

2. Estimate the network fee:
${commands.estimate}

Show the preflight and the fee and get explicit approval for intent ${expectedIntent}.
Then re-run this script with --confirm-intent ${quote(expectedIntent)} --evidence-dir '${evidenceDir ?? "<EVIDENCE_DIR>"}' for the single submit command.
`);
    return;
  }

  process.stdout.write(`
${summary}
Idempotency key saved to ${submissionEvidence}. If you re-run the confirm step, use the same --evidence-dir and the script reuses this key.

3. Submit once:
${commands.submit}

4. Verify (reward status ends in 3 = Refunded, vault drained, recipient up):
${commands.verify.join("\n")}
`);
}

main().catch((error) => {
  process.stderr.write(`${safeErrorMessage(error)}\n`);
  process.exitCode = 1;
});
