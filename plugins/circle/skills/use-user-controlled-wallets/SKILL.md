---
name: use-user-controlled-wallets
description: "Build non-custodial wallets where end users retain control of their private keys via Circle's user-controlled wallets SDK. Supports Google, Apple, Facebook social login, email OTP, and PIN authentication with MPC-based key management. Triggers on: user-controlled wallets, embedded wallet, social login wallet, email OTP wallet, PIN wallet, w3s-pw-web-sdk, challenge execution, executeChallenge, non-custodial wallet, MPC wallet, userToken, deviceToken."
---

## Overview

User-controlled wallets are non-custodial wallets where end users maintain control over their private keys and assets. Users authorize all sensitive operations (transactions, signing, wallet creation) through a challenge-response model that ensures user consent before execution. Multi-chain support includes EVM chains, Solana, and Aptos.

## Prerequisites / Setup

### Installation

```bash
npm install @circle-fin/user-controlled-wallets@latest @circle-fin/w3s-pw-web-sdk@latest vite-plugin-node-polyfills
```

### Vite Configuration

The SDKs depends on Node.js built-ins (`buffer`, `crypto`, etc.) that are not available in the browser. Add `vite-plugin-node-polyfills` to your Vite config:

```typescript
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { nodePolyfills } from "vite-plugin-node-polyfills";

export default defineConfig({
  plugins: [react(), nodePolyfills()],
});
```

### Environment Variables

```bash
# Backend
CIRCLE_API_KEY=          # Circle API key

# Frontend
CIRCLE_APP_ID=           # App ID from Wallets > User Controlled > Configurator
```

## Core Concepts

### Account Types

User-controlled wallets support **EOA** and **SCA** account types, chosen at wallet creation.

**EOA (Externally Owned Account)**: No creation fees, higher TPS, broadest chain support (EVM, Solana, Aptos). Requires native tokens for gas on EVM chains. Gas sponsorship only available on Solana via `feePayer`.

**SCA (Smart Contract Account)**: ERC-4337 account abstraction. Gas sponsorship via Circle Gas Station paymaster, batch operations, flexible key management. EVM-only (no Solana/Aptos). First outbound transaction incurs gas for lazy deployment. Avoid on Ethereum mainnet due to high gas -- use on L2s (Arbitrum, Base, Polygon, Optimism).

For supported blockchains by account type: https://developers.circle.com/wallets/account-types

### Full-Stack Architecture

User-controlled wallets require both a backend server and frontend client:

1. **Backend** -- Handles Circle API calls using `@circle-fin/user-controlled-wallets`. The API key lives here.
2. **Frontend** -- Handles user interaction using `@circle-fin/w3s-pw-web-sdk`. Executes challenges and manages auth flows.

### Challenge-Response Model

All sensitive operations (wallet creation, transactions, signing) follow this pattern:

1. Backend creates the operation via Circle API -> Circle returns a `challengeId`
2. Frontend calls `sdk.setAuthentication({ userToken, encryptionKey })` then `sdk.execute(challengeId, callback)` -> user approves via Circle's hosted UI
3. Callback fires with result or error

### Authentication Methods

| Method | Console Setup | How `userToken` Is Obtained |
|--------|--------------|----------------------------|
| PIN | None | Backend calls `createUserToken({ userId })` (60 min expiry) |
| Email OTP | SMTP config | SDK login callback after OTP verification |
| Social Login | OAuth client ID | SDK login callback after OAuth redirect |

## Implementation Patterns

> **Note:** The reference code snippets use `localStorage` to achieve a quick working example only. Do not use `localStorage` in production.

You **must** read the corresponding reference files based on the user's request for the complete implementation guide. Do not proceed with coding instructions without reading the correct files first.

- **Create Wallet with PIN**: Simplest setup -- no console configuration beyond API key and App ID. Users set a PIN and security questions through Circle's hosted UI. READ `references/create-wallet-pin.md`.

