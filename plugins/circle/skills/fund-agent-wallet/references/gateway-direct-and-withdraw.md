# Gateway direct deposit and withdrawals

## Direct deposit (same chain, slower for BASE/ETH/L2s)

```bash
circle gateway deposit --amount <amount> --address <addr> --chain MATIC --method direct
```

Supported chains and finality: Arc (sub-second); MATIC, AVAX (~8s); BASE, ARB, OP, UNI (13–19 minutes). ETH is listed in `--help`, but CLI 1.2.2 rejects it for direct deposit and agent withdraw.

## Withdrawing from Gateway

`circle gateway withdraw` is **same-chain only** in v1. To move USDC across chains, withdraw same-chain, then bridge with `circle bridge transfer`.

```bash
circle gateway withdraw --amount <amount> --address <addr> --chain <CHAIN>
```

Run `circle gateway withdraw --help` for current flags.
