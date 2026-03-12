# Depositing USDC on EVM from a Circle Developer-Controlled Wallet

## Prerequisite: Create Wallets

You must create a developer-controlled EOA wallet on **every chain** you plan to deposit from **and** transfer to.

Each wallet also needs testnet native tokens (for gas) and test USDC. Use the [Circle Faucet](https://faucet.circle.com/) for USDC and the [Console Faucet](https://console.circle.com/faucet) for native tokens.

```ts
import "dotenv/config";
import { initiateDeveloperControlledWalletsClient } from "@circle-fin/developer-controlled-wallets";

const client = initiateDeveloperControlledWalletsClient({
  apiKey: process.env.CIRCLE_API_KEY!,
  entitySecret: process.env.CIRCLE_ENTITY_SECRET!,
});

const walletSetResponse = await client.createWalletSet({
  name: "Gateway Wallets",
});

const walletsResponse = await client.createWallets({
  blockchains: ["ARC-TESTNET", "AVAX-FUJI", "BASE-SEPOLIA", "ETH-SEPOLIA"],
  count: 1,
  walletSetId: walletSetResponse.data?.walletSet?.id ?? "",
  metadata: [{ refId: "source-depositor" }],
});

// All wallets created this way will share the same address — use it as DEPOSITOR_ADDRESS
const address = walletsResponse.data?.wallets?.[0]?.address;
```

## Deposit Script

```ts
import { initiateDeveloperControlledWalletsClient } from "@circle-fin/developer-controlled-wallets";

import {
  type ChainConfig,
  ethereumContracts,
  baseContracts,
  avalancheContracts,
  arcContracts,
} from "./contract-addresses.js";

// Circle developer-controlled wallets SDK uses its own blockchain identifiers.
// Map each ChainConfig to the corresponding SDK blockchain string.
type CircleWalletChain = "ETH-SEPOLIA" | "BASE-SEPOLIA" | "AVAX-FUJI" | "ARC-TESTNET"
  | "ETH" | "BASE" | "AVAX" | "ARB" | "POLY" | "SOL";

const CHAIN_TO_WALLET_BLOCKCHAIN: Record<string, { testnet?: CircleWalletChain; mainnet?: CircleWalletChain }> = {
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
const DEPOSIT_AMOUNT_USDC = "2";

function parseToBaseUnits(value: string): string {
  const [whole, decimal = ""] = value.split(".");
  return (whole || "0") + (decimal + "000000").slice(0, 6);
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

async function depositToGateway(chainName: string) {
  const config = CHAIN_CONFIGS[chainName]?.[NETWORK];
  const blockchain = CHAIN_TO_WALLET_BLOCKCHAIN[chainName]?.[NETWORK];
  if (!config || !blockchain) {
    throw new Error(`No ${NETWORK} config for chain: ${chainName}`);
  }

  const client = initiateDeveloperControlledWalletsClient({
    apiKey: API_KEY,
    entitySecret: ENTITY_SECRET,
  });

  const depositAmount = parseToBaseUnits(DEPOSIT_AMOUNT_USDC);

  // Step 1: Approve Gateway Wallet to spend USDC
  const approveTx = await client.createContractExecutionTransaction({
    walletAddress: DEPOSITOR_ADDRESS,
    blockchain,
    contractAddress: config.USDCAddress,
    abiFunctionSignature: "approve(address,uint256)",
    abiParameters: [config.GatewayWallet, depositAmount],
    fee: { type: "level", config: { feeLevel: "MEDIUM" } },
  });

  const approveTxId = approveTx.data?.id;
  if (!approveTxId) throw new Error("Failed to create approve transaction");
  await waitForTxCompletion(client, approveTxId, "USDC approve");

  // Step 2: Deposit USDC into Gateway Wallet
  const depositTx = await client.createContractExecutionTransaction({
    walletAddress: DEPOSITOR_ADDRESS,
    blockchain,
    contractAddress: config.GatewayWallet,
    abiFunctionSignature: "deposit(address,uint256)",
    abiParameters: [config.USDCAddress, depositAmount],
    fee: { type: "level", config: { feeLevel: "MEDIUM" } },
  });

  const depositTxId = depositTx.data?.id;
  if (!depositTxId) throw new Error("Failed to create deposit transaction");
  await waitForTxCompletion(client, depositTxId, "Gateway deposit");
}

async function main() {
  const chains = process.argv.slice(2).map((c) => c.toLowerCase());
  const valid = Object.keys(CHAIN_CONFIGS);

  if (chains.length === 0) {
    throw new Error(`Usage: npx ts-node deposit.ts <chain1> [chain2...] | all\nValid: ${valid.join(", ")}`);
  }

  const selected = chains[0] === "all" ? valid : chains;
  const invalid = selected.filter((c) => !CHAIN_CONFIGS[c]);
  if (invalid.length > 0) {
    throw new Error(`Unsupported chain(s): ${invalid.join(", ")}. Valid: ${valid.join(", ")}`);
  }

  for (const chain of selected) {
    console.log(`\n=== Depositing ${DEPOSIT_AMOUNT_USDC} USDC on ${chain} (${NETWORK}) ===`);
    await depositToGateway(chain);
  }

  console.log("\nBlock confirmation may take up to 19 minutes for some chains.");
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
```

**Environment variables**:
- `CIRCLE_API_KEY` -- Circle developer API key
- `CIRCLE_ENTITY_SECRET` -- Entity secret for developer-controlled wallets
- `DEPOSITOR_ADDRESS` -- EVM address of the developer-controlled wallet to deposit from

**Dependencies**: `@circle-fin/developer-controlled-wallets`
