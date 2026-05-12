---
name: fund-agent-wallet
description: "Fund a Circle agent wallet with USDC via the `circle` CLI. payments are gas-abstracted. users can pay with USDC only, no ETH required. Covers two top-level paths — fiat on-ramp (buy USDC with USD/credit card) and crypto transfer (send existing USDC to the wallet via QR or direct address). Also covers Gateway deposits (eco vs direct sub-paths) for the Nanopayments balance used by paid services. Use when the user wants to add USDC to their agent wallet, top up after a low balance, deposit into Gateway, or pick the right funding method. Triggers on: fund agent wallet, fund Circle wallet, fund USDC, deposit USDC, add USDC, fiat on-ramp, buy USDC, crypto deposit, QR code transfer, Gateway deposit, eco deposit, direct deposit, low balance, top up wallet, withdraw USDC, nanopayments."
allowed-tools: ["Bash(circle wallet status*)", "Bash(circle wallet list*)", "Bash(circle wallet balance*)", "Bash(circle gateway balance*)", "Bash(circle wallet fund *)", "Bash(circle gateway deposit*)", "Bash(circle gateway withdraw*)", "Bash(circle wallet transfer*)", "Bash(circle bridge transfer*)", "Bash(circle blockchain*)"]
---

## Overview

For an overview of the Circle CLI's **full** capability set — bridging, smart contract execution, x402 payment, and more — see the `use-circle-cli` master skill. This skill is the narrower funding flow.

Funding an agent wallet means putting USDC where the CLI can spend it. There are **two balance pools** to be aware of:

- **On-chain (vanilla x402)** — USDC sitting at the wallet address on a specific chain. Each chain is separate. Used to pay endpoints whose `accepts[]` does not include `GatewayWalletBatched`. Settles in one block.
- **Nanopayments (powered by Gateway)** — USDC held off-chain in your Circle Gateway balance, batched and settled for you across supported chains. Per source chain — no cross-chain pooling at payment time. Used to pay endpoints whose `accepts[]` includes `GatewayWalletBatched`. Settles in <500ms once the balance exists.

### Gas note
**Agent wallet payment flows are gas-abstracted** — users can pay with USDC without pre-funding native gas. 

This skill covers funding both pools. Pick the path with the shortest time-to-result and hide chain complexity from the user.

## Prerequisites

```bash
# Confirm session is good
circle wallet status

# Get the wallet address
circle wallet list --chain BASE --type agent --output json

# Check current on-chain balance (per chain)
circle wallet balance --address <addr> --chain BASE --output json

# Check current Gateway balance (per chain)
circle gateway balance --address <addr> --chain BASE --output json
```

If `circle wallet status` errors with "Not logged in" or "Terms acceptance is required", hand off to the `use-agent-wallet` skill — it covers install, terms, login, and wallet creation.

## Step 1 — Pick a funding path

Ask the user: *"How would you like to fund your wallet?"*

- **Fiat (USD or local currency)** — Buy USDC with a card or bank transfer via the CLI's built-in fiat on-ramp. Best for users who don't have crypto yet.
- **Existing USDC** — Send USDC from a wallet they already have (MetaMask, Coinbase, Phantom, etc.). Faster and free of on-ramp fees.
- **Gateway deposit (advanced)** — Move existing on-chain USDC into the Gateway balance for low-latency batched payments. Only useful if the seller they're paying supports Gateway on a specific chain.

**Default recommendation: existing USDC → BASE.** Fastest, lowest friction, and BASE is the most commonly accepted chain across the marketplace.

## Step 2 — Required flags for non-interactive use

The CLI prompts for missing values when run interactively. **Agents are non-interactive**, so every `circle wallet fund` invocation against mainnet MUST include:

- `--address <addr>` — wallet address from `circle wallet list`
- `--chain <chain>` — e.g. `BASE`
- `--method <fiat|crypto>` — without it: `Error: --method is required in non-interactive mode.`
- `--amount <number>` — USDC amount; without it: `Error: --amount is required.`

`--token usdc` is the default and can be omitted, but pass it explicitly when the user asked for USDC specifically.

## Path A — Fiat on-ramp

Opens a fiat on-ramp window in the user's default browser. Funds deposit directly to the wallet on the selected chain.

```bash
circle wallet fund --address <addr> --chain BASE --amount 25 --token usdc --method fiat --open
```

The user completes purchase in the on-ramp window. USDC arrives in the wallet on the selected chain after on-ramp settlement (typically minutes for card, longer for bank transfer).

Verify after the user reports purchase complete:

```bash
circle wallet balance --address <addr> --chain BASE --output json
```

## Path B — Crypto transfer (existing USDC)

The user already holds USDC somewhere (another wallet, an exchange, etc.) and wants to send it to the agent wallet.

### Recommended — browser-rendered QR (best UX)

