---
name: use-user-controlled-wallets
description: "Build non-custodial wallets where end users retain control of their private keys via Circle's user-controlled wallets SDK. Supports Google, Apple, Facebook social login, email OTP, and PIN authentication with MPC-based key management. Covers wallet creation, token transfers, message signing, smart contract execution, and wallet management. Triggers on: user-controlled wallets, embedded wallet, social login wallet, email OTP wallet, PIN wallet, w3s-pw-web-sdk, challenge execution, executeChallenge, non-custodial wallet, MPC wallet, userToken, deviceToken, sign message, sign transaction, sign typed data, contract execution, execute contract, call contract, estimate fee, accelerate transaction, cancel transaction."
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

### Backend SDK Initialization

Uses `@circle-fin/user-controlled-wallets` for all server-side operations (user creation, challenge creation, transaction queries).

```typescript
import { initiateUserControlledWalletsClient } from "@circle-fin/user-controlled-wallets";

const circleClient = initiateUserControlledWalletsClient({
  apiKey: process.env.CIRCLE_API_KEY!,
});
```

### Frontend SDK Initialization

Uses `@circle-fin/w3s-pw-web-sdk` for user-facing operations (challenge execution, auth flows, PIN/OTP/OAuth UI).

```typescript
import { W3SSdk } from "@circle-fin/w3s-pw-web-sdk";

const sdk = new W3SSdk({ appSettings: { appId: circleAppId } });
```

IMPORTANT: You must call `sdk.getDeviceId()` after SDK initialization. This establishes a session with Circle's service via an iframe. Without this call, `sdk.execute()` will silently fail.

For email OTP and social login, the SDK must be initialized with a login callback as the second argument. See the corresponding reference files for details.

## Core Concepts

### Account Types

User-controlled wallets support **EOA** and **SCA** account types, chosen at wallet creation.

**EOA (Externally Owned Account)**: No creation fees, higher TPS, broadest chain support (EVM, Solana, Aptos). Requires native tokens for gas on EVM chains. Gas sponsorship only available on Solana via `feePayer`.

**SCA (Smart Contract Account)**: ERC-4337 account abstraction. Gas sponsorship via Circle Gas Station paymaster, batch operations, flexible key management. EVM-only (no Solana/Aptos). First outbound transaction incurs gas for lazy deployment. Avoid on Ethereum mainnet due to high gas -- use on L2s (Arbitrum, Base, Polygon, Optimism).

For supported blockchains by account type: https://developers.circle.com/wallets/account-types

### Architecture

User-controlled wallets involve three parties:

1. **End User (Client)** -- The person using a web app or mobile app. They interact with the developer's frontend, authenticate (PIN, email OTP, or social login), and approve all sensitive operations (wallet creation, transactions, signing) through Circle's hosted UI via `@circle-fin/w3s-pw-web-sdk`. Users retain full control of their private keys -- neither the developer nor Circle can act on their behalf.

