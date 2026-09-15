# Prerequisites — verify the agent wallet

This skill assumes the agent wallet is already bootstrapped. Quickly verify:

```bash
circle wallet status
circle wallet list --chain ARC --type agent --output json
```

If `circle wallet status` errors with `Not logged in` or `Terms acceptance is required`, hand off to the `use-agent-wallet` skill — it covers install, terms, login, and wallet creation.

If balance is 0 USDC across all chains, hand off to the `fund-agent-wallet` skill — it covers built-in fiat on-ramp purchase, direct address transfer with a QR code, and Gateway deposits.
