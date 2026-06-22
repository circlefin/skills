# Funding troubleshooting

| Error | What it means | Fix |
|---|---|---|
| `Error: --method is required in non-interactive mode.` | Forgot `--method` | Re-run with `--method fiat` or `--method crypto` |
| `Error: --amount is required.` | Forgot `--amount` | Re-run with `--amount <number>` (USDC amount) |
| Terminal QR truncated or unscannable | Agent UIs can't render QR codes reliably | Re-run with `--open` (browser QR) or `--export ~/Downloads` (PNG file) |
| `Wallet not deployed` | First tx on this chain — SCA needs deployment | Trigger deployment by performing any real transaction from this wallet on this chain — typically the deposit / transfer step in this skill, or a normal payment via `pay-via-agent-wallet`. There is no dedicated "deploy" command today; consult `circle wallet --help` for current options. |
| `Insufficient balance` | Not enough USDC on the picked chain | Check both pools — `circle wallet balance` (vanilla) and `circle gateway balance` (Gateway) — verify correct chain |
| Eco deposit settled but `pay` errors with "no Gateway balance on BASE" | Eco lands on **Polygon**, not BASE | Re-run `pay` with `--chain MATIC` |
| `Cross-chain withdraw (--destination) is not yet supported` | Tried `gateway withdraw --destination` | v1 is same-chain only — withdraw same-chain, then `circle bridge transfer` |

## Reference links

- Full funding walkthrough (mainnet vs testnet, eco-vs-direct deep dive): https://agents.circle.com/skills/wallet-fund.md
- USDC contract addresses by chain: https://developers.circle.com/stablecoins/usdc-contract-addresses.md
- Circle Gateway supported chains and finality times: https://developers.circle.com/gateway/references/supported-blockchains
- Circle Developer Docs: https://developers.circle.com/llms.txt