2. **Developer Service (Backend)** -- The developer's own server. It holds the Circle API key, manages user sessions, tracks usage, and enforces application-level guardrail rules (e.g., spending limits, allowlisted addresses, rate limiting). It submits requests to Circle's API using `@circle-fin/user-controlled-wallets`. Developers register a developer account through the [Circle Developer Console](https://developers.circle.com/w3s/circle-developer-account) to get access to Circle Wallet services. For developer-specific account setup, see the `use-developer-controlled-wallets` skill.

3. **Circle Wallet Service (API)** -- Circle's infrastructure that manages wallet creation, transaction submission, key management (MPC-based), and blockchain interactions. It provides the non-custodial guarantee: developers get read access for security monitoring and auditing, while users keep full control of their wallets and assets. Circle enforces platform-level compliance screening (e.g., OFAC sanctions checks) on transactions.

**Request flow:**

```
End User (browser/mobile)
    |  authenticates & approves challenges
    v
Developer Service (backend server)
    |  adds API key, enforces app-level guardrails, tracks usage
    v
Circle Wallet Service (API)
    |  manages wallets, enforces compliance screening, submits transactions
    v
Blockchain
```

This three-tier architecture ensures separation of concerns: the client handles user interaction and consent, the developer service handles business logic and application-level guardrails, and Circle handles cryptographic operations, compliance screening, and blockchain interactions.

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

### Developer Access and Limitations

Developers can **read** wallet data, transaction history, and user information -- either through the [Circle Developer Console](https://console.circle.com/) UI or programmatically via the API. However, developers do **not** have access to users' private keys and **cannot** control user wallets to send transactions, sign messages, or perform any on-chain operations on a user's behalf. All such operations require the user to authorize them through the challenge-response model.

Developers also **cannot** help a user recover their wallet if the user loses access to their authentication method (social account, email, or PIN code and security questions). Account recovery is entirely dependent on the user's ability to re-authenticate. Inform users of this limitation during onboarding so they understand the importance of maintaining access to their chosen authentication method.

### User Access and Limitations

Users can only access their own wallets and resources. They have **no** access to other users' wallets, transactions, or any other resources. Users also have **no** access to developer-controlled wallets or resources -- the two wallet types are fully isolated from each other.

## Implementation Patterns

> **Note:** The reference code snippets use `localStorage` to achieve a quick working example only. Do not use `localStorage` in production.

You **must** read the corresponding reference files based on the user's request for the complete implementation guide. Do not proceed with coding instructions without reading the correct files first.

- **Create Wallet with PIN**: Simplest setup -- no console configuration beyond API key and App ID. Users set a PIN and security questions through Circle's hosted UI. READ `references/create-wallet-pin.md`.

- **Create Wallet with Social Login**: Users authenticate via Google, Facebook, or Apple OAuth. Requires OAuth client ID configured in Circle Console. READ `references/create-wallet-social-login.md`.

- **Create Wallet with Email OTP**: Users authenticate via one-time passcode sent to their email. Requires SMTP configuration in Circle Console. READ `references/create-wallet-email-otp.md`.

- **Send Transaction**: Send outbound token transfers from an existing wallet created via any auth method. Includes fee estimation, transaction acceleration, and cancellation. READ `references/send-transaction.md`.

- **Sign Messages**: Sign messages from a user-controlled wallet. Covers EIP-191 message signing, EIP-712 typed data, and raw transaction signing. READ `references/sign-message.md`.

- **Execute Smart Contracts**: Execute smart contract functions via ABI signature or raw calldata. Includes gas estimation for contract execution. READ `references/contract-execution.md`.

- **Wallet Management**: Update wallet metadata. READ `references/wallet-management.md`.

## Transaction Lifecycle

All on-chain operations (transfers, contract executions) follow the same asynchronous state machine. Poll with `circleClient.getTransaction({ userToken, id })` until a terminal state is reached.

**Happy path:** `INITIATED` -> `CLEARED` -> `QUEUED` -> `SENT` -> `CONFIRMED` -> `COMPLETE`

**Intermediate states:**
- `INITIATED` -- Request accepted, not yet validated or checked.
- `WAITING` -- In queue for validation and compliance checks.
- `CLEARED` -- Finish compliance checks.
- `QUEUED` -- Queued for submission to the blockchain.
- `SENT` -- Submitted to the blockchain, awaiting confirmation.
- `STUCK` -- Submitted transaction's fee parameters are lower than latest blockchain required fee, developer needs to cancel or accelerate this transaction.
- `CONFIRMED` -- Included in a block, awaiting finality.

**Terminal states:**
- `COMPLETE` -- Transaction succeeded and is finalized on-chain.
- `FAILED` -- Transaction reverted or encountered an unrecoverable error.
- `DENIED` -- Transaction was rejected by risk screening.
- `CANCELLED` -- Transaction was cancelled before on-chain submission.

Always wait until a terminal state before treating any transaction as done. For debugging failed or denied transactions, see [Transaction Errors](https://developers.circle.com/w3s/asynchronous-states-and-statuses#transaction-errors).

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
- ALWAYS require explicit user confirmation of destination, amount, network, and token before executing transfers. MUST receive confirmation for funding movements on mainnet.
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
- ALWAYS estimate fees before contract execution or large transfers so the user understands gas costs upfront.
- ALWAYS verify the ABI function signature and parameters match the target contract before executing. Incorrect signatures will revert and waste gas.
- ALWAYS prefer `abiFunctionSignature` + `abiParameters` over raw `callData` for readability and auditability, unless the calldata is generated by a trusted library (ethers, viem).

## Alternatives

- Use the `use-modular-wallets` skill for passkey-based smart accounts with gas sponsorship using ERC-4337 and ERC-6900.
- Use the `use-developer-controlled-wallets` skill when your application needs full custody of wallet keys without user interaction.

## Reference Links

- [Circle Developer Docs](https://developers.circle.com/llms.txt) -- **Always read this first** when looking for relevant documentation from the source website.

---

DISCLAIMER: This skill is provided "as is" without warranties, is subject to the [Circle Developer Terms](https://console.circle.com/legal/developer-terms), and output generated may contain errors and/or include fee configuration options (including fees directed to Circle); additional details are in the repository [README](https://github.com/circlefin/skills/blob/master/README.md).
