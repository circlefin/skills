# Creating User-Controlled Wallets with PIN

PIN is the simplest auth method: no Circle Console configuration beyond the API key and App ID.

## Flow

Each step maps to one frontend handler and one backend call:

1. `handleCreateUser` -> `createUser({ userId })`. `userId` must be at least 5 characters and unique per user (email, username, UUID, etc.). Error 155101 means the user already exists -- continue to step 2.
2. `handleGetUserToken` -> `createUserToken({ userId })` returns `userToken` (valid 60 minutes) and `encryptionKey`.
3. `handleInitializeUser` -> `createUserPinWithWallets` returns a `challengeId`. Error 155106 means the user already has wallets -- load them with `listWallets` instead.
4. `handleCreateWallet` -> `sdk.execute(challengeId)`. The user sets a PIN and security questions in Circle's hosted UI, and Circle creates the wallet.

## Prerequisites

In the Circle Developer Console, get the API key from Project Settings, then copy the App ID from Wallets -> User Controlled -> Configurator.

## Backend SDK Methods

### Step 1: Create a user

```ts
const response = await circleClient.createUser({ userId });
// response.data: { id, status, pinStatus }
```

### Step 2: Get a session token

```ts
const response = await circleClient.createUserToken({ userId });
// response.data: { userToken, encryptionKey }
```

### Step 3: Initialize user with PIN and create wallet

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

PIN auth needs no login callback, so the SDK is initialized without one.

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

    // Error code 155101 means user already exists -- proceed to get token
    if (data.code === 155101) {
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
      // User already has wallets -- load them via listWallets
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
      // Wait for Circle to index, then call listWallets to fetch the new wallet
    });
  };

  return <div />;
}
```

Error codes and recovery actions: see Error Handling in `SKILL.md`.

## Reference Links

- [Create User Wallets with PIN](https://developers.circle.com/wallets/user-controlled/create-user-wallets-with-pin)
- [Create User API](https://developers.circle.com/api-reference/wallets/user-controlled-wallets/create-user)
- [Get User Token API](https://developers.circle.com/api-reference/wallets/user-controlled-wallets/get-user-token)
- [Create User with PIN Challenge API](https://developers.circle.com/api-reference/wallets/user-controlled-wallets/create-user-with-pin-challenge)
