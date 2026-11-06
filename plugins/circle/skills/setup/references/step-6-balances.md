Check each wallet's balance (use the addresses from Step 5):

```bash
circle wallet balance --address '<addr>' --chain ARC --output json
```

**If no wallet has USDC funds:**

Ask the user: "Your wallet doesn't have any USDC yet. Would you like to fund it now?"

- **If yes**: Route to the wallet funding skill:
  ```bash
  curl -sL https://agents.circle.com/skills/wallet-fund.md
  ```
  Follow the instructions from the wallet-fund skill exactly as written.
- **If no**: Proceed to service discovery (Step 7)
