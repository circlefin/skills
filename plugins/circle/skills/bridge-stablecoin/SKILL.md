---
name: bridge-stablecoin
description: "Build browser or server USDC bridging with Circle App Kit or standalone Bridge Kit and CCTP. Supports EVM and Solana browser wallets, private-key and Circle Wallets adapters, bridge events, custom fees, transfer speed, Forwarding Service, and recovery. Bridge operations require no kit key. Use when: bridge USDC, move USDC across chains, build wallet-connected bridge UIs, configure Viem/Ethers/Solana adapters, or use @circle-fin/bridge-kit, @circle-fin/app-kit, CCTP, forwarding, or bridge routes."
requirements:
  runtimes: []
  connectors: []
---

## Overview

Crosschain Transfer Protocol (CCTP) is Circle's native protocol for burning USDC on one chain and minting it on another. App Kit (`@circle-fin/app-kit`) is Circle's all-inclusive SDK covering bridge, swap, and send in one package; standalone Bridge Kit (`@circle-fin/bridge-kit`) ships the same bridge API in a lighter package. Both orchestrate the full CCTP lifecycle -- approve, burn, attestation fetch, mint -- in a single `kit.bridge()` call across EVM and Solana. **Recommend App Kit** unless the user wants bridge-only functionality. **Bridge operations need no kit key.**

Both SDKs run in browser and server applications. Use browser wallet provider adapters in client code and keep private keys plus Circle Wallets credentials on the server. App Kit `>=1.11.0` and Bridge Kit `>=1.12.2` bundle for browsers without consumer-provided Node or `Buffer` polyfills.

## Prerequisites / Setup

### Installation

Pick **one** base kit — App Kit (recommended) or the standalone Bridge Kit — then add adapters as needed.

App Kit with Viem adapter (recommended):

```bash
npm install @circle-fin/app-kit @circle-fin/adapter-viem-v2
# Optional: Solana support
npm install @circle-fin/adapter-solana-kit
# Optional: Circle Wallets (developer-controlled) support
npm install @circle-fin/adapter-circle-wallets
```

Or, for bridge-only apps, the standalone Bridge Kit (lighter package) instead of App Kit:

```bash
npm install @circle-fin/bridge-kit @circle-fin/adapter-viem-v2
```

### Environment Variables

```
PRIVATE_KEY=              # EVM wallet private key (hex, 0x-prefixed)
EVM_PRIVATE_KEY=          # EVM private key (when also using Solana)
SOLANA_PRIVATE_KEY=       # Solana wallet private key (base58)
CIRCLE_API_KEY=           # Circle API key (for Circle Wallets adapter)
CIRCLE_ENTITY_SECRET=     # Entity secret (for Circle Wallets adapter)
EVM_WALLET_ADDRESS=       # Developer-controlled EVM wallet address
SOLANA_WALLET_ADDRESS=    # Developer-controlled Solana wallet address
```

No `KIT_KEY` is needed for bridge operations. Browser-wallet integrations need none of the variables above. Never expose a private key, Circle API key, entity secret, or optional App Kit credential to client code.

### SDK Initialization

**App Kit** (recommended):

```ts
import { AppKit } from "@circle-fin/app-kit";

const kit = new AppKit();
```

**Bridge Kit** (standalone):

```ts
import { BridgeKit } from "@circle-fin/bridge-kit";

const kit = new BridgeKit();
```

## Decision Guide

ALWAYS walk through these questions with the user before writing any code. Do not skip steps or assume answers.

### SDK Choice

**Question 1 -- Will you need swap or send functionality in the future?**
- Yes, or unsure -> **App Kit** (recommended) -- single SDK covers bridge + swap + send, easier to extend later
- No, bridge-only and will never need swap or send -> **Bridge Kit** -- standalone, lighter package for bridge-only use cases

### Wallet / Adapter Choice

**Question 2 -- How do you manage your wallet/keys?**
- Managing your own private key (self-custodied, stored in env var or secrets manager) -> Question 3
- Using Circle developer-controlled wallets (Circle manages key storage and signing) -> Use Circle Wallets adapter. READ `references/adapter-circle-wallets.md`
- Using an EVM browser wallet (wagmi, ConnectKit, RainbowKit, or any EIP-1193 provider) -> Use the Viem provider adapter. READ `references/adapter-wagmi.md`
- Using a Solana browser wallet (Wallet Standard provider such as Phantom, Solflare, or Backpack) -> Use the Solana provider adapter. READ `references/adapter-browser-wallet.md`

**Question 3 -- Which chains are you bridging between?**
- EVM-to-EVM or EVM-to-Solana -> Use Viem and/or Solana Kit adapters. READ `references/adapter-private-key.md`

