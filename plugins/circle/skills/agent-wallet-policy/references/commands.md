# Spending-policy commands

Verbatim command examples for the agent-wallet spending-policy flow. See `SKILL.md` for the full workflow, when to run each command, and the OTP-handling rules. Both commands below are read-only — no money moves, no OTP.

## Prerequisites (session check + wallet address)

Confirm the CLI session is healthy and get the wallet address before viewing or changing limits:

```bash
# Confirm session is good
circle wallet status

# Get the wallet address
circle wallet list --chain ARC --type agent --output json
```

If `circle wallet status` errors with "Not logged in" or "Terms acceptance is required", hand off to the `use-agent-wallet` skill — it covers install, terms, login, and wallet creation.

## Verify limits after a change (in-agent, no OTP)

After the user reports a `set` or `reset` completed, run the read-only limit command to confirm the new caps, then surface them to the user:

```bash
circle wallet limit --address <addr> --chain ARC --output json
```
