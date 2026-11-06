# Check Balances and Transfer Tokens

## Get balances and the token address

```ts
const balanceResponse = await circleDeveloperSdk.getWalletTokenBalance({
  id: "<source-wallet-id>",
});

const tokenBalances = balanceResponse.data?.tokenBalances ?? [];
```

Capture the `tokenAddress` of the token to transfer.

## Create transfer transaction

```ts
const transferResponse = await circleDeveloperSdk.createTransaction({
  walletId: "<source-wallet-id>",
  tokenAddress: "<token-address>",
  destinationAddress: "<destination-wallet-address>",
  amount: ["0.01"],
  fee: {
    type: "level",
    config: { feeLevel: "MEDIUM" },
  },
});

const transactionId = transferResponse.data?.id;
```

## Poll transaction state

```ts
const txResponse = await circleDeveloperSdk.getTransaction({
  id: "<transaction-id>",
});

const tx = txResponse.data?.transaction;
const state = tx?.state;
const txHash = tx?.txHash;
```

`state` drives completion checks; `txHash` builds explorer links.

## Estimate transfer fees

```ts
const feeEstimate = await circleDeveloperSdk.estimateTransferFee({
  walletId: "<source-wallet-id>",
  tokenAddress: "<token-address>",
  blockchain: "ARC-TESTNET", // required with tokenAddress
  destinationAddress: "<destination-wallet-address>",
  amount: ["0.01"],
});

const { low, medium, high } = feeEstimate.data ?? {};
// Each tier includes: gasLimit, gasPrice, maxFee, priorityFee, baseFee, networkFee
```

Use the estimate to pick a fee level or set custom gas parameters.

## Accelerate a pending transaction

```ts
const accelerateResponse = await circleDeveloperSdk.accelerateTransaction({
  id: "<transaction-id>",
});
```

Resubmits with higher gas; may incur additional gas fees. Works only in the `SENT` or `STUCK` state.

## Cancel a pending transaction

```ts
const cancelResponse = await circleDeveloperSdk.cancelTransaction({
  id: "<transaction-id>",
});

const state = cancelResponse.data?.state;
```

Best-effort: fails if the chain already processed the original transaction. Gas fees may still be incurred.

## Reference Links

- [Transfer Tokens Across Wallets](https://developers.circle.com/wallets/dev-controlled/transfer-tokens-across-wallets)
- [List Wallet Balance API](https://developers.circle.com/api-reference/wallets/developer-controlled-wallets/list-wallet-balance)
- [Estimate Transfer Fee API](https://developers.circle.com/api-reference/wallets/developer-controlled-wallets/create-transfer-estimate-fee)
- [Get Transaction API](https://developers.circle.com/api-reference/wallets/developer-controlled-wallets/get-transaction)