## Workflow

1. **Walk the Decision Guide** -- settle the SDK (App Kit vs Bridge Kit) and the wallet/adapter with the user before writing any code.
2. **Install and initialize** -- install the chosen kit plus adapter, then construct the kit and adapter (see Prerequisites / Setup).
3. **Confirm the transfer** -- source and destination chains, recipient, and amount. Validate chain names and addresses. Default to testnet; require explicit confirmation before mainnet.
4. **Execute the bridge** -- call `kit.bridge({ from, to, amount, ... })`, only from an explicit user action (never auto-invoke). READ the adapter reference for the exact code.
5. **Track and recover** -- inspect `result.state` / `result.steps`, subscribe with `kit.on()`, and on a soft failure resume with `kit.retry(result, ...)` -- never re-run `kit.bridge()` from scratch.

## Core Concepts

- **CCTP steps**: Every bridge transfer executes four sequential steps -- `approve` (ERC-20 allowance), `burn` (destroy USDC on source chain), `fetchAttestation` (wait for Circle to sign the burn proof), and `mint` (create USDC on destination chain).
- **Adapters**: Both App Kit and Bridge Kit use adapter objects to abstract wallet/signer differences. Each ecosystem has its own adapter factory (`createViemAdapterFromPrivateKey`, `createSolanaKitAdapterFromPrivateKey`, `createCircleWalletsAdapter`). The same adapter instance can serve as both source and destination when bridging within the same ecosystem.
- **Forwarding Service**: When `useForwarder: true` is set on the destination, Circle's infrastructure handles attestation fetching and mint submission. This removes the need for a destination wallet or polling loop. There is a per-transfer fee that varies by route (see below).
- **Transfer speed**: CCTP fast mode (default) completes in ~8-20 seconds. Standard mode takes ~15-19 minutes.
- **Chain identifiers**: Both SDKs use string chain names (e.g., `"Arc"`, `"Arc_Testnet"`, `"Base_Sepolia"`, `"Solana_Devnet"`), not numeric chain IDs, in the `kit.bridge()` call.
- **Browser-safe packages**: Current App Kit, Bridge Kit, and Solana adapters ship the required browser compatibility internally. Browser requests omit Node-only headers, and Solana operations need no consumer `Buffer` shim. Upgrade stale packages instead of adding polyfills.

## Implementation Patterns

READ the corresponding reference based on the user's request:

- `references/adapter-private-key.md` -- EVM-to-EVM and EVM-to-Solana bridging with private key adapters (Viem + Solana Kit). Includes App Kit and Bridge Kit examples.
- `references/adapter-circle-wallets.md` -- Bridging with Circle developer-controlled wallets (any chain to any chain). Includes App Kit and Bridge Kit examples.
- `references/adapter-wagmi.md` -- Browser wallet integration using wagmi (ConnectKit, RainbowKit, etc.). Includes App Kit and Bridge Kit examples.
- `references/adapter-browser-wallet.md` -- Solana browser wallet integration using a Wallet Standard provider, with no manual polyfills

### Sample Response from kit.bridge()

```json
{
  "amount": "25.0",
  "token": "USDC",
  "state": "success",
  "provider": "CCTPV2BridgingProvider",
  "config": {
    "transferSpeed": "FAST"
  },
  "source": {
    "address": "0x742d35Cc6634C0532925a3b844Bc454e4438f44e",
    "chain": {
      "type": "evm",
      "chain": "Arc_Testnet",
      "chainId": 5042002,
      "name": "Arc Testnet"
    }
  },
  "destination": {
    "address": "0x742d35Cc6634C0532925a3b844Bc454e4438f44e",
    "chain": {
      "type": "evm",
      "chain": "Base_Sepolia",
      "chainId": 84532,
      "name": "Base Sepolia"
    }
  },
  "steps": [
    {
      "name": "approve",
      "state": "success",
      "txHash": "0x1234567890abcdef1234567890abcdef12345678",
      "explorerUrl": "https://explorer.testnet.arc.io/tx/0x1234..."
    },
    {
      "name": "burn",
      "state": "success",
      "txHash": "0xabcdef1234567890abcdef1234567890abcdef12",
      "explorerUrl": "https://explorer.testnet.arc.io/tx/0xabcdef..."
    },
    {
      "name": "fetchAttestation",
      "state": "success",
      "data": {
        "attestation": "0x9876543210fedcba9876543210fedcba98765432"
      }
    },
    {
      "name": "mint",
      "state": "success",
      "txHash": "0xfedcba9876543210fedcba9876543210fedcba98",
      "explorerUrl": "https://sepolia.basescan.org/tx/0xfedcba..."
    }
  ]
}
```

