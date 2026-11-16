#### How USDC moves between chains

- **Gateway balance is per chain.** A payment draws only on the Gateway balance for its `--chain`; balances on other chains are not pooled at payment time. When another chain the seller accepts is funded, the CLI's error hint names it (`Retry with --chain X`).
- **`circle gateway withdraw` is same-chain only.** The withdrawn USDC is minted on `--chain`. Passing `--destination` fails with `Cross-chain withdraw (--destination) is not yet supported.` To move Gateway USDC to another chain, withdraw on its chain, then bridge (Workflow A).
- **`circle bridge transfer <toChain>` moves wallet USDC across chains** through CCTP in ~8-20s. Circle mints on the destination, so the wallet needs no gas or funds there. `--amount` is what arrives; the source burns that plus a small fee.
- Withdraws also charge a small fee. Withdraw enough to cover the price, the bridge fee, and some slack.

Run `circle gateway withdraw --help` and `circle bridge transfer --help` for exact flags and output.

#### Workflow A — Gateway on Y, vanilla-only seller on X

```bash
circle gateway withdraw --amount <price+fees+slack> --address <addr> --chain <Y>
circle bridge transfer <X> --amount <price> --address <addr> --chain <Y>
circle services pay '<service-url>' -X '<METHOD>' --address '<addr>' --chain '<X>' --output json
```

#### Workflow B — Gateway on X, vanilla-only seller on X

```bash
circle gateway withdraw --amount <price+fee+slack> --address <addr> --chain <X>
circle services pay '<service-url>' -X '<METHOD>' --address '<addr>' --chain '<X>' --output json
```

#### Workflow C — Gateway-only seller on X, Gateway on Y

Rare: most sellers that offer Gateway also list vanilla on the same chain. Confirm from the seller's full `accepts[]`, not the inspect summary.

First check the Gateway balance on Y covers the deposit (at least 0.5 USDC) plus fees. If it doesn't, fund the wallet instead: use the installed `fund-agent-wallet` skill; if it isn't installed, fetch `https://agents.circle.com/skills/wallet-fund.md`.

```bash
circle gateway withdraw --amount <deposit+fees+slack> --address <addr> --chain <Y>
circle bridge transfer <X> --amount <deposit> --address <addr> --chain <Y>
circle gateway deposit --amount <deposit> --address <addr> --chain <X> --method direct
circle services pay '<service-url>' -X '<METHOD>' --address '<addr>' --chain '<X>' --output json
```

A direct deposit on a slow chain waits ~13-19 minutes, so ask the user before choosing one.

#### Deposit sizing

- `deposit = max(price × N + fee + slack, 0.5 USDC)`, where N is the workflow's expected number of paid calls and 0.5 USDC is the CLI's minimum Gateway deposit.
- Keep about 50% of the wallet's vanilla USDC out of Gateway as headroom for vanilla-only sellers. NEVER deposit all of it; "don't deposit everything" is not "don't deposit at all".
- Ask the user first when the deposit is much larger than the workflow's total cost (the minimum dwarfs a cheap task) or above their stated cap.
