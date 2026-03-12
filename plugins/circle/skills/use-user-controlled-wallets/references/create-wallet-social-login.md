# Creating User-Controlled Wallets with Social Login

## Overview

Complete flow for creating user-controlled wallets using Google OAuth. The same pattern works for Facebook and Apple. Requires both a frontend (Web SDK) and backend (Node.js SDK) component.

## User Flow

1. **Click "Create device token"**: The Web SDK generates a `deviceId` identifying the user's browser. Your backend exchanges it for `deviceToken` and `deviceEncryptionKey`.

2. **Click "Login with Google"**: The Web SDK starts the Google OAuth flow. After sign-in, Circle validates the login and invokes the SDK callback with `userToken` and `encryptionKey`.

3. **Click "Initialize user"**: Your backend initializes the user using `userToken`. Circle returns a `challengeId` to create a wallet. Error code 155106 means the user already has wallets -- load them instead.

4. **Click "Create wallet"**: The Web SDK executes the challenge. The user approves, and Circle creates the wallet.

## Prerequisites

1. **Google Cloud Console**: Create OAuth 2.0 credentials with authorized redirect URI
2. **Circle Developer Console**:
   - Get API key from Project Settings
   - Configure Google Client ID in Wallets -> User Controlled -> Configurator -> Authentication Methods -> Social Logins
   - Copy the App ID from the configurator

## Backend Component

Uses `@circle-fin/user-controlled-wallets` SDK for all server-side operations. The backend needs a server exposing the endpoints listed below each function.

```typescript
import {
  Blockchain,
  initiateUserControlledWalletsClient,
} from "@circle-fin/user-controlled-wallets";

const circleClient = initiateUserControlledWalletsClient({
  apiKey: process.env.CIRCLE_API_KEY!,
});

/**
 * Creates device token for social login authentication.
 * Call this before initiating OAuth on the frontend.
 * Endpoint: POST /api/wallet/device-token { deviceId }
 */
export async function createDeviceToken(deviceId: string) {
  const response = await circleClient.createDeviceTokenForSocialLogin({
    deviceId,
  });
  return {
    deviceToken: response.data?.deviceToken,
    deviceEncryptionKey: response.data?.deviceEncryptionKey,
  };
}

/**
 * Initializes a user after successful social login.
 * Returns a challengeId if the user needs to create a wallet.
 * Error code 155106 means user already exists - fetch wallets instead.
 * Endpoint: POST /api/wallet/initialize { userToken, blockchains? }
 */
export async function initializeUser(
  userToken: string,
  blockchains: Blockchain[] = [Blockchain.MaticAmoy]
) {
  const response = await circleClient.createUserPinWithWallets({
    userToken,
    blockchains,
    accountType: "EOA",
  });

  return {challengeId: response.data?.challengeId};
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
 * Endpoint: POST /api/wallet/balances { walletId, userToken }
 */
export async function getWalletBalances(walletId: string, userToken: string) {
  const response = await circleClient.getWalletTokenBalance({
    walletId,
    userToken,
  });
  return response.data?.tokenBalances ?? [];
}
```

## Frontend Component

Uses `@circle-fin/w3s-pw-web-sdk` for OAuth flow and challenge execution. The SDK must be initialized with a login callback to handle the OAuth redirect response.

IMPORTANT: Social login uses OAuth redirects. Use cookies (e.g., `react-cookie`) instead of React state to persist `deviceToken` and `deviceEncryptionKey` across page reloads.

The frontend implements four button handlers mapping to the User Flow steps:
1. `handleCreateDeviceToken` -- Create device token
2. `handleLoginWithGoogle` -- Login with Google
3. `handleInitializeUser` -- Initialize user (get challenge)
4. `handleCreateWallet` -- Create wallet (execute challenge)

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
      // User already has wallets -- load them via listUserWallets
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
      // Wait for Circle to index, then call listUserWallets to fetch the new wallet
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

The same pattern works for other providers. Configure when setting up the SDK:

```typescript
// Google
google: { clientId: "...", redirectUri: "..." }

// Facebook
facebook: { appId: "...", redirectUri: "..." }

// Apple
apple: { clientId: "...", redirectUri: "..." }
```

## Error Handling

| Error Code | Meaning | Action |
|------------|---------|--------|
| 155106 | User already initialized | Fetch existing wallets instead of creating |
| 155104 | Invalid user token | Re-authenticate user |
| 155101 | Invalid device token | Regenerate device token |
