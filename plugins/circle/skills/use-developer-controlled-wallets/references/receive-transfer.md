# Receive an Inbound Transfer

## Get the receiving address

```ts
const walletsResponse = await circleDeveloperSdk.listWallets();
const wallets = walletsResponse.data?.wallets ?? [];

const targetWallet = wallets[0];
const walletId = targetWallet?.id;
const receiveAddress = targetWallet?.address;
```

Fund `receiveAddress` from a testnet faucet (e.g., `https://faucet.circle.com`) or another wallet.

## Check inbound transfer state

```ts
const txResponse = await circleDeveloperSdk.listTransactions({
  walletIds: ["<wallet-id>"],
});

const inboundTransactions =
  txResponse.data?.transactions?.filter((tx) => tx.transactionType === "INBOUND") ?? [];
```

## Reference Links

- [Receive an Inbound Transfer](https://developers.circle.com/wallets/dev-controlled/receive-an-inbound-transfer)
- [List Transactions API](https://developers.circle.com/api-reference/wallets/developer-controlled-wallets/list-transactions)
