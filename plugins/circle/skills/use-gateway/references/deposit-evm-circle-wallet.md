# Deposit USDC on EVM into Gateway via Circle Wallets

This example uses Arc Testnet as the source chain, but the same deposit pattern applies to any supported EVM chain after substituting the correct Circle Wallet blockchain identifier, Gateway Wallet address, and USDC address.

Canonical runnable references:
- Unified balance EVM quickstart: https://developers.circle.com/gateway/quickstarts/unified-balance-evm.md
- Create unified USDC balance: https://developers.circle.com/gateway/howtos/create-unified-usdc-balance.md

## What this does

This script:

1. Uses a Circle Developer-Controlled Wallet as the depositor
2. Approves the Gateway Wallet contract to spend USDC
3. Calls `deposit(address,uint256)` on the Gateway Wallet contract
4. Waits for each asynchronous Circle Wallet transaction to complete

## Critical warning

Do **not** send USDC directly to the Gateway Wallet contract with a normal ERC-20 transfer. The funds will not be credited to the unified balance. You must call the Gateway `deposit()` method.

## Runnable example

```ts
import { initiateDeveloperControlledWalletsClient } from "@circle-fin/developer-controlled-wallets";

const GATEWAY_WALLET_ADDRESS = "0x0077777d7EBA4688BDeF3E311b846F25870A19B9";
const USDC_ADDRESS = "0x3600000000000000000000000000000000000000";
const BLOCKCHAIN = "ARC-TESTNET";
const DEPOSIT_AMOUNT_USDC = "5";

const API_KEY = process.env.CIRCLE_API_KEY!;
const ENTITY_SECRET = process.env.CIRCLE_ENTITY_SECRET!;
const DEPOSITOR_ADDRESS = process.env.DEPOSITOR_ADDRESS!;

if (!API_KEY || !ENTITY_SECRET || !DEPOSITOR_ADDRESS) {
  throw new Error(
    "Missing required env vars: CIRCLE_API_KEY, CIRCLE_ENTITY_SECRET, DEPOSITOR_ADDRESS",
  );
}

const client = initiateDeveloperControlledWalletsClient({
  apiKey: API_KEY,
  entitySecret: ENTITY_SECRET,
});

function parseBalance(value: string): string {
  const [whole, decimal = ""] = value.split(".");
  return (whole || "0") + (decimal + "000000").slice(0, 6);
}

async function waitForTxCompletion(txId: string, label: string) {
  const terminalStates = new Set([
    "COMPLETE",
    "CONFIRMED",
    "FAILED",
    "DENIED",
    "CANCELLED",
  ]);

  while (true) {
    const { data } = await client.getTransaction({ id: txId });
    const state = data?.transaction?.state;

    if (state && terminalStates.has(state)) {
      if (state !== "COMPLETE" && state !== "CONFIRMED") {
        throw new Error(`${label} did not complete successfully (state=${state})`);
      }
      return data.transaction;
    }

    await new Promise((resolve) => setTimeout(resolve, 3000));
  }
}

async function main() {
  const amount = parseBalance(DEPOSIT_AMOUNT_USDC);

  console.log(`Approving ${DEPOSIT_AMOUNT_USDC} USDC...`);

  const approveTx = await client.createContractExecutionTransaction({
    walletAddress: DEPOSITOR_ADDRESS,
    blockchain: BLOCKCHAIN,
    contractAddress: USDC_ADDRESS,
    abiFunctionSignature: "approve(address,uint256)",
    abiParameters: [GATEWAY_WALLET_ADDRESS, amount],
    fee: { type: "level", config: { feeLevel: "MEDIUM" } },
  });

  const approveTxId = approveTx.data?.id;
  if (!approveTxId) {
    throw new Error("Failed to create approve transaction");
  }
  await waitForTxCompletion(approveTxId, "USDC approve");

  console.log(`Depositing ${DEPOSIT_AMOUNT_USDC} USDC to Gateway Wallet...`);

  const depositTx = await client.createContractExecutionTransaction({
    walletAddress: DEPOSITOR_ADDRESS,
    blockchain: BLOCKCHAIN,
    contractAddress: GATEWAY_WALLET_ADDRESS,
    abiFunctionSignature: "deposit(address,uint256)",
    abiParameters: [USDC_ADDRESS, amount],
    fee: { type: "level", config: { feeLevel: "MEDIUM" } },
  });

  const depositTxId = depositTx.data?.id;
  if (!depositTxId) {
    throw new Error("Failed to create deposit transaction");
  }
  await waitForTxCompletion(depositTxId, "Gateway deposit");

  console.log(
    "Block confirmation may take additional time before the unified balance updates.",
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
```


