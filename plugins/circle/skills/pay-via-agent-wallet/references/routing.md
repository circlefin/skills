# Routing: seller, payment method, and chain

## Pick the seller by task fit

When multiple sellers serve the user's need, **do not** filter to "vanilla-only sellers on the chain I already have balance on" — the most common failure mode this skill exists to prevent. Read every candidate's full `accepts[]` (CLI ≥1.2: `paymentOptions[]` in `circle services inspect --output json`; CLI 1.1.x: the raw 402 via `curl -s "<service-url>"`) and pick the best task fit. Gateway-only sellers are first-class.

## Gateway vs vanilla: treat the first paid call as wallet onboarding

If any task-fit seller you intend to call accepts Gateway on Arc and the user has vanilla USDC on BASE, ARB, or OP, hand off to `fund-agent-wallet` for an eco deposit (~30s plus a small fee, settles on Arc), then pay Gateway-capable calls with `--chain ARC` and vanilla-only sellers with vanilla on a chain they accept. If the seller's Gateway support is limited to another chain (e.g. Polygon only), `fund-agent-wallet` covers depositing directly on that chain.

Never suggest `gateway deposit --method direct` on BASE without verifying one of the four conditions in `fund-agent-wallet` ("Eco vs direct") — eco is the default and saves 12+ minutes of finality wait.

## Picking `--chain`

The seller's `accepts[]` decides which chains are payable. **Don't assume BASE.** A common failure:

```
Error: Seller does not accept --chain BASE. Accepted chains: Polygon.
  Hint: Retry with --chain MATIC — you have <amount> USDC Gateway balance there.
```

Retry with the chain from the CLI's hint — it is authoritative. Many sellers accept only Polygon (`--chain MATIC`) or only Avalanche (`--chain AVAX`).

CLI chain values: `ARC` (Arc), `BASE`, `MATIC` (Polygon), `ETH` (Ethereum), `ARB` (Arbitrum), `OP` (Optimism), `AVAX` (Avalanche), `UNI` (Unichain), `MONAD` (Monad).

## Rationalizations to reject

Seen in real production traces. If your reasoning matches a row, take the skill's path instead.

| Tempting reasoning | Reality |
| --- | --- |
| "One-shot call — a vanilla seller on my current chain saves the small eco fee." | If the best task-fit seller is Gateway-only, deposit and pay it — **even for a single call**. Do NOT redefine "best fit" as cheapest/fastest: the seller was chosen for answer quality, which a small fee and ~30s don't outweigh. Onboarding also pays forward to every future call. |
| "Eco's ~30s wait is slower than vanilla's ~2s per call." | The ~30s is paid once; every later Gateway call is <500ms. Timing is NOT the decision rule. For ANY multi-call workflow, prefer eco: it unlocks Gateway-only sellers and onboards the wallet. Route vanilla-only only when the task is a single call to a vanilla-accepting seller — and see the row above even then. |
| "Locking part of the balance into Gateway is risky." | A $0.50-5 deposit on a ~9 USDC balance leaves most of it vanilla. That's headroom, not lock-out — and Gateway funds can be withdrawn. |
