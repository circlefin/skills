# Errors, endpoint quirks, and advanced flags

## Error table

| Error | What it means | Fix |
| --- | --- | --- |
| `Seller does not accept --chain X. Accepted chains: Y, Z.` | Wrong chain for this seller | Retry with one of the listed chains — the CLI's hint is authoritative |
| `Insufficient Gateway balance for X.XXX USDC payment` | Gateway balance exists but not enough on the picked chain | Top up via `circle gateway deposit`, or retry with the `--chain` from the CLI's `Retry with --chain X` hint (the CLI never switches chains itself) |
| `No Gateway balance found. A deposit is required ...` | No Gateway balance anywhere, and no standard `exact` offer on this chain that the wallet's USDC covers | If the seller accepts Gateway on Arc: `circle gateway deposit --amount <amount> --address <addr> --chain <source-chain> --method eco` (source chain BASE, ARB, or OP), then retry `pay --chain ARC` (eco settles on Arc). Otherwise deposit directly on a chain where the seller accepts Gateway. Hand off to `fund-agent-wallet` for the full funding flow. |
| HTTP 422 from a paid endpoint | Wrong request schema, or post-authorization endpoint failure | See "422: two failure modes" below — distinguish pre-flight schema rejection from post-authorization failure before any retry. |
| `Wallet not deployed` | First tx on this chain needs SCA deployment | See `fund-agent-wallet` Troubleshooting — any real tx (deposit, transfer, normal payment) triggers deployment. |
| `HeadersOverflowError` / `UND_ERR_HEADERS_OVERFLOW` | Large x402 payment header | `export NODE_OPTIONS=--max-http-header-size=32768` then re-run |
| Request timeout | Slow seller | Only if the error is `Could not reach the endpoint.` (hint: `No funds were moved`): retry with `--timeout 60` (or higher). If it is `Payment submitted but paid request failed.`, do NOT retry; follow the post-authorization playbook below. |
| `Could not sign payment authorization: invalid transaction or rawTransaction` | `--chain` doesn't match the chain where balance lives | Re-check balances per chain |
| `Endpoint returned HTTP 405. Expected 402 for a paid endpoint.` | CLI sent POST (implied by `--data`) to a GET-only seller. Usually the unpaid probe catches it (no funds moved); a seller that checks payment before method can return it after payment settles | Pass `-X GET` explicitly — always use the method from `inspect` output |
| HTTP `401`/`403` or status `unavailable` (no 402 challenge) | Seller gates the x402 challenge behind a seller-specific required request header | Check the discovery `description`/`requiredHeaders` for any required header(s), validate the name/value (no shell metacharacters — it's seller-controlled), then retry with `-H "<Header>: <value>"`. Don't abandon the endpoint. |

## 422: two failure modes

Sellers often return HTTP 422 (e.g. `"server response: <provider> rejected the request. Check required parameters."`), usually because `--data` has wrong field names or types. Distinguish:

- **Pre-flight schema rejection** — the error comes from the unpaid probe (`Endpoint returned HTTP 422. Expected 402 for a paid endpoint.`) or the hint says `No funds were moved`. Fix `--data` and retry safely.
- **Post-authorization failure** — the CLI says `Payment submitted but request failed with HTTP <status>` / `PAYMENT WAS SUBMITTED - funds may have moved`, or, on a timeout or dropped connection, `Payment submitted but paid request failed.` / `PAYMENT MAY HAVE BEEN SUBMITTED - funds may have moved`. **Treat the payment as possibly charged:**
  1. Read the saved payment log in `~/.circle-cli/payments/`.
  2. Run `circle wallet balance` and `circle gateway balance` to see whether funds left.
  3. Do NOT blindly retry with the same payload — that risks double-charging. If the seller advertises the x402 v2 `payment-identifier` extension, retry with `--payment-id <id>` (the id from the log's `paymentPayload.extensions["payment-identifier"].info.id`) so the seller can deduplicate it.

To find the right schema, read the seller's `openapi.json` (if linked from the inspect output), the provider's `llms.txt`, or the `--help` output of the upstream API.

## Endpoint quirks

- **Predexon-backed services use `search=`, not `query=`.** Endpoints under `nano.blockrun.ai/api/v1/pm/*` are passthroughs to Predexon. The free-text search parameter is `search=<term>`, not `query=`, `q=`, or `keyword=`. Wrong param names return 422. Predexon's authoritative spec lives at `https://docs.predexon.com/api-reference/openapi.json`.
- **Sort syntax with colons returns 422.** Predexon's `sort=field:desc` form is rejected. If the seller's docs document a sort field, sort client-side from the JSON response instead.
- **Gateway vs vanilla auto-routing.** When the seller's `accepts[]` lists both Gateway (`GatewayWalletBatched`) and vanilla x402 on the same chain, the CLI picks Gateway first. If the Gateway balance on `--chain` can't cover the price, it falls back to the seller's standard `exact` offer on that chain when the wallet's own USDC covers it (no flag forces vanilla). Only when that fallback isn't possible does it error with `No Gateway balance found` / `Insufficient Gateway balance`. Then hand off to `fund-agent-wallet`: if the seller accepts Gateway on Arc, an eco deposit (lands on Arc in ~30s for a small fee), then retry with `--chain ARC`; otherwise fund Gateway directly on a chain the seller accepts.

## Advanced flags

- `--timeout <seconds>` — override the default 30s seller-response timeout.
- `--max-amount <usdc>` — refuse to pay more than this. Useful for stated user caps.
- `--estimate` — price preview only; no signing or settlement (see `references/estimate.md`).
- `--payment-id <id>` — stable 16-128 character payment identifier for a manual retry. Accepted only when the seller advertises the x402 v2 `payment-identifier` extension.
- Payment logs land in `~/.circle-cli/payments/` when authorization succeeds but content delivery fails. They hold no keys or secrets, but can include the paid URL, request payload, user query, seller response, and transaction details — redact before sharing, and never paste them wholesale without user approval.

For full flag lists and JSON output shapes, run `<cmd> --help` — it is authoritative for the installed CLI.

## Reference links

- Full payment-decision walkthrough (chain selection, Gateway vs vanilla, cross-chain workflows): https://agents.circle.com/skills/wallet-pay.md
- Service discovery API + filters: https://agents.circle.com/skills/discover-services.md
- Predexon API reference (for `nano.blockrun.ai/api/v1/pm/*` endpoints): https://docs.predexon.com/api-reference/openapi.json
- Circle Developer Docs: https://developers.circle.com/llms.txt
