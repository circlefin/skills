# Wagmi Adapter (Browser Wallets)

Reference implementation for bridging USDC using wagmi (ConnectKit, RainbowKit, etc.) to manage wallet connections in a browser.

> **Note:** The wagmi examples below target `wagmi@^3`.

## Setup

```bash
npm install @circle-fin/bridge-kit @circle-fin/adapter-viem-v2
```

## Defining Custom Chains with viem

Use built-in chains from `viem/chains` when available. For custom chains, use `defineChain`:

```ts
import { arcTestnet, sepolia, baseSepolia, arbitrumSepolia } from "viem/chains";

export const supportedChains = [
  arcTestnet,
  sepolia,
  baseSepolia,
  arbitrumSepolia,
] as const;
```

## Bridge with wagmi

Get the provider from the connector and switch to the source chain before bridging:

```tsx
import { useAccount, useChainId, useSwitchChain } from "wagmi";
import { createViemAdapterFromProvider } from "@circle-fin/adapter-viem-v2";
import { BridgeKit } from "@circle-fin/bridge-kit";
import type { EIP1193Provider } from "viem";

const bridgeKit = new BridgeKit();

function BridgeComponent() {
  const { connector } = useAccount();
  const chainId = useChainId();
  const { switchChainAsync } = useSwitchChain();

  const handleBridge = async (
    sourceChainId: number,
    sourceChain: string,
    destinationChain: string,
  ) => {
    if (chainId !== sourceChainId) {
      await switchChainAsync({ chainId: sourceChainId });
    }

    const provider = (await connector.getProvider()) as EIP1193Provider;
    const adapter = await createViemAdapterFromProvider({ provider });

    const result = await bridgeKit.bridge({
      from: { adapter, chain: sourceChain },
      to: { adapter, chain: destinationChain },
      amount: "1.00",
    });
  };
}
```
