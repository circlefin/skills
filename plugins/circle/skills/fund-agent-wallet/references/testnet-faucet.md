Testnet wallets are funded from the Circle faucet, not the on-ramp or a QR. Use ARC-TESTNET (chain ID 5042002) unless the user names another testnet chain:

```bash
circle wallet fund --address <addr> --chain ARC-TESTNET
```

- The faucet needs a testnet agent session, separate from the mainnet one; `circle wallet status` shows both. If the testnet section is not logged in, the CLI asks for `circle wallet login <email> --type agent --testnet`. For the login steps, use the installed `use-agent-wallet` skill; if it isn't installed, fetch `https://agents.circle.com/skills/wallet-login.md`.
- Do not pass `--method`, `--open`, `--no-open`, or `--export`; the faucet rejects them. `--amount` is ignored.
- Get the testnet address with `circle wallet list --chain ARC-TESTNET --type agent --output json`.

Verify on the same chain:

```bash
circle wallet balance --address <addr> --chain ARC-TESTNET --output json
```
