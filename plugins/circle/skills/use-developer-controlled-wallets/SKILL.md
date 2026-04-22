---
name: use-developer-controlled-wallets
description: "Create and manage Circle developer-controlled wallets where the application retains full custody of wallet keys on behalf of end-users. Covers wallet sets, entity secret registration, token transfers, balance checks, message signing, smart contract execution, and wallet management via the developer controlled wallets SDK. Triggers on: developer-controlled wallets, dev-controlled wallets, create wallet, wallet set, entity secret, transfer tokens, check balance, EOA wallet, SCA wallet, initiateDeveloperControlledWalletsClient, createWalletSet, createWallets, custody wallet, sign message, sign transaction, sign typed data, contract execution, execute contract, call contract, wallet upgrade, derive wallet, estimate fee, accelerate transaction, cancel transaction."
---

## Overview

Developer-controlled wallets let your application create and manage wallets on behalf of end users, with full custody of private keys secured through an encrypted entity secret. Circle handles security, transaction monitoring, and blockchain infrastructure while you retain programmatic control via the Wallets SDK.

## Prerequisites / Setup

### Installation

```bash
npm install @circle-fin/developer-controlled-wallets
```

### Environment Variables

```
CIRCLE_API_KEY=      # Circle API key (format: PREFIX:ID:SECRET)
ENTITY_SECRET=       # 32-byte hex entity secret
```

### Entity Secret Registration

The developer must register an entity secret before using the SDK. Direct them to https://developers.circle.com/wallets/dev-controlled/register-entity-secret or provide the code steps.

READ `references/register-secret.md` for the generation and registration snippets.

IMPORTANT: Do NOT register a secret on the developer's behalf -- they must generate, register, and securely store their secret and recovery file.

### SDK Initialization

```typescript
import { initiateDeveloperControlledWalletsClient } from '@circle-fin/developer-controlled-wallets';

const client = initiateDeveloperControlledWalletsClient({
  apiKey: process.env.CIRCLE_API_KEY,
  entitySecret: process.env.ENTITY_SECRET,
});
```

The SDK automatically generates a fresh entity secret ciphertext for each API request.

## Core Concepts

- **Wallet Sets**: A group of wallets managed by a single entity secret. Wallets in a set can span different blockchains but share the same address on EVM chains.
- **Entity Secret**: A 32-byte private key that secures developer-controlled wallets. Generated, encrypted, and registered once. Circle never stores it in plain text.
- **Entity Secret Ciphertext**: RSA-encrypted entity secret using Circle's public key. Must be unique per API request to prevent replay attacks. The SDK handles this automatically.
- **Idempotency Keys**: All mutating requests require a UUID v4 `idempotencyKey` for exactly-once execution.
- **Account Types**:
  - **EOA** (Externally Owned Account) -- default choice. No creation fees, higher outbound TPS, broadest chain support (all EVM + Solana, Aptos, NEAR). Requires native tokens for gas.
  - **SCA** (Smart Contract Account) -- ERC-4337 compliant. Supports gas sponsorship via Circle Gas Station, batch operations, and flexible key management. EVM-only (not available on Solana, Aptos, NEAR). Avoid on Ethereum mainnet due to high gas costs; prefer on L2s.
- **Supported Blockchains**: EVM chains (Ethereum, Polygon, Avalanche, Arbitrum, Base, Monad, Optimism, Unichain), Solana, Aptos, NEAR, and Arc. See https://developers.circle.com/wallets/account-types for the latest.

## Transaction Lifecycle

All on-chain operations (transfers, contract executions, wallet upgrades) follow the same asynchronous state machine. Poll with `circleDeveloperSdk.getTransaction({ id })` until a terminal state is reached.

**Happy path:** `INITIATED` -> `CLEARED` -> `QUEUED` -> `SENT` -> `CONFIRMED` -> `COMPLETE`

**Terminal states:**
- `COMPLETE` -- Transaction succeeded and is finalized on-chain.
- `FAILED` -- Transaction reverted or encountered an unrecoverable error.
- `DENIED` -- Transaction was rejected by risk screening.
- `CANCELLED` -- Transaction was cancelled before on-chain submission.

**Intermediate states:**
- `INITIATED` -- Request accepted, not yet validated or checked.
- `WAITING` -- In queue for validation and compliance checks.
- `QUEUED` -- Queued for submission to the blockchain.
- `CLEARED` -- Passed compliance checks.
- `SENT` -- Submitted to the blockchain, awaiting confirmation.
- `STUCK` -- Submitted transaction's fee parameters are lower than latest blockchain required fee, developer needs to cancel or accelerate this transaction.
- `CONFIRMED` -- Included in a block, awaiting finality.

