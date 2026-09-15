# Gateway direct deposit and withdrawals

## Direct deposit (same chain, slower for BASE/ETH/L2s)

```bash
circle gateway deposit --amount <amount> --address <addr> --chain MATIC --method direct
```

Supported chains for direct: Arc, BASE, MATIC, ETH, ARB, AVAX, OP, UNI. Direct on fast-finality chains (Arc, MATIC, AVAX) is fast — Arc settles sub-second, MATIC/AVAX ~8s. Direct on slow chains (BASE, ETH, ARB, OP, UNI) is 13–19 minutes — almost always the wrong choice over eco. On Arc, direct is the natural path (fast, USDC-native gas); eco is a BASE-source-only shortcut and does not apply to Arc.

## Withdrawing from Gateway

`circle gateway withdraw` is **same-chain only** in v1 — it cannot do cross-chain withdrawals. To move USDC across chains, withdraw same-chain and then bridge with `circle bridge transfer` (the Circle CLI's built-in cross-chain transfer command).

```bash
circle gateway withdraw --amount <amount> --address <addr> --chain <CHAIN>
```

Run `circle gateway withdraw --help` for current flags.
