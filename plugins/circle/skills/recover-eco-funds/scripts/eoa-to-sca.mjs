#!/usr/bin/env node

import { randomBytes } from "node:crypto";

import {
  freshIdempotencyKey,
  isFailedTransaction,
  json,
  loadCircleRuntime,
  parseArgs,
  required,
  requireAddress,
  requireCircleChainId,
  resolveAgentWallet,
  rpc,
  rpcOrigin,
  safeErrorMessage,
  sha256,
  writeEvidence,
} from "./_shared.mjs";

const HELP = `Usage:
  <circle-cli-repo>/node_modules/.bin/tsx scripts/eoa-to-sca.mjs \\
    --circle-cli-repo <path> --chain <Circle chain code> --chain-id <id> \\
    --rpc-url <url> --sca <address> --usdc <address> \\
    --amount-atomic <integer> [--expected-eoa <address>] \\
    [--usdc-name <name>] [--usdc-version <version>] \\
    [--validity-seconds <seconds>] [--evidence-dir <path>] [--estimate-fee]

The default mode resolves the backing EOA and prints an unsigned plan.
--estimate-fee adds a pre-signing fee estimate using an ephemeral, zero-value
authorization that cannot move user funds.

After reviewing that estimate, set an approved native-token fee ceiling and add:
  --submit --confirm-transfer <BACKING_EOA>:<SCA>:<ATOMIC_AMOUNT>
  --max-network-fee <decimal-native-token-amount>
  [--idempotency-key <uuid>]
  --evidence-dir is required with --submit so the key is durable first.

If CIRCLE_PROXY_URL is set, inspect it and explicitly pass:
  --allow-proxy-origin <scheme://trusted-host>

Exit codes: 0 = requested mode completed, 1 = error or failed transaction,
  2 = submit requested but safely refused before signing or broadcast.
`;

const erc3009Abi = [
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
    name: "name",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "name", type: "string" }],
  },
  {
    type: "function",
    name: "version",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "version", type: "string" }],
  },
  {
    type: "function",
    name: "authorizationState",
    stateMutability: "view",
    inputs: [
      { name: "authorizer", type: "address" },
      { name: "nonce", type: "bytes32" },
    ],
    outputs: [{ name: "used", type: "bool" }],
  },
  {
    type: "function",
    name: "transferWithAuthorization",
    stateMutability: "nonpayable",
    inputs: [
      { name: "from", type: "address" },
      { name: "to", type: "address" },
      { name: "value", type: "uint256" },
      { name: "validAfter", type: "uint256" },
      { name: "validBefore", type: "uint256" },
      { name: "nonce", type: "bytes32" },
      { name: "v", type: "uint8" },
      { name: "r", type: "bytes32" },
      { name: "s", type: "bytes32" },
    ],
    outputs: [],
  },
];

const authorizationTypes = {
  TransferWithAuthorization: [
    { name: "from", type: "address" },
    { name: "to", type: "address" },
    { name: "value", type: "uint256" },
    { name: "validAfter", type: "uint256" },
    { name: "validBefore", type: "uint256" },
    { name: "nonce", type: "bytes32" },
  ],
};

const eip712DomainType = [
  { name: "name", type: "string" },
  { name: "version", type: "string" },
  { name: "chainId", type: "uint256" },
  { name: "verifyingContract", type: "address" },
];

function unpackSignature(parseSignature, signature) {
  const parsed = parseSignature(signature);
  const v =
    parsed.v !== undefined
      ? Number(parsed.v)
      : parsed.yParity !== undefined
        ? Number(parsed.yParity) + 27
        : Number.NaN;
  if ((v !== 27 && v !== 28) || !parsed.r || !parsed.s) {
    throw new Error("Could not parse a canonical ECDSA signature.");
  }
  return { v, r: parsed.r, s: parsed.s };
}

function parseNativeFee(parseUnits, value, label) {
  if (!/^(?:0|[1-9][0-9]*)(?:\.[0-9]{1,18})?$/.test(value)) {
    throw new Error(
      `${label} must be a non-negative decimal with at most 18 places.`,
    );
  }
  return parseUnits(value, 18);
}

