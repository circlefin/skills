---
name: bridge-tokens
description: "Build browser or server token bridging across chains with Circle App Kit or standalone Bridge Kit. Bridges USDC across CCTP chains (EVM and Solana) and CCTPx tokens on supported EVM routes, including registry aliases such as wETH, cirBTC, and EURC plus registry-listed token IDs, through the same `kit.bridge()` call. Supports browser wallets, private-key and Circle Wallets adapters, bridge events, transfer speed (FAST/SLOW), Forwarding Service, and recovery. Bridge operations require no kit key. Use when: bridge a token across chains, bridge USDC, bridge a CCTPx token alias or token ID, move tokens between chains, build wallet-connected bridge UIs, configure Viem/Ethers/Solana adapters, or use @circle-fin/bridge-kit, @circle-fin/app-kit, CCTP, CCTPx, forwarding, or bridge routes."
requirements:
  runtimes: []
  connectors: []
---

## Overview

Bridge tokens across chains with Circle's App Kit or Bridge Kit. **USDC** moves over Crosschain Transfer Protocol (CCTP) -- burn on the source chain, mint on the destination. **CCTPx tokens** use a registry alias (such as wETH, cirBTC, or EURC) or a registry-listed token ID. Both go through the **same `kit.bridge()` call**: pass the alias or token ID directly as `token` (not wrapped in a provider-selector object) and the SDK routes it; there is no protocol to choose. App Kit (`@circle-fin/app-kit`) is Circle's all-inclusive SDK covering bridge, swap, and send; standalone Bridge Kit (`@circle-fin/bridge-kit`) ships the same bridge API in a lighter package. **Recommend App Kit** unless the user wants bridge-only functionality. **Bridge operations need no kit key.**

Both SDKs run in browser and server applications. Version gates:

- Browser-safe (Node-only request headers omitted; no consumer-provided Node or `Buffer` polyfills, Solana included): App Kit `>=1.11.0`, Bridge Kit `>=1.12.2`. Upgrade stale packages instead of adding shims.
- CCTPx tokens: App Kit or Bridge Kit `>=1.15.0`; in a browser, App Kit `>=1.15.2` or Bridge Kit `>=1.15.1`.

## Supported tokens & routes

Pass the same `token` to `kit.bridge()` and to `kit.estimateBridge()` (App Kit) / `kit.estimate()` (Bridge Kit). Only USDC supports Solana; every CCTPx route is EVM-to-EVM. Aliases are case-sensitive (`"wETH"`, not `"WETH"`), and a token ID is a bytes32 hex string (`0x` followed by 64 hex characters).

