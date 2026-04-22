# Creating User-Controlled Wallets with PIN

## Overview

Complete flow for creating user-controlled wallets using PIN authentication. PIN is the simplest method -- no configuration in the Circle Developer Console beyond API key and App ID. Requires both a frontend (Web SDK) and backend (Node.js SDK) component.

## User Flow

1. **Enter user ID and click "Create User"**: Your backend creates a new user in Circle's system using a unique identifier (email, username, UUID, etc.).

2. **Click "Get User Token"**: Your backend retrieves a session token (`userToken`) and `encryptionKey` for the user. Valid for 60 minutes.

3. **Click "Initialize User"**: Your backend creates a challenge for PIN setup and wallet creation. If the user already has wallets, load them instead. Otherwise, Circle returns a `challengeId`.

4. **Click "Create Wallet"**: The Web SDK executes the challenge. The user sets up their PIN and security questions through Circle's hosted UI, and Circle creates the wallet.

## Prerequisites

1. **Circle Developer Console**:
   - Get API key from Project Settings
   - Navigate to Wallets -> User Controlled -> Configurator
   - Copy the App ID from the configurator
   - No additional configuration needed -- PIN works out of the box

2. **User ID Requirements**:
   - Must be at least 5 characters
   - Should be unique per user (email, username, UUID, etc.)

## Backend SDK Methods

### Step 1: Create a user

```ts
const response = await circleClient.createUser({ userId });
// response.data: { id, status, pinStatus }
```

### Step 2: Get a session token

Returns `userToken` (valid for 60 minutes) and `encryptionKey`.

```ts
const response = await circleClient.createUserToken({ userId });
// response.data: { userToken, encryptionKey }
```

### Step 3: Initialize user with PIN and create wallet

Returns a `challengeId` for the Web SDK to execute. Error code 155106 means user already has wallets -- fetch them instead.

```ts
const response = await circleClient.createUserPinWithWallets({
  userToken,
  blockchains: [Blockchain.ArcTestnet],
  accountType: "SCA",
});
// response.data: { challengeId }
```

### List wallets

```ts
const response = await circleClient.listWallets({ userToken });
// response.data: { wallets }
```

### Get token balances

```ts
const response = await circleClient.getWalletTokenBalance({
  walletId,
  userToken,
});
// response.data: { tokenBalances }
```

## Frontend Component

Unlike email/social auth, PIN does not require a login callback -- the SDK is initialized without one.

The frontend implements four button handlers mapping to the User Flow steps:
1. `handleCreateUser` -- Create user in Circle's system
2. `handleGetUserToken` -- Get session token
3. `handleInitializeUser` -- Initialize user (get challenge)
4. `handleCreateWallet` -- Create wallet (execute challenge with PIN setup)

```tsx
import { useState, useEffect, useRef } from "react";
import { W3SSdk } from "@circle-fin/w3s-pw-web-sdk";

interface UserCredentials {
  userToken: string;
  encryptionKey: string;
}

export default function PinWallet({
  circleAppId,
  apiBaseUrl = "",
}: {
  circleAppId: string;
  apiBaseUrl?: string;
}) {
  const sdkRef = useRef<W3SSdk | null>(null);
  const [sdkReady, setSdkReady] = useState(false);
  const [userId, setUserId] = useState("");
  const [credentials, setCredentials] = useState<UserCredentials | null>(null);
  const [challengeId, setChallengeId] = useState<string | null>(null);
  const [status, setStatus] = useState("Ready");

  // Initialize SDK on mount (no callback needed for PIN auth)
  useEffect(() => {
    const initSdk = async () => {
      try {
        const sdk = new W3SSdk({ appSettings: { appId: circleAppId } });
        sdkRef.current = sdk;

        const storedDeviceId = localStorage.getItem("deviceId");
        if (!storedDeviceId) {
          const id = await sdk.getDeviceId();
          localStorage.setItem("deviceId", id);
        }

        const storedUserToken = localStorage.getItem("userToken");
        const storedEncryptionKey = localStorage.getItem("encryptionKey");
        if (storedUserToken && storedEncryptionKey) {
          setCredentials({ userToken: storedUserToken, encryptionKey: storedEncryptionKey });
        }

        setSdkReady(true);
      } catch {
        setStatus("Failed to initialize Web SDK");
      }
    };

    void initSdk();
  }, [circleAppId]);

  // Step 1: Create User
  const handleCreateUser = async () => {
    if (!userId || userId.length < 5) return;

    setCredentials(null);
    setChallengeId(null);

    const response = await fetch(`${apiBaseUrl}/api/wallet/create-user`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId }),
    });
    const data = await response.json();

    // Error code 155106 means user already exists -- proceed to get token
    if (data.code === 155106) {
      setStatus("User already exists. Get user token to continue.");
      return;
    }

    setStatus("User created. Get user token to continue.");
  };

  // Step 2: Get User Token
  const handleGetUserToken = async () => {
    if (!userId) return;

    const response = await fetch(`${apiBaseUrl}/api/wallet/get-token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId }),
    });
    const data = await response.json();

    setCredentials({ userToken: data.userToken, encryptionKey: data.encryptionKey });
    localStorage.setItem("userToken", data.userToken);
    localStorage.setItem("encryptionKey", data.encryptionKey);
  };

  // Step 3: Initialize User (get challenge)
  const handleInitializeUser = async () => {
    if (!credentials?.userToken) return;

    const response = await fetch(`${apiBaseUrl}/api/wallet/initialize`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userToken: credentials.userToken }),
    });
    const data = await response.json();

    if (data.code === 155106) {
      // User already has wallets -- load them via listUserWallets
      return;
    }

    setChallengeId(data.challengeId);
  };

  // Step 4: Create Wallet (execute challenge -- opens Circle's PIN setup UI)
  const handleCreateWallet = () => {
    const sdk = sdkRef.current;
    if (!sdk || !challengeId || !credentials) return;

    sdk.setAuthentication({
      userToken: credentials.userToken,
      encryptionKey: credentials.encryptionKey,
    });

    sdk.execute(challengeId, (error, result) => {
      if (error) {
        setStatus("Failed: " + ((error as Error).message || "Unknown error"));
        return;
      }
      console.log("Challenge result:", result);
      setChallengeId(null);
      // Wait for Circle to index, then call listUserWallets to fetch the new wallet
    });
  };

  return <div />;
}
```

## Error Handling

| Error Code | Meaning | Action |
|------------|---------|--------|
| 155106 | User already initialized | Fetch existing wallets instead of creating |
| 155104 | Invalid user token | Token expired -- call `createUserToken` again |
| 155101 | User not found | User needs to be created first |

## Reference Links

- [Create User Wallets with PIN](https://developers.circle.com/wallets/user-controlled/create-user-wallets-with-pin)
- [Create User API](https://developers.circle.com/api-reference/wallets/user-controlled-wallets/create-user)
- [Get User Token API](https://developers.circle.com/api-reference/wallets/user-controlled-wallets/get-user-token)
- [Create User with PIN Challenge API](https://developers.circle.com/api-reference/wallets/user-controlled-wallets/create-user-with-pin-challenge)
