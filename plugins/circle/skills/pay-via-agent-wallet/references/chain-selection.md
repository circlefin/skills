#### Picking `--chain`

The seller's `accepts[]` decides which chains are payable. **Don't assume BASE.** A common failure:

```
Error: Seller does not accept --chain BASE. Accepted chains: Polygon.
  Hint: Retry with --chain MATIC — you have <amount> USDC Gateway balance there.
```

Retry with the chain from the CLI's hint — it is authoritative. Many sellers accept only Polygon (`--chain MATIC`) or only Avalanche (`--chain AVAX`). The CLI pays only on the `--chain` you pass; it never switches chains itself.

CLI chain values (`circle blockchain list` is authoritative): `ARC` (Arc), `BASE`, `MATIC` (Polygon), `ETH` (Ethereum), `ARB` (Arbitrum), `OP` (Optimism), `AVAX` (Avalanche), `UNI` (Unichain), `MONAD` (Monad).

Before picking, check both balance pools on each chain the seller accepts: wallet USDC (`circle wallet balance --address <addr> --chain <CHAIN>`) and Gateway (`circle gateway balance --address <addr> --chain ARC --all` lists every Gateway chain).

#### Chain speeds

A payment from an existing Gateway balance takes <500ms on any chain. What differs is how long a **direct** deposit takes to become spendable, which decides whether a cold-start Gateway deposit is worth it:

| CLI `--chain` | Gateway domain | Direct deposit to ready | Class |
| --- | --- | --- | --- |
| ARC (Arc) | 26 | ~0.5s | **fast** |
| MATIC (Polygon) | 7 | ~8s | **fast** |
| AVAX (Avalanche) | 1 | ~8s | **fast** |
| BASE | 6 | ~13-19 min | slow |
| ARB (Arbitrum) | 3 | ~13-19 min | slow |
| OP (Optimism) | 2 | ~13-19 min | slow |
| UNI (Unichain) | 10 | ~13-19 min | slow |

- **Eco** (`--method eco`) skips the finality wait: it takes vanilla USDC on BASE, ARB, or OP and lands on Arc (domain 26) in ~30s for a small fee. Pay that balance with `--chain ARC`.
- **ETH** (domain 0) is slow too (a direct deposit waits for Ethereum finality); prefer paying ETH sellers with vanilla USDC. If the CLI rejects a chain for a Gateway deposit or withdraw, its error lists the chains it supports.
- **MONAD** is a CLI chain with no Gateway domain in the CLI; pay Monad sellers with vanilla USDC.
- A vanilla x402 payment settles in one block on its chain (~0.5s on Arc, ~5s on Polygon, ~12s on Ethereum).

**Seller chains the CLI can't pay on yet:** Sonic, Sei, HyperEVM, World Chain, and Solana. A seller may list them in `accepts[]`, and Gateway supports some of them, but the CLI has no `--chain` value for them. Skip those entries and pay on a CLI chain the seller also accepts, or search for another provider.

#### Seller offers × wallet balance

Walk the rows top to bottom and use the first that fits. "Vanilla" means wallet USDC paid through a standard x402 `exact` offer; "Gateway" means a Gateway balance. Pass `-X <METHOD>` on every `pay`.

| Seller offers | Wallet has | Action |
| --- | --- | --- |
| Gateway on any chain X | Gateway ≥ price on X | `pay --chain X` (<500ms) |
| Gateway on ARC | No Gateway yet; vanilla on BASE, ARB, or OP | Eco deposit from that chain (~30s, lands on Arc), then `pay --chain ARC` |
| Gateway on fast chain F | No Gateway yet; vanilla on F | `gateway deposit --chain F --method direct` (~0.5-8s, no eco fee), then `pay --chain F` |
| Gateway on fast chain F; no vanilla on Y | No Gateway yet; vanilla only on Y (Y≠F), at least the deposit size, e.g. an ARC-funded wallet and a Polygon-only Gateway seller | `bridge transfer F --amount … --chain Y`, then `gateway deposit --chain F --method direct`, then `pay --chain F` |
| Gateway and vanilla on X | No Gateway on X; vanilla ≥ price on X | `pay --chain X`: the CLI tries Gateway first, then falls back to the seller's `exact` offer from wallet USDC (not `upto` or Permit2 offers). For a multi-call workflow, onboard the wallet to Gateway instead (see the routing rules) |
| Vanilla only on X | Vanilla ≥ price on X | `pay --chain X` |
| Vanilla only on X | Vanilla on Y (Y≠X) | `bridge transfer X --amount … --chain Y`, then `pay --chain X` |
| Vanilla only on X | Gateway ≥ price on X | Workflow B: withdraw on X, then `pay --chain X` |
| Vanilla only on X | Gateway on Y (Y≠X), no vanilla on X | Workflow A: withdraw on Y, bridge to X, then `pay --chain X` |
| Gateway only, on slow chain S | Vanilla on fast chains only | Search for a provider with vanilla or fast-chain Gateway. If none, ask the user before a direct deposit on S (~13-19 min wait) |
| Gateway only, on X | Gateway on Y (Y≠X), none on X | Workflow C: withdraw on Y, bridge to X, deposit on X, then `pay --chain X` |
| Nothing matches | Any | Fund the wallet: use the installed `fund-agent-wallet` skill; if it isn't installed, fetch `https://agents.circle.com/skills/wallet-fund.md` |

For eco vs direct and why eco is the default, see `fund-agent-wallet` ("Eco vs direct").
