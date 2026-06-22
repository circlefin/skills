# EIP-1193 Provider Adapter (Browser Wallets)

This shows how to use App Kit with EIP-1193 providers using wagmi (ConnectKit, RainbowKit, etc.) as an example. Includes examples for both App Kit and standalone Unified Balance Kit. Any EIP-1193 provider works — the wallet connection library only supplies the provider; the same `@circle-fin/adapter-viem-v2` adapter used by the bridge skill drives the unified balance operations.

> **Note:** The wagmi examples below target `wagmi@^3`.

## Setup

```bash
# App Kit (recommended)
npm install @circle-fin/app-kit @circle-fin/adapter-viem-v2

# Unified Balance Kit (standalone)
npm install @circle-fin/unified-balance-kit @circle-fin/adapter-viem-v2
```

## Using App Kit

Get the provider from the connector and switch to the chain that signs the transaction (the source chain for `deposit`, the allocation chain for `spend`) before calling the operation. `getBalances` is read-only and needs no chain switch. `createViemAdapterFromProvider` is async — always `await` it.

For the two `spend` destination (`to`) shapes, see the Spend / Forwarding Service notes in `SKILL.md`. The examples below use the Forwarding Service (`useForwarder: true`) — the natural fit for browser wallets, since the user signs once (the burn on the source chain) and never has to switch the wallet to the destination chain. To submit the mint from the user's own destination wallet instead, build a destination adapter the same way (`await getAdapter(destinationChainId)`) and pass it as `adapter`.

```tsx
import { useAccount, useChainId, useSwitchChain } from "wagmi";
import { createViemAdapterFromProvider } from "@circle-fin/adapter-viem-v2";
import { AppKit } from "@circle-fin/app-kit";
import type { EIP1193Provider } from "viem";

const appKit = new AppKit();

function UnifiedBalanceComponent() {
  const { connector } = useAccount();
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

  const handleDeposit = async (sourceChainId: number, sourceChain: string) => {
    const adapter = await getAdapter(sourceChainId);

    const result = await appKit.unifiedBalance.deposit({
      from: { adapter, chain: sourceChain },
      amount: "10.00",
    });
  };

  const handleSpend = async (
    sourceChainId: number,
    sourceChain: string,
    destinationChain: string,
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

The standalone kit exposes the same operations directly on the instance (`kit.deposit`, `kit.spend`, `kit.getBalances`) instead of under `kit.unifiedBalance.*`.

```tsx
import { useAccount, useChainId, useSwitchChain } from "wagmi";
import { createViemAdapterFromProvider } from "@circle-fin/adapter-viem-v2";
import { UnifiedBalanceKit } from "@circle-fin/unified-balance-kit";
import type { EIP1193Provider } from "viem";

const kit = new UnifiedBalanceKit();

function UnifiedBalanceComponent() {
  const { connector } = useAccount();
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

  const handleDeposit = async (sourceChainId: number, sourceChain: string) => {
    const adapter = await getAdapter(sourceChainId);

    const result = await kit.deposit({
      from: { adapter, chain: sourceChain },
      amount: "10.00",
    });
  };

  const handleSpend = async (
    sourceChainId: number,
    sourceChain: string,
    destinationChain: string,
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