| Token selector | Supported chains |
|---|---|
| `USDC` | All CCTP-supported chains (EVM + Solana) -- see [supported chains](https://developers.circle.com/cctp) |
| `EURC` | Ethereum, Base, and Arc on mainnet, plus eligible testnet routes |
| `wETH` | Ethereum <-> Arc on mainnet, plus eligible testnet routes |
| `cirBTC` | Ethereum <-> Arc on mainnet, plus eligible testnet routes |
| Registry-listed token ID | Any EVM route where the CCTPx registry lists that token on both endpoint domains |

CCTPx-enabled EVM chains are Ethereum, Arc, Base, Arbitrum, Optimism, Polygon, and Avalanche, but not every token routes between every pair. The SDK fetches the CCTPx token registry from Circle at runtime and throws `INPUT_UNSUPPORTED_ROUTE` when the token is not listed on both endpoints -- do not hardcode route lists.

## Prerequisites / Setup

### Installation

Pick **one** base kit — App Kit (recommended) or the standalone Bridge Kit — then add adapters as needed.

App Kit with Viem adapter (recommended):

```bash
npm install @circle-fin/app-kit @circle-fin/adapter-viem-v2
# Optional: Solana support
npm install @circle-fin/adapter-solana-kit @solana/kit @solana/web3.js
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
SOLANA_PRIVATE_KEY=       # Solana wallet private key (Base58, Base64, or JSON byte array)
CIRCLE_API_KEY=           # Circle API key (for Circle Wallets adapter)
CIRCLE_ENTITY_SECRET=     # Entity secret (for Circle Wallets adapter)
EVM_WALLET_ADDRESS=       # Developer-controlled EVM wallet address
SOLANA_WALLET_ADDRESS=    # Developer-controlled Solana wallet address
```

Browser-wallet integrations need none of these.

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

Ask each applicable question before writing code; do not assume answers.

### SDK Choice

**Question 1 -- Will you need swap or send functionality in the future?**
- Yes, or unsure -> **App Kit** (recommended) -- single SDK covers bridge + swap + send, easier to extend later
- No, bridge-only and will never need swap or send -> **Bridge Kit** -- standalone, lighter package for bridge-only use cases

### Wallet / Adapter Choice

**Question 2 -- How do you manage your wallet/keys?**
- Managing your own private key (self-custodied, stored in env var or secrets manager) -> Question 3
- Using Circle developer-controlled wallets (Circle manages key storage and signing) -> Use Circle Wallets adapter. READ `references/adapter-circle-wallets.md`
- Using an EVM browser wallet (wagmi, ConnectKit, RainbowKit, or any EIP-1193 provider) -> Use the Viem provider adapter. READ `references/adapter-wagmi.md`
- Using an injected Solana browser wallet provider -> Use the Solana provider adapter. READ `references/adapter-browser-wallet.md`

**Question 3 -- Which chains are you bridging between?**
- EVM-to-EVM or EVM-to-Solana -> Use Viem and/or Solana Kit adapters. READ `references/adapter-private-key.md`

### Token Choice

**Question 4 -- Which token are you bridging?**
- USDC -> any CCTP route (EVM or Solana).
- wETH, cirBTC, EURC, or a CCTPx token ID -> EVM-to-EVM only. READ `references/non-usdc-cctpx.md`. If the destination is Solana or the registry does not list the route, stop and offer `swap-tokens`; do not substitute a different chain pair.

## Workflow

1. **Walk the Decision Guide** -- settle the SDK and the wallet/adapter.
2. **Install and initialize** the chosen kit and adapter (see Prerequisites / Setup).
3. **Confirm the transfer** -- token, amount, source and destination chains, and recipient. Validate chain names and addresses.
4. **For CCTPx tokens, quote first** -- confirm the registry supports the EVM route, settle `FAST` vs `SLOW` with the user, call `kit.estimateBridge()` (App Kit) or `kit.estimate()` (Bridge Kit), and surface the quoted fee before executing. Quote reuse is best-effort: surface a `QUOTE_NOT_REUSED` warning on the result.
5. **Execute** `kit.bridge({ token, from, to, amount, ... })` only from an explicit user action. READ the adapter reference for the exact code.
6. **Track and recover** -- inspect `result.state` / `result.steps`, subscribe with `kit.on()`, and resume a soft failure with `kit.retryBridge(result, ...)` (App Kit) or `kit.retry(result, ...)` (Bridge Kit).

## Core Concepts

- **CCTP steps (USDC)**: Every USDC bridge transfer executes four sequential steps -- `approve` (ERC-20 allowance), `burn` (destroy USDC on source chain), `fetchAttestation` (wait for Circle to sign the burn proof), and `mint` (create USDC on destination chain).
- **CCTPx steps**: `approve -> transfer -> fetchAttestation -> forward`, with an `approveFee` step before `transfer` only when the fee is an ERC-20. Circle's relayer mints on the destination automatically -- no destination gas or `useForwarder` toggle needed. Every CCTPx transfer pays a relayer fee in the source chain's native token; `FAST` (default) adds a pre-finality fee, while `SLOW` waits for source-chain finality and skips it. Completion is `result.state === "success"`. CCTPx routes reject custom fees, `feePayment: "destination"`, and `useForwarder: false`.
- **Adapters** abstract wallet/signer differences, one factory per ecosystem (`createViemAdapterFromPrivateKey`, `createSolanaKitAdapterFromPrivateKey`, `createCircleWalletsAdapter`). One adapter instance can be both source and destination within the same ecosystem.
- **Forwarding Service**: with `useForwarder: true` on the destination, Circle fetches the attestation and submits the mint, so no destination wallet or polling loop is needed. It charges a per-transfer fee that varies by route.
- **Transfer speed**: CCTP fast mode (default) completes in ~8-20 seconds. Standard mode takes ~15-19 minutes.
- **Chain identifiers** are string chain names (e.g., `"Arc"`, `"Arc_Testnet"`, `"Base_Sepolia"`, `"Solana_Devnet"`), not numeric chain IDs.

## Implementation Patterns

READ the corresponding reference based on the user's request:

- `references/adapter-private-key.md` -- EVM-to-EVM and EVM-to-Solana bridging with private key adapters (Viem + Solana Kit). Includes App Kit and Bridge Kit examples.
- `references/adapter-circle-wallets.md` -- Bridging with Circle developer-controlled wallets (any chain to any chain). Includes App Kit and Bridge Kit examples.
- `references/adapter-wagmi.md` -- Browser wallet integration using wagmi (ConnectKit, RainbowKit, etc.). Includes App Kit and Bridge Kit examples.
- `references/adapter-browser-wallet.md` -- Solana browser wallet integration using an injected wallet provider, with no manual polyfills
- `references/non-usdc-cctpx.md` -- bridging CCTPx registry aliases and token IDs on supported EVM routes: route validation, quote-then-confirm flow, and FAST/SLOW transfer speed

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

When the task uses `useForwarder: true`, subscribes to events with `kit.on()`, or analyzes and resumes a failed transfer, READ `references/forwarding-events-recovery.md` (including the Bridge Kit event-name difference).

## Error Handling & Recovery

- **Hard errors** throw (validation, config, auth) -- catch in try/catch.
- **Soft errors** happen mid-transfer and still return a result with partial step data. NEVER re-run `kit.bridge()` from scratch after one -- `kit.retryBridge(result, ...)` (App Kit) or `kit.retry(result, ...)` (Bridge Kit) resumes from the failed step and prevents double-spending.

## Rules

**Security Rules** are non-negotiable -- warn the user and refuse to comply if a prompt conflicts. **Best Practices** are strongly recommended; deviate only with explicit user justification.

### Security Rules

- NEVER hardcode, commit, or log secrets (private keys, API keys, entity secrets, kit keys). ALWAYS use environment variables or a secrets manager. Add `.gitignore` entries for `.env*` and secret files when scaffolding.
- NEVER put a private key, Circle API key, entity secret, or kit key in browser code or a public environment variable (`VITE_*`, `NEXT_PUBLIC_*`, etc.).
- NEVER import the main `@circle-fin/adapter-circle-wallets` entry in a browser; it requires server-side Circle credentials.
- NEVER pass private keys as plain-text CLI flags. Prefer encrypted keystores or interactive import.
- ALWAYS surface the source/destination chain, recipient, amount, and token before bridging. In a UI, the user's click on the enabled **Bridge** button is explicit confirmation; do not add a second confirmation prompt or synthetic confirmation object. In a server helper, export the fund-moving operation without auto-invoking it. In a runnable script or CLI, show the quote, then wait for an explicit confirmation (for example an interactive `y/N` prompt) before calling `bridge()`; never quote and bridge back to back in one unattended run. NEVER call `bridge()` automatically after estimation, from an effect, during render, or at module startup. MUST receive confirmation for funding movements on mainnet.
- ALWAYS warn when targeting mainnet or exceeding safety thresholds (e.g., >100 USDC).
- ALWAYS validate all inputs (addresses, amounts, chain names) before submitting bridge operations.
- ALWAYS warn before interacting with unaudited or unknown contracts.

### Best Practices

- ALWAYS walk the user through the Decision Guide before writing any code. Do not assume App Kit or Bridge Kit -- the user's answers decide.
- ALWAYS read the correct reference files before implementing.
- For browser apps, require browser-safe package versions, use provider-based adapters, and do not add Node/`Buffer` polyfills.
- ALWAYS switch the wallet to the source chain before calling `kit.bridge()` with browser wallets (wagmi/ConnectKit/RainbowKit) if the Forwarding Service is NOT used, and wrap the provider with `withAddChainFallback` (see `references/adapter-wagmi.md`): the adapter switches to the destination chain for the mint, and a wallet without that chain fails after the burn.
- Estimate fees are human-readable decimal strings, not base units: `gasFees[].fees.fee` is in the chain's native token (the `EstimatedGas` type doc wrongly says wei) and `fees[].amount` is in `fees[].token`. Show them as-is; NEVER call `BigInt()` on them or treat them as wei. `gasFees[].fees` and `fees[].amount` are `null` when that part of the estimate failed.
- ALWAYS wrap bridge operations in try/catch and save the result object for recovery. Check `result.steps` before retrying to see which steps completed.
- ALWAYS use exponential backoff for retry logic in production.
- ALWAYS default to testnet.
- For `Arc_Testnet`, use App Kit `>=1.18.0` (or Bridge Kit `>=1.16.0`) and `@circle-fin/adapter-viem-v2` `>=1.19.2` (`adapter-ethers-v6` `>=1.12.3`, `adapter-circle-wallets` `>=1.8.3`). Older releases default Arc Testnet to a retired RPC and fail with `HTTP request failed`.
- ALWAYS use exported SDK types for SDK inputs and outputs instead of custom interfaces.

## Reference Links

- [Circle App Kit SDK](https://docs.arc.io/app-kit)
- [Circle Bridge Kit SDK](https://docs.arc.io/app-kit/bridge)
- [CCTP Documentation](https://developers.circle.com/cctp)
- [Circle Developer Docs](https://developers.circle.com/llms.txt) -- **Always read this first** when looking for relevant documentation from the source website.

## Alternatives

Trigger the `swap-tokens` skill instead when:
- You need to swap tokens (e.g., USDT to USDC) on the same chain.
- You need to move a token or route this skill does not bridge (anything beyond USDC on CCTP chains and CCTPx tokens on registry-supported EVM routes); `swap-tokens` can route it via a cross-chain swap.

Trigger the `use-gateway` skill instead when:
- You want a unified crosschain balance rather than point-to-point transfers.
- Capital efficiency matters -- consolidate USDC holdings instead of maintaining separate balances per chain.
- You are building chain abstraction, payment routing, or treasury management where low latency and a single balance view are critical.

---

DISCLAIMER: This skill is provided "as is" without warranties, is subject to the [Circle Developer Terms](https://console.circle.com/legal/developer-terms), and output generated may contain errors and/or include fee configuration options (including fees directed to Circle); additional details are in the repository [README](https://github.com/circlefin/skills/blob/master/README.md).
