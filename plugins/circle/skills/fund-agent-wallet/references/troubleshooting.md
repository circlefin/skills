| Error | What it means | Fix |
| --- | --- | --- |
| `Error: --method is required in non-interactive mode.` | Forgot `--method` | Re-run with `--method fiat` or `--method crypto` |
| `Error: --amount is required.` | Forgot `--amount` | Re-run with `--amount <number>` (USDC amount) |
| `--method is not valid on testnet.` / `--export, --open, and --no-open are not valid on testnet.` | Passed mainnet flags to the testnet faucet | Re-run as `circle wallet fund --address <addr> --chain ARC-TESTNET` with no other flags |
| `Agent session required to fund on testnet.` | Logged in to mainnet only; testnet has its own session | Log in to testnet first (see Testnet funding), then re-run the faucet command |
| Terminal QR truncated or unscannable | Agent UIs can't render QR codes reliably | Re-run with `--open` (browser QR) or `--export ~/Downloads` (PNG file) |
| `Wallet not deployed` | First tx on this chain — SCA needs deployment | Trigger deployment by performing any real transaction from this wallet on this chain — typically the deposit / transfer step in this skill, or a normal payment via `pay-via-agent-wallet`. There is no dedicated "deploy" command today; consult `circle wallet --help` for current options. |
| `Insufficient balance` | Not enough USDC on the picked chain | Check both pools — `circle wallet balance` (vanilla) and `circle gateway balance` (Gateway) — verify correct chain |
| Eco deposit settled but `pay --chain BASE` errors `Insufficient Gateway balance for <amount> payment. Current balances: Arc: <n> USDC.` | Eco lands on **Arc**, not BASE | Re-run `pay` with `--chain ARC` |
| `Cross-chain withdraw (--destination) is not yet supported` | Tried `gateway withdraw --destination` | v1 is same-chain only — withdraw same-chain, then `circle bridge transfer` |

### Reference links

- USDC contract addresses by chain: https://developers.circle.com/stablecoins/usdc-contract-addresses.md
- Circle Gateway supported chains and finality times: https://developers.circle.com/gateway/references/supported-blockchains
- Circle Developer Docs: https://developers.circle.com/llms.txt
