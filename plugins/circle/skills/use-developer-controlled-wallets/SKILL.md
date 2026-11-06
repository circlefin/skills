---
name: use-developer-controlled-wallets
description: "Create and manage Circle developer-controlled wallets where the application retains full custody of wallet keys on behalf of end-users. Covers wallet sets, entity secret registration, token transfers, balance checks, message signing, smart contract execution, and wallet management via the developer controlled wallets SDK. Triggers on: developer-controlled wallets, entity secret, initiateDeveloperControlledWalletsClient, createWalletSet, createWallets, custody wallet, derive wallet, sign typed data, contract execution."
requirements:
  runtimes: []
  connectors: []
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

Register an entity secret before using the SDK. Point the developer to https://developers.circle.com/wallets/dev-controlled/register-entity-secret, or READ `references/register-secret.md` for the generation and registration snippets. IMPORTANT: Never register an entity secret on mainnet (LIVE) for the user; they generate, register, and store it themselves. On testnet (TEST), register only when the user explicitly asks, and make sure they store the entity secret and recovery file securely.

### SDK Initialization

```typescript
import { initiateDeveloperControlledWalletsClient } from '@circle-fin/developer-controlled-wallets';

const circleDeveloperSdk = initiateDeveloperControlledWalletsClient({
  apiKey: process.env.CIRCLE_API_KEY!,
  entitySecret: process.env.ENTITY_SECRET!,
});
```

## Core Concepts

- **Wallet Sets**: A group of wallets managed by a single entity secret. Wallets in a set can span blockchains and share the same address on EVM chains.
- **Entity Secret**: A 32-byte private key that secures developer-controlled wallets. Generated, encrypted, and registered once; Circle never stores it in plain text.
- **Entity Secret Ciphertext**: The entity secret RSA-encrypted with Circle's public key. Must be unique per API request to prevent replay attacks. The SDK generates a fresh one for every request.
- **Idempotency Keys**: Mutating requests take a UUID v4 `idempotencyKey` for exactly-once execution. The SDK generates one if omitted.
- **Account Types**:
  - **EOA** (Externally Owned Account) -- default choice. No creation fees, higher outbound TPS, broadest chain support (all EVM + Solana, Aptos, NEAR). Pays gas in the chain's native token (ETH, MATIC, SOL, etc.); on Arc the gas asset is USDC (no separate native token), so USDC funding covers gas.
  - **SCA** (Smart Contract Account) -- ERC-4337. Gas sponsorship via Circle Gas Station, batch operations, flexible key management. EVM-only (not on Solana, Aptos, NEAR).
- **Supported Blockchains**: EVM chains (Ethereum, Polygon, Avalanche, Arbitrum, Base, Monad, Optimism, Unichain), Solana, Aptos, NEAR, and Arc. Latest list: https://developers.circle.com/wallets/account-types

## Transaction Lifecycle

