# Solana Browser Wallet Adapter

Use App Kit `>=1.11.0` or Unified Balance Kit `>=1.3.1` with
`@circle-fin/adapter-solana>=1.6.4`. These releases bundle for browsers and
require no consumer-provided `Buffer`, `process`, or Node core polyfills.

## Setup

```bash
# App Kit (recommended)
npm install @circle-fin/app-kit @circle-fin/adapter-solana @solana/web3.js

# Unified Balance Kit (standalone)
npm install @circle-fin/unified-balance-kit @circle-fin/adapter-solana @solana/web3.js
```

## App Kit

Accept the Wallet Standard provider supplied by the application's wallet
integration (Phantom, Solflare, Backpack, etc.). The forwarded spend needs no
destination wallet, so the user signs only on Solana.

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

For standalone Unified Balance Kit, change the initialization and call
`kit.getBalances()`, `kit.deposit()`, and `kit.spend()` directly:

```ts
import { UnifiedBalanceKit } from "@circle-fin/unified-balance-kit";

const kit = new UnifiedBalanceKit();
```

## Browser rules

- Display the chains, recipient, and amount before calling `deposit()` or
  `spend()`. The user's click on the enabled action button is the confirmation;
  do not add a second prompt or synthetic confirmation object. Never call
  `deposit()` or `spend()` automatically after review, from an effect, or during
  render.
- Never put private keys or Circle credentials in browser code.
- Do not import the main `@circle-fin/adapter-circle-wallets` entry in a
  browser; it is server-only.
- Do not add manual Node or `Buffer` shims. Upgrade stale packages if a bundle
  reports missing Node globals.
