# Path A — Fiat on-ramp

Opens a fiat on-ramp window in the user's default browser; USDC is deposited directly to the wallet on the selected chain. Supported `--chain` values: ARC, ETH, MATIC, BASE, ARB, OP. For AVAX, UNI, or MONAD, use Path B.

```bash
circle wallet fund --address <addr> --chain ARC --amount 25 --token usdc --method fiat --open
```

The user completes the purchase in the on-ramp window. USDC arrives after on-ramp settlement (typically minutes for card, longer for bank transfer).

Verify after the user reports the purchase complete:

```bash
circle wallet balance --address <addr> --chain ARC --output json
```
