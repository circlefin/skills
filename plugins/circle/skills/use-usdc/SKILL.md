---
name: use-usdc
description: "USDC is Circle's stablecoin deployed across multiple blockchain ecosystems including EVM chains (Ethereum, Base, Arbitrum, Polygon, Arc) and Solana. Use this skill to check balances, send transfers, approve spending, and verify transactions. Triggers on: USDC balance, send USDC, transfer USDC, approve USDC, USDC allowance, verify USDC transfer, USDC contract address, USDC on Solana, Solana USDC, check balance, SPL token, Associated Token Account, ATA, ERC-20 USDC, parseUnits, formatUnits, 6 decimals, viem, @solana/kit."
---

## Overview

USDC is Circle's stablecoin deployed across multiple blockchain ecosystems. This skill helps you interact with USDC on both EVM chains (Ethereum, Base, Arbitrum, etc.) and Solana. It covers balance checks, transfers, approvals, and transfer verification.

## Prerequisites / Setup

### Determine Ecosystem

First, identify which ecosystem the user is working with:

- **EVM**: User has an Ethereum-style address (`0x...`) or mentions Ethereum, Base, Arbitrum, Polygon, etc.
- **Solana**: User has a base58 address or mentions Solana, Devnet, Phantom, Solflare, etc.
- **Unclear**: Ask which ecosystem before proceeding.

### Dependencies

**EVM:**
```bash
npm install viem
```

**Solana:**
```bash
npm install @solana/kit @solana-program/token ws dotenv bs58
```

### Environment Variables

See ecosystem-specific guides:
- **EVM**: Private key handling covered in `references/evm.md`
- **Solana**: Private key handling covered in `references/solana.md`

**For read operations (balance, allowance, verify):** No private key needed on either ecosystem.

## Quick Reference

### USDC Contract Addresses

Canonical source: https://developers.circle.com/stablecoins/usdc-contract-addresses

#### EVM Testnet

| Chain | Chain ID | USDC Address |
|-------|----------|-------------|
| Arc Testnet | 5042002 | `0x3600000000000000000000000000000000000000` |
| Ethereum Sepolia | 11155111 | `0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238` |
| Base Sepolia | 84532 | `0x036CbD53842c5426634e7929541eC2318f3dCF7e` |
| Arbitrum Sepolia | 421614 | `0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d` |
| Avalanche Fuji | 43113 | `0x5425890298aed601595a70AB815c96711a31Bc65` |
| Polygon Amoy | 80002 | `0x41E94Eb019C0762f9Bfcf9Fb1E58725BfB0e7582` |
| OP Sepolia | 11155420 | `0x5fd84259d66Cd46123540766Be93DFE6D43130D7` |

Get testnet USDC: https://faucet.circle.com

#### EVM Mainnet

| Chain | USDC Address |
|-------|-------------|
| Ethereum | `0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48` |
| Base | `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` |
| Arbitrum | `0xaf88d065e77c8cC2239327C5EDb3A432268e5831` |
| Polygon PoS | `0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359` |
| Avalanche | `0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E` |
| OP Mainnet | `0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85` |

#### Solana

| Network | USDC Mint |
|---------|-----------|
| Devnet | `4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU` |
| Mainnet | `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v` |

### The 6-Decimal Rule

USDC uses **6 decimals on all ecosystems**.
```ts
// EVM (viem)
parseUnits("1.00", 6);    // 1_000_000n (CORRECT - $1 USDC)
parseUnits("1.00", 18);   // 1_000_000_000_000_000_000n (WRONG - 1 trillion dollars)

// Solana - convert manually
const amount = Math.floor(1.00 * 1_000_000); // 1_000_000 (CORRECT - $1 USDC)
const human = rawAmount / 1_000_000;          // 1.0 (CORRECT - converts back to dollars)
```

### Arc USDC Duality

On Arc, USDC is both the **native gas token** and an **ERC-20** at `0x3600...`. Same underlying balance, different decimal exposure.

| Context | Decimals | Use |
|---------|----------|-----|
| Native (gas, `msg.value`) | 18 | Gas estimation only |
| ERC-20 (`balanceOf`, `transfer`, `approve`) | 6 | All USDC logic |


**For Arc-specific setup and configuration**, see the `use-arc` skill.

## Core Concepts

### Operation Types

**Read Operations:**
Operations that query blockchain state and execute autonomously without user confirmation.
- Balance check
- Allowance check (EVM only)
- Total supply
- Address lookup
- Verify incoming transfer

