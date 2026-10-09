# Eco deposit (BASE → Arc)

```bash
# Deposit (--amount, --address, --chain, --method are all required)
circle gateway deposit --amount 10 --address <addr> --chain BASE --method eco

# Verify (Gateway balance shows Arc in the per-chain breakdown)
circle gateway balance --address <addr> --chain ARC --output json
# First payment/transfer on a new chain auto-deploys the wallet (see Troubleshooting).
```

The deposit's JSON output carries the landing chain in `destinationChain` — use that value on the follow-up `pay` / `gateway balance` call rather than assuming it.
