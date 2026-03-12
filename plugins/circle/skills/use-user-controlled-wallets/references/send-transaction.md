# Sending Transactions from User-Controlled Wallets

## Overview

Complete flow for sending an outbound token transfer from a user-controlled wallet. The user must already have a wallet created (via PIN, email OTP, or social login). Requires both a frontend (Web SDK) and backend (Node.js SDK) component.

## User Flow

1. **Select wallet and view balance**: Your backend retrieves the user's wallets and token balances. The user selects which wallet to send from.

2. **Enter transfer details**: The user provides the destination address, amount, and token. Your backend creates a transfer challenge (by `tokenId`, or by `blockchain` + `tokenAddress`), returning a `challengeId`.

3. **Authorize the transfer**: The Web SDK executes the challenge. The user enters their PIN (or confirms via their auth method) through Circle's hosted UI.

4. **View transaction status**: Your backend polls Circle's API until the transaction reaches `COMPLETE` or a terminal state.

## Prerequisites

- **Existing wallet**: Created via PIN, email OTP, or social login (see corresponding `create-wallet-*.md` references).
- **Token balance**: The wallet must hold tokens to transfer.

## Backend Component

Uses `@circle-fin/user-controlled-wallets` SDK for all server-side operations. The backend needs a server exposing the endpoints listed below each function.

```ts
import {
  CreateTransactionInput,
  ListTransactionsInput,
  TokenBlockchain,
  initiateUserControlledWalletsClient,
} from "@circle-fin/user-controlled-wallets";

const circleClient = initiateUserControlledWalletsClient({
  apiKey: process.env.CIRCLE_API_KEY!,
});

/**
 * Gets a session token for a user (needed for PIN-based auth).
 * Returns userToken (valid for 60 minutes) and encryptionKey.
 * Endpoint: POST /api/wallet/get-token { userId }
 */
export async function getUserToken(userId: string) {
  const response = await circleClient.createUserToken({ userId });
  return {
    userToken: response.data?.userToken,
    encryptionKey: response.data?.encryptionKey,
  };
}

/**
 * Lists all wallets for a user.
 * Endpoint: POST /api/wallet/list { userToken }
 */
export async function listUserWallets(userToken: string) {
  const response = await circleClient.listWallets({ userToken });
  return response.data?.wallets ?? [];
}

/**
 * Gets token balances for a specific wallet.
 * Use this to check available funds and retrieve the tokenId for transfers.
 * Endpoint: POST /api/wallet/balances { walletId, userToken }
 */
export async function getWalletBalances(walletId: string, userToken: string) {
  const response = await circleClient.getWalletTokenBalance({
    walletId,
    userToken,
  });
  return response.data?.tokenBalances ?? [];
}

/**
 * Creates a transfer challenge for a token transfer using tokenId.
 * Returns a challengeId for the Web SDK to execute.
 * The tokenId can be obtained from getWalletBalances.
 * Endpoint: POST /api/wallet/transfer { userToken, walletId, destinationAddress, amount, tokenId, feeLevel? }
 */
export async function createTransferByTokenId(
  userToken: string,
  walletId: string,
  destinationAddress: string,
  amount: string,
  tokenId: string,
  feeLevel: "LOW" | "MEDIUM" | "HIGH" = "MEDIUM"
) {
  const params: CreateTransactionInput = {
    userToken,
    walletId,
    destinationAddress,
    amounts: [amount],
    tokenId,
    fee: { type: "level", config: { feeLevel } },
  };
  const response = await circleClient.createTransaction(params);
  return { challengeId: response.data?.challengeId };
}

/**
 * Creates a transfer challenge using blockchain + tokenAddress.
 * For native tokens (ETH, MATIC, etc.), pass empty string as tokenAddress.
 * For non-native tokens (e.g., USDC), pass the token's contract address.
 * Endpoint: POST /api/wallet/transfer-blockchain { userToken, walletId, destinationAddress, amount, blockchain, tokenAddress, feeLevel? }
 */
export async function createTransferByBlockchain(
  userToken: string,
  walletId: string,
  destinationAddress: string,
  amount: string,
  blockchain: string,
  tokenAddress: string = "",
  feeLevel: "LOW" | "MEDIUM" | "HIGH" = "MEDIUM"
) {
  const params: CreateTransactionInput = {
    userToken,
    walletId,
    destinationAddress,
    amounts: [amount],
    blockchain: blockchain as TokenBlockchain,
    tokenAddress,
    fee: { type: "level", config: { feeLevel } },
  };
  const response = await circleClient.createTransaction(params);
  return { challengeId: response.data?.challengeId };
}

/**
 * Gets the status of a specific transaction.
 * Endpoint: POST /api/wallet/transaction-status { userToken, transactionId }
 */
export async function getTransactionStatus(
  userToken: string,
  transactionId: string
) {
  const response = await circleClient.getTransaction({ userToken, id: transactionId });
  return response.data;
}

/**
 * Lists transactions for a user, optionally filtered by wallet.
 * Endpoint: POST /api/wallet/transactions { userToken, walletId? }
 */
export async function listTransactions(
  userToken: string,
  walletId?: string
) {
  const params: ListTransactionsInput = { userToken };
  if (walletId) params.walletIds = [walletId];
  const response = await circleClient.listTransactions(params);
  return response.data?.transactions ?? [];
}
```

## Frontend Component

Uses `@circle-fin/w3s-pw-web-sdk` to execute the transfer challenge. The user must already have a valid `userToken` + `encryptionKey` from a prior auth step.

```tsx
import { W3SSdk } from "@circle-fin/w3s-pw-web-sdk";

// Before calling this, you need:
// 1. Initialized SDK:          new W3SSdk({ appSettings: { appId } })
// 2. Called sdk.getDeviceId()  (required to establish session)
// 3. User session:             { userToken, encryptionKey } from auth step
// 4. Listed wallets:           circleClient.listWallets({ userToken })
// 5. Fetched balances:         circleClient.getWalletTokenBalance({ walletId, userToken })
// 6. Created transfer challenge from backend (one of two options):
//    a. By tokenId:    circleClient.createTransaction({ ..., tokenId })
//    b. By blockchain: circleClient.createTransaction({ ..., blockchain, tokenAddress })
//       tokenAddress = "" for native tokens, or contract address for ERC-20s

function executeTransferChallenge(
  sdk: W3SSdk,
  userToken: string,
  encryptionKey: string,
  challengeId: string
) {
  sdk.setAuthentication({ userToken, encryptionKey });

  sdk.execute(challengeId, (error, result) => {
    if (error) {
      console.error("Transfer failed:", error);
      return;
    }

    console.log("Transfer authorized:", result);

    // After authorization, the transaction progresses: INITIATED -> SENT -> CONFIRMED -> COMPLETE
    // Poll: circleClient.getTransaction({ userToken, id }) or circleClient.listTransactions({ userToken })
    // Refresh balances: circleClient.getWalletTokenBalance({ walletId, userToken })
  });
}
```
