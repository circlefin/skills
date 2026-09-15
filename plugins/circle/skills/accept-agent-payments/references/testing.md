# Testing the Seller Flow

Reference commands for the `accept-agent-payments` skill. See SKILL.md for command safety, network and funds safety, and the approval requirements that apply before running any paid call.

Prove the full seller flow:

```bash
# Unpaid request must return 402 and payment requirements.
curl -i -X POST "https://service.example.com/summarize"

# Inspect should show method, price, schema, accepted chains, and payment scheme.
circle services inspect "https://service.example.com/summarize" --output json

# Confirm whether accepted chains are testnet or mainnet before paying.
# Mainnet paid calls move real USDC and cannot be reversed.

# Estimate before paying when cost, chain, or method is unclear.
circle services pay "https://service.example.com/summarize" \
  -X POST \
  --address <buyer-wallet-address> \
  --chain <CHAIN-FROM-INSPECT-OR-402> \
  --max-amount 0.01 \
  --estimate

# Paid request must return the protected payload.
circle services pay "https://service.example.com/summarize" \
  -X POST \
  --address <buyer-wallet-address> \
  --chain <CHAIN-FROM-INSPECT-OR-402> \
  --max-amount 0.01 \
  --data '{"text":"hello"}' \
  --output json
```

Always pass `-X` from inspect output. If the buyer wallet is not ready, hand off to `use-agent-wallet` or `fund-agent-wallet`; come back when the paid endpoint needs verification.
