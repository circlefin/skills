---
name: use-user-controlled-wallets
description: "Build non-custodial wallets where end users retain control of their private keys via Circle's user-controlled wallets SDK. Supports Google, Apple, Facebook social login, email OTP, and PIN authentication with MPC-based key management. Covers wallet creation, token transfers, message signing, smart contract execution, and wallet management. Triggers on: user-controlled wallets, social login wallet, email OTP wallet, PIN wallet, w3s-pw-web-sdk, executeChallenge, MPC wallet, userToken, deviceToken, contract execution."
requirements:
  runtimes: []
  connectors: []
---

## Overview

User-controlled wallets are non-custodial: end users keep control of their private keys and assets, and authorize every sensitive operation (wallet creation, transactions, signing) through a challenge-response flow. Supports EVM chains, Solana, and Aptos.

## Prerequisites / Setup

### Installation

```bash
npm install @circle-fin/user-controlled-wallets@latest @circle-fin/w3s-pw-web-sdk@latest vite-plugin-node-polyfills
```

### Vite Configuration

The SDKs depend on Node.js built-ins (`buffer`, `crypto`, etc.) that browsers lack. Add `nodePolyfills()`:

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

`@circle-fin/user-controlled-wallets` handles all server-side operations (user creation, challenge creation, transaction queries).

```typescript
import { initiateUserControlledWalletsClient, Blockchain, TokenBlockchain } from "@circle-fin/user-controlled-wallets";

const circleClient = initiateUserControlledWalletsClient({
  apiKey: process.env.CIRCLE_API_KEY!,
});
```

### Frontend SDK Initialization

`@circle-fin/w3s-pw-web-sdk` handles user-facing operations (challenge execution, auth flows, PIN/OTP/OAuth UI).

```typescript
import { W3SSdk } from "@circle-fin/w3s-pw-web-sdk";

const sdk = new W3SSdk({ appSettings: { appId: circleAppId } });
```

IMPORTANT: Call `sdk.getDeviceId()` right after initialization. It establishes the iframe session with Circle; without it, `sdk.execute()` fails silently.

For email OTP and social login, pass a login callback as the second constructor argument (see the corresponding reference).

## Core Concepts

### Account Types

Chosen at wallet creation. Supported blockchains per type: https://developers.circle.com/wallets/account-types

- **EOA (Externally Owned Account)**: No creation fees, higher TPS, broadest chain support (EVM, Solana, Aptos). Requires native tokens for gas on EVM chains (on Arc the gas asset is USDC -- there is no separate native token). Gas sponsorship only on Solana, via `feePayer`.
- **SCA (Smart Contract Account)**: ERC-4337. Gas sponsorship via the Circle Gas Station paymaster, batch operations, flexible key management. EVM-only (no Solana/Aptos). The first outbound transaction incurs gas for lazy deployment.

### Architecture

| Party | Role |
| --- | --- |
| End user (browser/mobile) | Authenticates (PIN, email OTP, or social login) and approves every sensitive operation in Circle's hosted UI via `@circle-fin/w3s-pw-web-sdk`. Keeps full control of private keys -- neither the developer nor Circle can act on the user's behalf. |
| Developer service (backend) | Holds the Circle API key, manages user sessions, tracks usage, and enforces app-level guardrails (e.g., spending limits, allowlisted addresses, rate limiting). Calls Circle's API via `@circle-fin/user-controlled-wallets`. Requires a [Circle Developer Console](https://developers.circle.com/w3s/circle-developer-account) account; for developer account setup, see the `use-developer-controlled-wallets` skill. |
| Circle Wallet Service (API) | Wallet creation, transaction submission, MPC-based key management, and blockchain interaction. Enforces platform-level compliance screening (e.g., OFAC sanctions checks). |

Request flow: End user -> Developer service (adds API key, enforces guardrails) -> Circle Wallet Service (compliance screening, submission) -> Blockchain.

### Challenge-Response Model

All sensitive operations (wallet creation, transactions, signing) follow this pattern:

1. Backend creates the operation via the Circle API -> Circle returns a `challengeId`.
2. Frontend calls `sdk.setAuthentication({ userToken, encryptionKey })`, then `sdk.execute(challengeId, callback)` -> user approves in Circle's hosted UI.
3. The callback fires with the result or error.

### Authentication Methods

| Method | Console Setup | How `userToken` Is Obtained |
| --- | --- | --- |
| PIN | None | Backend calls `createUserToken({ userId })` (60 min expiry) |
| Email OTP | SMTP config | SDK login callback after OTP verification |
| Social Login | OAuth client ID | SDK login callback after OAuth redirect |

### Access Boundaries

- **Developers** can read wallet data, transaction history, and user information (Circle Developer Console or API) for security monitoring and auditing. They cannot access private keys, send transactions, sign messages, or perform any on-chain operation for a user -- the user must authorize each one via a challenge.
- **Recovery**: Developers cannot recover a wallet for a user who loses their authentication method (social account, email, or PIN plus security questions); recovery depends entirely on the user re-authenticating. Tell users this during onboarding.
- **Users** can access only their own wallets and resources -- not other users' and not developer-controlled wallets (the two wallet types are fully isolated).

