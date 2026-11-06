# Sending Transactions from User-Controlled Wallets

Requires a wallet (created via PIN, email OTP, or social login) that holds the tokens to send.

## Flow

1. Backend lists the user's wallets and token balances; the user picks the source wallet.
2. The user enters destination, amount, and token. Backend creates a transfer challenge with `tokenAddress` and gets a `challengeId`.
3. Frontend executes the challenge; the user authorizes in Circle's hosted UI (PIN or their auth method).
4. Backend polls the transaction until a terminal state.

## Backend SDK Methods

### Get a session token (PIN-based auth)

```ts
const response = await circleClient.createUserToken({ userId });
// response.data: { userToken, encryptionKey }
```

### List wallets

```ts
const response = await circleClient.listWallets({ userToken });
// response.data: { wallets }
```

### Get token balances

Returns available funds and each token's `tokenAddress`.

```ts
const response = await circleClient.getWalletTokenBalance({
  walletId,
  userToken,
});
// response.data: { tokenBalances }
```

### Create a transfer challenge

`tokenAddress`: empty string for native tokens (ETH, MATIC, etc.); the token contract address (from `getWalletTokenBalance`) for other tokens such as USDC.

IMPORTANT: On Arc the native asset IS USDC (`0x3600000000000000000000000000000000000000`). The empty-`tokenAddress` native balance and the USDC ERC-20 balance are the same funds -- never show or sum them as separate balances. For USDC app logic on Arc, use the ERC-20 view (6 decimals).

```ts
const response = await circleClient.createTransaction({
  userToken,
  walletId,
  destinationAddress,
  amounts: [amount],
  blockchain: blockchain as TokenBlockchain,
  tokenAddress,
  fee: { type: "level", config: { feeLevel: "MEDIUM" } },
});
// response.data: { challengeId }
```

### Get transaction status

```ts
const response = await circleClient.getTransaction({ userToken, id: transactionId });
// response.data: { transaction: { state, txHash, ... } }
```

### List transactions

```ts
const response = await circleClient.listTransactions({
  userToken,
  walletIds: [walletId],
});
// response.data: { transactions }
```

### Estimate transfer fees

```ts
const response = await circleClient.estimateTransferFee({
  userToken,
  walletId,
  tokenAddress,
  blockchain: blockchain as TokenBlockchain, // required with tokenAddress
  destinationAddress,
  amount: [amount],
});
// response.data: { low, medium, high } -- each tier includes gasLimit, gasPrice, maxFee, priorityFee, baseFee, networkFee
```

### Accelerate a pending transaction

Resubmits with higher gas; may incur additional gas fees. Works only while the transaction is still pending on-chain.

```ts
const response = await circleClient.accelerateTransaction({
  userToken,
  id: transactionId,
});
// response.data: { challengeId }
```

### Cancel a pending transaction

Best-effort: fails if the chain already processed the original transaction. Gas fees may still be incurred.

```ts
const response = await circleClient.cancelTransaction({
  userToken,
  id: transactionId,
});
// response.data: { challengeId }
```

## Frontend Component

Execute every `challengeId` above (transfer, accelerate, cancel) the same way, using the `userToken` + `encryptionKey` from the auth step:

```ts
sdk.setAuthentication({ userToken, encryptionKey });

sdk.execute(challengeId, (error, result) => {
  if (error) {
    console.error("Challenge failed:", error);
    return;
  }
  // After authorization, the transaction progresses through the standard lifecycle.
  // Poll: circleClient.getTransaction({ userToken, id }) until terminal state.
});
```

## Reference Links

- [Send an Outbound Transfer](https://developers.circle.com/wallets/user-controlled/send-outbound-transfer)
- [Create User Transaction Transfer Challenge API](https://developers.circle.com/api-reference/wallets/user-controlled-wallets/create-user-transaction-transfer-challenge)
- [List Wallet Balance API](https://developers.circle.com/api-reference/wallets/user-controlled-wallets/list-wallet-balance)
- [Create Transfer Estimate Fee API](https://developers.circle.com/api-reference/wallets/user-controlled-wallets/create-transfer-estimate-fee)
- [Get Transaction API](https://developers.circle.com/api-reference/wallets/user-controlled-wallets/get-transaction)
