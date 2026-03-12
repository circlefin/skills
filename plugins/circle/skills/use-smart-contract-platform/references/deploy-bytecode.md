# Deploy Smart Contract with Bytecode

## Overview

Use this flow when you already have a compiled contract ABI + bytecode and want to deploy it with Circle Smart Contract Platform.

## Prerequisites

- A dev-controlled wallet on `ARC-TESTNET`
- Testnet USDC for transaction fees if using an EOA

## 1) Create wallet set + wallet (if needed)

```ts
const walletSetRes = await walletClient.createWalletSet({ name: "WalletSet 1" });
const walletSetId = walletSetRes.data?.walletSet?.id!;

const walletRes = await walletClient.createWallets({
  walletSetId,
  blockchains: ["ARC-TESTNET"],
  count: 1,
});

const walletId = walletRes.data?.wallets?.[0]?.id!;
const walletAddress = walletRes.data?.wallets?.[0]?.address!;
```

## 2) Check wallet token balances

```ts
const balanceRes = await walletClient.getWalletTokenBalance({ id: walletId });
console.log(balanceRes.data?.tokenBalances ?? []);
```

## 3) Compile your Solidity contract

Compile in Remix (or your own build tool), then copy:
- ABI JSON
- Raw bytecode (prefix with `0x` before deployment)

## 4) Deploy contract from ABI + bytecode

```ts
const abiJson = [
  // Paste full ABI JSON here
];

const bytecode = "0xPASTE_COMPILED_BYTECODE_HERE";

const deployRes = await scpClient.deployContract({
  name: "MerchantTreasury Contract",
  description: "Receives USDC deposits and allows owner withdrawals",
  blockchain: "ARC-TESTNET",
  walletId,
  abiJson: JSON.stringify(abiJson),
  bytecode,
  constructorParameters: [
    walletAddress,
    "0x3600000000000000000000000000000000000000", // Arc Testnet USDC
  ],
  fee: {
    type: "level",
    config: { feeLevel: "MEDIUM" },
  },
});

const contractId = deployRes.data?.contractId;
console.log({ contractId, tx: deployRes.data?.transactionId });
```

## 5) Check deployment status

```ts
const contractRes = await scpClient.getContract({ id: contractId! });
console.log(contractRes.data?.contract);
```

Deployment is complete when contract status is `COMPLETE`.
