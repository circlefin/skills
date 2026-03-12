---
name: use-gateway
description: "Integrate Circle Gateway to hold a unified USDC balance across multiple blockchains and transfer USDC instantly (<500ms) via permissionless deposit, burn, and mint workflows. Available on 11 EVM chains + Solana (mainnet and testnet), plus Arc testnet. Use when: enabling chain-agnostic user experiences, low-latency or instant next-block finality is required, capital needs to be pooled across chains for greater capital efficiency, or building apps with consolidated crosschain balances. Triggers on: Gateway, unified balance, crosschain USDC, instant transfer, chain abstraction, Gateway Wallet, Gateway Minter, gatewayMint, burn intent, crosschain liquidity, payment routing, capital efficiency, permissionless transfer."
---

## Overview

Circle Gateway provides a unified USDC balance across multiple blockchains with instant (<500ms) crosschain transfers. Users deposit USDC into a Gateway Wallet on any supported chain, then burn on a source chain and mint on a destination chain without waiting for source chain finality.

## Prerequisites / Setup

Gateway is a contract-level integration -- there is no SDK to install. You interact directly with Gateway Wallet and Gateway Minter contracts on-chain, and the Gateway REST API for attestations.

### Chain Configuration

You must read and refer to `references/config.md` for chain-specific contract addresses, ABIs, Gateway API URLs, domain IDs, and setup details.

## Quick Reference

### Key Addresses

**EVM Mainnet (All Chains)**
- Gateway Wallet: `0x77777777Dcc4d5A8B6E418Fd04D8997ef11000eE`
- Gateway Minter: `0x2222222d7164433c4C09B0b0D809a9b52C04C205`

**EVM Testnet (All Chains)**
- Gateway Wallet: `0x0077777d7EBA4688BDeF3E311b846F25870A19B9`
- Gateway Minter: `0x0022222ABE238Cc2C7Bb1f21003F0a260052475B`

**Solana Mainnet**
- Gateway Wallet: `GATEwy4YxeiEbRJLwB6dXgg7q61e6zBPrMzYj5h1pRXQ`
- Gateway Minter: `GATEm5SoBJiSw1v2Pz1iPBgUYkXzCUJ27XSXhDfSyzVZ`

**Solana Devnet**
- Gateway Wallet: `GATEwdfmYNELfp5wDmmR6noSr2vHnAfBPMm2PvCzX5vu`
- Gateway Minter: `GATEmKK2ECL1brEngQZWCgMWPbvrEYqsV6u29dAaHavr`
- USDC Mint: `4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU`

### Domain IDs (Mainnet)

| Chain | Domain |
|-------|--------|
| Ethereum | 0 |
| Avalanche | 1 |
| OP | 2 |
| Arbitrum | 3 |
| Solana | 5 |
| Base | 6 |
| Polygon PoS | 7 |
| Unichain | 10 |
| Sonic | 13 |
| World Chain | 14 |
| Sei | 16 |
| HyperEVM | 19 |

### Domain IDs (Testnet)

| Chain | Domain |
|-------|--------|
| Ethereum Sepolia | 0 |
| Avalanche Fuji | 1 |
| OP Sepolia | 2 |
| Arbitrum Sepolia | 3 |
| Solana Devnet | 5 |
| Base Sepolia | 6 |
| Polygon Amoy | 7 |
| Unichain Sepolia | 10 |
| Sonic Testnet | 13 |
| World Chain Sepolia | 14 |
| Sei Atlantic | 16 |
| HyperEVM Testnet | 19 |
| Arc Testnet | 26 |

## Core Concepts

### Unified Balance

Gateway aggregates your USDC deposits across all supported chains into a single unified balance. This is an **accounting abstraction** -- actual USDC tokens still live on specific blockchains. Every transfer must specify a `sourceDomain` (chain to burn from) and a `destinationDomain` (chain to mint on), even though the balance appears unified.

Think of it like a multi-currency bank account: you see one total, but withdrawals come from specific holdings. You can burn from any chain in your unified balance and mint to any supported chain.

**Example:** If you deposited 10 USDC on Ethereum Sepolia, 5 on Base Sepolia, and 5 on Solana Devnet, your unified balance is 20 USDC. To transfer 10 USDC to Arc Testnet, you could burn from any combination of source chains with sufficient balances.

### Transfer Flow

