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

## Retry-safety checks

For an endpoint that supports retries, use its integration-test buyer to send a
stable application idempotency key and verify all of these cases before launch:

1. Send a paid request, discard the client-visible response, and retry the same
   method, path, body, and idempotency key.
2. Confirm that the seller records one settlement and one application side
   effect, and that the retry returns the stored result or an explicit
   in-progress response.
3. Send two matching requests concurrently and confirm the durable claim lets
   at most one request proceed to settlement.
4. Reuse the key with a different body, price, or payment terms and confirm the
   server rejects it without settling.
5. Restart the server between the first attempt and the retry. Confirm the
   result is unchanged; this catches process-local idempotency stores.

Do not run these cases on mainnet first. Use testnet, cap the buyer's spend, and
compare the seller's settlement records or Gateway receipts before and after
each case. A repeated HTTP response is not enough evidence by itself; the test
must prove that only one payment was accepted.
