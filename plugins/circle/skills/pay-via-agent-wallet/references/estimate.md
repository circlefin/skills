# Cost preview without paying

```bash
circle services pay "<service-url>" --address <addr> --chain <CHAIN> --estimate
```

Returns price, chain, scheme, and seller without signing or settling. `--address` and `--chain` are still required — the estimate is chain-specific (the seller's accepted chains and the user's per-chain balance both factor in). Useful when the user wants confirmation before authorizing payment.