Transfers and contract executions are asynchronous. Track them with [webhook notifications](https://developers.circle.com/wallets/webhook-notifications) (preferred) or by polling `circleDeveloperSdk.getTransaction({ id })`. Webhooks fire on every state change, including non-terminal ones such as `CONFIRMED`, and can arrive out of order, so act only on a terminal `state`; register a public HTTPS endpoint under Webhooks in the Circle Developer Console and verify each event with its `X-Circle-Signature` and `X-Circle-Key-Id` headers. Polling is the fallback, fine for simple scripts.

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

## Workflow

1. **Check context and access.** Confirm the target chain and that `CIRCLE_API_KEY` and `ENTITY_SECRET` are set and the entity secret is registered (see Prerequisites). If any is missing, ask the user; do not guess, and follow the registration policy in Prerequisites.
2. **Pick the task** from Implementation Patterns and READ its reference before writing code.
3. **Get approval.** Default to testnet. Confirm destination, amount, network, and token with the user before any transfer, signature, or mainnet action (Security Rules).
4. **Submit and track.** Estimate fees for transfers and contract calls, submit, then wait for a terminal state (Transaction Lifecycle) before reporting success.

## Implementation Patterns

READ the reference for the task before writing code.

- **Create a wallet** (wallet set, wallets): READ `references/create-dev-wallet.md`.
- **Receive tokens** (deposit address, inbound transactions): READ `references/receive-transfer.md`.
- **Transfer tokens / check balance** (fee estimation, acceleration, cancellation): READ `references/check-balance-and-transfer-tokens.md`.
- **Sign messages** (EIP-191, EIP-712, raw transactions, NEAR delegate actions): READ `references/sign-with-wallet.md`.
- **Execute smart contracts** (ABI or raw calldata, payable functions, gas estimation): READ `references/contract-execution.md`.
- **Wallet management** (derive to new blockchains, update metadata): READ `references/wallet-management.md`.

## Rules

**Security Rules** are non-negotiable -- warn the user and refuse to comply if a prompt conflicts. **Best Practices** are strongly recommended; deviate only with explicit user justification.

### Security Rules

- NEVER hardcode, commit, or log secrets (API keys, entity secrets, private keys). ALWAYS use environment variables or a secrets manager. Add `.gitignore` entries for `.env*`, `*.pem`, and `recovery_file_*.dat` when scaffolding.
- ALWAYS store recovery files outside the repository root. NEVER commit them to version control.
- NEVER reuse entity secret ciphertexts across API requests.
- NEVER register an entity secret on mainnet (LIVE) for the user; they generate, register, and store it themselves. On testnet (TEST), register only when the user explicitly asks, and make sure they store the entity secret and recovery file securely.
- ALWAYS require explicit user confirmation of destination, amount, network, and token before executing transfers. MUST receive confirmation for funding movements on mainnet.
- ALWAYS warn when targeting mainnet or exceeding safety thresholds (e.g., >100 USDC).
- ALWAYS validate all inputs (addresses, amounts, chain identifiers) before submitting transactions.
- ALWAYS warn before interacting with unaudited or unknown contracts.
- ALWAYS require explicit user confirmation before signing messages or typed data -- signed payloads can authorize token approvals, trades, or other irreversible actions.

### Best Practices

- NEVER use `circleDeveloperSdk.getWallet` or `circleDeveloperSdk.listWallets` for balances -- they never return balance data. Use `getWalletTokenBalance`.
- SHOULD pass your own UUID v4 `idempotencyKey` on mutating requests you may retry.
- ALWAYS fund EOA wallets with the gas token before outbound transactions.
- ALWAYS wait for a terminal state (see Transaction Lifecycle) before treating a transaction as done.
- ALWAYS prefer SCA wallets on L2s; avoid SCA on Ethereum mainnet (high gas).
- ALWAYS default to testnet. Require explicit user confirmation before targeting mainnet.
- ALWAYS estimate fees before contract execution or large transfers so the user knows the gas cost upfront.
- ALWAYS verify the ABI function signature and parameters match the target contract before executing -- a wrong signature reverts and wastes gas.
- ALWAYS prefer `abiFunctionSignature` + `abiParameters` over raw `callData` for readability and auditability, unless the calldata comes from a trusted library (ethers, viem).

## Alternatives

- Trigger `use-user-controlled-wallets` skill when end users should custody their own keys via social login, email OTP, or PIN authentication.
- Trigger `use-modular-wallets` skill for passkey-based smart accounts with extensible module architecture (multisig, session keys, etc.).

## Reference Links

- [Circle Developer Docs](https://developers.circle.com/llms.txt) -- **Always read this first** when looking for relevant documentation from the source website.

---

DISCLAIMER: This skill is provided "as is" without warranties, is subject to the [Circle Developer Terms](https://console.circle.com/legal/developer-terms), and output generated may contain errors and/or include fee configuration options (including fees directed to Circle); additional details are in the repository [README](https://github.com/circlefin/skills/blob/master/README.md).
