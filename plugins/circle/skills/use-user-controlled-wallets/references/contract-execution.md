# Executing Smart Contracts from User-Controlled Wallets

The backend creates an execution challenge (wallet ID, contract address, ABI details) and gets a `challengeId`; the frontend executes it so the user approves in Circle's hosted UI. The transaction then follows the standard lifecycle -- poll until a terminal state.

## Backend SDK Methods

### Execute using ABI function signature

Pass parameters as an array of strings. Supported parameter types: string, integer, boolean, and arrays.

```ts
const response = await circleClient.createUserTransactionContractExecutionChallenge({
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

Use `callData` for pre-encoded data (e.g., from ethers or viem). `callData` and `abiFunctionSignature` are mutually exclusive.

```ts
const response = await circleClient.createUserTransactionContractExecutionChallenge({
  userToken,
  walletId,
  contractAddress,
  callData: "0xa9059cbb000000000000000000000000...",
  fee: { type: "level", config: { feeLevel: "MEDIUM" } },
});
// response.data: { challengeId }
```

### Execute a payable function

`amount` sends native tokens (ETH, MATIC, etc.) with a payable call.

```ts
const response = await circleClient.createUserTransactionContractExecutionChallenge({
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
  userToken,
  source: { walletId },
  contractAddress,
  abiFunctionSignature: "transfer(address,uint256)",
  abiParameters: ["0xRecipientAddress", "1000000"],
});
// response.data: { low, medium, high } -- each tier includes gasLimit, gasPrice, maxFee, priorityFee, baseFee, networkFee
```

## Frontend Component

Execute every `challengeId` above the same way:

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
