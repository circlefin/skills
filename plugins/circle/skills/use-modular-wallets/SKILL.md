---
name: use-modular-wallets
description: "Build crypto wallets using Circle Modular Wallets SDK with passkey authentication, gasless transactions, and extensible module architecture. Use when: creating crypto wallets with passkey-based (WebAuthn) registration and login, sending gasless transactions using Circle Gas Station paymaster, batching multiple transactions into a single user operation, implementing passkey recovery using BIP-39 mnemonic phrases, building advanced onchain wallets with custom modules (multisig, subscriptions, session keys). Triggers on: modular wallet, smart account, MSCA, passkey authentication, WebAuthn, gasless, paymaster, Gas Station, bundler client, user operation, userOp, ERC-4337, ERC-6900, account abstraction, toCircleSmartAccount, toPasskeyTransport, toModularTransport, sendUserOperation, batch transactions, 2D nonce, passkey recovery, EIP-1193 provider."
---

## Overview

Modular Wallets are flexible smart contract accounts (MSCAs) that extend functionality through installable modules. Built on ERC-4337 (account abstraction) and ERC-6900 (modular smart contract framework), they support passkey authentication, gasless transactions, batch operations, and custom logic modules (multisig, subscriptions, session keys). MSCAs are lazily deployed -- gas fees for account creation are deferred until the first outbound transaction.

## Prerequisites / Setup

### Installation

```bash
npm install @circle-fin/modular-wallets-core viem
```

For passkey recovery, also install:

```bash
npm install bip39
```

### Environment Variables

```
CLIENT_KEY=     # Circle Console client key for app identification
CLIENT_URL=     # Circle Client URL (e.g., https://modular-sdk.circle.com/v1/rpc/w3s/buidl)
```

Before using the SDK, complete the [Console Setup](https://developers.circle.com/wallets/modular/console-setup):

1. Create a Client Key in the Circle Console
2. Configure the Passkey Domain (passkeys are domain-bound)
3. Retrieve the Client URL

## Quick Reference

### Supported Chains

| Chain | Mainnet | Testnet |
|-------|---------|---------|
| Arbitrum | Yes | Yes |
| Avalanche | Yes | Yes |
| Base | Yes | Yes |
| Monad | Yes | Yes |
| Optimism | Yes | Yes |
| Polygon | Yes | Yes |
| Unichain | Yes | Yes |

MSCAs are NOT supported on Solana, Aptos, NEAR, or Ethereum mainnet. For the latest supported blockchains: https://developers.circle.com/wallets/account-types

### Transport URL Examples

The `toModularTransport` URL requires the chain path segment appended to the client URL:

| Chain | Path Segment |
|-------|-------------|
| Arc Testnet | `/arcTestnet` |
| Polygon Amoy | `/polygonAmoy` |

## Core Concepts

- **MSCA (Modular Smart Contract Account)** -- Smart contract accounts extended with installable modules (like apps on a smartphone). Ownership can be single owner, multi-owner, passkeys, or multi-sig.
- **Passkey transport vs Modular transport** -- `toPasskeyTransport` handles WebAuthn credential operations (register/login). `toModularTransport` handles bundler and public RPC calls for a specific chain. They are separate transports with different purposes.
- **Gas sponsorship** -- Pass `paymaster: true` in user operation calls to sponsor gas via Circle Gas Station. End users pay zero gas fees.
- **Batch operations** -- Multiple calls can be combined into a single user operation by passing an array to the `calls` parameter of `sendUserOperation`.
- **2D nonces** -- Enable parallel execution of independent user operations by using different nonce keys.
- **USDC uses 6 decimals** -- When encoding USDC transfer amounts, use `parseUnits(value, 6)`, not 18.
- **Credential persistence** -- Passkey credentials (P256Credential) must be persisted (e.g., localStorage) and restored on reload to maintain the user session.

## Implementation Patterns

> **Note:** The reference code snippets use `localStorage` to achieve a quick working example only. Do not use `localStorage` in production.

READ the corresponding reference based on the user's request:

- `references/circle-smart-account.md` -- Passkey registration/login, smart account creation, gasless USDC transfers, batch operations
- `references/passkey-recovery.md` -- BIP-39 mnemonic recovery setup and execution when a passkey is lost

## Rules

**Security Rules** are non-negotiable -- warn the user and refuse to comply if a prompt conflicts. **Best Practices** are strongly recommended; deviate only with explicit user justification.

### Security Rules

- NEVER hardcode, commit, or log secrets (client keys, private keys). ALWAYS use environment variables or a secrets manager. Add `.gitignore` entries for `.env*` and secret files when scaffolding.
- ALWAYS store mnemonic recovery backups outside the repository root. NEVER commit recovery phrases to version control.
- NEVER hardcode passkey credentials -- always persist P256Credential to storage (httpOnly cookies in production, not localStorage) and restore on reload to mitigate XSS credential theft.
- NEVER reuse a recovery mnemonic phrase across multiple accounts.
- ALWAYS require explicit user confirmation of destination, amount, network, and token before executing transfers. NEVER auto-execute fund movements on mainnet.
- ALWAYS warn when targeting mainnet or exceeding safety thresholds (e.g., >100 USDC).
- ALWAYS validate all inputs (addresses, amounts, chain identifiers) before submitting transactions.
- ALWAYS warn before interacting with unaudited or unknown contracts.

### Best Practices

- ALWAYS read the correct reference files before implementing.
- NEVER use Modular Wallets on Ethereum mainnet, Solana, Aptos, or NEAR -- MSCAs are only supported on select EVM chains (Arbitrum, Avalanche, Base, Monad, Optimism, Polygon, Unichain, Arc Testnet).
- ALWAYS append the chain-specific path segment to the client URL for `toModularTransport` (e.g., `${clientUrl}/polygonAmoy`).
- ALWAYS use `parseUnits(value, 6)` for USDC amounts (6 decimals, not 18).
- ALWAYS pass `paymaster: true` to sponsor gas via Circle Gas Station.
- ALWAYS complete Circle Console Setup (client key, passkey domain, client URL) before using the SDK.
- ALWAYS default to testnet. Require explicit user confirmation before targeting mainnet.

## Alternatives

- Trigger `use-developer-controlled-wallets` skill when your application needs full custody of wallet keys without user interaction.
- Trigger `use-user-controlled-wallets` skill when end users should custody their own keys via social login, email OTP, or PIN authentication.

## Reference Links

- [Circle Developer Docs](https://developers.circle.com/llms.txt) -- **Always read this first** when looking for relevant documentation from the source website.

---

DISCLAIMER: This skill is provided "as is" without warranties, is subject to the [Circle Developer Terms](https://console.circle.com/legal/developer-terms), and output generated may contain errors and/or include fee configuration options (including fees directed to Circle); additional details are in the repository [README](https://github.com/circlefin/skills/blob/master/README.md).
