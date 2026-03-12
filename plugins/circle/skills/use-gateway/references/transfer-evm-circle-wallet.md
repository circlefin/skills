# Transfer Gateway Balance (EVM) via Circle Developer-Controlled Wallets

```ts
import { randomBytes } from "node:crypto";
import { initiateDeveloperControlledWalletsClient } from "@circle-fin/developer-controlled-wallets";

import {
  type ChainConfig,
  GATEWAY_CONFIG,
  ethereumContracts,
  baseContracts,
  avalancheContracts,
  arcContracts,
} from "./contract-addresses.js";

// Circle developer-controlled wallets SDK uses its own blockchain identifiers.
const CHAIN_TO_WALLET_BLOCKCHAIN: Record<string, { testnet?: string; mainnet?: string }> = {
  ethereum:  { testnet: "ETH-SEPOLIA", mainnet: "ETH" },
  base:      { testnet: "BASE-SEPOLIA", mainnet: "BASE" },
  avalanche: { testnet: "AVAX-FUJI", mainnet: "AVAX" },
  arc:       { testnet: "ARC-TESTNET" },
};

const CHAIN_CONFIGS: Record<string, ChainConfig> = {
  ethereum: ethereumContracts,
  base: baseContracts,
  avalanche: avalancheContracts,
  arc: arcContracts,
};

const NETWORK = "testnet" as "mainnet" | "testnet";

const API_KEY = process.env.CIRCLE_API_KEY!;
const ENTITY_SECRET = process.env.CIRCLE_ENTITY_SECRET!;
const DEPOSITOR_ADDRESS = process.env.DEPOSITOR_ADDRESS!;
const DESTINATION_CHAIN = "base";
const RECIPIENT_ADDRESS = "<RECIPIENT_ADDRESS>";
const TRANSFER_AMOUNT_USDC = "1";
const MAX_FEE = 2_010000n;

/* ── EIP-712 definitions ── */

const EIP712_DOMAIN = { name: "GatewayWallet", version: "1" } as const;

const EIP712_TYPES = {
  EIP712Domain: [
    { name: "name", type: "string" },
    { name: "version", type: "string" },
  ],
  TransferSpec: [
    { name: "version", type: "uint32" },
    { name: "sourceDomain", type: "uint32" },
    { name: "destinationDomain", type: "uint32" },
    { name: "sourceContract", type: "bytes32" },
    { name: "destinationContract", type: "bytes32" },
    { name: "sourceToken", type: "bytes32" },
    { name: "destinationToken", type: "bytes32" },
    { name: "sourceDepositor", type: "bytes32" },
    { name: "destinationRecipient", type: "bytes32" },
    { name: "sourceSigner", type: "bytes32" },
    { name: "destinationCaller", type: "bytes32" },
    { name: "value", type: "uint256" },
    { name: "salt", type: "bytes32" },
    { name: "hookData", type: "bytes" },
  ],
  BurnIntent: [
    { name: "maxBlockHeight", type: "uint256" },
    { name: "maxFee", type: "uint256" },
    { name: "spec", type: "TransferSpec" },
  ],
} as const;

/* ── Helpers ── */

const MAX_UINT256_DEC = ((1n << 256n) - 1n).toString();

function addressToBytes32(addr: string): string {
  return "0x" + addr.toLowerCase().replace(/^0x/, "").padStart(64, "0");
}

function parseToBaseUnits(value: string): string {
  const [whole, decimal = ""] = value.split(".");
  return (whole || "0") + (decimal + "000000").slice(0, 6);
}

function stringifyBigInts<T>(obj: T): string {
  return JSON.stringify(obj, (_k, v) => (typeof v === "bigint" ? v.toString() : v));
}

async function waitForTxCompletion(
  client: ReturnType<typeof initiateDeveloperControlledWalletsClient>,
  txId: string,
  label: string,
) {
  const terminalStates = new Set(["COMPLETE", "CONFIRMED", "FAILED", "DENIED", "CANCELLED"]);

  while (true) {
    const { data } = await client.getTransaction({ id: txId });
    const state = data?.transaction?.state;

    if (state && terminalStates.has(state)) {
      if (state !== "COMPLETE" && state !== "CONFIRMED") {
        throw new Error(`${label} did not complete (state=${state})`);
      }
      return data.transaction;
    }
    await new Promise((r) => setTimeout(r, 3000));
  }
}

/* ── Burn intent construction ── */

function createBurnIntent(params: {
  sourceChain: string;
  depositorAddress: string;
  recipientAddress?: string;
}) {
  const { sourceChain, depositorAddress, recipientAddress = depositorAddress } = params;
  const source = CHAIN_CONFIGS[sourceChain]?.[NETWORK];
  const dest = CHAIN_CONFIGS[DESTINATION_CHAIN]?.[NETWORK];
  if (!source || !dest) throw new Error(`Missing ${NETWORK} config for source or destination`);

  const value = parseToBaseUnits(TRANSFER_AMOUNT_USDC);

  return {
    maxBlockHeight: MAX_UINT256_DEC,
    maxFee: MAX_FEE,
    spec: {
      version: 1,
      sourceDomain: CHAIN_CONFIGS[sourceChain].domain,
      destinationDomain: CHAIN_CONFIGS[DESTINATION_CHAIN].domain,
      sourceContract: addressToBytes32(source.GatewayWallet),
      destinationContract: addressToBytes32(dest.GatewayMinter),
      sourceToken: addressToBytes32(source.USDCAddress),
      destinationToken: addressToBytes32(dest.USDCAddress),
      sourceDepositor: addressToBytes32(depositorAddress),
      destinationRecipient: addressToBytes32(recipientAddress),
      sourceSigner: addressToBytes32(depositorAddress),
      destinationCaller: addressToBytes32("0x0000000000000000000000000000000000000000"),
      value,
      salt: "0x" + randomBytes(32).toString("hex"),
      hookData: "0x",
    },
  };
}

function burnIntentTypedData(burnIntent: ReturnType<typeof createBurnIntent>) {
  return {
    types: EIP712_TYPES,
    domain: EIP712_DOMAIN,
    primaryType: "BurnIntent",
    message: burnIntent,
  };
}

/* ── Main ── */

async function main() {
  const client = initiateDeveloperControlledWalletsClient({
    apiKey: API_KEY,
    entitySecret: ENTITY_SECRET,
  });

  // Select source chains from CLI args (e.g. `npx ts-node transfer.ts ethereum base` or `all`)
  const args = process.argv.slice(2).map((c) => c.toLowerCase());
  const validChains = Object.keys(CHAIN_CONFIGS);

  if (args.length === 0) {
    throw new Error(`Usage: npx ts-node transfer.ts <chain1> [chain2...] | all\nValid: ${validChains.join(", ")}`);
  }

  const selectedChains = args[0] === "all" ? validChains : args;

  const invalid = selectedChains.filter((c) => !CHAIN_CONFIGS[c]);
  if (invalid.length > 0) {
    throw new Error(`Unsupported chain(s): ${invalid.join(", ")}. Valid: ${validChains.join(", ")}`);
  }

  // [1] Build & sign burn intents
  const requests = [];

  for (const chain of selectedChains) {
    const blockchain = CHAIN_TO_WALLET_BLOCKCHAIN[chain]?.[NETWORK];
    if (!blockchain) throw new Error(`No ${NETWORK} wallet blockchain for ${chain}`);

    const burnIntent = createBurnIntent({
      sourceChain: chain,
      depositorAddress: DEPOSITOR_ADDRESS,
      recipientAddress: RECIPIENT_ADDRESS,
    });

    const typedData = burnIntentTypedData(burnIntent);

    const sigResp = await client.signTypedData({
      walletAddress: DEPOSITOR_ADDRESS,
      blockchain,
      data: stringifyBigInts(typedData),
    });

    requests.push({
      burnIntent: typedData.message,
      signature: sigResp.data?.signature,
    });
  }

  // [2] Submit burn intents to Gateway API for attestation
  const gatewayUrl = NETWORK === "mainnet" ? GATEWAY_CONFIG.MAINNET_URL : GATEWAY_CONFIG.TESTNET_URL;

  const response = await fetch(`${gatewayUrl}/transfer`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: stringifyBigInts(requests),
  });

  if (!response.ok) {
    throw new Error(`Gateway API error ${response.status}: ${await response.text()}`);
  }

  const { attestation, signature: operatorSig } = (await response.json()) as {
    attestation: string;
    signature: string;
  };

  if (!attestation || !operatorSig) {
    throw new Error("Gateway response missing attestation or signature");
  }

  // [3] Mint on destination chain
  const destBlockchain = CHAIN_TO_WALLET_BLOCKCHAIN[DESTINATION_CHAIN]?.[NETWORK];
  const destConfig = CHAIN_CONFIGS[DESTINATION_CHAIN]?.[NETWORK];
  if (!destBlockchain || !destConfig) throw new Error("Missing destination config");

  const tx = await client.createContractExecutionTransaction({
    walletAddress: DEPOSITOR_ADDRESS,
    blockchain: destBlockchain,
    contractAddress: destConfig.GatewayMinter,
    abiFunctionSignature: "gatewayMint(bytes,bytes)",
    abiParameters: [attestation, operatorSig],
    fee: { type: "level", config: { feeLevel: "MEDIUM" } },
  });

  const txId = tx.data?.id;
  if (!txId) throw new Error("Failed to submit mint transaction");
  await waitForTxCompletion(client, txId, "USDC mint");

  console.log(`Minted USDC on ${DESTINATION_CHAIN} (tx: ${txId})`);
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
```

**Environment variables**:
- `CIRCLE_API_KEY` -- Circle developer API key
- `CIRCLE_ENTITY_SECRET` -- Entity secret for developer-controlled wallets
- `DEPOSITOR_ADDRESS` -- EVM address of the developer-controlled wallet that holds the Gateway balance

**Dependencies**: `@circle-fin/developer-controlled-wallets`
