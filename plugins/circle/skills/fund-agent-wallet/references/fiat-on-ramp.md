# Path A — Fiat on-ramp

Opens a fiat on-ramp window in the user's default browser. Funds deposit directly to the wallet on the selected chain.

```bash
circle wallet fund --address <addr> --chain ARC --amount 25 --token usdc --method fiat --open
```

The user completes purchase in the on-ramp window. USDC arrives in the wallet on the selected chain after on-ramp settlement (typically minutes for card, longer for bank transfer).

Verify after the user reports purchase complete:

```bash
circle wallet balance --address <addr> --chain ARC --output json
```
