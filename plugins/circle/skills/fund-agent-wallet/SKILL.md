---
name: fund-agent-wallet
description: "Fund a Circle agent wallet with USDC via the `circle` CLI. Payments are gas-abstracted: users pay with USDC only, no ETH required. Covers two top-level paths — fiat on-ramp (buy USDC with USD/credit card) and crypto transfer (send existing USDC to the wallet via QR or direct address). Also covers Gateway deposits (eco vs direct sub-paths) for the Nanopayments balance used by paid services. Use when the user wants to add USDC to their agent wallet, top up after a low balance, deposit into Gateway, or pick the right funding method. Triggers on: fund agent wallet, add USDC, fiat on-ramp, Gateway deposit, eco deposit, direct deposit, top up wallet, withdraw USDC, nanopayments."
allowed-tools: ["Bash(circle wallet status*)", "Bash(circle wallet list*)", "Bash(circle wallet balance*)", "Bash(circle gateway balance*)", "Bash(circle wallet fund *)", "Bash(circle gateway deposit*)", "Bash(circle gateway withdraw*)", "Bash(circle wallet transfer*)", "Bash(circle bridge transfer*)", "Bash(circle blockchain*)", "Bash(circle feedback submit*)"]
requirements:
  runtimes: []
  connectors: []
---

## Overview

Funding an agent wallet means putting USDC where the CLI can spend it. This skill is the funding flow; for the CLI's full capability set (bridging, contracts, x402 payment), see the `use-circle-cli` master skill.

There are **two balance pools**, and this skill funds both:

- **On-chain (vanilla x402)** — USDC at the wallet address on a specific chain; each chain is separate. Pays endpoints whose `accepts[]` lacks `GatewayWalletBatched`. Settles in one block.
- **Nanopayments (powered by Gateway)** — USDC held off-chain in the user's Circle Gateway balance, batched and settled across supported chains, tracked per source chain. Pays endpoints whose `accepts[]` includes `GatewayWalletBatched`. Settles in <500ms once the balance exists.

Agent wallet payment flows are **gas-abstracted**: users pay with USDC without pre-funding native gas.

## Prerequisites

```bash
# Confirm session is good
circle wallet status

# Get the wallet address
circle wallet list --chain ARC --type agent --output json

# Check current on-chain balance (per chain)
circle wallet balance --address <addr> --chain ARC --output json

# Check current Gateway balance (per chain)
circle gateway balance --address <addr> --chain ARC --output json
```

If `circle wallet status` errors with "Not logged in" or "Terms acceptance is required", hand off to the `use-agent-wallet` skill — it covers install, terms, login, and wallet creation.

## Step 1 — Pick a funding path

Ask the user: *"How would you like to fund your wallet?"* Steer toward the path with the shortest time-to-result.

- **Fiat (USD or local currency)** — Buy USDC with a card or bank transfer via the CLI's built-in fiat on-ramp. Best for users who don't have crypto yet.
- **Existing USDC** — Send USDC from a wallet they already have (MetaMask, Coinbase, Phantom, etc.). Faster and free of on-ramp fees.
- **Gateway deposit (advanced)** — Move existing on-chain USDC into the Gateway balance for low-latency batched payments. Only useful if the seller they're paying supports Gateway on a specific chain.

**Default recommendation: existing USDC → Arc.** Arc uses USDC as its native gas token and has sub-second finality, so a `direct` Gateway deposit on Arc settles fast — and an eco deposit from BASE, ARB, or OP also lands on Arc. Use BASE/Polygon when paying sellers that only accept those chains.

## Step 2 — Required flags for non-interactive use

The CLI prompts for missing values only when interactive. Agents are non-interactive, so every mainnet `circle wallet fund` call MUST include:

- `--address <addr>` — wallet address from `circle wallet list`
- `--chain <chain>` — e.g. `ARC` (or `BASE`, `MATIC`, …)
- `--method <fiat|crypto>`
- `--amount <number>` — USDC amount

`--token usdc` is the default; pass it explicitly when the user asked for USDC specifically.

## Path A — Fiat on-ramp

