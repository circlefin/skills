# Receive an Inbound Transfer

Use these TypeScript snippets to get a wallet address, fund it from a faucet/external wallet, then verify inbound transfer state.

## Get wallet address for receiving funds

```ts
const walletsResponse = await circleDeveloperSdk.getWallets({});
const wallets = walletsResponse.data?.wallets ?? [];

const targetWallet = wallets[0];
const walletId = targetWallet?.id;
const receiveAddress = targetWallet?.address;
```

Use `receiveAddress` with a testnet faucet (for example, `https://faucet.circle.com`) or another wallet.

## Check inbound transfer state by wallet

```ts
const txResponse = await circleDeveloperSdk.listTransactions({
  walletIds: ["<wallet-id>"],
});

const inboundTransactions =
  txResponse.data?.transactions?.filter((tx) => tx.transactionType === "INBOUND") ?? [];
```

Lists transactions for the wallet so you can confirm inbound transfers and state progression.
