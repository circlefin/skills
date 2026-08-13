#!/usr/bin/env node

import {
  freshIdempotencyKey,
  isFailedTransaction,
  json,
  loadCircleRuntime,
  parseArgs,
  required,
  requireAddress,
  requireCircleChainId,
  requireHex,
  resolveAgentWallet,
  rpc,
  rpcOrigin,
  safeErrorMessage,
  sha256,
  writeEvidence,
} from "./_shared.mjs";

const HELP = `Usage:
  <circle-cli-repo>/node_modules/.bin/tsx scripts/eco-self-refund.mjs \\
    --circle-cli-repo <path> --chain <Circle refund-chain code> \\
    --event-chain-id <id> --refund-chain-id <id> \\
    --event-rpc-url <url> --refund-rpc-url <url> \\
    --sca <address> --event-portal <address> --portal <address> \\
    --creation-tx <hash> \\
    --intent-hash <hash> [--evidence-dir <path>]

The default mode is read-only and simulates the exact refund calldata.
Add --estimate-fee to verify refund-recipient ownership and include the Circle
fee estimate in the approval preflight; this requires an active agent session.

To broadcast after explicit user approval, add:
  --submit --confirm-intent <intent-hash> [--idempotency-key <uuid>]
  --evidence-dir is required with --submit so the key is durable first.

If CIRCLE_PROXY_URL is set, inspect it and explicitly pass:
  --allow-proxy-origin <scheme://trusted-host>

Exit codes: 0 = requested mode completed, 1 = error or failed transaction,
  2 = submit requested but safely refused before broadcast.
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

async function main() {
  const args = parseArgs(process.argv.slice(2), {
    booleanFlags: ["submit", "estimate-fee", "help", "h"],
  });
  if (args.help || args.h) {
    process.stdout.write(HELP);
    return;
  }

  const circleCliRepo = required(args, "circle-cli-repo");
  const chain = required(args, "chain").toUpperCase();
  const eventRpcUrl = required(args, "event-rpc-url");
  const refundRpcUrl = required(args, "refund-rpc-url");
  const eventChainId = BigInt(required(args, "event-chain-id"));
  const refundChainId = BigInt(required(args, "refund-chain-id"));
  const sca = requireAddress(required(args, "sca"), "--sca");
  const eventPortal = requireAddress(
    required(args, "event-portal"),
    "--event-portal",
  );
  const portal = requireAddress(required(args, "portal"), "--portal");
  const creationTx = requireHex(
    required(args, "creation-tx"),
    32,
    "--creation-tx",
  );
  const expectedIntent = requireHex(
    required(args, "intent-hash"),
    32,
    "--intent-hash",
  );
  const evidenceDir =
    typeof args["evidence-dir"] === "string" ? args["evidence-dir"] : undefined;
  if (args.submit && !evidenceDir) {
    throw new Error(
      "--evidence-dir is required with --submit so the idempotency key is persisted before broadcast.",
    );
  }

  const runtime = await loadCircleRuntime(circleCliRepo);
  requireCircleChainId(runtime, chain, refundChainId);
  const {
    decodeEventLog,
    decodeFunctionResult,
    encodeAbiParameters,
    encodeFunctionData,
    encodePacked,
    formatUnits,
    keccak256,
  } = runtime.viem;

  const observedEventChainId = BigInt(await rpc(eventRpcUrl, "eth_chainId", []));
  const observedRefundChainId = BigInt(
    await rpc(refundRpcUrl, "eth_chainId", []),
  );
  if (observedEventChainId !== eventChainId) {
    throw new Error(
      `Event RPC chain ID ${observedEventChainId} does not match --event-chain-id ${eventChainId}.`,
    );
  }
  if (observedRefundChainId !== refundChainId) {
    throw new Error(
      `Refund RPC chain ID ${observedRefundChainId} does not match --refund-chain-id ${refundChainId}.`,
    );
  }

  const receipt = await rpc(eventRpcUrl, "eth_getTransactionReceipt", [
    creationTx,
  ]);
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
    throw new Error(
      `Expected exactly one IntentPublished event for ${expectedIntent}; found ${matches.length}.`,
    );
  }

  const event = matches[0];
  const destination = BigInt(event.destination);
  const route = event.route;
  const routeHash = keccak256(route);
  const reward = normalizeReward(event);
  const rewardHash = keccak256(
    encodeAbiParameters(
      [{ name: "reward", type: "tuple", components: rewardComponents }],
      [reward],
    ),
  );
  const computedIntent = keccak256(
    encodePacked(
      ["uint64", "bytes32", "bytes32"],
      [destination, routeHash, rewardHash],
    ),
  );
  if (computedIntent.toLowerCase() !== expectedIntent.toLowerCase()) {
    throw new Error(
      `Reconstructed intent ${computedIntent} does not match ${expectedIntent}.`,
    );
  }

  const portalCode = await rpc(refundRpcUrl, "eth_getCode", [portal, "latest"]);
  if (!portalCode || portalCode === "0x") {
    throw new Error(`No Portal bytecode exists at ${portal} on the refund chain.`);
  }

  const statusCall = encodeFunctionData({
    abi: portalAbi,
    functionName: "getRewardStatus",
    args: [expectedIntent],
  });
  const statusRaw = await rpc(refundRpcUrl, "eth_call", [
    { to: portal, data: statusCall },
    "latest",
  ]);
  const status = Number(
    decodeFunctionResult({
      abi: portalAbi,
      functionName: "getRewardStatus",
      data: statusRaw,
    }),
  );
  const statusNames = ["Initial", "Funded", "Withdrawn", "Refunded"];
  if (status < 0 || status > 3) {
    throw new Error(`Unknown Eco reward status ${status}.`);
  }
  const terminalStatus = status === 2 || status === 3;

  const latestBlock = await rpc(refundRpcUrl, "eth_getBlockByNumber", [
    "latest",
    false,
  ]);
  const refundTimestamp = BigInt(latestBlock.timestamp);
  if (!terminalStatus && refundTimestamp < reward.deadline) {
    throw new Error(
      `Refund deadline has not passed: block=${refundTimestamp}, deadline=${reward.deadline}.`,
    );
  }

  const vaultCall = encodeFunctionData({
    abi: portalAbi,
    functionName: "intentVaultAddress",
    args: [destination, route, reward],
  });
  const vaultRaw = await rpc(refundRpcUrl, "eth_call", [
    { to: portal, data: vaultCall },
    "latest",
  ]);
  const vault = decodeFunctionResult({
    abi: portalAbi,
    functionName: "intentVaultAddress",
    data: vaultRaw,
  });

  const tokenBalances = [];
  let recoverableBalance =
    BigInt(await rpc(refundRpcUrl, "eth_getBalance", [vault, "latest"])) > 0n;
  for (const tokenReward of reward.tokens) {
    const balanceCall = encodeFunctionData({
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [vault],
    });
    const balanceRaw = await rpc(refundRpcUrl, "eth_call", [
      { to: tokenReward.token, data: balanceCall },
      "latest",
    ]);
    const balance = BigInt(
      decodeFunctionResult({
        abi: erc20Abi,
        functionName: "balanceOf",
        data: balanceRaw,
      }),
    );
    const recipientRaw = await rpc(refundRpcUrl, "eth_call", [
      {
        to: tokenReward.token,
        data: encodeFunctionData({
          abi: erc20Abi,
          functionName: "balanceOf",
          args: [reward.creator],
        }),
      },
      "latest",
    ]);
    const recipientBalance = BigInt(
      decodeFunctionResult({
        abi: erc20Abi,
        functionName: "balanceOf",
        data: recipientRaw,
      }),
    );
    if (balance > 0n) recoverableBalance = true;

    let decimals;
    let symbol;
    try {
      const data = encodeFunctionData({
        abi: erc20Abi,
        functionName: "decimals",
      });
      const raw = await rpc(refundRpcUrl, "eth_call", [
        { to: tokenReward.token, data },
        "latest",
      ]);
      decimals = Number(
        decodeFunctionResult({
          abi: erc20Abi,
          functionName: "decimals",
          data: raw,
        }),
      );
    } catch {
      decimals = undefined;
    }
    try {
      const data = encodeFunctionData({
        abi: erc20Abi,
        functionName: "symbol",
      });
      const raw = await rpc(refundRpcUrl, "eth_call", [
        { to: tokenReward.token, data },
        "latest",
      ]);
      symbol = decodeFunctionResult({
        abi: erc20Abi,
        functionName: "symbol",
        data: raw,
      });
    } catch {
      symbol = undefined;
    }

    tokenBalances.push({
      token: tokenReward.token,
      symbol,
      decimals,
      nominalAmountAtomic: tokenReward.amount,
      nominalAmount:
        decimals === undefined ? undefined : formatUnits(tokenReward.amount, decimals),
      vaultBalanceAtomic: balance,
      vaultBalance: decimals === undefined ? undefined : formatUnits(balance, decimals),
      recipientBalanceAtomic: recipientBalance,
      recipientBalance:
        decimals === undefined ? undefined : formatUnits(recipientBalance, decimals),
    });
  }
  if (!terminalStatus && !recoverableBalance) {
    throw new Error(
      `The computed vault ${vault} has no recoverable reward balance on the selected refund chain.`,
    );
  }

  const nativeVaultBalance = BigInt(
    await rpc(refundRpcUrl, "eth_getBalance", [vault, "latest"]),
  );
  const callData = encodeFunctionData({
    abi: portalAbi,
    functionName: "refund",
    args: [destination, routeHash, reward],
  });
  const simulation = terminalStatus
    ? "skipped-terminal-status"
    : await rpc(refundRpcUrl, "eth_call", [
        { from: sca, to: portal, data: callData },
        "latest",
      ]);
  if (!terminalStatus && simulation !== "0x") {
    throw new Error(`Unexpected Eco refund simulation result ${simulation}.`);
  }

  let circleContext;
  const creator = reward.creator.toLowerCase();
  let recipientOwnership =
    creator === sca.toLowerCase()
      ? { checked: true, match: "sca", backingEoa: undefined }
      : { checked: false, match: undefined, backingEoa: undefined };
  let estimatedFee;
  if (
    !terminalStatus &&
    recipientOwnership.match !== "sca" &&
    (args["estimate-fee"] || args.submit)
  ) {
    const resolved = await resolveAgentWallet(runtime, chain, sca, args);
    const walletDetail = await resolved.client.getWallet(
      resolved.env.userToken,
      resolved.wallet.id,
    );
    const backingEoa = walletDetail.eoaOwnerAddress
      ? requireAddress(
          walletDetail.eoaOwnerAddress,
          "Circle wallet eoaOwnerAddress",
        )
      : undefined;
    const match =
      creator === backingEoa?.toLowerCase() ? "backing-eoa" : undefined;
    if (!match) {
      throw new Error(
        `Refusing to spend gas: fixed refund recipient ${reward.creator} is neither Circle wallet SCA ${resolved.wallet.address} nor its verified backing EOA${backingEoa ? ` ${backingEoa}` : " (not returned by Circle)"}.`,
      );
    }
    const feeEstimate = await resolved.client.estimateContractExecutionFee(
      resolved.env.userToken,
      {
        walletId: resolved.wallet.id,
        sourceAddress: resolved.wallet.address,
        blockchain: resolved.wallet.blockchain,
        contractAddress: portal,
        callData,
      },
    );
    recipientOwnership = { checked: true, match, backingEoa };
    estimatedFee = runtime.pickSubmittedFee(feeEstimate);
    circleContext = resolved;
  }

  const preflight = {
    operation: "eco-self-refund",
    mode: args.submit ? "submit-requested" : "read-only",
    action: terminalStatus
      ? "stop-no-broadcast"
      : recipientOwnership.match === "sca"
        ? "stop-current-direct-to-sca"
        : !recipientOwnership.checked || estimatedFee === undefined
          ? "diagnostic-only-add-estimate-fee"
          : "eligible-after-approval",
    refusedReason: terminalStatus
      ? `Intent reward status is already ${statusNames[status]}.`
      : recipientOwnership.match === "sca"
        ? `Fixed refund recipient ${reward.creator} is the selected Circle wallet SCA. This is the current direct-to-SCA flow; reconcile balances or escalate instead.`
        : !recipientOwnership.checked || estimatedFee === undefined
          ? "Recipient ownership and fee were not verified; re-run with --estimate-fee before requesting approval."
          : undefined,
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
    rewardStatus: { value: status, name: statusNames[status] },
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
    estimatedFee,
  };
  const preflightEvidence = await writeEvidence(
    evidenceDir,
    "eco-self-refund-preflight",
    preflight,
  );
  process.stdout.write(`${json({ data: { ...preflight, preflightEvidence } })}\n`);

  if (!args.submit) return;
  if (terminalStatus || recipientOwnership.match === "sca") {
    process.exitCode = 2;
    return;
  }
  const confirmedIntent = required(args, "confirm-intent");
  if (confirmedIntent.toLowerCase() !== expectedIntent.toLowerCase()) {
    throw new Error(
      "--confirm-intent must exactly match --intent-hash after the user approves the preflight.",
    );
  }

  if (!circleContext) {
    throw new Error("Circle wallet ownership and fee preflight was not completed.");
  }
  const { env, proxyUrl, client, wallet } = circleContext;
  const idempotencyKey = freshIdempotencyKey(args["idempotency-key"]);
  const submissionIntentEvidence = await writeEvidence(
    evidenceDir,
    "eco-self-refund-submission-intent",
    {
      operation: "eco-self-refund",
      circleChain: chain,
      intentHash: expectedIntent,
      sca: wallet.address,
      portal,
      idempotencyKey,
      callDataSha256: sha256(callData),
    },
  );
  const submission = await runtime.submitAgentContractExecutionChallenge(
    client,
    env.userToken,
    wallet,
    { contractAddress: portal, callData, idempotencyKey },
  );
  const transaction = await runtime.runTransactionChallenge(
    proxyUrl,
    client,
    env,
    submission.challengeId,
    submission.idempotencyKey,
    ["--output", "json"],
  );
  if (!transaction) {
    throw new Error(
      `Circle submission became ambiguous. Reconcile intent ${expectedIntent} and idempotency key ${submission.idempotencyKey} before retrying.`,
    );
  }

  const postStatusRaw = await rpc(refundRpcUrl, "eth_call", [
    { to: portal, data: statusCall },
    "latest",
  ]);
  const postStatus = Number(
    decodeFunctionResult({
      abi: portalAbi,
      functionName: "getRewardStatus",
      data: postStatusRaw,
    }),
  );
  const postTokenBalances = [];
  for (const tokenReward of reward.tokens) {
    const readBalance = async (account) => {
      const raw = await rpc(refundRpcUrl, "eth_call", [
        {
          to: tokenReward.token,
          data: encodeFunctionData({
            abi: erc20Abi,
            functionName: "balanceOf",
            args: [account],
          }),
        },
        "latest",
      ]);
      return BigInt(
        decodeFunctionResult({
          abi: erc20Abi,
          functionName: "balanceOf",
          data: raw,
        }),
      );
    };
    postTokenBalances.push({
      token: tokenReward.token,
      vaultBalanceAtomic: await readBalance(vault),
      recipientBalanceAtomic: await readBalance(reward.creator),
    });
  }

  const result = {
    operation: "eco-self-refund",
    intentHash: expectedIntent,
    fixedRecipient: reward.creator,
    estimatedFee,
    submissionIntentEvidence,
    transaction,
    postState: {
      rewardStatus: { value: postStatus, name: statusNames[postStatus] },
      tokenBalances: postTokenBalances,
      nativeVaultBalance: BigInt(
        await rpc(refundRpcUrl, "eth_getBalance", [vault, "latest"]),
      ),
    },
  };
  const resultEvidence = await writeEvidence(
    evidenceDir,
    "eco-self-refund-result",
    result,
  );
  process.stdout.write(`${json({ data: { ...result, resultEvidence } })}\n`);
  if (isFailedTransaction(transaction.state)) process.exitCode = 1;
}

main().catch((error) => {
  process.stderr.write(`${safeErrorMessage(error)}\n`);
  process.exitCode = 1;
});
