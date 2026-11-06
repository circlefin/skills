# Creating User-Controlled Wallets with Email OTP

## Flow

Each step maps to one frontend handler:

1. `handleRequestOtp` -- The Web SDK provides a `deviceId` identifying the browser. The backend calls `createDeviceTokenForEmailLogin` with `deviceId` and email; Circle emails an OTP and returns `deviceToken`, `deviceEncryptionKey`, and `otpToken`, which the frontend passes to `sdk.updateConfigs`.
2. `handleVerifyOtp` -- `sdk.verifyOtp()` opens Circle's hosted OTP UI. On success, the SDK login callback receives `userToken` and `encryptionKey`.
3. `handleInitializeUser` -- The backend calls `createUserPinWithWallets` with `userToken` and gets a `challengeId`. Error 155106 means the user already has wallets -- load them with `listWallets` instead.
4. `handleCreateWallet` -- `sdk.execute(challengeId)`; the user approves and Circle creates the wallet.

## Prerequisites

1. **SMTP provider**: Circle accepts any SMTP-compatible provider. For testing, use Mailtrap (Email Sandbox -> Transactional Sandboxes -> copy Host, Port, Username, Password). For production, use SendGrid, Mailgun, or AWS SES.
2. **Circle Developer Console**: Get the API key from Project Settings. In Wallets -> User Controlled -> Configurator, configure SMTP under Authentication Methods -> Email OTP, then copy the App ID.

## Backend SDK Methods

### Step 1: Request email OTP

```ts
const response = await circleClient.createDeviceTokenForEmailLogin({
  deviceId,
  email,
});
// response.data: { deviceToken, deviceEncryptionKey, otpToken }
```

### Step 2: Initialize user and create wallet

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

Initialize the SDK with a login callback to receive the OTP verification result.

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
      // User already has wallets -- load them via listWallets
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
      // Wait for Circle to index, then call listWallets to fetch the new wallet
    });
  };

  return <div />;
}
```

Error codes (including the OTP codes) and recovery actions: see Error Handling in `SKILL.md`.

## Reference Links

- [Create User Wallets with Email OTP](https://developers.circle.com/wallets/user-controlled/create-user-wallets-with-email)
- [Create Device Token Email Login API](https://developers.circle.com/api-reference/wallets/user-controlled-wallets/create-device-token-email-login)
- [Resend OTP API](https://developers.circle.com/api-reference/wallets/user-controlled-wallets/resend-otp)
