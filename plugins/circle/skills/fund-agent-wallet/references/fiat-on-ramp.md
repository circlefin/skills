Opens a fiat on-ramp (Transak) window in the user's default browser; USDC is deposited directly to the wallet on the selected chain. Supported `--chain` values: ARC, ETH, MATIC, BASE, ARB, OP. For AVAX, UNI, or MONAD, use Path B.

```bash
circle wallet fund --address <addr> --chain ARC --amount 25 --token usdc --method fiat --open
```

Use `--no-open` instead of `--open` only if the user explicitly asks for the on-ramp URL without launching a browser.

The user completes the purchase in the on-ramp window. USDC arrives after on-ramp settlement (typically minutes for card, longer for bank transfer).

Verify on the chain you passed to `--chain` after the user reports the purchase complete:

```bash
circle wallet balance --address <addr> --chain ARC --output json
```
