# Transfer Tokens Across Wallets

Use these TypeScript snippets to find token balances, create a transfer, and poll transaction status.

## Get source wallet balances and token ID

For USDC tokens on each blockchain, referring to [USDC Token IDs](https://developers.circle.com/wallets/monitored-tokens#usdc-token-ids) to check `tokenId`.

For other tokens, leveraging [Get Token Balance for a Wallet](https://developers.circle.com/api-reference/wallets/developer-controlled-wallets/list-wallet-balance) API or simply use SDK method:

```ts
const balanceResponse = await circleDeveloperSdk.getWalletTokenBalance({
  id: "<source-wallet-id>",
});

const tokenBalances = balanceResponse.data?.tokenBalances ?? [];
```

Find the token you want to transfer and capture `tokenId`.

## Create transfer transaction

```ts
const transferResponse = await circleDeveloperSdk.createTransaction({
  walletId: "<source-wallet-id>",
  tokenId: "<token-id>",
  destinationAddress: "<destination-wallet-address>",
  amounts: ["0.01"],
  fee: {
    type: "level",
    config: { feeLevel: "MEDIUM" },
  },
});

const transactionId = transferResponse.data?.id;
```

Or replace `tokenId` with `tokenAddress` 

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
