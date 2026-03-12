# Create Your First Developer-Controlled Wallet

Use these TypeScript snippets to create a wallet set, then create wallets in that set.

## Create a wallet set

```ts
const walletSetResponse = await circleDeveloperSdk.createWalletSet({
  name: "Entity WalletSet A",
});

const walletSetId = walletSetResponse.data?.walletSet?.id;
```

Creates a wallet set and stores `walletSetId` for the next step.

## Create wallets in that wallet set

```ts
const walletsResponse = await circleDeveloperSdk.createWallets({
  accountType: "SCA",
  blockchains: ["MATIC-AMOY"],
  count: 2,
  walletSetId: "<wallet-set-id>",
});

const wallets = walletsResponse.data?.wallets ?? [];
const sourceWallet = wallets[0];
const destinationWallet = wallets[1];
```

Creates two wallets and captures source/destination wallets for transfer workflows.

## Alternate chain/account example

```ts
const solWalletResponse = await circleDeveloperSdk.createWallets({
  accountType: "EOA",
  blockchains: ["SOL-DEVNET"],
  count: 1,
  walletSetId: "<wallet-set-id>",
});
```

Same flow on a different blockchain/account type.
