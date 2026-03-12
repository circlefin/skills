# Interact with a Deployed Contract

## Overview

Use this reference to:
1. Read contract metadata/functions
2. Query read-only methods (`view`/`pure`)
3. Execute write methods (`nonpayable`/`payable`)

## Prerequisites

- Contract is already deployed (or imported)
- Wallet ID available for write transactions

## 1) Get contract details and ABI functions

```ts
const contractId = "YOUR_CONTRACT_ID";
const contractRes = await scpClient.getContract({ id: contractId });

console.log(contractRes.data?.contract?.contractAddress);
console.log(contractRes.data?.contract?.functions ?? []);
```

## 2) Query a read function

`abiFunctionSignature` format is `functionName(type1,type2,...)`.

```ts
const queryRes = await scpClient.queryContract({
  address: "YOUR_CONTRACT_ADDRESS",
  blockchain: "ARC-TESTNET",
  abiFunctionSignature: "owner()",
  abiJson: JSON.stringify([
    {
      name: "owner",
      type: "function",
      stateMutability: "view",
      inputs: [],
      outputs: [{ type: "address", name: "" }],
    },
  ]),
});

console.log(queryRes.data?.outputValues);
```

## 3) Execute a write function

Write calls require `walletId` and gas fee settings.

```ts
const executeRes = await walletClient.createContractExecutionTransaction({
  walletId: "YOUR_WALLET_ID",
  contractAddress: "YOUR_CONTRACT_ADDRESS",
  abiFunctionSignature: "safeMint(address,uint256)",
  abiParameters: ["0xRecipientAddress", "1"],
  fee: {
    type: "level",
    config: { feeLevel: "MEDIUM" },
  },
});

const txId = executeRes.data?.transactionId;
console.log({ txId });
```

## 4) Poll write transaction status

```ts
const txRes = await walletClient.getTransaction({ id: txId! });
console.log(txRes.data?.transaction?.state);
```

Common states: `INITIATED`, `SENT`, `CONFIRMED`, `COMPLETE`, `FAILED`.