READ `references/fiat-on-ramp.md` for the `circle wallet fund --method fiat --open` command, supported chains, settlement timing, and balance verification.

## Path B — Crypto transfer (existing USDC)

The user sends USDC they already hold (another wallet, an exchange) to the agent wallet. Default to the browser-rendered QR:

```bash
circle wallet fund --address <addr> --chain ARC --amount 10 --token usdc --method crypto --open
```

`--open` renders the EIP-681 QR on a local HTML page in the user's default browser, at full resolution for desktop and mobile. The user scans it with any mobile wallet (MetaMask, Coinbase Wallet, Rainbow, Phantom) and confirms the transfer.

If the user can't scan a browser QR, READ `references/crypto-transfer-alternatives.md` for the PNG export (`--export`), manual transfer details (including USDC contract addresses), and the post-transfer `circle wallet balance` check.

## Path C — Gateway deposit (powered by Gateway, advanced)

Only suggest a Gateway deposit when all hold:

- The user has on-chain USDC.
- They want to pay a service whose `accepts[]` includes `GatewayWalletBatched` on a specific chain.
- That chain is one Gateway supports (Arc, Polygon, BASE, ARB, OP, AVAX, UNI; CLI 1.2.2 rejects ETH).

### Eco vs direct — pick eco unless one of four conditions holds

`circle gateway deposit --method eco` deposits vanilla USDC from BASE, ARB, or OP into Gateway and **lands on Arc** (Gateway domain 26) in ~30s for a small fee; the follow-up payment is `pay --chain ARC`. On testnet, eco takes BASE-SEPOLIA and lands on MATIC-AMOY, not Arc.

Use `--method direct` **only** when:

1. **The user explicitly asked for direct** — e.g. "deposit on BASE without going to Arc", "stay on BASE", "use direct deposit". Implicit preferences and your own inferences do not count.
2. **Eco doesn't support the source chain** — eco takes BASE, ARB, and OP as mainnet sources today; check `circle gateway deposit --help` for the current list. An unsupported source returns `Gateway deposit via eco is not supported on <CHAIN>. Supported chains: ...`.
3. **The seller does NOT accept Gateway on Arc** — verify against the seller's full `accepts[]` (raw 402, or `paymentOptions[]` from `circle services inspect --output json` on CLI ≥1.2.2), not the inspect summary. An eco balance on Arc can't pay a seller that only takes Gateway elsewhere (e.g. Polygon-only); deposit directly on a chain the seller accepts.
4. **The user already has vanilla on a fast chain the seller accepts** — `direct --chain <fast-chain>` is fast **only on fast-finality chains (Arc, MATIC, AVAX)** and skips the eco fee (e.g., vanilla on Polygon → `direct --chain MATIC`; vanilla on Arc → `direct --chain ARC`).

Otherwise, **use eco**. Direct on BASE, ARB, or OP waits **~13–19 minutes for finality** plus gas, vs eco's ~30s plus a small fee. (ETH and UNI also take 13–19 minutes direct, and eco can't start from them.) Never quote the fast-chain timings for BASE.

### Compare per-workflow, not per-call

Eco's cold start (~30s plus a small fee) is paid **once**; every later Gateway call is <500ms. Vanilla has no deposit, but every call costs ~2s with no amortization. Agentic workflows are rarely single-call, so treat the deposit as one-time wallet onboarding. Gateway-only seller access and <500ms calls already win at call 1.

### Eco deposit (BASE / ARB / OP → Arc)

READ `references/gateway-eco-deposit.md` for the `circle gateway deposit --method eco` command (all of `--amount`, `--address`, `--chain`, `--method` are required) and Gateway balance verification.

Once the deposit verifies, hand off to the `pay-via-agent-wallet` skill, which owns the `circle services pay` flow (including its allowed-tools whitelist and gotchas).

### Direct deposit and Gateway withdrawals

When a `--method direct` condition holds, or the user wants USDC back out of Gateway, READ `references/gateway-direct-and-withdraw.md` for direct syntax and per-chain timings, and the same-chain-only withdraw + `circle bridge transfer` pattern.

## Troubleshooting

