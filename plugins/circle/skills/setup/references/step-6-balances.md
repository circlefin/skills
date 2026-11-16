Check each wallet's balance (use the addresses from Step 5, and ARC-TESTNET on testnet):

```bash
circle wallet balance --address '<addr>' --chain ARC --output json
```

**If no wallet has USDC funds:**

Ask the user: "Your wallet doesn't have any USDC yet. Would you like to fund it now?"

- **If yes**: Use the installed `fund-agent-wallet` skill; if it isn't installed, fetch `https://agents.circle.com/skills/wallet-fund.md`.
- **If no**: Proceed to service discovery (Step 7)
