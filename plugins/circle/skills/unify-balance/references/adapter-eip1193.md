# EIP-1193 Provider Adapter (Browser Wallets)

Unified balance from any EIP-1193 browser wallet, shown with wagmi (`wagmi@^3`; ConnectKit, RainbowKit, etc.), for App Kit and standalone Unified Balance Kit. The wallet library only supplies the provider; `@circle-fin/adapter-viem-v2` drives the operations. Use the browser-safe kit versions in SKILL.md and add no Node or `Buffer` polyfills.

## Setup

```bash
# App Kit (recommended)
npm install @circle-fin/app-kit @circle-fin/adapter-viem-v2 viem

# Unified Balance Kit (standalone)
npm install @circle-fin/unified-balance-kit @circle-fin/adapter-viem-v2 viem
```

## Using App Kit

Switch the wallet to the chain that signs (the source chain for `deposit`, the allocation chain for `spend`), then build the adapter from the connector's provider. `getBalances` is read-only and needs no switch. `createViemAdapterFromProvider` is async -- always `await` it.

The examples spend through the Forwarding Service (`useForwarder: true`): the user signs once, on the source chain, and never switches to the destination. To mint from the user's own destination wallet instead, build a destination adapter the same way (`await getAdapter(destinationChainId)`) and pass it as `to.adapter` (see Spend in SKILL.md).

```tsx
import { useConnection, useChainId, useSwitchChain } from "wagmi";
import { createViemAdapterFromProvider } from "@circle-fin/adapter-viem-v2";
import { AppKit, type UnifiedBalanceChainIdentifier } from "@circle-fin/app-kit";
import type { EIP1193Provider } from "viem";

const appKit = new AppKit();

function UnifiedBalanceComponent() {
  const { connector } = useConnection();
  const chainId = useChainId();
  const { switchChainAsync } = useSwitchChain();

  const getAdapter = async (requiredChainId: number) => {
    if (!connector) throw new Error("Wallet not connected");
    if (chainId !== requiredChainId) {
      await switchChainAsync({ chainId: requiredChainId });
    }
    const provider = (await connector.getProvider()) as EIP1193Provider;
    return await createViemAdapterFromProvider({ provider });
  };

  const handleDeposit = async (
    sourceChainId: number,
    sourceChain: UnifiedBalanceChainIdentifier,
  ) => {
    const adapter = await getAdapter(sourceChainId);

    const result = await appKit.unifiedBalance.deposit({
      from: { adapter, chain: sourceChain },
      amount: "10.00",
    });
  };

  const handleSpend = async (
    sourceChainId: number,
    sourceChain: UnifiedBalanceChainIdentifier,
    destinationChain: UnifiedBalanceChainIdentifier,
    recipientAddress: string,
  ) => {
    const adapter = await getAdapter(sourceChainId);

    const result = await appKit.unifiedBalance.spend({
      from: {
        adapter,
        allocations: { amount: "5.00", chain: sourceChain },
      },
      to: { chain: destinationChain, recipientAddress, useForwarder: true },
      amount: "5.00",
    });
  };

  const handleGetBalances = async () => {
    if (!connector) throw new Error("Wallet not connected");
    const provider = (await connector.getProvider()) as EIP1193Provider;
    const adapter = await createViemAdapterFromProvider({ provider });

    const balances = await appKit.unifiedBalance.getBalances({
      sources: { adapter },
      networkType: "testnet",
    });
  };
}
```

## Using Unified Balance Kit

Same operations directly on the instance (`kit.deposit`, `kit.spend`, `kit.getBalances`) instead of under `kit.unifiedBalance.*`.

```tsx
import { useConnection, useChainId, useSwitchChain } from "wagmi";
import { createViemAdapterFromProvider } from "@circle-fin/adapter-viem-v2";
import {
  UnifiedBalanceKit,
  type UnifiedBalanceChainIdentifier,
} from "@circle-fin/unified-balance-kit";
import type { EIP1193Provider } from "viem";

const kit = new UnifiedBalanceKit();

function UnifiedBalanceComponent() {
  const { connector } = useConnection();
  const chainId = useChainId();
  const { switchChainAsync } = useSwitchChain();

  const getAdapter = async (requiredChainId: number) => {
    if (!connector) throw new Error("Wallet not connected");
    if (chainId !== requiredChainId) {
      await switchChainAsync({ chainId: requiredChainId });
    }
    const provider = (await connector.getProvider()) as EIP1193Provider;
    return await createViemAdapterFromProvider({ provider });
  };

  const handleDeposit = async (
    sourceChainId: number,
    sourceChain: UnifiedBalanceChainIdentifier,
  ) => {
    const adapter = await getAdapter(sourceChainId);

    const result = await kit.deposit({
      from: { adapter, chain: sourceChain },
      amount: "10.00",
    });
  };

  const handleSpend = async (
    sourceChainId: number,
    sourceChain: UnifiedBalanceChainIdentifier,
    destinationChain: UnifiedBalanceChainIdentifier,
    recipientAddress: string,
  ) => {
    const adapter = await getAdapter(sourceChainId);

    const result = await kit.spend({
      from: {
        adapter,
        allocations: { amount: "5.00", chain: sourceChain },
      },
      to: { chain: destinationChain, recipientAddress, useForwarder: true },
      amount: "5.00",
    });
  };

  const handleGetBalances = async () => {
    if (!connector) throw new Error("Wallet not connected");
    const provider = (await connector.getProvider()) as EIP1193Provider;
    const adapter = await createViemAdapterFromProvider({ provider });

    const balances = await kit.getBalances({
      sources: { adapter },
      networkType: "testnet",
    });
  };
}
```
