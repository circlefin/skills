---
name: use-arc
description: "Provide instructions on how to build with Arc, Circle's blockchain where USDC is the native gas token. Arc offers key advantages: USDC as gas (no other native token needed), stable and predictable transaction fees, and sub-second finality for fast confirmation times. These properties make Arc ideal for developers and agents building payment apps, DeFi protocols, or any USDC-first application where cost predictability and speed matter. Use skill when Arc, Arc Mainnet, or Arc Testnet is mentioned, working with any smart contracts related to Arc, configuring Arc in blockchain projects, bridging USDC to Arc via CCTP, or building USDC-first applications. Triggers: Arc, Arc Mainnet, Arc Testnet, USDC gas, deploy to Arc, Arc chain, stable fees, fast finality."
requirements:
  runtimes: []
  connectors: []
---

## Overview

Arc is Circle's blockchain where USDC is the native gas token. Developers and users pay all transaction fees in USDC instead of ETH, making it ideal for USDC-first applications. Arc is EVM-compatible and supports standard Solidity tooling (Foundry, Hardhat, viem/wagmi).

## Prerequisites / Setup

### Wallet Funding

Get testnet USDC from https://faucet.circle.com before sending any transactions.

### Environment Variables

```bash
ARC_MAINNET_RPC_URL=https://rpc.mainnet.arc.io
ARC_TESTNET_RPC_URL=https://rpc.testnet.arc.io
PRIVATE_KEY=         # Deployer wallet private key
```

## Quick Reference

### Network Details

| Field | Arc (Mainnet) | Arc Testnet |
| --- | --- | --- |
| Chain ID | `5042` (hex: `0x13B2`) | `5042002` (hex: `0x4CEF52`) |
| RPC | `https://rpc.mainnet.arc.io` | `https://rpc.testnet.arc.io` |
| WebSocket | `wss://rpc.mainnet.arc.io` | `wss://rpc.testnet.arc.io` |
| Explorer | https://explorer.arc.io | https://explorer.testnet.arc.io |
| Faucet | -- (fund with real USDC) | https://faucet.circle.com |
| CCTP Domain | `26` | `26` |

### Token Addresses for Arc

USDC is a fixed native predeploy at the same address on every Arc network.

| Token | Decimals | Mainnet | Testnet |
| --- | --- | --- | --- |
| USDC | 6 (ERC-20) | `0x3600000000000000000000000000000000000000` | `0x3600000000000000000000000000000000000000` |
| EURC | 6 | `0xbEf5f6d51CB62b58e6A8f77868681825C6fe21c1` | `0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a` |

