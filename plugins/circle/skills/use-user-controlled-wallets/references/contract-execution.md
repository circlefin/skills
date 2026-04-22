# Executing Smart Contracts from User-Controlled Wallets

## Overview

Complete flow for executing a smart contract function from a user-controlled wallet. All contract executions follow the challenge-response model: the backend creates an execution challenge, then the frontend SDK collects user approval via Circle's hosted UI. Requires both a frontend (Web SDK) and backend (Node.js SDK) component.

## User Flow

1. **Backend creates a contract execution challenge**: Your backend calls the Circle API with the wallet ID, contract address, and ABI details, receiving a `challengeId`.

2. **User authorizes execution**: The Web SDK executes the challenge. The user confirms via their PIN (or auth method) through Circle's hosted UI.

3. **Transaction submitted**: After authorization, the transaction progresses through the standard lifecycle. Poll until terminal state.

## Backend SDK Methods

### Execute using ABI function signature

Pass the Solidity function signature and parameters as an array of strings. Supported parameter types: string, integer, boolean, and arrays.

```ts
const response = await circleClient.createContractExecutionTransaction({
  userToken,
  walletId,
  contractAddress,
  abiFunctionSignature: "transfer(address,uint256)",
  abiParameters: ["0xRecipientAddress", "1000000"],
  fee: { type: "level", config: { feeLevel: "MEDIUM" } },
});
// response.data: { challengeId }
```

### Execute using raw call data

Use `callData` when you have pre-encoded transaction data (e.g., from ethers or viem). `callData` and `abiFunctionSignature` are mutually exclusive.

```ts
const response = await circleClient.createContractExecutionTransaction({
  userToken,
  walletId,
  contractAddress,
  callData: "0xa9059cbb000000000000000000000000...",
  fee: { type: "level", config: { feeLevel: "MEDIUM" } },
});
// response.data: { challengeId }
```

### Execute a payable function

Set `amount` to send native tokens (ETH, MATIC, etc.) when calling payable functions.

```ts
const response = await circleClient.createContractExecutionTransaction({
  userToken,
  walletId,
  contractAddress,
  abiFunctionSignature: "deposit()",
  abiParameters: [],
  amount: "0.1",
  fee: { type: "level", config: { feeLevel: "MEDIUM" } },
});
// response.data: { challengeId }
```

### Estimate gas fees before execution

```ts
const response = await circleClient.estimateContractExecutionFee({
  contractAddress,
  abiFunctionSignature: "transfer(address,uint256)",
  abiParameters: ["0xRecipientAddress", "1000000"],
  walletId,
});
// response.data: { low, medium, high } -- each tier includes gasLimit, gasPrice, maxFee, priorityFee, baseFee, networkFee
```

## Frontend Component

All challenge IDs returned by the backend SDK methods above are executed on the frontend using the same pattern:

```ts
sdk.setAuthentication({ userToken, encryptionKey });

sdk.execute(challengeId, (error, result) => {
  if (error) {
    console.error("Contract execution failed:", error);
    return;
  }
  // After authorization, the transaction progresses through the standard lifecycle.
  // Poll: circleClient.getTransaction({ userToken, id }) until terminal state.
});
```

## Reference Links

- [Send an Outbound Transfer or Execute Contract](https://developers.circle.com/wallets/user-controlled/send-an-outbound-transfer-or-execute-contract)
- [Create User Transaction Contract Execution Challenge API](https://developers.circle.com/api-reference/wallets/user-controlled-wallets/create-user-transaction-contract-execution-challenge)
- [Create Transaction Estimate Fee API](https://developers.circle.com/api-reference/wallets/user-controlled-wallets/create-transaction-estimate-fee)
