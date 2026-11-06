# Wagmi Adapter (Browser Wallets)

Bridge USDC from a browser wallet managed by wagmi (`wagmi@^3`; ConnectKit, RainbowKit, etc.), with App Kit or standalone Bridge Kit.

## Setup

```bash
# App Kit (recommended)
npm install @circle-fin/app-kit @circle-fin/adapter-viem-v2 viem@^2.57.5

# Bridge Kit (standalone)
npm install @circle-fin/bridge-kit @circle-fin/adapter-viem-v2 viem@^2.57.5
```

## Chains

Use built-in chains from `viem/chains` (viem `>=2.57.5`: older releases point `arcTestnet` at the retired `arc.network` RPC); define a chain viem lacks with `defineChain`.

```ts
import { arcTestnet, sepolia, baseSepolia, arbitrumSepolia } from "viem/chains";

export const supportedChains = [
  arcTestnet,
  sepolia,
  baseSepolia,
  arbitrumSepolia,
] as const;
```

## Destination chains the wallet lacks

Without the Forwarding Service, the adapter switches the wallet to the destination chain for the mint using `wallet_switchEthereumChain` only. A wallet that lacks that chain rejects with error 4902 after the burn has already happened. Wrap the provider so a 4902 adds the chain from `supportedChains` and retries the switch:

```ts
import { numberToHex, type Chain, type EIP1193Provider } from "viem";

const isUnrecognizedChain = (error: unknown) => {
  const e = error as { code?: number; data?: { originalError?: { code?: number } } };
  return e?.code === 4902 || e?.data?.originalError?.code === 4902; // nested on MetaMask mobile
};

export function withAddChainFallback(
  provider: EIP1193Provider,
  chains: readonly Chain[],
): EIP1193Provider {
  const send = provider.request.bind(provider) as (args: { method: string; params?: unknown }) => Promise<unknown>;
  const request = (async (args: { method: string; params?: unknown }) => {
    try {
      return await send(args);
    } catch (error) {
      if (args.method !== "wallet_switchEthereumChain" || !isUnrecognizedChain(error)) throw error;
      const [{ chainId }] = args.params as [{ chainId: string }];
      const chain = chains.find((c) => c.id === Number(chainId));
      if (!chain) throw error;
      await send({
        method: "wallet_addEthereumChain",
        params: [{
          chainId: numberToHex(chain.id),
          chainName: chain.name,
          nativeCurrency: chain.nativeCurrency,
          rpcUrls: [...chain.rpcUrls.default.http],
          blockExplorerUrls: chain.blockExplorers ? [chain.blockExplorers.default.url] : undefined,
        }],
      });
      return send(args);
    }
  }) as EIP1193Provider["request"];

  // A Proxy, not a spread: wallet providers are class instances.
  return new Proxy(provider, {
    get(target, prop) {
      if (prop === "request") return request;
      const value = Reflect.get(target, prop, target);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
}
```

## Using App Kit

Switch the wallet to the source chain, then build the adapter from the connector's provider:

```tsx
import { useConnection, useChainId, useSwitchChain } from "wagmi";
import { createViemAdapterFromProvider } from "@circle-fin/adapter-viem-v2";
import { AppKit, type BridgeParams } from "@circle-fin/app-kit";
import type { EIP1193Provider } from "viem";

type BridgeChainIdentifier = BridgeParams["from"]["chain"];

const appKit = new AppKit();

function BridgeComponent() {
  const { connector } = useConnection();
  const chainId = useChainId();
  const { switchChainAsync } = useSwitchChain();

  const handleBridge = async (
    sourceChainId: number,
    sourceChain: BridgeChainIdentifier,
    destinationChain: BridgeChainIdentifier,
  ) => {
    if (!connector) throw new Error("Wallet not connected");
    if (chainId !== sourceChainId) {
      await switchChainAsync({ chainId: sourceChainId });
    }

    const provider = (await connector.getProvider()) as EIP1193Provider;
    const adapter = await createViemAdapterFromProvider({
      provider: withAddChainFallback(provider, supportedChains),
    });

    const result = await appKit.bridge({
      from: { adapter, chain: sourceChain },
      to: { adapter, chain: destinationChain },
      amount: "1.00",
    });
  };
}
```

## Using Bridge Kit

```tsx
import { useConnection, useChainId, useSwitchChain } from "wagmi";
import { createViemAdapterFromProvider } from "@circle-fin/adapter-viem-v2";
import { BridgeKit, type BridgeChainIdentifier } from "@circle-fin/bridge-kit";
import type { EIP1193Provider } from "viem";

const bridgeKit = new BridgeKit();

function BridgeComponent() {
  const { connector } = useConnection();
  const chainId = useChainId();
  const { switchChainAsync } = useSwitchChain();

  const handleBridge = async (
    sourceChainId: number,
    sourceChain: BridgeChainIdentifier,
    destinationChain: BridgeChainIdentifier,
  ) => {
    if (!connector) throw new Error("Wallet not connected");
    if (chainId !== sourceChainId) {
      await switchChainAsync({ chainId: sourceChainId });
    }

    const provider = (await connector.getProvider()) as EIP1193Provider;
    const adapter = await createViemAdapterFromProvider({
      provider: withAddChainFallback(provider, supportedChains),
    });

    const result = await bridgeKit.bridge({
      from: { adapter, chain: sourceChain },
      to: { adapter, chain: destinationChain },
      amount: "1.00",
    });
  };
}
```