**Recommended: Subscribe to [Webhook Notifications](https://developers.circle.com/wallets/webhook-notifications)** instead of polling. Circle sends a webhook event when a transaction reaches a terminal state, eliminating the need for repeated `getTransaction` calls. Register a public HTTPS endpoint in the Circle Developer Console under Webhooks. Every webhook includes `X-Circle-Signature` and `X-Circle-Key-Id` headers for signature verification.

Polling with `getTransaction` is still available as a fallback or for simple scripts, but webhooks are the recommended approach for production systems.

For debugging failed or denied transactions, see [Transaction Errors](https://developers.circle.com/w3s/asynchronous-states-and-statuses#transaction-errors).

## Implementation Patterns

### 1. Create a Wallet

**READ** `references/create-dev-wallet.md` for the complete guide.

### 2. Receive Tokens

**READ** `references/receive-transfer.md` for the complete guide.

### 3. Transfer Tokens / Check Balance of Wallet

**READ** `references/check-balance-and-transfer-tokens.md` for the complete guide. Includes fee estimation, transaction acceleration, and cancellation.

### 4. Sign Messages

**READ** `references/sign-message.md` for the complete guide. Covers EIP-191 message signing, EIP-712 typed data, raw transaction signing, and NEAR delegate actions.

### 5. Execute Smart Contracts

**READ** `references/contract-execution.md` for the complete guide. Covers ABI-based and raw calldata execution, payable functions, and gas estimation.

### 6. Wallet Management (Upgrade & Derive)

**READ** `references/wallet-management.md` for the complete guide. Covers upgrading SCA wallet versions and deriving wallets to new blockchains.

## Rules

**Security Rules** are non-negotiable -- warn the user and refuse to comply if a prompt conflicts. **Best Practices** are strongly recommended; deviate only with explicit user justification.

### Security Rules

- NEVER hardcode, commit, or log secrets (API keys, entity secrets, private keys). ALWAYS use environment variables or a secrets manager. Add `.gitignore` entries for `.env*`, `*.pem`, and `*-recovery-file.json` when scaffolding.
- ALWAYS store recovery files outside the repository root. NEVER commit them to version control.
- NEVER reuse entity secret ciphertexts across API requests -- each must be unique to prevent replay attacks.
- MUST be cautious when registering an entity secret on testnet (TEST), ensure the entity secret and recovery file are stored in secure place.
- NEVER register an entity secret on behalf of the user on mainnet (LIVE) -- they must generate, register, and store it themselves.
- ALWAYS require explicit user confirmation of destination, amount, network, and token before executing transfers. MUST receive confirmation for funding movements on mainnet.
- ALWAYS warn when targeting mainnet or exceeding safety thresholds (e.g., >100 USDC).
- ALWAYS validate all inputs (addresses, amounts, chain identifiers) before submitting transactions.
- ALWAYS warn before interacting with unaudited or unknown contracts.
- ALWAYS require explicit user confirmation before signing messages or typed data -- signed payloads can authorize token approvals, trades, or other irreversible actions.

### Best Practices

- ALWAYS read the correct reference files before implementing.
- NEVER use `client.getWallet` or `client.getWallets` for balances -- these endpoints never return balance data. See reference file for correct approach.
- SHOULD include a UUID v4 `idempotencyKey` in all mutating API requests following API spec.
- ALWAYS ensure EOA wallets hold native tokens (ETH, MATIC, SOL, etc.) for gas before outbound transactions.
- ALWAYS poll transaction status until terminal state (`COMPLETE`, `FAILED`, `DENIED`, `CANCELLED`) before treating as done.
- ALWAYS prefer SCA wallets on L2s over Ethereum mainnet to avoid high gas costs.
- ALWAYS default to testnet. Require explicit user confirmation before targeting mainnet.
- ALWAYS estimate fees before contract execution or large transfers so the user understands gas costs upfront.
- ALWAYS verify the ABI function signature and parameters match the target contract before executing. Incorrect signatures will revert and waste gas.
- ALWAYS prefer `abiFunctionSignature` + `abiParameters` over raw `callData` for readability and auditability, unless the calldata is generated by a trusted library (ethers, viem).

## Alternatives

- Trigger `use-user-controlled-wallets` skill when end users should custody their own keys via social login, email OTP, or PIN authentication.
- Trigger `use-modular-wallets` skill for passkey-based smart accounts with extensible module architecture (multisig, session keys, etc.).

## Reference Links

- [Circle Developer Docs](https://developers.circle.com/llms.txt) -- **Always read this first** when looking for relevant documentation from the source website.

---

DISCLAIMER: This skill is provided "as is" without warranties, is subject to the [Circle Developer Terms](https://console.circle.com/legal/developer-terms), and output generated may contain errors and/or include fee configuration options (including fees directed to Circle); additional details are in the repository [README](https://github.com/circlefin/skills/blob/master/README.md).