```bash
circle wallet fund --address <addr> --chain BASE --amount 10 --token usdc --method crypto --open
```

`--open` renders the EIP-681 QR code on a local HTML page in the user's default browser. Use this by default. **Terminal-rendered QR codes are frequently truncated or unscannable** inside agent UIs (Claude Code, Codex, etc.); the browser page renders the QR at full resolution and works on both desktop and mobile.

The user scans the QR with any mobile wallet (MetaMask, Coinbase Wallet, Rainbow, Phantom) and confirms the transfer.

### Alternative — save the QR as a PNG file

```bash
circle wallet fund --address <addr> --chain BASE --amount 10 --token usdc --method crypto --export ~/Downloads
```

### Alternative — manual transfer (no QR)

Provide the user the raw transfer details:

- Destination: the wallet address from `circle wallet list`
- Token: USDC
- Network: BASE (chain ID 8453)
- USDC contract on BASE: `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`

For other chains, look up the USDC contract address at https://developers.circle.com/stablecoins/usdc-contract-addresses.

### Verify after transfer

```bash
circle wallet balance --address <addr> --chain BASE --output json
```

## Path C — Gateway deposit (powered by Gateway, advanced)

Only suggest a Gateway deposit when:

- The user has on-chain USDC, AND
- They want to pay a service whose `accepts[]` includes `GatewayWalletBatched` on a specific chain, AND
- That chain is one Gateway supports (Polygon, BASE, ETH, ARB, OP, AVAX, UNI).

### Eco vs direct — pick eco unless one of four conditions holds

`circle gateway deposit --method eco` deposits BASE vanilla USDC into Gateway and **lands on Polygon** (Gateway domain 7) in ~30-50s for a $0.03 flat fee. The follow-up payment is `pay --chain MATIC`.

Use `--method direct` **only** when:

1. **The user explicitly asked for direct** — e.g. "deposit on BASE without going to Polygon", "stay on BASE", "use direct deposit". Implicit preferences and your own inferences do not count.
2. **The source chain isn't supported by eco** — eco only supports BASE as a source today; check `circle gateway deposit --help` for the current list. Trying an unsupported source returns "Unknown method" or chain-not-supported.
3. **The seller does NOT accept Gateway on Polygon** — verify by reading the seller's raw 402 `accepts[]` (not `circle services inspect`). Eco lands on Polygon, so if the seller can't pay there, the Gateway balance won't be reachable for this payment.
4. **The user already has vanilla on a fast chain the seller accepts** — `direct --chain <fast-chain>` is ~8s and skips the eco fee. (e.g., user has 5 USDC vanilla on Polygon → `direct --chain MATIC`.)

If none of conditions 1–4 holds, **the answer is eco**. Picking direct anyway costs the user 13–19 minutes of finality wait + gas vs eco's ~30-50s + $0.03.

### Compare per-workflow, not per-call

The cold-start cost of eco (~30-50s deposit + $0.03 fee) is paid **once**. After that, every Gateway-supported call is <500ms. Vanilla x402 has no deposit, but every call costs ~2s plus facilitator overhead, forever, with no amortization. Agentic workflows are almost never single-call. For any multi-call task, treat the deposit as wallet onboarding, not as a per-call optimization. Pure time breakeven lands at roughly N=7-13 calls (vanilla `30 + 2N` vs eco `30-50 + 0.5N` across the realistic timing range), but the immediate wins land at call 1: Gateway-only seller access, wallet onboarding for every future call (each <500ms), and amortizing a single $0.03 fee.

### Eco deposit (BASE → Polygon)

```bash
# Deposit (--amount, --address, --chain, --method are all required)
circle gateway deposit --amount 10 --address <addr> --chain BASE --method eco

# Verify (Gateway balance shows Polygon in the per-chain breakdown)
circle gateway balance --address <addr> --chain BASE --output json

# If the wallet hasn't been used on the destination chain yet, the first
# payment / transfer on that chain will deploy it. There is no dedicated
# "deploy" command — consult `circle wallet --help` for current options.
```

Once the deposit verifies, hand off to the `pay-via-agent-wallet` skill for the actual payment — that skill owns the `circle services pay` flow (including its allowed-tools whitelist and gotchas).

**Common mistake:** using `--chain BASE` on the `pay` call when the Gateway balance landed on Polygon. The chain on `pay` must match where the balance lives.

### Direct deposit (same chain, slower for BASE/ETH/L2s)

```bash
circle gateway deposit --amount <amount> --address <addr> --chain MATIC --method direct
```

Supported chains for direct: BASE, MATIC, ETH, ARB, AVAX, OP, UNI. Direct on fast chains (MATIC, AVAX) is ~8s. Direct on slow chains (BASE, ETH, ARB, OP, UNI) is 13–19 minutes — almost always the wrong choice over eco.

