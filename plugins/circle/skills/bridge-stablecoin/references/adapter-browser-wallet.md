# Solana Browser Wallet Adapter

Use App Kit `>=1.11.0` or Bridge Kit `>=1.12.2` with
`@circle-fin/adapter-solana-kit>=1.5.4`. These releases bundle Solana support
for browsers and require no consumer-provided `Buffer`, `process`, or Node core
polyfills.

## Setup

```bash
# App Kit (recommended)
npm install @circle-fin/app-kit @circle-fin/adapter-solana-kit @solana/kit @solana/web3.js

# Bridge Kit (standalone)
npm install @circle-fin/bridge-kit @circle-fin/adapter-solana-kit @solana/kit @solana/web3.js
```

## Browser provider

Accept the Wallet Standard provider from the application's wallet integration
(Phantom, Solflare, Backpack, etc.). The example uses the Forwarding Service so
the user signs on Solana once and does not need a destination wallet.

```ts
import { AppKit } from "@circle-fin/app-kit";
import {
  createSolanaKitAdapterFromProvider,
  type CreateAdapterFromProviderParams,
} from "@circle-fin/adapter-solana-kit";

const kit = new AppKit();

export async function bridgeFromSolana(
  provider: CreateAdapterFromProviderParams["provider"],
  recipientAddress: string,
) {
  const adapter = createSolanaKitAdapterFromProvider({ provider });

  return await kit.bridge({
    from: { adapter, chain: "Solana_Devnet" },
    to: {
      chain: "Base_Sepolia",
      recipientAddress,
      useForwarder: true,
    },
    amount: "1.00",
  });
}
```

For standalone Bridge Kit, change only the import and initialization:

```ts
import { BridgeKit } from "@circle-fin/bridge-kit";

const kit = new BridgeKit();
```

## Browser rules

- Display the chains, recipient, and amount before calling `bridge()`. The
  user's click on the enabled **Bridge** button is the confirmation; do not add
  a second prompt or synthetic confirmation object. Never call `bridge()`
  automatically after review, from an effect, or during render.
- Never put private keys or Circle credentials in browser code.
- Do not import the main `@circle-fin/adapter-circle-wallets` entry in a
  browser; it is server-only.
- Do not add manual Node or `Buffer` shims. Upgrade stale packages if a bundle
  reports missing Node globals.
