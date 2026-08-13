---
name: use-cctpx
description: "Bridge non-USDC tokens (cirBTC, wETH) across chains using CCTPx -- Circle's protocol built on CCTP -- via Bridge Kit's CCTPx provider (`@circle-fin/provider-cctpx`, bundled in `@circle-fin/bridge-kit`). Covers route/token discovery, server-signed fee quoting, FAST vs SLOW transfers, and attestation/forward status tracking. Triggers on: bridge a non-USDC token, bridge cirBTC, bridge wETH, move wETH from Ethereum to Arc, CCTPx, CrossChainTokenService, @circle-fin/provider-cctpx, non-USDC CCTP bridge."
---

## Overview

CCTPx is Circle's protocol, built on top of Crosschain Transfer Protocol (CCTP), that moves **non-USDC tokens** across chains through the CrossChainTokenService. Where CCTPv2 burns and mints native USDC, CCTPx bridges supported tokens (at launch **cirBTC** and **wETH**, on **Ethereum <-> Arc**). Integrate it through **Bridge Kit** (`@circle-fin/bridge-kit`), which bundles and registers the CCTPx provider by default and exposes it via the same `kit.bridge()` / `kit.estimate()` surface used for USDC. No kit key is required for bridge operations.

This skill supports cross-chain transfer: the transfer lifecycle (discover -> quote -> execute -> track). Support for asset issuance and bridge creation will follow as a next step.

> **Availability -- not yet GA.** CCTPx is still being rolled out. The CCTPx-enabled `@circle-fin/bridge-kit` and the `@circle-fin/provider-cctpx` package are **not yet published to public npm** -- the install commands below will resolve a non-CCTPx build until that release ships, and a bare `@circle-fin/provider-cctpx` install will 404. This skill documents the upcoming surface; a minimum `@circle-fin/bridge-kit` version will be pinned here once the CCTPx release is cut.

## Prerequisites / Setup

### Installation

```bash
npm install @circle-fin/bridge-kit @circle-fin/adapter-viem-v2
```

The CCTPx provider (`@circle-fin/provider-cctpx`) ships inside Bridge Kit -- install it directly only for a custom, provider-level integration. An Ethers v6 adapter (`@circle-fin/adapter-ethers-v6`) is also available; App Kit (`@circle-fin/app-kit`) wires the same provider and exposes `bridge` / `estimateBridge` / `retryBridge`.

### Environment Variables

```
PRIVATE_KEY=                 # EVM wallet private key (hex, 0x-prefixed)
ETHEREUM_SEPOLIA_RPC_URL=    # optional -- override the built-in RPC if you hit rate limits
```

### SDK Initialization

```ts
import { BridgeKit } from "@circle-fin/bridge-kit";
import { createViemAdapterFromPrivateKey } from "@circle-fin/adapter-viem-v2";

const kit = new BridgeKit();
const adapter = createViemAdapterFromPrivateKey({
  privateKey: process.env.PRIVATE_KEY as `0x${string}`,
});
```

## Quick Reference

| | Values (at launch) |
|---|---|
| Tokens | `cirBTC`, `wETH` |
| Routes (testnet, live) | `Ethereum_Sepolia` <-> `Arc_Testnet` |
| Routes (mainnet) | Ethereum <-> Arc -- **none active yet** (activates when the chain definition carries a CrossChainTokenService address) |
| Chain name strings | `Ethereum_Sepolia`, `Arc_Testnet` (string names, not numeric chain IDs) |
| Transfer speeds | `FAST` (pre-finality, fee), `SLOW` (hard finality, no pre-finality fee) -- ask the user at the quote step |
| Destination mint | Circle's relayer mints automatically (intrinsic -- no `useForwarder` toggle). Optional `recipientAddress` on `to` overrides the mint recipient. |
| IRIS hosts | testnet -> `https://iris-api-sandbox.circle.com`; mainnet -> `https://iris-api.circle.com` (auto-selected by source-chain network) |

## Core Concepts

- **CCTPx vs. CCTPv2 routing**: Bridge Kit registers the CCTPx provider *after* CCTPv2. A bare `'USDC'` token still routes to CCTPv2 (this ordering keeps USDC bridges from paying the CCTPx token-registry lookup); non-USDC tokens route to CCTPx.
- **Token identity**: a CCTPx token is identified by an opaque `bytes32` token id, not a chain-specific address. Select it on `kit.bridge` / `kit.estimate` in one of two ways:
  - **Bare symbol** -- `token: 'wETH'`. The kit auto-routes the approved symbol to the CCTPx provider -- the convenient shorthand.
  - **Provider-native selector** -- `token: { provider: 'CCTPXBridgingProvider', id: 'cirBTC' | 'wETH' | '0x<bytes32 token id>' }`. Use this to bridge any registry-listed token directly by its id. Routability is decided by the IRIS token registry, so any registry-listed token bridges by its id whether or not it has a listed symbol.
