# Signing Messages from User-Controlled Wallets

## Overview

Complete flow for signing a message from a user-controlled wallet. All signing operations follow the challenge-response model: the backend creates a signing challenge, then the frontend SDK collects user approval via Circle's hosted UI before producing the signature. Requires both a frontend (Web SDK) and backend (Node.js SDK) component.

## User Flow

1. **Backend creates a sign-message challenge**: Your backend calls the Circle API with the wallet ID and message, receiving a `challengeId`.

2. **User authorizes signing**: The Web SDK executes the challenge. The user confirms via their PIN (or auth method) through Circle's hosted UI.

3. **Signature returned**: The challenge callback returns the result containing the signature.

## Backend SDK Methods

### Sign a plaintext message

Supports EIP-191 on EVM chains, Ed25519 on Solana and Aptos.

```ts
const response = await circleClient.signMessage({
  userToken,
  walletId,
  message,
});
// response.data: { challengeId }
```

### Sign a hex-encoded message

Set `encodedByHex: true` when the message is already hex-encoded.

```ts
const response = await circleClient.signMessage({
  userToken,
  walletId,
  message,
  encodedByHex: true,
});
// response.data: { challengeId }
```

### Sign EIP-712 typed data (EVM-compatible only)

Use for EIP-2612 permit approvals, off-chain order signing (e.g., Seaport), and any protocol requiring typed structured data.

```ts
const response = await circleClient.signTypedData({
  userToken,
  walletId,
  data, // EIP-712 typed structured data as JSON string
});
// response.data: { challengeId }
```

### Sign a raw transaction (SOL, EVM)

Use when you build transactions externally and only need Circle to sign. Accepts base64 (Solana) or hex (EVM) encoding.

```ts
const response = await circleClient.signTransaction({
  userToken,
  walletId,
  rawTransaction,
});
// response.data: { challengeId }
```

## Frontend Component

All challenge IDs returned by the backend SDK methods above are executed on the frontend using the same pattern:

```ts
sdk.setAuthentication({ userToken, encryptionKey });

sdk.execute(challengeId, (error, result) => {
  if (error) {
    console.error("Signing failed:", error);
    return;
  }
  // result contains the signature
});
```

## Reference Links

- [Initiate a Signature Request](https://developers.circle.com/wallets/user-controlled/initiate-a-signature-request)
- [Sign User Message API](https://developers.circle.com/api-reference/wallets/user-controlled-wallets/sign-user-message)
- [Sign User Typed Data API](https://developers.circle.com/api-reference/wallets/user-controlled-wallets/sign-user-typed-data)
- [Sign User Transaction API](https://developers.circle.com/api-reference/wallets/user-controlled-wallets/sign-user-transaction)