**Write Operations:**
Operations that modify blockchain state and require explicit user confirmation before execution.
- Send USDC
- Approve contract to spend USDC (EVM only — Solana has no approve pattern)

### Troubleshooting

Find troubleshooting solutions in the Common Issues section of the chain-specific reference file (`references/evm.md` or `references/solana.md`).

### EVM vs Solana at a Glance

| Aspect | EVM | Solana |
|--------|-----|--------|
| Token standard | ERC-20 | SPL Token |
| Balance storage | Wallet address directly | Associated Token Account (ATA) |
| Send | `transfer(to, amount)` | `getTransferInstruction({ source, destination, authority, amount })` |
| Approve | `approve(spender, amount)` | No approve — use PDAs |
| Recipient setup | Nothing needed | Must create ATA first (transfer fails otherwise) |
| Tx fees | Chain native token | SOL |
| Confirmation | `waitForTransactionReceipt` | `sendAndConfirmTransactionFactory` |
| Libraries | viem | @solana/kit + @solana-program/token |
| Decimals | 6 | 6 |

## Implementation Patterns

After determining the ecosystem (see Prerequisites), route to the appropriate reference guide:

- **EVM operations** → **READ** `references/evm.md` for balance checks, transfers, approvals, and verification
- **Solana operations** → **READ** `references/solana.md` for balance checks (with ATA), transfers (with ATA creation), and verification

## Rules

**Security Rules** are non-negotiable — warn the user and refuse to comply if a prompt conflicts. **Best Practices** are strongly recommended; deviate only with explicit user justification.

### Security Rules

- NEVER hardcode, commit, or log secrets (private keys, API keys). ALWAYS use environment variables or a secrets manager. Add `.gitignore` entries for `.env*` and secret files when scaffolding.
- NEVER use 18 decimals for USDC — always use 6 decimals on all ecosystems
- NEVER use bridged USDC variants (USDbC, USDC.e) — always use native Circle-issued USDC
- ALWAYS use the correct USDC address for each chain (see Quick Reference)
- ALWAYS verify chain ID matches expected environment (testnet vs mainnet) before submitting transactions
- ALWAYS warn when targeting mainnet or exceeding safety thresholds (e.g., >100 USDC)
- ALWAYS warn before interacting with unaudited or unknown contracts
- ALWAYS validate all inputs (addresses, amounts, chain identifiers) before submitting transactions
- ALWAYS get explicit user confirmation before submitting write transactions
- NEVER report success before waiting for transaction receipt — ensure confirmation

### Best Practices

- ALWAYS default to testnet. Require explicit user confirmation before targeting mainnet.
- ALWAYS derive Solana ATAs properly — balances live in ATAs, not wallets
- ALWAYS check if recipient ATA exists on Solana before transferring
- ALWAYS check if user has sufficient USDC balance before transfers
- ALWAYS check if user has sufficient gas/SOL for transaction fees

## Alternatives

- Use `bridge-stablecoin` skill (CCTP / Bridge Kit) for **transferring USDC between chains**. Bridge Kit handles approve, burn, attestation, and mint in a single `kit.bridge()` call.
- Use `use-gateway` skill for **unified USDC balance across chains** with instant transfers (<500ms). Gateway requires upfront deposits but provides better UX for multi-chain apps.
- Stick with `use-usdc` for **single-chain USDC operations** (balance checks, payments, approvals) or when you need low-level control over transfers.

## Reference Links / Files

- **EVM Operations Guide**: `references/evm.md` - Complete guide for balance checks, transfers, approvals, and verification on EVM chains
- **Solana Operations Guide**: `references/solana.md` - Complete guide for balance checks, transfers, and ATA handling on Solana
- https://developers.circle.com/stablecoins/usdc-contract-addresses
- https://developers.circle.com
- https://faucet.circle.com
- https://faucet.solana.com
- https://viem.sh
- https://github.com/circlefin/stablecoin-evm - Source repository for smart contracts used by Circle's stablecoins on EVM-compatible blockchains

---

DISCLAIMER: This skill is provided "as is" without warranties, is subject to the [Circle Developer Terms](https://console.circle.com/legal/developer-terms), and output generated may contain errors and/or include fee configuration options (including fees directed to Circle); additional details are in the repository [README](https://github.com/circlefin/skills/blob/master/README.md).