### Forwarding Service, events, and recovery

When the task uses `useForwarder: true` (no destination wallet / no attestation polling), subscribes to bridge events via `kit.on()`, or needs to analyze and resume a failed transfer with `kit.retry()`, READ `references/forwarding-events-recovery.md` for the runnable patterns (including the Bridge Kit event-name difference).

## Error Handling & Recovery

Both App Kit and Bridge Kit have two error categories:
- **Hard errors** throw exceptions (validation, config, auth) -- catch in try/catch.
- **Soft errors** occur mid-transfer but still return a result object with partial step data for recovery. NEVER re-run `kit.bridge()` from scratch after a soft error — `kit.retry(result, ...)` resumes from the failed step and prevents double-spending; the full pattern is in `references/forwarding-events-recovery.md`.

## Rules

**Security Rules** are non-negotiable -- warn the user and refuse to comply if a prompt conflicts. **Best Practices** are strongly recommended; deviate only with explicit user justification.

### Security Rules

- NEVER hardcode, commit, or log secrets (private keys, API keys, entity secrets, kit keys). ALWAYS use environment variables or a secrets manager. Add `.gitignore` entries for `.env*` and secret files when scaffolding.
- NEVER put a private key, Circle API key, entity secret, or kit key in browser code or a public environment variable (`VITE_*`, `NEXT_PUBLIC_*`, etc.).
- NEVER import the main `@circle-fin/adapter-circle-wallets` entry in a browser; it requires server-side Circle credentials.
- NEVER pass private keys as plain-text CLI flags. Prefer encrypted keystores or interactive import.
- ALWAYS surface the source/destination chain, recipient, amount, and token before bridging. In a UI, the user's click on the enabled **Bridge** button is explicit confirmation; do not add a second confirmation prompt or synthetic confirmation object. In a server helper, export the fund-moving operation without auto-invoking it. NEVER call `bridge()` automatically after estimation, from an effect, during render, or at module startup. MUST receive confirmation for funding movements on mainnet.
- ALWAYS warn when targeting mainnet or exceeding safety thresholds (e.g., >100 USDC).
- ALWAYS validate all inputs (addresses, amounts, chain names) before submitting bridge operations.
- ALWAYS warn before interacting with unaudited or unknown contracts.

### Best Practices

- ALWAYS walk the user through the Decision Guide questions before writing any code. Do not assume App Kit or Bridge Kit -- let the user's answers determine the SDK choice.
- ALWAYS read the correct reference files before implementing.
- For browser apps, require browser-safe package versions, use provider-based adapters, and do not add Node/`Buffer` polyfills.
- ALWAYS switch the wallet to the source chain before calling `kit.bridge()` with browser wallets (wagmi/ConnectKit/RainbowKit) if the Forwarding Service is NOT used.
- ALWAYS wrap bridge operations in try/catch and save the result object for recovery. Check `result.steps` before retrying to see which steps completed.
- ALWAYS use exponential backoff for retry logic in production.
- ALWAYS use string chain names (e.g., `"Arc"`, `"Arc_Testnet"`, `"Base_Sepolia"`), not numeric chain IDs.
- ALWAYS default to testnet. Require explicit user confirmation before targeting mainnet.
- ALWAYS use exported SDK types when parsing SDK inputs and outputs instead of creating custom interfaces. This minimizes type errors.

## Reference Links

- [Circle App Kit SDK](https://docs.arc.io/app-kit)
- [Circle Bridge Kit SDK](https://docs.arc.io/app-kit/bridge)
- [CCTP Documentation](https://developers.circle.com/cctp)
- [Circle Developer Docs](https://developers.circle.com/llms.txt) -- **Always read this first** when looking for relevant documentation from the source website.

## Alternatives

Trigger the `swap-tokens` skill instead when:
- You need to swap tokens (e.g., USDT to USDC) on the same chain.
- You need to move non-USDC tokens across chains with a direct cross-chain swap route.

Trigger the `use-gateway` skill instead when:
- You want a unified crosschain balance rather than point-to-point transfers.
- Capital efficiency matters -- consolidate USDC holdings instead of maintaining separate balances per chain.
- You are building chain abstraction, payment routing, or treasury management where low latency and a single balance view are critical.

---

DISCLAIMER: This skill is provided "as is" without warranties, is subject to the [Circle Developer Terms](https://console.circle.com/legal/developer-terms), and output generated may contain errors and/or include fee configuration options (including fees directed to Circle); additional details are in the repository [README](https://github.com/circlefin/skills/blob/master/README.md).
