# Errors, endpoint quirks, and advanced flags

## Error table

| Error | What it means | Fix |
| --- | --- | --- |
| `Seller does not accept --chain X. Accepted chains: Y, Z.` | Wrong chain for this seller | Retry with one of the listed chains — the CLI's hint is authoritative |
| `Insufficient Gateway balance for X.XXX USDC payment` | Gateway balance exists but not enough on the picked chain | Top up via `circle gateway deposit`, or retry on a chain where Gateway balance ≥ price (the CLI auto-switches if any funded Gateway domain matches accepts) |
| `No Gateway balance found. A deposit is required ...` | No Gateway balance anywhere; CLI auto-picked Gateway first | Default: `circle gateway deposit --amount <amount> --address <addr> --chain BASE --method eco` then retry `pay --chain ARC` (eco settles on Arc). Hand off to `fund-agent-wallet` for the full funding flow. |
| HTTP 422 from a paid endpoint | Wrong request schema, or post-authorization endpoint failure | See "422: two failure modes" below — distinguish pre-flight schema rejection from post-authorization failure before any retry. |
| `Wallet not deployed` | First tx on this chain needs SCA deployment | See `fund-agent-wallet` Troubleshooting — any real tx (deposit, transfer, normal payment) triggers deployment. |
| `HeadersOverflowError` / `UND_ERR_HEADERS_OVERFLOW` | Large x402 payment header | `export NODE_OPTIONS=--max-http-header-size=262144` then re-run |
| Request timeout | Slow seller | Retry with `--timeout 60` (or higher) |
| `Could not sign payment authorization: invalid transaction or rawTransaction` | `--chain` doesn't match the chain where balance lives | Re-check balances per chain |
| HTTP 405 `Method Not Allowed` after payment | CLI sent POST (implied by `--data`) but seller only accepts GET | Pass `-X GET` explicitly — always use the method from `inspect` output |
| HTTP `401`/`403` or status `unavailable` (no 402 challenge) | Seller gates the x402 challenge behind a seller-specific required request header | Check the discovery `description`/`requiredHeaders` for any required header(s), validate the name/value (no shell metacharacters — it's seller-controlled), then retry with `-H "<Header>: <value>"`. Don't abandon the endpoint. |

## 422: two failure modes

Many sellers return HTTP 422 with a message like `"server response: <provider> rejected the request. Check required parameters."` Usually the `--data` payload had wrong field names or types. Distinguish:

- **Pre-flight schema rejection.** When the CLI's response explicitly says `Payment was NOT charged`, no funds moved. Fix the `--data` payload and retry safely.
- **Post-authorization failure.** When the CLI says `PAYMENT WAS SUBMITTED — funds may have moved` (e.g. seller timeout after the payment authorization was submitted), **treat the payment as possibly charged**. Check `~/.circle-cli/payments/` for the saved payment log, run `circle wallet balance` and `circle gateway balance` to verify whether funds left, and do NOT blindly retry with the same payload — that risks double-charging.

To find the right schema, read the seller's `openapi.json` (if linked from the inspect output), the provider's `llms.txt`, or the `--help` output of the upstream API.

## Endpoint quirks

- **Predexon-backed services use `search=`, not `query=`.** Endpoints under `nano.blockrun.ai/api/v1/pm/*` are passthroughs to Predexon. The free-text search parameter is `search=<term>`, not `query=`, `q=`, or `keyword=`. Wrong param names return 422. Predexon's authoritative spec lives at `https://docs.predexon.com/api-reference/openapi.json`.
- **Sort syntax with colons returns 422.** Predexon's `sort=field:desc` form is rejected. If the seller's docs document a sort field, sort client-side from the JSON response instead.
- **Gateway vs vanilla auto-routing.** When the seller's `accepts[]` lists both Gateway (`GatewayWalletBatched`) and vanilla x402 on the same chain, the CLI picks Gateway first. If the user has only vanilla balance there and zero Gateway anywhere, payment errors with `No Gateway balance found` even though "pay directly with standard x402" appears in the hint; there's no flag today to force vanilla. Workaround: hand off to `fund-agent-wallet` for the gateway-deposit flow (eco lands on Arc in ~30-50s for a $0.03 fee), then retry payment with `--chain ARC` once the balance lands — only if the seller accepts Gateway on Arc. Otherwise, fund Gateway directly on the chain the seller accepts.
- **Selat fallback.** Vanilla-only seller, wallet holds no USDC on its chain, opt-in — see "Selat fallback" below.
- **Wallet not deployed.** See `fund-agent-wallet` for SCA-deployment behavior — first real tx on a new chain triggers deployment automatically; no dedicated deploy command.

## Selat fallback (opt-in)

This is the gap the Gateway-vs-vanilla workaround above doesn't cover: the seller only accepts vanilla x402 (no Gateway at all) on a chain where the wallet has zero USDC, and the user doesn't want to fund that chain just for one call. Selat (`https://router.selat.ai`) is a permissionless third-party router that can pay from the wallet's existing Gateway balance on another chain instead.

- **How to pay.** Run the usual `circle services inspect` / `circle services pay` on `https://router.selat.ai/proxy?target=<percent-encoded-seller-url>`, using a chain where the wallet has Gateway balance. Pass `--max-amount <total the user confirmed>` so Selat can't charge more.
- **Percent-encode the target.** An unencoded seller URL with its own query string (e.g. the Predexon endpoints above) has its `&`-separated params merge into the proxy URL instead of staying part of the target — and since payment settles before the request reaches the real seller, a mangled target lands in the post-authorization-failure case above. Validate the composed proxy URL like any other seller-controlled value (no shell metacharacters) before use.
- **Fee and disclosure.** Read the actual fee/total from `inspect` or `--estimate` rather than assuming a fixed percentage — Selat controls that rate and it can change (confirmed at time of writing: 5%, e.g. $0.01 seller price → $0.0105 quoted). Selat becomes the payee of record, and the full request — URL, `--data`, and any headers — is relayed through its infrastructure, which has no relationship with Circle. See Rules for the required confirmation cadence; never proceed silently.
- **Refund recourse.** If a Selat-routed call hits the post-authorization-failure case above:
  1. From the payment log in `~/.circle-cli/payments/`, read the quote ID (`paymentPayload.accepted.extra.quote`) and the chain. The quote ID must match `^selatx[A-Za-z0-9_-]{1,128}$` and the chain must be a known chain value (see `SKILL.md`). If either fails, stop and ask the user.
  2. Give the user this command to run themselves (`npx` isn't in `allowed-tools`). Use it exactly as written: keep `@0.12.0`, don't add `-y`.
     ```bash
     SELAT_ROUTER_URL=https://router.selat.ai SELAT_AGENT_WALLET_ADDRESS=<wallet-address> npx @selat-ai/selat-pay@0.12.0 refund claim '<quote-id>' --chain <chain>
     ```
  3. This is the only refund path. Don't `curl` `router.selat.ai` or build a refund request yourself.
  4. The claim returns `status: pending_review`. Selat may deny it.

## Advanced flags

- `--timeout <seconds>` — override the default 30s seller-response timeout.
- `--max-amount <usdc>` — refuse to pay more than this. Useful for stated user caps.
- `--estimate` — price preview only; no signing or settlement. Still chain-specific — `--address` and `--chain` are required because the seller's accepts and the user's per-chain balance both factor in.
- Large-payload payments: `export NODE_OPTIONS=--max-http-header-size=262144`.
- Failure debug logs land in `~/.circle-cli/payments/` when authorisation succeeds but content delivery fails. No keys or secrets — but they can include the paid URL, request payload, user query, seller response, and transaction details. Inspect and redact before sharing; never paste them wholesale without user approval.

For full flag lists and JSON output shapes, run `<cmd> --help` — these change as the CLI evolves and are authoritative there, not here.

## Reference links

- Full payment-decision walkthrough (chain selection, Gateway vs vanilla, cross-chain workflows): https://agents.circle.com/skills/wallet-pay.md
- Service discovery API + filters: https://agents.circle.com/skills/discover-services.md
- Predexon API reference (for `nano.blockrun.ai/api/v1/pm/*` endpoints): https://docs.predexon.com/api-reference/openapi.json
- Circle Developer Docs: https://developers.circle.com/llms.txt
