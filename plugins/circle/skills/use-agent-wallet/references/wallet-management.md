# Wallet management

Detailed command reference for checking, creating, and inspecting the agent wallet. See `../SKILL.md` for the overall bootstrap workflow and decision logic.

## Step 4 — Check or create the agent wallet

**The `--chain` flag is REQUIRED for `circle wallet list` and `circle wallet balance`.** Use ARC as the default if the user hasn't specified a chain.

```bash
circle wallet list --chain ARC --type agent --output json
```

If wallets already exist, save the address(es) for the next step.

If no agent wallets exist:

```bash
circle wallet create --output json
```

Creates agent-controlled SCA wallets on each supported EVM chain. The JSON output is an array of `{ chain, address, ... }` objects — read the `address` field to save per-chain addresses for Step 5.

## Step 5 — Check wallet balance

Use the address(es) from Step 4:

```bash
circle wallet balance --address <addr> --chain ARC --output json
```

If balance is 0 USDC and the user wants to pay for services, hand off to the `fund-agent-wallet` skill — it covers built-in fiat on-ramp purchase, direct address transfer with a QR code, and Gateway deposits.

If the user only wants to verify state (not pay yet), stop here. Bootstrap is complete.
