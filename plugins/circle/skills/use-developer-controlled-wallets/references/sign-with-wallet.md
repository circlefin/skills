# Sign a Message

Use these TypeScript snippets to sign a message from a developer-controlled wallet.

## Sign a message (EIP-191 / blockchain-native)

```ts
const signResponse = await circleDeveloperSdk.signMessage({
  walletId: "<wallet-id>",
  message: "Hello, Circle!",
});

const signature = signResponse.data?.signature;
```

Signs using EIP-191 on EVM chains, or the native signing scheme on Solana and Aptos.

## Sign a hex-encoded message

```ts
const signResponse = await circleDeveloperSdk.signMessage({
  walletId: "<wallet-id>",
  message: "0x48656c6c6f",
  encodedByHex: true,
});

const signature = signResponse.data?.signature;
```

Set `encodedByHex: true` when the message is already hex-encoded.

## Identify wallet by address instead of ID

```ts
const signResponse = await circleDeveloperSdk.signMessage({
  walletAddress: "<wallet-address>",
  blockchain: "ARC-TESTNET",
  message: "Sign ARC-TESTNET message",
});

const signature = signResponse.data?.signature;
```

Provide `walletAddress` + `blockchain` instead of `walletId` when you only have the address.

## Other signing operations

The SDK also supports these additional signing methods. They follow the same pattern (provide `walletId` or `walletAddress` + `blockchain`, plus `entitySecretCiphertext` handled automatically by the SDK):

### Sign EIP-712 typed data (EVM-compatible only)

```ts
const signResponse = await circleDeveloperSdk.signTypedData({
  walletId: "<wallet-id>",
  data: JSON.stringify(eip712TypedData), // EIP-712 structured data as string
});

const signature = signResponse.data?.signature;
```

Use for EIP-2612 permit approvals, off-chain order signing (e.g., Seaport), and any protocol requiring typed structured data.

### Sign a raw transaction (SOL, NEAR, EVM)

```ts
const signResponse = await circleDeveloperSdk.signTransaction({
  walletId: "<wallet-id>",
  rawTransaction: "<base64-or-hex-encoded-transaction>",
});

const signature = signResponse.data?.signature;
const signedTransaction = signResponse.data?.signedTransaction;
```

Use when you build transactions externally and only need Circle to sign. Accepts base64 (Solana/NEAR) or hex (EVM) encoding. EVM responses also include `txHash`.

### Sign a delegate action (NEAR only)

```ts
const signResponse = await circleDeveloperSdk.signDelegateAction({
  walletId: "<wallet-id>",
  unsignedDelegateAction: "<base64-encoded-delegate-action>",
});

const signature = signResponse.data?.signature;
const signedDelegateAction = signResponse.data?.signedDelegateAction;
```

Use for NEAR meta-transactions where a relayer submits the transaction on behalf of the user.

## Reference Links

- [Sign Message API](https://developers.circle.com/api-reference/wallets/developer-controlled-wallets/sign-message)
- [Sign Typed Data API](https://developers.circle.com/api-reference/wallets/developer-controlled-wallets/sign-typed-data)
- [Sign Transaction API](https://developers.circle.com/api-reference/wallets/developer-controlled-wallets/sign-transaction)