## Withdrawing from Gateway

`circle gateway withdraw` is **same-chain only** in v1 — it cannot do cross-chain withdrawals. To move USDC across chains, withdraw same-chain and then bridge with `circle bridge transfer` (the Circle CLI's built-in cross-chain transfer command).

```bash
circle gateway withdraw --amount <amount> --address <addr> --chain <CHAIN>
```

Run `circle gateway withdraw --help` for current flags.

## Troubleshooting

| Error | What it means | Fix |
|---|---|---|
| `Error: --method is required in non-interactive mode.` | Forgot `--method` | Re-run with `--method fiat` or `--method crypto` |
| `Error: --amount is required.` | Forgot `--amount` | Re-run with `--amount <number>` (USDC amount) |
| Terminal QR truncated or unscannable | Agent UIs can't render QR codes reliably | Re-run with `--open` (browser QR) or `--export ~/Downloads` (PNG file) |
| `Wallet not deployed` | First tx on this chain — SCA needs deployment | Trigger deployment by performing any real transaction from this wallet on this chain — typically the deposit / transfer step in this skill, or a normal payment via `pay-via-agent-wallet`. There is no dedicated "deploy" command today; consult `circle wallet --help` for current options. |
| `Insufficient balance` | Not enough USDC on the picked chain | Check both pools — `circle wallet balance` (vanilla) and `circle gateway balance` (Gateway) — verify correct chain |
| Eco deposit settled but `pay` errors with "no Gateway balance on BASE" | Eco lands on **Polygon**, not BASE | Re-run `pay` with `--chain MATIC` |
| `Cross-chain withdraw (--destination) is not yet supported` | Tried `gateway withdraw --destination` | v1 is same-chain only — withdraw same-chain, then `circle bridge transfer` |

## Rules

- NEVER prompt users to send USDC to addresses you generated. ALWAYS use the user's own wallet from `circle wallet list`.
- NEVER store, log, or display private keys.
- ALWAYS pass `--method <fiat|crypto>` to `circle wallet fund` — agents are non-interactive and the CLI will not prompt.
- ALWAYS pass `--amount <number>` to `circle wallet fund` — confirm the amount with the user first.
- ALWAYS prefer `--method crypto --open` over rendering QR codes in the terminal — terminal QR codes get truncated inside Claude Code, Codex, and similar agent UIs and become unscannable.
- For fiat: use `--method fiat --open` so the on-ramp loads in the browser.
- NEVER suggest a Gateway eco deposit unless you have verified the target service supports Gateway on Polygon via the discovery API or the seller's raw 402 `accepts[]`.
- NEVER deposit 100% of the user's vanilla balance into Gateway. The wallet needs vanilla headroom for vanilla-only sellers the user may hit next.
- Sizing formula: `amount = max(price × N + fee + slack, Gateway minimum)`, where N is the workflow's expected call count. Typically reserve ~50% of vanilla as a soft headroom floor. Gateway enforces a server-side minimum deposit; sizing below it returns an error, so floor your suggestion to that minimum. Run `circle gateway deposit --help` for current bounds.
- Surface to the user before depositing when the required amount is materially larger than the workflow's total cost (cheap-endpoint case: $0.0024/call × 5 = $0.012, but the Gateway minimum sets the floor) or above the user's stated `--max-amount` cap. Don't silently deposit ~100× the task cost.
- The first real transaction on a new chain deploys the SCA — there is no dedicated "deploy" command today. Consult `circle wallet --help` for the current options if a `Wallet not deployed` error appears.
- ALWAYS use `--chain` matching where the balance lives. Eco lands on Polygon → `pay --chain MATIC`. Direct lands on the source chain → `pay --chain <same>`.
- Gateway does NOT do cross-chain transfers at payment time. Source chain matters.
- Abstract chain details from the user unless they explicitly want technical specifics. The user asked to fund the wallet; they don't need a tour of EVM finality.

## Reference Links

- Full funding walkthrough (mainnet vs testnet, eco-vs-direct deep dive): https://agents.circle.com/skills/wallet-fund.md
- USDC contract addresses by chain: https://developers.circle.com/stablecoins/usdc-contract-addresses.md
- Circle Gateway supported chains and finality times: https://developers.circle.com/gateway/references/supported-blockchains
- Circle Developer Docs: https://developers.circle.com/llms.txt

## Alternatives

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

For cross-chain USDC moves the agent should use **`circle bridge transfer`** directly — it is part of the Circle CLI and is referenced in the "Withdrawing from Gateway" section above.

---

DISCLAIMER: This skill is provided "as is" without warranties, is subject to the [Circle Developer Terms](https://console.circle.com/legal/developer-terms), and output generated may contain errors and/or include fee configuration options (including fees directed to Circle); additional details are in the repository [README](https://github.com/circlefin/skills/blob/master/README.md).
