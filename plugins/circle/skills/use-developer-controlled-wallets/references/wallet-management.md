# Wallet Management

## Derive a wallet to a new blockchain

```ts
const deriveResponse = await circleDeveloperSdk.deriveWallet({
  id: "<wallet-id>",
  blockchain: "ARB-SEPOLIA",
  metadata: {
    name: "Arbitrum Wallet",
    refId: "internal-ref-001",
  },
});

const derivedWallet = deriveResponse.data?.wallet;
```

Derives an existing EOA or SCA wallet onto another EVM blockchain at the same address. If a wallet already exists at that address on the target chain, its metadata is updated instead.

## Update wallet metadata

```ts
const updateResponse = await circleDeveloperSdk.updateWallet({
  id: "<wallet-id>",
  name: "Updated Wallet Name",
  refId: "new-ref-id",
});
```

Updates the name or reference ID; no on-chain transaction.

## Reference Links

- [Derive Wallet API](https://developers.circle.com/api-reference/wallets/developer-controlled-wallets/derive-wallet)
- [Update Wallet API](https://developers.circle.com/api-reference/wallets/developer-controlled-wallets/update-wallet)
- [Wallet Upgrades](https://developers.circle.com/wallets/wallet-upgrades)
