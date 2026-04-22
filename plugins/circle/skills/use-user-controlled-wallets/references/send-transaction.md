# Sending Transactions from User-Controlled Wallets

## Overview

Complete flow for sending an outbound token transfer from a user-controlled wallet. The user must already have a wallet created (via PIN, email OTP, or social login). Requires both a frontend (Web SDK) and backend (Node.js SDK) component.

## User Flow

1. **Select wallet and view balance**: Your backend retrieves the user's wallets and token balances. The user selects which wallet to send from.

2. **Enter transfer details**: The user provides the destination address, amount, and token. Your backend creates a transfer challenge using `tokenAddress`, returning a `challengeId`.

3. **Authorize the transfer**: The Web SDK executes the challenge. The user enters their PIN (or confirms via their auth method) through Circle's hosted UI.

4. **View transaction status**: Your backend polls Circle's API until the transaction reaches `COMPLETE` or a terminal state.

## Prerequisites

- **Existing wallet**: Created via PIN, email OTP, or social login (see corresponding `create-wallet-*.md` references).
- **Token balance**: The wallet must hold tokens to transfer.

## Backend SDK Methods

### Get a session token (PIN-based auth)

Returns `userToken` (valid for 60 minutes) and `encryptionKey`.

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

Use this to check available funds and retrieve the `tokenAddress` for transfers.

```ts
const response = await circleClient.getWalletTokenBalance({
  walletId,
  userToken,
});
// response.data: { tokenBalances }
```

### Create a transfer challenge

For native tokens (ETH, MATIC, etc.), pass empty string as `tokenAddress`. For non-native tokens (e.g., USDC), pass the token's contract address. The `tokenAddress` can be obtained from `getWalletTokenBalance`.

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
  walletId,
  tokenAddress,
  destinationAddress,
  amounts,
});
// response.data: { low, medium, high } -- each tier includes gasLimit, gasPrice, maxFee, priorityFee, baseFee, networkFee
```

### Accelerate a pending transaction

Resubmits with higher gas. Additional gas fees may be incurred. Only works while the transaction is still pending on-chain.

```ts
const response = await circleClient.accelerateTransaction({
  userToken,
  id: transactionId,
});
// response.data: { challengeId }
```

### Cancel a pending transaction

Best-effort -- cancellation may fail if the blockchain has already processed the original transaction. Gas fees may still be incurred.

```ts
const response = await circleClient.cancelTransaction({
  userToken,
  id: transactionId,
});
// response.data: { challengeId }
```

## Frontend Component

The user must already have a valid `userToken` + `encryptionKey` from a prior auth step. All challenge IDs returned by the backend SDK methods above (transfer, accelerate, cancel) are executed on the frontend using the same pattern:

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
