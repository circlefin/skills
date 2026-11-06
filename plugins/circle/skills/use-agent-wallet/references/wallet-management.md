# Wallet management

## Step 4 — List or create the agent wallet

```bash
circle wallet list --chain ARC --type agent --output json
```

If wallets exist, save the address(es) for Step 5. Only if none exist, or the user explicitly wants another set — `create` makes a new wallet on every supported EVM chain, so confirm that scope first:

```bash
circle wallet create --output json
```

Creates agent-controlled SCA wallets on each supported EVM chain, capped at 5 agent wallets per chain. Output shape:

```text
{ "data": { "wallets": [{ "type", "address", "blockchain", "createDate" }, ...] } }
```

Read `address` and `blockchain` from each entry to save per-chain addresses.

## Step 5 — Check wallet balance

```bash
circle wallet balance --address <addr> --chain ARC --output json
```