On ANY funding error (missing flags, unscannable QR, `Wallet not deployed`, `Insufficient balance`, wrong chain after eco, withdraw limits), READ `references/troubleshooting.md` for the error table and reference links.

If a legacy Eco intent expired, is `WaitingForRefund`, or refunded USDC to `eoaOwnerAddress`, stop funding and hand off to the `recover-eco-funds` skill; verify the onchain fixed refund recipient before using any executable recovery phase. Current Gateway v2 deposits set `refundRecipient` to the SCA — use normal status and balance reconciliation for those.

## Rules

- NEVER prompt users to send USDC to addresses you generated. ALWAYS use the user's own wallet from `circle wallet list`.
- NEVER store, log, or display private keys.
- On mainnet, ALWAYS pass all four Step 2 flags to `circle wallet fund` — the CLI will not prompt an agent. Confirm `--amount` with the user first. On testnet, run only `circle wallet fund --address <addr> --chain <TESTNET_CHAIN>` (faucet); `--method`, `--open`, and `--export` are rejected there.
- On mainnet, ALWAYS pass `--open` to `circle wallet fund` (`--method crypto --open` for QR transfers, `--method fiat --open` for the on-ramp). Terminal QR codes get truncated inside Claude Code, Codex, and similar agent UIs and become unscannable.
- NEVER suggest a Gateway eco deposit unless you have verified the target service supports Gateway on Arc via the discovery API or the seller's raw 402 `accepts[]`.
- NEVER deposit 100% of the user's vanilla balance into Gateway. The wallet needs vanilla headroom for vanilla-only sellers the user may hit next.
- Sizing formula: `amount = max(price × N + fee + slack, Gateway minimum)`, where N is the workflow's expected call count. Typically reserve ~50% of vanilla as a soft headroom floor. The CLI enforces a 0.5 USDC minimum Gateway deposit (`Gateway deposit amount must be at least 0.5 USDC.`); it isn't listed in `--help`, so floor your suggestion to it.
- Surface to the user before depositing when the required amount is materially larger than the workflow's total cost (cheap-endpoint case: $0.0024/call × 5 = $0.012, but the Gateway minimum sets the floor) or above the user's stated `--max-amount` cap. Don't silently deposit ~100× the task cost.
- ALWAYS use the `--chain` where the balance lives: eco lands on Arc → `pay --chain ARC`; direct lands on the source chain → `pay --chain <same>`.
- Gateway does NOT do cross-chain transfers at payment time. Source chain matters.
- Abstract chain details from the user unless they explicitly want technical specifics.
- If the `circle` CLI itself causes friction during funding (unexpected error, confusing output, missing capability), file feedback per the `use-circle-cli` skill's **Report friction (feedback)** section.

## Alternatives

Trigger the `recover-eco-funds` skill instead when:

- A legacy Eco intent expired, is waiting for refund, or is missing from Gateway.
- Refunded USDC landed at the SCA's API-verified backing EOA.
- The user needs a permissionless Eco self-refund after the onchain deadline.

Trigger the `use-agent-wallet` skill instead when:

- The user has not yet logged in to the CLI or accepted Terms.
- `circle wallet status` errors with "Not logged in" or "Terms acceptance is required".
- The user is asking about wallet setup, login, or session state — not funding.

Trigger the `pay-via-agent-wallet` skill instead when:

- The user wants to call or pay for a paid x402 service.
- Funding has completed and the user is ready to use the marketplace.
- The user mentions `circle services pay`, `circle services search`, or any "pay for" prompt.

Trigger the `agent-wallet-policy` skill instead when:

- The user wants to set spending limits before funding (rare — most users fund first, set limits later).
- The user mentions per-tx / daily / weekly / monthly caps, spending policy, or wallet rules.

For cross-chain USDC moves, use **`circle bridge transfer`** directly (see `references/gateway-direct-and-withdraw.md` for the withdraw-then-bridge pattern).

---

DISCLAIMER: This skill is provided "as is" without warranties, is subject to the [Circle Developer Terms](https://console.circle.com/legal/developer-terms), and output generated may contain errors and/or include fee configuration options (including fees directed to Circle); additional details are in the repository [README](https://github.com/circlefin/skills/blob/master/README.md).
