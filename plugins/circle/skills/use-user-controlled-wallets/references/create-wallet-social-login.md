# Creating User-Controlled Wallets with Social Login

Shown with Google OAuth; Facebook and Apple follow the same pattern (see Supported Social Providers).

## Flow

Each step maps to one frontend handler:

1. `handleCreateDeviceToken` -- The Web SDK provides a `deviceId` identifying the browser. The backend exchanges it via `createDeviceTokenForSocialLogin` for `deviceToken` and `deviceEncryptionKey`. Call this before starting OAuth.
2. `handleLoginWithGoogle` -- The Web SDK starts the Google OAuth flow. After sign-in, Circle validates the login and the SDK login callback receives `userToken` and `encryptionKey`.
3. `handleInitializeUser` -- The backend calls `createUserPinWithWallets` with `userToken` and gets a `challengeId`. Error 155106 means the user already has wallets -- load them with `listWallets` instead.
4. `handleCreateWallet` -- `sdk.execute(challengeId)`; the user approves and Circle creates the wallet.

## Prerequisites

1. **Google Cloud Console**: Create OAuth 2.0 credentials with an authorized redirect URI.
2. **Circle Developer Console**: Get the API key from Project Settings. Configure the Google Client ID in Wallets -> User Controlled -> Configurator -> Authentication Methods -> Social Logins, then copy the App ID.

## Backend SDK Methods

### Step 1: Create device token

```ts
const response = await circleClient.createDeviceTokenForSocialLogin({
  deviceId,
});
// response.data: { deviceToken, deviceEncryptionKey }
```

### Step 2: Initialize user and create wallet

```ts
const response = await circleClient.createUserPinWithWallets({
  userToken,
  blockchains: [Blockchain.MaticAmoy],
  accountType: "EOA",
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

Initialize the SDK with a login callback to receive the OAuth redirect result. Persist `deviceToken` and `deviceEncryptionKey` in cookies (e.g., `react-cookie`), not React state -- the OAuth redirect reloads the page.

```tsx
import { useState, useEffect, useRef } from "react";
import { useCookies } from "react-cookie";
import { SocialLoginProvider } from "@circle-fin/w3s-pw-web-sdk/dist/src/types";
import type { W3SSdk } from "@circle-fin/w3s-pw-web-sdk";

export default function SocialLoginWallet({
  circleAppId,
  googleClientId,
  apiBaseUrl = "",
}: {
  circleAppId: string;
  googleClientId: string;
  apiBaseUrl?: string;
}) {
  const sdkRef = useRef<W3SSdk | null>(null);
  const [cookies, setCookie, removeCookie] = useCookies([
    "deviceId", "deviceToken", "deviceEncryptionKey", "userToken", "encryptionKey",
  ]);

  const deviceId = (cookies.deviceId as string) || "";
  const deviceToken = (cookies.deviceToken as string) || "";
  const deviceEncryptionKey = (cookies.deviceEncryptionKey as string) || "";
  const userToken = (cookies.userToken as string) || "";
  const encryptionKey = (cookies.encryptionKey as string) || "";

  const [challengeId, setChallengeId] = useState<string | null>(null);
  const [status, setStatus] = useState("Ready");

  useEffect(() => {
    let cancelled = false;

    const initSdk = async () => {
      try {
        const { W3SSdk } = await import("@circle-fin/w3s-pw-web-sdk");

        const onLoginComplete = (error: unknown, result: unknown) => {
          if (cancelled) return;
          if (error) {
            setStatus("Login failed: " + ((error as Error).message || "Unknown error"));
            return;
          }
          const { userToken, encryptionKey } = result as { userToken: string; encryptionKey: string };
          setCookie("userToken", userToken);
          setCookie("encryptionKey", encryptionKey);
        };

        const sdk = new W3SSdk(
          {
            appSettings: { appId: circleAppId },
            loginConfigs: {
              deviceToken,
              deviceEncryptionKey,
              google: {
                clientId: googleClientId,
                redirectUri: window.location.origin,
                selectAccountPrompt: true,
              },
            },
          },
          onLoginComplete
        );
        sdkRef.current = sdk;

        if (!deviceId) {
          const id = await sdk.getDeviceId();
          setCookie("deviceId", id);
        }
      } catch {
        if (!cancelled) setStatus("Failed to initialize Web SDK");
      }
    };

    void initSdk();
    return () => { cancelled = true; };
  }, [circleAppId, googleClientId, deviceToken, deviceEncryptionKey, deviceId, setCookie]);

  // Step 1: Create device token
  const handleCreateDeviceToken = async () => {
    if (!deviceId) return;

    const response = await fetch(`${apiBaseUrl}/api/wallet/device-token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ deviceId }),
    });
    const data = await response.json();

    setCookie("deviceToken", data.deviceToken);
    setCookie("deviceEncryptionKey", data.deviceEncryptionKey);
  };

  // Step 2: Login with Google
  const handleLoginWithGoogle = () => {
    const sdk = sdkRef.current;
    if (!sdk || !deviceToken || !deviceEncryptionKey) return;

    sdk.updateConfigs({
      appSettings: { appId: circleAppId },
      loginConfigs: {
        deviceToken,
        deviceEncryptionKey,
        google: {
          clientId: googleClientId,
          redirectUri: window.location.origin,
          selectAccountPrompt: true,
        },
      },
    });

    sdk.performLogin(SocialLoginProvider.GOOGLE);
  };

  // Step 3: Initialize user (get challenge)
  const handleInitializeUser = async () => {
    if (!userToken) return;

    const response = await fetch(`${apiBaseUrl}/api/wallet/initialize`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userToken }),
    });
    const data = await response.json();

    if (data.code === 155106) {
      // User already has wallets -- load them via listWallets
      return;
    }

    setChallengeId(data.challengeId);
  };

  // Step 4: Create wallet (execute challenge)
  const handleCreateWallet = () => {
    const sdk = sdkRef.current;
    if (!sdk || !challengeId || !userToken || !encryptionKey) return;

    sdk.setAuthentication({ userToken, encryptionKey });

    sdk.execute(challengeId, (error) => {
      if (error) {
        setStatus("Failed: " + ((error as Error).message || "Unknown error"));
        return;
      }
      setChallengeId(null);
      // Wait for Circle to index, then call listWallets to fetch the new wallet
    });
  };

  // Logout
  const handleLogout = () => {
    removeCookie("userToken");
    removeCookie("encryptionKey");
    removeCookie("deviceToken");
    removeCookie("deviceEncryptionKey");
    setChallengeId(null);
  };

  return <div />;
}
```

## Supported Social Providers

Provider configs passed when setting up the SDK:

```typescript
// Google
google: { clientId: "...", redirectUri: "..." }

// Facebook
facebook: { appId: "...", redirectUri: "..." }

// Apple (Firebase config -- the SDK uses Firebase Auth for Apple sign-in)
apple: { apiKey: "...", authDomain: "...", projectId: "...", appId: "..." }
```

Error codes and recovery actions: see Error Handling in `SKILL.md`.

## Reference Links

- [Create User Wallets with Social Login](https://developers.circle.com/wallets/user-controlled/create-user-wallets-with-social-login)
- [Create Device Token Social Login API](https://developers.circle.com/api-reference/wallets/user-controlled-wallets/create-device-token-social-login)
