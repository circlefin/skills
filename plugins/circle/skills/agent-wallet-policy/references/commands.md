### Session check and wallet address

Confirm the CLI session is healthy and get the wallet address before viewing or changing limits. Both commands are read-only — no money moves, no OTP.

```bash
# Confirm session is good
circle wallet status

# Get the wallet address
circle wallet list --chain ARC --type agent --output json
```