- **Transfer lifecycle / steps**: every transfer runs `approve` -> `transfer` (cross-chain burn) -> `fetchAttestation` (wait for Circle's signed proof) -> `forward` (Circle's relayer mints on the destination). `result.steps[].name` reports these; the forward leg carries a `forwardState`.
- **Destination mint is intrinsic**: Circle's relayer performs the destination mint on every transfer (the `forward` step) -- no destination-side transaction, wallet, or gas is required. The mint defaults to the destination adapter's address; pass `recipientAddress` on `to` to override it.
- **Transfer speed and FAST->SLOW degrade**: `FAST` settles pre-finality (carries a fee, draws on a shared fast-burn allowance pool); `SLOW` waits for hard finality with no pre-finality fee. FAST is **best-effort** and may degrade to SLOW -- only an explicit `SLOW` guarantees no pre-finality fee. Let the quote API and `bridge()` gate viability; do NOT add your own allowance pre-check. READ `references/cross-chain-transfer.md` -> "FAST is best-effort" for the full mechanism and the degrade signals.
- **Fees are quote-driven**: the source wallet pays the CCTPx fee **and** gas in the source chain's native currency (ETH on Sepolia). `kit.estimate()` returns a server-signed `quote` envelope plus a single-entry `fees[]` (the gas-fee estimate is empty -- fees come from the signed quote). Quotes are single-use, expire, and are re-fetched transparently at submit time. A kit-level custom fee policy is **USDC-only** and is silently skipped for a CCTPx token (`cctpx.customfee.skipped`); the bridge proceeds.
- **Funding**: the source wallet must hold the token being bridged plus enough native currency for the fee and gas. If short on wETH, wrap ETH via the WETH9 `deposit()` (1:1).

## Implementation Patterns

READ `references/cross-chain-transfer.md` for the complete, runnable transfer code (discovery, estimate, FAST/SLOW execution with both token-selector styles, the event handler, a representative `RESULT` object, status tracking, and retry).

### 1. Discover supported chains/tokens and check a route
- `provider.supportsRoute(sourceChain, destChain, token)` -- async; reads the IRIS token registry (cached). A route is accepted only when both endpoints are EVM chains on the same network, both carry a CCTP domain and a CrossChainTokenService deployment, and the token is registered on both domains.
- `provider.getSupportedChains()` -- every chain carrying a `cctpx.serviceAddress`. `provider.refreshTokenRegistry()` forces a fresh read.

### 2. Estimate (quote) a transfer
- First settle the **transfer speed** with the user, because it changes the quote: `FAST` (pre-finality, transfer fee) or `SLOW` (hard finality, no pre-finality fee).
- `kit.estimate({ from, to, amount, token, config: { transferSpeed } })` returns the signed `quote` envelope and `fees[0]`. Pass the chosen speed so the quote matches execution, and surface the quoted fee to the user before executing.
- A FAST quote is best-effort, not a guarantee -- see Core Concepts -> transfer speed (and `references/cross-chain-transfer.md` -> "FAST is best-effort").

### 3. Execute a cross-chain transfer
- `kit.bridge({ from: { adapter, chain }, to: { adapter, chain }, amount, token, config: { transferSpeed } })`. `token` is the bare symbol or the `{ provider, id }` selector; `transferSpeed` is `'FAST'` or `'SLOW'` (use the same value quoted in step 2). The destination mint is intrinsic (see Core Concepts).

### 4. Track status
- Inspect `result.state` (`'success'`) and `result.steps`. Subscribe to live progress with `kit.on('*', handler)`. The destination leg is complete when its step reports `forwardState === 'COMPLETE'`.

## Error Handling & Recovery