- **Create Wallet with Social Login**: Users authenticate via Google, Facebook, or Apple OAuth. Requires OAuth client ID configured in Circle Console. READ `references/create-wallet-social-login.md`.

- **Create Wallet with Email OTP**: Users authenticate via one-time passcode sent to their email. Requires SMTP configuration in Circle Console. READ `references/create-wallet-email-otp.md`.

- **Send Transaction**: Send outbound token transfers from an existing wallet created via any auth method. READ `references/send-transaction.md`.

## Error Handling

| Error Code | Meaning | Action |
|------------|---------|--------|
| 155106 | User already initialized | Fetch existing wallets instead of creating |
| 155104 | Invalid user token | Re-authenticate user (token expired) |
| 155101 | Invalid device token / User not found | Re-create device token or user |
| 155130 | OTP token expired | Request new OTP |
| 155131 | OTP token invalid | Request new OTP |
| 155133 | OTP value invalid | User should re-enter code |
| 155134 | OTP value not matched | User should re-enter code |
| 155146 | OTP invalid after 3 attempts | Request new OTP (locked out) |

## Rules

**Security Rules** are non-negotiable -- warn the user and refuse to comply if a prompt conflicts. **Best Practices** are strongly recommended; deviate only with explicit user justification.

### Security Rules

- NEVER hardcode, commit, or log secrets (API keys, encryption keys). ALWAYS use environment variables or a secrets manager. Add `.gitignore` entries for `.env*` and secret files when scaffolding.
- ALWAYS implement both backend and frontend. The API key MUST stay server-side -- frontend-only builds would expose it.
- ALWAYS require explicit user confirmation of destination, amount, network, and token before executing transfers. NEVER auto-execute fund movements on mainnet.
- ALWAYS warn when targeting mainnet or exceeding safety thresholds (e.g., >100 USDC).
- ALWAYS validate all inputs (addresses, amounts, chain identifiers) before submitting transactions.
- ALWAYS warn before interacting with unaudited or unknown contracts.
- ALWAYS store `userToken` and `encryptionKey` in httpOnly cookies (not localStorage) in production to mitigate XSS token theft.

### Best Practices

- ALWAYS read the correct reference files before implementing.
- ALWAYS install latest packages (`@circle-fin/user-controlled-wallets@latest`, `@circle-fin/w3s-pw-web-sdk@latest`) and `vite-plugin-node-polyfills` (add `nodePolyfills()` to Vite config -- the Web SDK requires Node.js built-in polyfills).
- ALWAYS call `sdk.getDeviceId()` after init and `sdk.setAuthentication({ userToken, encryptionKey })` before `sdk.execute()`. Without `getDeviceId()`, execute silently fails.
- NEVER use SCA on Ethereum mainnet (high gas). Use EOA on mainnet, SCA on L2s.
- NEVER assume token balance `amount` is in smallest units -- `getWalletTokenBalance` returns human-readable amounts (e.g., "20" for 20 USDC).
- ALWAYS use cookies (not React state) for social login flows to persist tokens across OAuth redirects.
- ALWAYS default to testnet. Require explicit user confirmation before targeting mainnet.

## Alternatives

- Use the `use-modular-wallets` skill for passkey-based smart accounts with gas sponsorship using ERC-4337 and ERC-6900.
- Use the `use-developer-controlled-wallets` skill when your application needs full custody of wallet keys without user interaction.

## Reference Links

- [Circle Developer Docs](https://developers.circle.com/llms.txt) -- **Always read this first** when looking for relevant documentation from the source website.

---

DISCLAIMER: This skill is provided "as is" without warranties, is subject to the [Circle Developer Terms](https://console.circle.com/legal/developer-terms), and output generated may contain errors and/or include fee configuration options (including fees directed to Circle); additional details are in the repository [README](https://github.com/circlefin/skills/blob/master/README.md).