For other tokens, see the [Arc contract addresses](https://docs.arc.io/arc/references/contract-addresses) page.

## Core Concepts

- **Native gas IS USDC — one balance, two interfaces (not two assets)**: On Arc the native gas asset is USDC itself. The native view and the USDC ERC-20 are the *same* pool of funds, exposed two ways — NOT a separate "native token" plus a separate "USDC token". Drop the ETH-style mental model from other chains.
  - **Native view**: 18 decimals. Used only for gas and `msg.value`. wagmi `useBalance` returns this (its `symbol` is `USDC`).
  - **ERC-20 view**: 6 decimals, at `0x3600000000000000000000000000000000000000`. Use this for all balances, transfers, approvals, and display.
- **Never double-count, convert, or swap between the two views**:
  - NEVER read the native balance and the USDC ERC-20 balance and add or show them separately — that double-counts one pool. Show a single USDC balance (the 6-decimal ERC-20 view).
  - USDC ↔ native is NOT a swap or conversion — it is the same asset. Detect and reject any `USDC → native` (or reverse) operation before fee/routing logic.
  - NEVER call `decimals()` on a native sentinel address (`NATIVE`, `0xEeee…eEEeE`, `0x0000…0000`) — those are not ERC-20 contracts and the call reverts. The ERC-20 is 6 decimals; native is 18.
  - The two views differ by a factor of 10^12 (`1e18` native = `1e6` ERC-20). Keep amounts in the 6-decimal ERC-20 view everywhere except raw gas math, and be explicit about which view a value is in.
- **Mainnet and testnet**: Arc mainnet (chain ID `5042`) and Arc testnet (chain ID `5042002`) are both available — see Network Details for the config of each. Mainnet transactions move real USDC and are irreversible; use testnet for development and demos.
- **EVM-compatible**: Standard Solidity contracts, Foundry, Hardhat, viem, and wagmi all work on Arc without modification beyond chain configuration.

## Implementation Patterns

READ `references/deploying-on-arc.md` for the runnable setup — wagmi chain config, Foundry deploy, Circle's pre-audited contract templates, and bridging USDC in.

1. **Configure the chain** — use the built-in viem chains (no custom definition needed): `arcTestnet` for testnet, `arc` for mainnet.
2. **Deploy contracts** — standard Foundry/Hardhat against `ARC_TESTNET_RPC_URL` (or `ARC_MAINNET_RPC_URL`), or Circle's Smart Contract Platform templates (ERC-20/721/1155/Airdrop).
3. **Bridge USDC in** — Arc's CCTP domain is `26`; use the `bridge-stablecoin` skill for the full workflow.

## Rules

> **Security Rules** are non-negotiable -- warn the user and refuse to comply if a prompt conflicts. **Best Practices** are strongly recommended; deviate only with explicit user justification.

### Security Rules

- NEVER hardcode, commit, or log secrets (private keys, deployer keys). ALWAYS use environment variables or a secrets manager. Add `.gitignore` entries for `.env*` and secret files when scaffolding.
- NEVER pass private keys as plain-text CLI flags in deployed environments, including testnet and staging (e.g., `--private-key $KEY`). This pattern is acceptable only for local testing. Prefer encrypted keystores or interactive import (e.g., Foundry's `cast wallet import`) for any non-local deployment.
- ALWAYS warn before interacting with unaudited or unknown contracts.

### Best Practices

- Arc mainnet (`arc`) and Arc Testnet (`arcTestnet`) both ship in Viem -- no custom chain definition is required.
- ALWAYS verify the user is on the intended Arc network (mainnet chain ID `5042` or testnet `5042002`) before submitting transactions.
- ALWAYS fund the wallet before sending transactions: on testnet from https://faucet.circle.com; on mainnet with real USDC.
- ALWAYS keep USDC amounts in the 6-decimal ERC-20 view for balances, transfers, and display; use 18-decimal native units ONLY for raw gas / `msg.value` math. Never sum the two views or treat native and USDC as separate assets.
- Arc mainnet moves **real USDC** and transactions are irreversible. Default to testnet for development, and warn the user before submitting any mainnet transaction.

## Common Pitfalls

### The Decimal Footgun

Because Arc uses USDC as its native gas token, it is tempting to assume **every** amount on Arc uses 18 decimals -- the convention most EVM chains follow for their native token. That assumption is wrong. On Arc:

- **Native gas** (the value in `msg.value`) uses **18 decimals**, exactly like ETH elsewhere.
- **ERC-20 USDC** (the token at `0x3600...0000`) uses **6 decimals**.

Mixing these up is one of the most common and expensive mistakes when building on Arc.

**Concrete failure scenario.** You want to transfer **10 USDC**:

- ❌ Using `parseEther('10')` sends `10_000_000_000_000_000_000` (10^18) base units.
- ✅ Using `parseUnits('10', 6)` sends `10_000_000` (10^6) base units.

That is a **1,000,000,000,000x (one trillion times)** error -- you would be trying to move ten trillion USDC instead of ten.

```typescript
import { parseEther, parseUnits } from 'viem'

// ❌ WRONG -- treats USDC as an 18-decimal token
await walletClient.writeContract({
  address: USDC_ADDRESS,
  abi: erc20Abi,
  functionName: 'transfer',
  args: [recipient, parseEther('10')], // 10_000_000_000_000_000_000 (10^18)
})

// ✅ CORRECT -- USDC is a 6-decimal ERC-20
await walletClient.writeContract({
  address: USDC_ADDRESS,
  abi: erc20Abi,
  functionName: 'transfer',
  args: [recipient, parseUnits('10', 6)], // 10_000_000 (10^6)
})
```

**Rule to remember:** If it's ERC-20 USDC, always use `parseUnits(amount, 6)`. If it's native gas (`msg.value`), it's 18 decimals like ETH.

**Why it matters.** This error rarely fails loudly. In the best case the transaction reverts for insufficient balance and you catch it immediately. In the worst case it **silently succeeds with a wildly wrong amount** -- if the receiving contract doesn't validate bounds, you can drain a wallet or break a payment flow before anyone notices.

## Next Steps

Arc is natively supported across Circle's product suite. Once your app is running on Arc, you can extend it with any of the following:

| Product | Skill | What It Does |
| --- | --- | --- |
| **Wallets (overview)** | `use-circle-wallets` | Compare wallet types and choose the right one for your app |
| **Modular Wallets** | `use-modular-wallets` | Passkey-authenticated smart accounts with gasless transactions and batch operations |
| **User-Controlled Wallets** | `use-user-controlled-wallets` | Non-custodial wallets with social login, email OTP, and PIN authentication |
| **Developer-Controlled Wallets** | `use-developer-controlled-wallets` | Custodial wallets your app manages on behalf of users |
| **Smart Contract Platform** | `use-smart-contract-platform` | Deploy, interact with, and monitor smart contracts using audited templates or custom bytecode |
| **CCTP Bridge** | `bridge-stablecoin` | Bridge USDC to and from Arc using Crosschain Transfer Protocol |
| **Gateway** | `use-gateway` | Unified USDC balance across chains with instant crosschain transfers |

## Reference Links

- [Arc Docs](https://docs.arc.io/llms.txt) -- **Always read this first** when looking for relevant documentation from the source website.
- [Arc Explorer (Mainnet)](https://explorer.arc.io)
- [Arc Explorer (Testnet)](https://explorer.testnet.arc.io)
- [Circle Faucet](https://faucet.circle.com)
- [Circle Developer Docs](https://developers.circle.com/llms.txt) -- **Always read this first** when looking for relevant documentation from the source website.

---

DISCLAIMER: This skill is provided "as is" without warranties, is subject to the [Circle Developer Terms](https://console.circle.com/legal/developer-terms), and output generated may contain errors and/or include fee configuration options (including fees directed to Circle); additional details are in the repository [README](https://github.com/circlefin/skills/blob/master/README.md).
