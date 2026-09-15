# Eco deposit (BASE → Polygon)

```bash
# Deposit (--amount, --address, --chain, --method are all required)
circle gateway deposit --amount 10 --address <addr> --chain BASE --method eco

# Verify (Gateway balance shows Polygon in the per-chain breakdown)
circle gateway balance --address <addr> --chain BASE --output json
# First payment/transfer on a new chain auto-deploys the wallet (see Troubleshooting).
```
