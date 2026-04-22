# Execute a Smart Contract

Use these TypeScript snippets to execute smart contract functions from a developer-controlled wallet.

## Execute using ABI function signature

```ts
const executionResponse = await circleDeveloperSdk.createContractExecutionTransaction({
  walletId: "<source-wallet-id>",
  contractAddress: "<contract-address>",
  abiFunctionSignature: "transfer(address,uint256)",
  abiParameters: ["0xRecipientAddress", "1000000"],
  fee: {
    type: "level",
    config: { feeLevel: "MEDIUM" },
  },
});

const transactionId = executionResponse.data?.id;
```

Pass the Solidity function signature and parameters as an array of strings. Supported parameter types: string, integer, boolean, and arrays.

## Execute using raw call data

```ts
const executionResponse = await circleDeveloperSdk.createContractExecutionTransaction({
  walletId: "<source-wallet-id>",
  contractAddress: "<contract-address>",
  callData: "0xa9059cbb000000000000000000000000...",
  fee: {
    type: "level",
    config: { feeLevel: "MEDIUM" },
  },
});

const transactionId = executionResponse.data?.id;
```

Use `callData` when you have pre-encoded transaction data (e.g., from ethers or viem). `callData` and `abiFunctionSignature` are mutually exclusive.

## Execute a payable function

```ts
const executionResponse = await circleDeveloperSdk.createContractExecutionTransaction({
  walletId: "<source-wallet-id>",
  contractAddress: "<contract-address>",
  abiFunctionSignature: "deposit()",
  abiParameters: [],
  amount: "0.1", // native token amount (ETH, MATIC, etc.)
  fee: {
    type: "level",
    config: { feeLevel: "MEDIUM" },
  },
});

const transactionId = executionResponse.data?.id;
```

Set `amount` to send native tokens when calling payable functions.

## Estimate gas fees before execution

```ts
const feeEstimate = await circleDeveloperSdk.estimateContractExecutionFee({
  walletId: "<source-wallet-id>",
  contractAddress: "<contract-address>",
  abiFunctionSignature: "transfer(address,uint256)",
  abiParameters: ["0xRecipientAddress", "1000000"],
});

const { low, medium, high } = feeEstimate.data ?? {};
// Each tier includes: gasLimit, gasPrice, maxFee, priorityFee, baseFee, networkFee
```

Estimate fees before executing to choose an appropriate fee level or set custom gas parameters.

## Reference Links

- [Contract Execution Transaction API](https://developers.circle.com/api-reference/wallets/developer-controlled-wallets/create-developer-transaction-contract-execution)
- [Estimate Contract Execution Fee API](https://developers.circle.com/api-reference/wallets/developer-controlled-wallets/create-transaction-estimate-fee)

