**CRITICAL: The `--chain` flag is REQUIRED.** Use ARC. If the user is working on testnet, use ARC-TESTNET instead.

The first login for an email already creates an agent wallet on every supported EVM chain, so this check normally finds one:

```bash
circle wallet list --chain ARC --type agent --output json
```

If no agent wallets exist yet, create them (add `--testnet` on testnet):

```bash
circle wallet create
```

This creates agent-controlled wallets on every supported EVM chain, including ARC.

Save the wallet addresses for Step 6.
