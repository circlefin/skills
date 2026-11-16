#### Contract allowlist command

For a separate contract allowlist, confirm the wallet, chain, and approved addresses, then hand the user this command for their own terminal. Use ARC by default, or the chain the user requests:

```bash
circle wallet limit set --address <addr> --chain ARC \
  --rule-type contract-allowlist --targets "[<contract-address>]" --output json
```

The policy type is set automatically for contract rules; do not add transfer-limit tier flags. Targets must be nonempty approved addresses. For multiple targets, use `--targets "[<contract-1>,<contract-2>]"`. Keep the transfer limit and add the allowlist as a separate rule without resetting it. Repeat on every chain the agent uses with that chain's approved targets.
