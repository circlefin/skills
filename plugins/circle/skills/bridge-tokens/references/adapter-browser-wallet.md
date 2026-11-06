# Solana Browser Wallet Adapter

Requires `@circle-fin/adapter-solana-kit>=1.5.4` with a browser-safe kit (see
SKILL.md). Add no `Buffer`, `process`, or Node core polyfills.

## Setup

```bash
# App Kit (recommended)
npm install @circle-fin/app-kit @circle-fin/adapter-solana-kit @solana/kit @solana/web3.js

# Bridge Kit (standalone)
npm install @circle-fin/bridge-kit @circle-fin/adapter-solana-kit @solana/kit @solana/web3.js
```

## Browser provider

Pass an injected Solana provider -- not a Wallet Standard `Wallet` object -- that exposes
`isConnected`, `address` (base58 string), `connect()` resolving to `{ address }`,
`disconnect()`, and `signTransaction()`. Phantom (`window.phantom?.solana`) exposes
`publicKey` instead of `address` and fails with `Wallet connection did not return an address`;
wrap a wallet like that and pass `withAddress(window.phantom.solana)`:

```ts
import type { CreateAdapterFromProviderParams } from "@circle-fin/adapter-solana-kit";

type PublicKeyProvider = {
  isConnected: boolean;
  publicKey: { toString(): string } | null;
  connect(): Promise<{ publicKey: { toString(): string } }>;
  disconnect(): Promise<void>;
  signTransaction(transaction: unknown): Promise<unknown>;
};

export const withAddress = (
  wallet: PublicKeyProvider,
): CreateAdapterFromProviderParams["provider"] => ({
  get isConnected() {
    return wallet.isConnected;
  },
  get address() {
    return wallet.publicKey?.toString();
  },
  connect: async () => ({ address: (await wallet.connect()).publicKey.toString() }),
  disconnect: () => wallet.disconnect(),
  signTransaction: (transaction) => wallet.signTransaction(transaction),
});
```

The example uses
the Forwarding Service, so the user signs once on Solana and needs no
destination wallet.

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

Standalone Bridge Kit: change only the import and initialization:

```ts
import { BridgeKit } from "@circle-fin/bridge-kit";

const kit = new BridgeKit();
```

## Confirmation

Display the chains, recipient, and amount, then call `bridgeFromSolana()` only
from the user's click on the enabled **Bridge** button (no second prompt or
synthetic confirmation object) -- never automatically after review, from an
effect, or during render.