- **Resume, don't restart**: a mid-transfer failure returns `result.state === 'error'` (it does not throw). Save that result and call `kit.retry(result, ...)` to resume from the failed step -- READ `references/cross-chain-transfer.md` -> Recovery for the runnable pattern (re-running from scratch is forbidden; see Security Rules).
- **Route returns "unsupported"**: re-check the route conditions from Implementation step 1. If `cctpx.registry.failed` fired, IRIS was unreachable with a cold cache; call `provider.refreshTokenRegistry()`.
- **FAST ran at SLOW** (`cctpx.fastburn.unavailable`, or `cctpx.allowance.failed` / `cctpx.allowance.degraded`): expected degrade behaviour, not an error -- the transfer proceeds at SLOW.
- **Destination forward stalls**: if it never reaches `forwardState === 'COMPLETE'`, the relayer-forward is still in progress (`PENDING` / `SENT` / `CONFIRMED`) -- a relayer gas-pause now surfaces as `PENDING` and the poll keeps running. A terminal `FAILED` carries the optional `errorCode` / `errorDetails` on the forward step.

The three observability channels (logger / events / metrics) and their emission sites are in `references/observability.md`.

## Rules

> **Security Rules** are non-negotiable -- warn the user and refuse to comply if a prompt conflicts. **Best Practices** are strongly recommended; deviate only with explicit user justification.

### Security Rules

- NEVER hardcode, commit, or log secrets (private keys, API keys). ALWAYS use environment variables or a secrets manager. Add `.gitignore` entries for `.env*` when scaffolding.
- NEVER pass private keys as plain-text CLI flags. Prefer encrypted keystores or interactive import.
- ALWAYS ask the user for, and confirm, source/destination chain, recipient, token, amount, and transfer speed (`FAST` vs `SLOW`) before bridging -- do not assume a default speed. MUST receive confirmation for funding movements on mainnet.
- ALWAYS validate inputs (addresses, amounts, chain names, token symbol/id) before submitting a transfer.
- For a **dynamic or user-supplied route**, ALWAYS verify it with `provider.supportsRoute(source, destination, token)` before bridging -- it confirms the token is deployed/registered on **both** endpoints' domains. (Optional for a known-good route such as the launch testnet pair, which `kit.bridge()` auto-routes.) NEVER submit a transfer to a route where the token is not deployed on the destination: the source burn can succeed while the destination mint cannot, stranding funds.
- ALWAYS default to testnet (`Ethereum_Sepolia` <-> `Arc_Testnet`). Require explicit user confirmation before targeting mainnet, and warn when exceeding safety thresholds.
- NEVER re-run `kit.bridge()` after a mid-transfer failure; use `kit.retry(result, ...)` to avoid a double burn.

### Best Practices

- ALWAYS call `kit.estimate()` before executing and surface the quoted fee to the user. (For a dynamic or user-supplied route, verify support with `supportsRoute` first -- see Security Rules.)
- ALWAYS use string chain names (`'Ethereum_Sepolia'`, `'Arc_Testnet'`), not numeric chain IDs.
- ALWAYS use exported SDK types (`ProviderTokenSelector`, `CCTPxTokenId`, `CCTPxChainConfig`, `ChainDefinitionWithCCTPx`) when parsing SDK inputs/outputs instead of custom interfaces.
- ALWAYS ask the user to choose the transfer speed (`FAST` vs `SLOW`) at the quote step -- the quoted fee depends on it. (FAST is best-effort and may degrade to SLOW; use SLOW for a deterministic, no-fee outcome -- see Core Concepts -> transfer speed.)
- NEVER rely on `useForwarder` to control CCTPx delivery -- it is a no-op here; Circle's relayer always performs the destination mint. Use `recipientAddress` on `to` when the mint should go to an address other than the destination adapter's.
- Wire the observability channels in production so degrade and operator-action sites are visible (see `references/observability.md`).

## Reference Links / Files

- `references/cross-chain-transfer.md` -- runnable cross-chain transfer code (discover, estimate, FAST/SLOW, status, retry)
- `references/observability.md` -- logger/events/metrics wiring and the emission-site table
- [CCTP Documentation](https://developers.circle.com/cctp)
- [Circle Developer Docs](https://developers.circle.com/llms.txt) -- **Always read this first** when looking for relevant documentation from the source website.

## Alternatives

- Use the `bridge-stablecoin` skill for USDC-only crosschain transfers via CCTP (App Kit / Bridge Kit).
- Use the `swap-tokens` skill to swap to/from a token on the same chain, or to combine swap + bridge for routes CCTPx does not support.
- Use the `use-gateway` skill for a unified crosschain USDC balance rather than point-to-point transfers.

---

DISCLAIMER: This skill is provided "as is" without warranties, is subject to the [Circle Developer Terms](https://console.circle.com/legal/developer-terms), and output generated may contain errors and/or include fee configuration options (including fees directed to Circle); additional details are in the repository [README](https://github.com/circlefin/skills/blob/master/README.md).