function requireEstimatedNetworkFee(parseUnits, estimatedFee) {
  const value = estimatedFee?.medium?.networkFee;
  if (typeof value !== "string") {
    throw new Error("Circle fee estimate did not include medium.networkFee.");
  }
  return {
    value,
    atomic: parseNativeFee(parseUnits, value, "Estimated network fee"),
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
  const chainId = BigInt(required(args, "chain-id"));
  const rpcUrl = required(args, "rpc-url");
  const sca = requireAddress(required(args, "sca"), "--sca");
  const usdc = requireAddress(required(args, "usdc"), "--usdc");
  const amount = BigInt(required(args, "amount-atomic"));
  if (amount <= 0n) throw new Error("--amount-atomic must be positive.");
  const validitySeconds = BigInt(
    typeof args["validity-seconds"] === "string"
      ? args["validity-seconds"]
      : "3600",
  );
  if (validitySeconds < 60n || validitySeconds > 86_400n) {
    throw new Error("--validity-seconds must be between 60 and 86400.");
  }
  const evidenceDir =
    typeof args["evidence-dir"] === "string" ? args["evidence-dir"] : undefined;
  if (args.submit && !evidenceDir) {
    throw new Error(
      "--evidence-dir is required with --submit so the idempotency key is persisted before broadcast.",
    );
  }

  const runtime = await loadCircleRuntime(circleCliRepo);
  requireCircleChainId(runtime, chain, chainId);
  const {
    decodeFunctionResult,
    encodeFunctionData,
    formatUnits,
    parseUnits,
    parseSignature,
    recoverTypedDataAddress,
  } = runtime.viem;
  const { env, proxyUrl, client, wallet } = await resolveAgentWallet(
    runtime,
    chain,
    sca,
    args,
  );

  const walletDetail = await client.getWallet(env.userToken, wallet.id);
  const backingEoa = requireAddress(
    walletDetail.eoaOwnerAddress,
    "Circle wallet eoaOwnerAddress",
  );
  if (typeof args["expected-eoa"] === "string") {
    const expectedEoa = requireAddress(args["expected-eoa"], "--expected-eoa");
    if (expectedEoa.toLowerCase() !== backingEoa.toLowerCase()) {
      throw new Error(
        `Circle returned backing EOA ${backingEoa}, not expected ${expectedEoa}.`,
      );
    }
  }

  const observedChainId = BigInt(await rpc(rpcUrl, "eth_chainId", []));
  if (observedChainId !== chainId) {
    throw new Error(
      `RPC chain ID ${observedChainId} does not match --chain-id ${chainId}.`,
    );
  }
  const tokenCode = await rpc(rpcUrl, "eth_getCode", [usdc, "latest"]);
  if (!tokenCode || tokenCode === "0x") {
    throw new Error(`No token bytecode exists at ${usdc}.`);
  }

  const readToken = async (functionName, functionArgs = []) => {
    const data = encodeFunctionData({
      abi: erc3009Abi,
      functionName,
      args: functionArgs,
    });
    const raw = await rpc(rpcUrl, "eth_call", [
      { to: usdc, data },
      "latest",
    ]);
    return decodeFunctionResult({
      abi: erc3009Abi,
      functionName,
      data: raw,
    });
  };

  const decimals = Number(await readToken("decimals"));
  if (decimals !== 6) {
    throw new Error(
      `Token ${usdc} reports ${decimals} decimals; expected native USDC with 6.`,
    );
  }
  let tokenName =
    typeof args["usdc-name"] === "string" ? args["usdc-name"] : undefined;
  let tokenVersion =
    typeof args["usdc-version"] === "string"
      ? args["usdc-version"]
      : undefined;
  if (!tokenName) tokenName = String(await readToken("name"));
  if (!tokenVersion) tokenVersion = String(await readToken("version"));
  if (!tokenName || !tokenVersion) {
    throw new Error(
      "Could not resolve the USDC EIP-712 domain name/version. Supply audited --usdc-name and --usdc-version values.",
    );
  }

  const ownerBalance = BigInt(await readToken("balanceOf", [backingEoa]));
  const scaBalance = BigInt(await readToken("balanceOf", [sca]));
  const sufficientBalance = ownerBalance >= amount;

  const approvedMaxNetworkFee = args.submit
    ? required(args, "max-network-fee")
    : undefined;
  const approvedMaxNetworkFeeAtomic = approvedMaxNetworkFee
    ? parseNativeFee(parseUnits, approvedMaxNetworkFee, "--max-network-fee")
    : undefined;

  let estimatedFee;
  let estimatedNetworkFee;
  let estimatedNetworkFeeAtomic;
  let feeProbe;
  if (args["estimate-fee"] || args.submit) {
    const probeAccount = runtime.viemAccounts.privateKeyToAccount(
      `0x${randomBytes(32).toString("hex")}`,
    );
    const probeValidAfter = 0n;
    const probeValidBefore =
      BigInt(Math.floor(Date.now() / 1000)) + validitySeconds;
    const probeNonce = `0x${randomBytes(32).toString("hex")}`;
    const probeMessage = {
      from: probeAccount.address,
      to: sca,
      value: 0n,
      validAfter: probeValidAfter,
      validBefore: probeValidBefore,
      nonce: probeNonce,
    };
    const probeSignature = await probeAccount.signTypedData({
      domain: {
        name: tokenName,
        version: tokenVersion,
        chainId,
        verifyingContract: usdc,
      },
      types: authorizationTypes,
      primaryType: "TransferWithAuthorization",
      message: probeMessage,
    });
    const probeParsed = unpackSignature(parseSignature, probeSignature);
    const probeCallData = encodeFunctionData({
      abi: erc3009Abi,
      functionName: "transferWithAuthorization",
      args: [
        probeAccount.address,
        sca,
        0n,
        probeValidAfter,
        probeValidBefore,
        probeNonce,
        probeParsed.v,
        probeParsed.r,
        probeParsed.s,
      ],
    });
    const probeSimulation = await rpc(rpcUrl, "eth_call", [
      { from: sca, to: usdc, data: probeCallData },
      "latest",
    ]);
    if (probeSimulation !== "0x") {
      throw new Error(
        `Unexpected zero-value fee-probe result ${probeSimulation}.`,
      );
    }
    const feeEstimate = await client.estimateContractExecutionFee(
      env.userToken,
      {
        walletId: wallet.id,
        sourceAddress: wallet.address,
        blockchain: wallet.blockchain,
        contractAddress: usdc,
        callData: probeCallData,
      },
    );
    estimatedFee = runtime.pickSubmittedFee(feeEstimate);
    const selectedFee = requireEstimatedNetworkFee(parseUnits, estimatedFee);
    estimatedNetworkFee = selectedFee.value;
    estimatedNetworkFeeAtomic = selectedFee.atomic;
    feeProbe = {
      kind: "ephemeral-zero-value-erc3009",
      authorizesUserFunds: false,
      simulation: probeSimulation,
      callDataSha256: sha256(probeCallData),
    };
  }

  const feeWithinApprovedMaximum =
    approvedMaxNetworkFeeAtomic === undefined
      ? undefined
      : estimatedNetworkFeeAtomic <= approvedMaxNetworkFeeAtomic;
  const feePreflightComplete = estimatedFee !== undefined;
  const safelyEligible =
    sufficientBalance &&
    feePreflightComplete &&
    feeWithinApprovedMaximum !== false;

  const plan = {
    operation: "backing-eoa-to-sca",
    mode: args.submit ? "submit-requested" : "unsigned-read-only",
    action: !sufficientBalance
      ? "stop-insufficient-backing-eoa-balance"
      : !feePreflightComplete
        ? "diagnostic-only-add-estimate-fee"
        : feeWithinApprovedMaximum === false
          ? "stop-fee-exceeds-approved-maximum"
          : "eligible-after-approval",
    refusedReason: !sufficientBalance
      ? `Backing EOA balance ${ownerBalance} is lower than requested amount ${amount}.`
      : !feePreflightComplete
        ? "Fee was not estimated; re-run with --estimate-fee before requesting approval."
        : feeWithinApprovedMaximum === false
          ? `Estimated network fee ${estimatedNetworkFee} exceeds approved maximum ${approvedMaxNetworkFee}.`
          : undefined,
    circleChain: chain,
    chainId,
    rpcOrigin: rpcOrigin(rpcUrl),
    token: {
      address: usdc,
      codeSha256: sha256(tokenCode),
      name: tokenName,
      version: tokenVersion,
      decimals,
    },
    backingEoa,
    linkedSca: sca,
    amountAtomic: amount,
    amount: formatUnits(amount, decimals),
    validitySeconds,
    balancesBefore: {
      backingEoaAtomic: ownerBalance,
      backingEoa: formatUnits(ownerBalance, decimals),
      scaAtomic: scaBalance,
      sca: formatUnits(scaBalance, decimals),
    },
    feeProbe,
    estimatedFee,
    feeApproval:
      approvedMaxNetworkFee === undefined
        ? undefined
        : {
            estimatedNetworkFee,
            approvedMaxNetworkFee,
            withinMaximum: feeWithinApprovedMaximum,
          },
  };
  const planEvidence = await writeEvidence(
    evidenceDir,
    "eoa-to-sca-unsigned-plan",
    plan,
  );
  process.stdout.write(`${json({ data: { ...plan, planEvidence } })}\n`);

  if (!args.submit) return;
  if (!safelyEligible) {
    process.exitCode = 2;
    return;
  }

  const expectedConfirmation = `${backingEoa}:${sca}:${amount}`.toLowerCase();
  const confirmation = required(args, "confirm-transfer").toLowerCase();
  if (confirmation !== expectedConfirmation) {
    throw new Error(
      `--confirm-transfer must exactly equal ${backingEoa}:${sca}:${amount}.`,
    );
  }

  const validAfter = 0n;
  const validBefore = BigInt(Math.floor(Date.now() / 1000)) + validitySeconds;
  const nonce = `0x${randomBytes(32).toString("hex")}`;
  const domain = {
    name: tokenName,
    version: tokenVersion,
    chainId,
    verifyingContract: usdc,
  };
  const message = {
    from: backingEoa,
    to: sca,
    value: amount,
    validAfter,
    validBefore,
    nonce,
  };
  const typedDataForCircle = {
    types: {
      EIP712Domain: eip712DomainType,
      ...authorizationTypes,
    },
    primaryType: "TransferWithAuthorization",
    domain: {
      ...domain,
      chainId: chainId.toString(),
    },
    message: {
      ...message,
      value: amount.toString(),
      validAfter: validAfter.toString(),
      validBefore: validBefore.toString(),
    },
  };

  const signResponse = await fetch(`${proxyUrl}/v1/w3s/user/sign/typedData`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "X-User-Token": env.userToken,
    },
    body: JSON.stringify({
      walletAddress: backingEoa,
      blockchain: chain,
      data: JSON.stringify(typedDataForCircle),
    }),
    signal: AbortSignal.timeout(30_000),
  });
  const signBody = await signResponse.json();
  if (!signResponse.ok) {
    throw new Error(
      `Circle backing-EOA sign request failed (${signResponse.status}). Do not fall back to SCA wallet-ID signing.`,
    );
  }
  const signChallengeId =
    signBody?.data?.challengeId ?? signBody?.challengeId;
  if (!signChallengeId) throw new Error("Circle sign response lacked challengeId.");

  const challengeResult = await runtime.executeChallenge(
    client,
    proxyUrl,
    env,
    signChallengeId,
  );
  const signature = challengeResult?.data?.signature ?? challengeResult?.signature;
  if (!/^0x[0-9a-f]{130}$/i.test(signature)) {
    throw new Error("Circle returned an unexpected typed-data signature shape.");
  }

  const recoveredSigner = await recoverTypedDataAddress({
    domain,
    types: authorizationTypes,
    primaryType: "TransferWithAuthorization",
    message,
    signature,
  });
  if (recoveredSigner.toLowerCase() !== backingEoa.toLowerCase()) {
    throw new Error(
      `Authorization recovered ${recoveredSigner}, expected ${backingEoa}.`,
    );
  }

  const parsed = unpackSignature(parseSignature, signature);

  const usedBefore = Boolean(
    await readToken("authorizationState", [backingEoa, nonce]),
  );
  if (usedBefore) throw new Error(`Fresh authorization nonce ${nonce} is already used.`);

  const callData = encodeFunctionData({
    abi: erc3009Abi,
    functionName: "transferWithAuthorization",
    args: [
      backingEoa,
      sca,
      amount,
      validAfter,
      validBefore,
      nonce,
      parsed.v,
      parsed.r,
      parsed.s,
    ],
  });
  const simulation = await rpc(rpcUrl, "eth_call", [
    { from: sca, to: usdc, data: callData },
    "latest",
  ]);
  if (simulation !== "0x") {
    throw new Error(`Unexpected USDC simulation result ${simulation}.`);
  }

  const feeEstimate = await client.estimateContractExecutionFee(env.userToken, {
    walletId: wallet.id,
    sourceAddress: wallet.address,
    blockchain: wallet.blockchain,
    contractAddress: usdc,
    callData,
  });
  const exactEstimatedFee = runtime.pickSubmittedFee(feeEstimate);
  const exactNetworkFee = requireEstimatedNetworkFee(
    parseUnits,
    exactEstimatedFee,
  );
  const exactFeeWithinApprovedMaximum =
    exactNetworkFee.atomic <= approvedMaxNetworkFeeAtomic;
  const idempotencyKey = freshIdempotencyKey(args["idempotency-key"]);
  const signedPreflight = {
    operation: "backing-eoa-to-sca",
    backingEoa,
    linkedSca: sca,
    amountAtomic: amount,
    validAfter,
    validBefore,
    validBeforeIso: new Date(Number(validBefore) * 1000).toISOString(),
    nonce,
    recoveredSigner,
    signatureSha256: sha256(signature),
    callDataSha256: sha256(callData),
    authorizationUsedBefore: usedBefore,
    simulation,
    estimatedFee: exactEstimatedFee,
    feeApproval: {
      estimatedNetworkFee: exactNetworkFee.value,
      approvedMaxNetworkFee,
      withinMaximum: exactFeeWithinApprovedMaximum,
    },
    idempotencyKey,
  };
  const signedEvidence = await writeEvidence(
    evidenceDir,
    "eoa-to-sca-signed-preflight",
    signedPreflight,
  );
  if (!exactFeeWithinApprovedMaximum) {
    process.stdout.write(
      `${json({
        data: {
          ...signedPreflight,
          action: "stop-fee-exceeds-approved-maximum-before-broadcast",
          refusedReason: `Exact network fee ${exactNetworkFee.value} exceeds approved maximum ${approvedMaxNetworkFee}. The authorization was signed but not broadcast; reconcile nonce ${nonce} and let it expire before creating another.`,
          signedEvidence,
        },
      })}\n`,
    );
    process.exitCode = 2;
    return;
  }
  const ownerBalanceBeforeBroadcast = BigInt(
    await readToken("balanceOf", [backingEoa]),
  );
  if (ownerBalanceBeforeBroadcast < amount) {
    const refusal = {
      ...signedPreflight,
      action: "stop-insufficient-backing-eoa-balance-before-broadcast",
      refusedReason: `Backing EOA balance changed to ${ownerBalanceBeforeBroadcast}, below the authorized amount ${amount}. The authorization was signed but not broadcast; reconcile nonce ${nonce} and let it expire before creating another.`,
      ownerBalanceBeforeBroadcast,
    };
    const refusalEvidence = await writeEvidence(
      evidenceDir,
      "eoa-to-sca-prebroadcast-refusal",
      refusal,
    );
    process.stdout.write(
      `${json({ data: { ...refusal, refusalEvidence } })}\n`,
    );
    process.exitCode = 2;
    return;
  }
  const submission = await runtime.submitAgentContractExecutionChallenge(
    client,
    env.userToken,
    wallet,
    { contractAddress: usdc, callData, idempotencyKey },
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
      `Circle submission became ambiguous. Reconcile nonce ${nonce} and idempotency key ${submission.idempotencyKey} before signing again.`,
    );
  }

  const ownerAfter = BigInt(await readToken("balanceOf", [backingEoa]));
  const scaAfter = BigInt(await readToken("balanceOf", [sca]));
  const authorizationUsedAfter = Boolean(
    await readToken("authorizationState", [backingEoa, nonce]),
  );
  const result = {
    operation: "backing-eoa-to-sca",
    backingEoa,
    linkedSca: sca,
    amountAtomic: amount,
    nonce,
    signatureSha256: sha256(signature),
    signedEvidence,
    transaction,
    balancesAfter: {
      backingEoaAtomic: ownerAfter,
      backingEoa: formatUnits(ownerAfter, decimals),
      scaAtomic: scaAfter,
      sca: formatUnits(scaAfter, decimals),
    },
    authorizationUsedAfter,
  };
  const resultEvidence = await writeEvidence(
    evidenceDir,
    "eoa-to-sca-result",
    result,
  );
  process.stdout.write(`${json({ data: { ...result, resultEvidence } })}\n`);
  if (isFailedTransaction(transaction.state)) process.exitCode = 1;
}

main().catch((error) => {
  process.stderr.write(`${safeErrorMessage(error)}\n`);
  process.exitCode = 1;
});
