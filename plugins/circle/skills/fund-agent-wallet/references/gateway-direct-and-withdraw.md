#### Direct deposit (same chain, slower for BASE/ETH/L2s)

```bash
circle gateway deposit --amount <amount> --address <addr> --chain ARC --method direct
```

Use `--chain ARC` by default. When a direct condition names another chain (the user's USDC is already there, or the seller takes Gateway only there), pass that chain instead.

Supported chains and finality: Arc (sub-second); MATIC, AVAX (~8s); BASE, ARB, OP, UNI (13–19 minutes). If the CLI rejects a chain for a direct deposit or withdraw, its error lists the chains it supports.

#### Withdrawing from Gateway

`circle gateway withdraw` is **same-chain only** in v1. To move USDC across chains, withdraw same-chain, then bridge with `circle bridge transfer`.

```bash
circle gateway withdraw --amount <amount> --address <addr> --chain <CHAIN>
```

Run `circle gateway withdraw --help` for current flags.
