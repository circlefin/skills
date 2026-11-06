# Cost preview without paying

```bash
circle services pay "<service-url>" --address <addr> --chain <CHAIN> --estimate
```

Returns price, chain, scheme, and seller without signing or settling. `--address` and `--chain` are still required, but the estimate skips the balance and chain-match checks, so it does not prove the payment will succeed on that chain.
