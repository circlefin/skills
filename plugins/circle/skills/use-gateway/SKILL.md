---
name: use-gateway
description: "Integrate Circle Gateway to hold a unified USDC balance across multiple blockchains and transfer USDC instantly (<500ms) via permissionless deposit, burn, and mint workflows. Available on 11 EVM chains + Solana (mainnet and testnet), plus Arc testnet. Use when: enabling chain-agnostic user experiences, low-latency or instant next-block finality is required, capital needs to be pooled across chains for greater capital efficiency, or building apps with consolidated crosschain balances. Triggers on: Gateway, unified balance, crosschain USDC, instant transfer, chain abstraction, Gateway Wallet, Gateway Minter, gatewayMint, burn intent, crosschain liquidity, payment routing, capital efficiency, permissionless transfer."
---

## Overview

Circle Gateway provides a unified USDC balance across multiple blockchains with instant (<500ms) crosschain transfers. Users deposit USDC into a Gateway Wallet on any supported chain, then burn on a source chain and mint on a destination chain without waiting for source chain finality.

## Prerequisites / Setup

Gateway is a contract-level integration -- there is no SDK to install. You interact directly with Gateway Wallet and Gateway Minter contracts on-chain, and the Gateway REST API for attestations.

### Chain Configuration

Do not load a separate config file by default. Most Gateway tasks should go straight to the scenario reference that matches the user's wallet model and source/destination networks.

Use the scenario reference first and only do additional verification when you need to confirm:

- Gateway REST base URL
  - testnet: `https://gateway-api-testnet.circle.com/v1/`
  - mainnet: `https://gateway-api.circle.com/v1/`
- chain-specific USDC addresses: `https://developers.circle.com/stablecoins/usdc-contract-addresses.md`
- Circle Wallet blockchain identifiers: `https://developers.circle.com/wallets/supported-blockchains.md`

Canonical source docs for verification:

- Gateway how-tos:
  - `https://developers.circle.com/gateway/howtos/create-unified-usdc-balance.md`
  - `https://developers.circle.com/gateway/howtos/manage-delegates.md`
  - `https://developers.circle.com/gateway/howtos/transfer-unified-usdc-balance.md`
- Gateway quickstarts:
  - `https://developers.circle.com/gateway/quickstarts/unified-balance-evm.md`
  - `https://developers.circle.com/gateway/quickstarts/unified-balance-solana.md`
- Arc tutorial: `https://docs.arc.network/arc/tutorials/access-usdc-crosschain.md`

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

**READ** the reference files for the scenario(s) that apply.

- Self-managed EVM refs use `viem` in Node/TypeScript scripts.
- Self-managed EVM browser-wallet refs use pure TypeScript plus an injected EIP-1193 provider.
- Circle Wallets refs use `@circle-fin/developer-controlled-wallets`.
- Solana refs use Anchor plus the relevant Solana tooling.

### Deposits
- `references/deposit-evm.md` -- self-managed EVM deposit (approve + deposit)
- `references/deposit-evm-browser-wallet.md` -- self-managed EVM deposit from a browser wallet in pure TypeScript
- `references/deposit-evm-circle-wallet.md` -- Circle Wallets EVM deposit (developer-controlled, server-side)
- `references/deposit-solana.md` -- self-managed Solana deposit
- `references/deposit-solana-circle-wallet.md` -- Circle Wallets Solana deposit
### Transfers from EVM
- `references/evm-to-evm.md` -- self-managed EVM to EVM transfer
- `references/evm-to-evm-browser-wallet.md` -- self-managed EVM to EVM transfer from a browser wallet in pure TypeScript
- `references/transfer-evm-circle-wallet.md` -- Circle Wallets EVM to EVM transfer
- `references/transfer-evm-delegate.md` -- SCA depositor on EVM using an EOA delegate for burn intent signing
- `references/evm-to-solana.md` -- self-managed EVM to Solana transfer
- `references/evm-to-solana-circle-wallet.md` -- Circle Wallets EVM to Solana transfer
### Transfers from Solana
- `references/solana-to-evm.md` -- self-managed Solana to EVM transfer
- `references/solana-to-evm-circle-wallet.md` -- Circle Wallets Solana to EVM transfer
- `references/solana-to-solana.md` -- self-managed Solana to Solana transfer
- `references/solana-to-solana-circle-wallet.md` -- Circle Wallets Solana to Solana transfer
### Balance queries
- `references/query-balance.md` -- query unified Gateway balances across chains (POST `/balances`)

Route in this order:

1. Choose wallet model: self-managed or Circle Wallets.
2. Choose source network family: EVM or Solana.
3. Choose destination network family: EVM or Solana.
4. If the EVM source depositor is an SCA using Circle Developer-Controlled Wallets, switch to `references/transfer-evm-delegate.md`.
5. If the user has a self-managed SCA flow, verify the signing and delegate approach against the canonical Gateway docs before reusing the Circle Wallets delegate reference.
6. Do not select `references/transfer-evm-delegate.md` as the single best reference for a self-managed SCA prompt unless the user explicitly says they are using Circle Developer-Controlled Wallets.

When responding:

- First identify and use the single best matching reference file for the user's scenario.
- Prefer adapting the existing reference pattern over creating a new workspace or fresh scaffold when the current refs already cover the case.
- If you do generate code, make it a targeted adaptation of the matched reference rather than inventing a parallel implementation path.
- If the user asks about a self-managed SCA on EVM and no exact reference exists, say that no single exact reference file matches; explain that delegate-style signing is required and that the Circle Wallets delegate reference is only a pattern to verify against the canonical Gateway docs.

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
- ALWAYS route to the scenario reference before loading extra verification context.
- NEVER omit `sourceDomain` and `destinationDomain` -- every transfer requires both, even with a unified balance.
- NEVER use 18 decimals for USDC. ALWAYS use 6 decimals (`parseUnits(amount, 6)`).
- In React apps that already use wagmi, prefer the existing wagmi/provider pattern instead of introducing a parallel wallet connection stack.
- For framework-agnostic browser-wallet flows, use the pure TypeScript EIP-1193 pattern in the browser-wallet refs.
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
