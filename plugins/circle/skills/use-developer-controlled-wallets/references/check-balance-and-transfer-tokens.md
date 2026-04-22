# Transfer Tokens Across Wallets

Use these TypeScript snippets to find token balances, create a transfer, and poll transaction status.

## Get source wallet balances and token address

Use the [Get Token Balance for a Wallet](https://developers.circle.com/api-reference/wallets/developer-controlled-wallets/list-wallet-balance) API or the SDK method to retrieve balances and the `tokenAddress` for transfers:

```ts
const balanceResponse = await circleDeveloperSdk.getWalletTokenBalance({
  id: "<source-wallet-id>",
});

const tokenBalances = balanceResponse.data?.tokenBalances ?? [];
```

Find the token you want to transfer and capture its `tokenAddress`.

## Create transfer transaction

```ts
const transferResponse = await circleDeveloperSdk.createTransaction({
  walletId: "<source-wallet-id>",
  tokenAddress: "<token-address>",
  destinationAddress: "<destination-wallet-address>",
  amounts: ["0.01"],
  fee: {
    type: "level",
    config: { feeLevel: "MEDIUM" },
  },
});

const transactionId = transferResponse.data?.id;
```

Creates an outbound transfer transaction and returns a transaction ID for tracking.

## Poll transaction state

```ts
const txResponse = await circleDeveloperSdk.getTransaction({
  id: "<transaction-id>",
});

const tx = txResponse.data?.transaction;
const state = tx?.state;
const txHash = tx?.txHash;
```

Use `state` to determine completion and `txHash` for chain explorer links.

## Estimate transfer fees

```ts
const feeEstimate = await circleDeveloperSdk.estimateTransferFee({
  walletId: "<source-wallet-id>",
  tokenAddress: "<token-address>",
  destinationAddress: "<destination-wallet-address>",
  amounts: ["0.01"],
});

const { low, medium, high } = feeEstimate.data ?? {};
// Each tier includes: gasLimit, gasPrice, maxFee, priorityFee, baseFee, networkFee
```

Estimate fees before transferring to choose an appropriate fee level or set custom gas parameters.

## Accelerate a pending transaction

```ts
const accelerateResponse = await circleDeveloperSdk.accelerateTransaction({
  id: "<transaction-id>",
});
```

Speeds up a `SENT` transaction by resubmitting with higher gas. Additional gas fees may be incurred. Only works while the transaction is in the `SENT` state (still pending on-chain).

## Cancel a pending transaction

```ts
const cancelResponse = await circleDeveloperSdk.cancelTransaction({
  id: "<transaction-id>",
});

const state = cancelResponse.data?.state;
```

Attempts to cancel a transaction. This is best-effort -- cancellation may fail if the blockchain has already processed the original transaction. Gas fees may still be incurred.

## Reference Links

- [Transfer Tokens Across Wallets](https://developers.circle.com/wallets/dev-controlled/transfer-tokens-across-wallets)
- [List Wallet Balance API](https://developers.circle.com/api-reference/wallets/developer-controlled-wallets/list-wallet-balance)
- [Estimate Transfer Fee API](https://developers.circle.com/api-reference/wallets/developer-controlled-wallets/create-transfer-estimate-fee)
- [Get Transaction API](https://developers.circle.com/api-reference/wallets/developer-controlled-wallets/get-transaction)
