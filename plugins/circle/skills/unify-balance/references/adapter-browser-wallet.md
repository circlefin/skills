# Solana Browser Wallet Adapter

Requires `@circle-fin/adapter-solana>=1.6.4` with a browser-safe kit (see
SKILL.md). Add no `Buffer`, `process`, or Node core polyfills.

## Setup

```bash
# App Kit (recommended)
npm install @circle-fin/app-kit @circle-fin/adapter-solana @solana/web3.js

# Unified Balance Kit (standalone)
npm install @circle-fin/unified-balance-kit @circle-fin/adapter-solana @solana/web3.js
```

## App Kit

Pass the injected provider object (e.g. `window.phantom?.solana` or
`window.solflare`) exposing `isConnected`, `publicKey`, `connect()`, `disconnect()`, and
`signTransaction()` -- not a Wallet Standard `Wallet` object. The forwarded
spend needs no destination wallet, so the user signs only on Solana. This page uses
`@circle-fin/adapter-solana`, which takes `publicKey`; `@circle-fin/adapter-solana-kit` instead needs `address`.

```ts
import { AppKit } from "@circle-fin/app-kit";
import {
  createSolanaAdapterFromProvider,
  type CreateSolanaAdapterFromProviderParams,
} from "@circle-fin/adapter-solana";

const kit = new AppKit();

export async function createUnifiedBalanceActions(
  provider: CreateSolanaAdapterFromProviderParams["provider"],
) {
  const adapter = await createSolanaAdapterFromProvider({ provider });

  const getBalances = () =>
    kit.unifiedBalance.getBalances({
      sources: { adapter },
      networkType: "testnet",
    });

  const deposit = (amount: string) =>
    kit.unifiedBalance.deposit({
      from: { adapter, chain: "Solana_Devnet" },
      amount,
    });

  const spendToBase = (
    amount: string,
    recipientAddress: string,
  ) =>
    kit.unifiedBalance.spend({
      from: {
        adapter,
        allocations: {
          chain: "Solana_Devnet",
          amount,
        },
      },
      to: {
        chain: "Base_Sepolia",
        recipientAddress,
        useForwarder: true,
      },
      amount,
    });

  return { getBalances, deposit, spendToBase };
}
```

Standalone Unified Balance Kit: change the initialization and call
`kit.getBalances()`, `kit.deposit()`, and `kit.spend()` directly:

```ts
import { UnifiedBalanceKit } from "@circle-fin/unified-balance-kit";

const kit = new UnifiedBalanceKit();
```

## Confirmation

Display the chains, recipient, and amount, then call `deposit()` or `spend()`
only from the user's click on the enabled action button (no second prompt or
synthetic confirmation object) -- never automatically after review, from an
effect, or during render.