### Transaction Lifecycle

Transfers and contract executions are asynchronous. Poll `circleClient.getTransaction({ userToken, id })` until a terminal state.

**Happy path:** `INITIATED` -> `QUEUED` -> `CLEARED` -> `SENT` -> `CONFIRMED` -> `COMPLETE`. `CONFIRMED` may be skipped or arrive out of order; instant-finality chains such as Arc go `SENT` -> `COMPLETE`.

| State | Terminal | Meaning |
| --- | --- | --- |
| `INITIATED` | No | Request accepted, not yet validated or checked |
| `QUEUED` | No | In the processing queue |
| `CLEARED` | No | Passed initial checks and risk screening |
| `SENT` | No | Submitted to the blockchain, awaiting confirmation |
| `STUCK` | No | Fee parameters are below the chain's current required fee -- cancel or accelerate the transaction |
| `CONFIRMED` | No | Included in a block, awaiting finality |
| `COMPLETE` | Yes | Succeeded and finalized on-chain |
| `FAILED` | Yes | Reverted or hit an unrecoverable error |
| `DENIED` | Yes | Rejected by risk screening |
| `CANCELLED` | Yes | Cancelled (allowed in `INITIATED`, `QUEUED`, or `SENT`) |

Debug `FAILED` or `DENIED` transactions with [Transaction Errors](https://developers.circle.com/wallets/asynchronous-states-and-statuses#transaction-errors).

## Implementation Patterns

READ the reference for the user's request before writing code. Reference snippets use `localStorage` only for a quick working example (see Security Rules for production storage).

- **Create wallet with PIN**: Simplest setup -- no console configuration beyond API key and App ID; users set a PIN and security questions in Circle's hosted UI. READ `references/create-wallet-pin.md`.
- **Create wallet with social login**: Google, Facebook, or Apple OAuth; requires an OAuth client ID in the Circle Console. READ `references/create-wallet-social-login.md`.
- **Create wallet with email OTP**: One-time passcode sent by email; requires SMTP configuration in the Circle Console. READ `references/create-wallet-email-otp.md`.
- **Send transaction**: Outbound token transfers from a wallet created with any auth method, plus fee estimation, acceleration, and cancellation. READ `references/send-transaction.md`.
- **Sign messages**: EIP-191 messages, EIP-712 typed data, and raw transactions. READ `references/sign-message.md`.
- **Execute smart contracts**: ABI signature or raw calldata, plus gas estimation. READ `references/contract-execution.md`.
- **Wallet management**: Update wallet metadata. READ `references/wallet-management.md`.

## Error Handling

| Error Code | Meaning | Action |
| --- | --- | --- |
| 155106 | User already initialized | Fetch existing wallets (`listWallets`) instead of creating |
| 155104 | Invalid user token (expired) | Re-authenticate: PIN calls `createUserToken` again; email OTP and social login repeat the login |
| 155101 | Existing user already created with the provided userId | Skip `createUser`; call `createUserToken` for the existing user |
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

- ALWAYS install the `@latest` SDKs (`@circle-fin/user-controlled-wallets`, `@circle-fin/w3s-pw-web-sdk`) and add `nodePolyfills()` from `vite-plugin-node-polyfills` to the Vite config.
- ALWAYS call `sdk.getDeviceId()` after init and `sdk.setAuthentication({ userToken, encryptionKey })` before `sdk.execute()`.
- NEVER use SCA on Ethereum mainnet (high gas). Use EOA on mainnet, SCA on L2s (Arbitrum, Base, Polygon, Optimism).
- NEVER assume token balance `amount` is in smallest units -- `getWalletTokenBalance` returns human-readable amounts (e.g., "20" for 20 USDC).
- ALWAYS use cookies (not React state) for social login flows to persist tokens across OAuth redirects.
- ALWAYS wait for a terminal transaction state (see Transaction Lifecycle) before treating a transaction as done.
- ALWAYS default to testnet. Require explicit user confirmation before targeting mainnet.
- ALWAYS estimate fees before contract execution or large transfers so the user knows the gas cost upfront.
- ALWAYS verify the ABI function signature and parameters match the target contract before executing -- a wrong signature reverts and wastes gas.
- ALWAYS prefer `abiFunctionSignature` + `abiParameters` over raw `callData` for readability and auditability, unless the calldata comes from a trusted library (ethers, viem).

## Alternatives

- Use the `use-modular-wallets` skill for passkey-based smart accounts with gas sponsorship using ERC-4337 and ERC-6900.
- Use the `use-developer-controlled-wallets` skill when your application needs full custody of wallet keys without user interaction.

## Reference Links

- [Circle Developer Docs](https://developers.circle.com/llms.txt) -- **Always read this first** when looking for relevant documentation from the source website.

---

DISCLAIMER: This skill is provided "as is" without warranties, is subject to the [Circle Developer Terms](https://console.circle.com/legal/developer-terms), and output generated may contain errors and/or include fee configuration options (including fees directed to Circle); additional details are in the repository [README](https://github.com/circlefin/skills/blob/master/README.md).
