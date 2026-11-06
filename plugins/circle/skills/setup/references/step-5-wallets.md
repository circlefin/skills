**CRITICAL: The `--chain` flag is REQUIRED.** Use ARC. If the user is working on testnet, use ARC-TESTNET instead.

Check if wallets already exist for the session:

```bash
circle wallet list --chain ARC --type agent --output json
```

If no agent wallets exist yet, create one:

```bash
circle wallet create
```

This creates agent-controlled wallets on every supported EVM chain, including ARC.

Save the wallet addresses for Step 6.
