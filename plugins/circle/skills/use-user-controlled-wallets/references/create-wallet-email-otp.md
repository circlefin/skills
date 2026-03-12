# Creating User-Controlled Wallets with Email OTP

## Overview

Complete flow for creating user-controlled wallets using email one-time passcode (OTP) authentication. Requires both a frontend (Web SDK) and backend (Node.js SDK) component.

## User Flow

1. **Enter email and click "Send OTP"**: The Web SDK generates a `deviceId` identifying the user's browser. Your backend calls Circle's email token endpoint with `deviceId` and email. Circle sends an OTP to the user's email and returns `deviceToken`, `deviceEncryptionKey`, and `otpToken`.

2. **Click "Verify OTP"**: The Web SDK opens Circle's hosted OTP verification UI. The user enters the code. Upon success, the SDK invokes the login callback with `userToken` and `encryptionKey`.

3. **Click "Initialize user"**: Your backend initializes the user using the `userToken`. Circle returns a `challengeId` to create a wallet. Error code 155106 means the user already has wallets -- load them instead.

4. **Click "Create wallet"**: The Web SDK executes the challenge using the `challengeId`. The user approves, and Circle creates the wallet.

## Prerequisites

1. **Email Provider (Mailtrap for testing)**:
   - Create a Mailtrap account
   - Go to Email Sandbox -> Transactional Sandboxes
   - Copy SMTP credentials (Host, Port, Username, Password)

2. **Circle Developer Console**:
   - Get API key from Project Settings
   - Navigate to Wallets -> User Controlled -> Configurator
   - Under Authentication Methods -> Email OTP, configure your SMTP settings
   - Copy the App ID from the configurator

Circle supports any SMTP-compatible email provider. For testing, Mailtrap is recommended. For production, use SendGrid, Mailgun, or AWS SES.

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
 * Requests an email OTP for authentication.
 * Circle sends a one-time code to the user's email address.
 * Endpoint: POST /api/wallet/request-otp { deviceId, email }
 */
export async function requestEmailOtp(deviceId: string, email: string) {
  const response = await circleClient.createDeviceTokenForEmailLogin({
    deviceId,
    email,
  });

  return {
    deviceToken: response.data?.deviceToken,
    deviceEncryptionKey: response.data?.deviceEncryptionKey,
    otpToken: response.data?.otpToken,
  };
}

/**
 * Initializes a user after successful OTP verification.
 * Returns a challengeId if the user needs to create a wallet.
 * Error code 155106 means user already exists - fetch wallets instead.
 * Endpoint: POST /api/wallet/initialize { userToken, blockchains? }
 */
export async function initializeUser(
  userToken: string,
  blockchains: Blockchain[] = [Blockchain.ArcTestnet]
) {
  const response = await circleClient.createUserPinWithWallets({
    userToken,
    blockchains,
    accountType: "SCA",
  });

  return {
    challengeId: response.data?.challengeId,
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

Uses `@circle-fin/w3s-pw-web-sdk` for OTP verification and challenge execution. The SDK must be initialized with a login callback to handle OTP verification results.

The frontend implements four button handlers mapping to the User Flow steps:
1. `handleRequestOtp` -- Send OTP to email
2. `handleVerifyOtp` -- Verify OTP code
3. `handleInitializeUser` -- Initialize user (get challenge)
4. `handleCreateWallet` -- Create wallet (execute challenge)

```tsx
import { useState, useEffect, useRef } from "react";
import { W3SSdk } from "@circle-fin/w3s-pw-web-sdk";

interface LoginResult {
  userToken: string;
  encryptionKey: string;
}

interface OtpTokens {
  deviceToken: string;
  deviceEncryptionKey: string;
  otpToken: string;
}

export default function EmailOtpWallet({
  circleAppId,
  apiBaseUrl = "",
}: {
  circleAppId: string;
  apiBaseUrl?: string;
}) {
  const sdkRef = useRef<W3SSdk | null>(null);
  const [deviceId, setDeviceId] = useState("");
  const [email, setEmail] = useState("");
  const [otpTokens, setOtpTokens] = useState<OtpTokens | null>(null);
  const [loginResult, setLoginResult] = useState<LoginResult | null>(null);
  const [challengeId, setChallengeId] = useState<string | null>(null);
  const [status, setStatus] = useState("Ready");

  useEffect(() => {
    const initSdk = async () => {
      try {
        const onLoginComplete = (error: unknown, result: unknown) => {
          if (error) {
            setStatus("Login failed: " + ((error as Error).message || "Unknown error"));
            return;
          }
          const loginRes = result as LoginResult;
          setLoginResult(loginRes);
          localStorage.setItem("userToken", loginRes.userToken);
          localStorage.setItem("encryptionKey", loginRes.encryptionKey);
          setStatus("Email verified. Ready to initialize user.");
        };

        const sdk = new W3SSdk(
          { appSettings: { appId: circleAppId } },
          onLoginComplete
        );
        sdkRef.current = sdk;

        const storedDeviceId = localStorage.getItem("deviceId");
        if (storedDeviceId) {
          setDeviceId(storedDeviceId);
        } else {
          const id = await sdk.getDeviceId();
          setDeviceId(id);
          localStorage.setItem("deviceId", id);
        }

        const storedUserToken = localStorage.getItem("userToken");
        const storedEncryptionKey = localStorage.getItem("encryptionKey");
        if (storedUserToken && storedEncryptionKey) {
          setLoginResult({ userToken: storedUserToken, encryptionKey: storedEncryptionKey });
        }
      } catch {
        setStatus("Failed to initialize Web SDK");
      }
    };

    void initSdk();
  }, [circleAppId]);

  // Step 1: Request OTP
  const handleRequestOtp = async () => {
    if (!deviceId || !email) return;

    const response = await fetch(`${apiBaseUrl}/api/wallet/request-otp`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ deviceId, email }),
    });
    const data = await response.json();

    setOtpTokens({
      deviceToken: data.deviceToken,
      deviceEncryptionKey: data.deviceEncryptionKey,
      otpToken: data.otpToken,
    });

    sdkRef.current?.updateConfigs({
      appSettings: { appId: circleAppId },
      loginConfigs: {
        deviceToken: data.deviceToken,
        deviceEncryptionKey: data.deviceEncryptionKey,
        otpToken: data.otpToken,
      },
    });
  };

  // Step 2: Verify OTP (opens Circle's hosted verification UI)
  const handleVerifyOtp = () => {
    if (!sdkRef.current || !otpTokens) return;
    sdkRef.current.verifyOtp();
  };

  // Step 3: Initialize user (get challenge)
  const handleInitializeUser = async () => {
    if (!loginResult?.userToken) return;

    const response = await fetch(`${apiBaseUrl}/api/wallet/initialize`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userToken: loginResult.userToken }),
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
    if (!sdk || !challengeId || !loginResult) return;

    sdk.setAuthentication({
      userToken: loginResult.userToken,
      encryptionKey: loginResult.encryptionKey,
    });

    sdk.execute(challengeId, (error) => {
      if (error) {
        setStatus("Failed: " + ((error as Error).message || "Unknown error"));
        return;
      }
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
| 155104 | Invalid user token | Re-authenticate user via OTP |
| 155101 | Invalid device token | Request new OTP |
| 155130 | OTP token expired | Request new OTP |
| 155131 | OTP token invalid | Request new OTP |
| 155133 | OTP value invalid | User should re-enter code |
| 155134 | OTP value not matched | User should re-enter code |
| 155146 | OTP invalid after 3 attempts | Request new OTP (locked out) |