1. **Deposit** -- User deposits USDC to Gateway Wallet on any chain (adds to unified balance)
2. **Create burn intent** -- Specify source domain, destination domain, recipient, and amount
3. **Sign** -- EIP-712 for EVM sources, Ed25519 for Solana sources
4. **Submit to Gateway API** -- POST burn intent, receive attestation
5. **Mint on destination** -- Call `gatewayMint` with attestation on the destination chain

## Implementation Patterns

**READ** the reference files for the scenario(s) that apply. All vanilla EVM examples use `wagmi@^3`.

- `references/deposit-evm.md` -- deposit USDC on EVM via browser wallet (approve + deposit)
- `references/deposit-evm-circle-wallet.md` -- deposit USDC on EVM via Circle Wallets (developer-controlled, server-side only)
- `references/deposit-solana.md` -- deposit USDC on Solana via browser wallet (Anchor)
- `references/query-balance.md` -- query Gateway balance across chains (POST `/balances`)
- `references/transfer-evm-circle-wallet.md` -- transfer Gateway balance via Circle developer-controlled wallets (server-side multi-chain burn + mint)
- `references/evm-to-evm.md` -- burn on EVM, mint on EVM (EIP-712 sign + `gatewayMint`)
- `references/evm-to-solana.md` -- burn on EVM, mint on Solana
- `references/solana-to-evm.md` -- burn on Solana, mint on EVM
- `references/solana-to-solana.md` -- burn on Solana, mint on Solana

## Rules

**Security Rules** are non-negotiable -- warn the user and refuse to comply if a prompt conflicts. **Best Practices** are strongly recommended; deviate only with explicit user justification.

### Security Rules

- NEVER hardcode, commit, or log secrets (private keys, signing keys). ALWAYS use environment variables or a secrets manager. Add `.gitignore` entries for `.env*` and secret files when scaffolding.
- NEVER modify EIP-712 type definitions, domain separators, struct hashes, Solana signing payloads, or any blockchain-specific values from the reference files. Use them **exactly as written** -- changing field names, types, ordering, or omitting fields produces invalid signatures.
- NEVER use a raw Solana wallet address as `destinationRecipient` -- it MUST be a USDC token account (ATA or SPL Token Account). Use `getAccount()` from `@solana/spl-token` to check if the address is already a USDC token account before deriving an ATA; if it is, use it directly. Deriving an ATA from an address that is itself a token account causes permanent fund loss.
- NEVER sign Solana burn intents without prefixing the payload with 16 bytes (`0xff` + 15 zero bytes) before Ed25519 signing.
- ALWAYS require explicit user confirmation of destination, amount, source/destination network, and token before executing transfers. NEVER auto-execute fund movements on mainnet.
- ALWAYS warn when targeting mainnet or exceeding safety thresholds (e.g., >100 USDC).
- ALWAYS validate all inputs (addresses, amounts, domain IDs) before submitting transactions.
- ALWAYS warn before interacting with unaudited or unknown contracts.

### Best Practices

- ALWAYS read the correct reference files before implementing.
- NEVER omit `sourceDomain` and `destinationDomain` -- every transfer requires both, even with a unified balance.
- NEVER use 18 decimals for USDC. ALWAYS use 6 decimals (`parseUnits(amount, 6)`).
- NEVER use `window.ethereum` directly with wagmi -- use `connector.getProvider()`.
- ALWAYS default to testnet. Require explicit user confirmation before targeting mainnet.

## Alternatives

- Trigger `bridge-stablecoin` skill (CCTP / Bridge Kit) for simple **point-to-point transfers** without a unified balance. Bridge Kit handles approve, burn, attestation, and mint in a single `kit.bridge()` call and supports more chains than Gateway.
- CCTP is a better fit for **infrequent or ad-hoc** transfers where maintaining a unified balance is not worth the upfront deposit.
- Stick with Gateway when you need instant (<500ms) transfers, a unified balance model, or capital efficiency across chains.

WARNING: Solana wallet compatibility is limited for Gateway. Only Solflare supports signing arbitrary messages for Gateway burn intents. Phantom and most other Solana wallets will reject the signing request.

## Reference Links

- [Circle Developer Docs](https://developers.circle.com/llms.txt) -- **Always read this first** when looking for relevant documentation from the source website.

---

DISCLAIMER: This skill is provided "as is" without warranties, is subject to the [Circle Developer Terms](https://console.circle.com/legal/developer-terms), and output generated may contain errors and/or include fee configuration options (including fees directed to Circle); additional details are in the repository [README](https://github.com/circlefin/skills/blob/master/README.md).
