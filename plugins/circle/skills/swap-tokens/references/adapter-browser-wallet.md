# Browser Wallet Adapters

Use provider-based adapters and permissionless swap requests in browser apps.
Never pass a private key, Circle API key, entity secret, or `kitKey` to client
code.

Use App Kit `>=1.11.0` or Swap Kit `>=1.5.0` with current adapters. These
releases bundle cleanly for browsers, omit Node-only request headers, and need
no consumer-provided Node or `Buffer` polyfills.

## Setup

```bash
# App Kit (recommended) with EVM browser wallets
npm install @circle-fin/app-kit @circle-fin/adapter-viem-v2 viem

# Swap Kit (standalone) with EVM browser wallets
npm install @circle-fin/swap-kit @circle-fin/adapter-viem-v2 viem

# Solana browser wallets
npm install @circle-fin/adapter-solana-kit @solana/kit @solana/web3.js
```

## EVM wallet with wagmi

The example targets `wagmi@^3`. Switch the wallet to the source chain before
creating the adapter. `createViemAdapterFromProvider` is async.

```tsx
import { AppKit, type SwapEstimate } from "@circle-fin/app-kit";
import { createViemAdapterFromProvider } from "@circle-fin/adapter-viem-v2";
import type { EIP1193Provider } from "viem";
import { mainnet } from "viem/chains";
import { useState } from "react";
import { useAccount, useChainId, useSwitchChain } from "wagmi";

const kit = new AppKit();

const swapRequest = {
  tokenIn: "USDT",
  tokenOut: "USDC",
  amountIn: "10.00",
  config: { slippageBps: 100 },
} as const;

type ReviewedSwap = {
  estimate: SwapEstimate;
  request: typeof swapRequest;
  account: string | undefined;
};

export function SwapButton() {
  const { connector, address } = useAccount();
  const chainId = useChainId();
  const { switchChainAsync } = useSwitchChain();
  const [reviewed, setReviewed] = useState<ReviewedSwap | null>(null);

  const getAdapter = async () => {
    if (!connector) throw new Error("Wallet not connected");

    if (chainId !== mainnet.id) {
      await switchChainAsync({ chainId: mainnet.id });
    }

    const provider = (await connector.getProvider()) as EIP1193Provider;
    return await createViemAdapterFromProvider({ provider });
  };

  const reviewSwap = async () => {
    const adapter = await getAdapter();
    const estimate = await kit.estimateSwap({
      from: { adapter, chain: "Ethereum" },
      ...swapRequest,
    });
    setReviewed({ estimate, request: swapRequest, account: address });
  };

  const executeSwap = async () => {
    if (!reviewed) throw new Error("Review a current estimate first");
    if (address !== reviewed.account) throw new Error("Wallet account changed since the estimate; review again");
    const adapter = await getAdapter();
    const result = await kit.swap({
      from: { adapter, chain: "Ethereum" },
      ...reviewed.request,
    });
    setReviewed(null);
    return result;
  };

  return (
    <>
      <button onClick={() => void reviewSwap()}>Review quote</button>
      {reviewed && (
        <div>
          <p>10 USDT on Ethereum to USDC</p>
          <p>
            Estimated output: {reviewed.estimate.estimatedOutput.amount}{" "}
            {reviewed.estimate.estimatedOutput.token}
          </p>
          <button onClick={() => void executeSwap()}>
            Swap 10 USDT to USDC
          </button>
        </div>
      )}
    </>
  );
}
```

For standalone Swap Kit, change only the kit import/initialization and call
`kit.estimate()` instead of `kit.estimateSwap()`:

```ts
import { SwapKit } from "@circle-fin/swap-kit";

const kit = new SwapKit();
```

## Solana wallet provider

Accept the provider supplied by the application's Wallet Standard integration
(Phantom, Solflare, Backpack, etc.). The adapter connects to the wallet if
needed. No global `Buffer` shim is required.

```tsx
import { AppKit, type SwapEstimate } from "@circle-fin/app-kit";
import {
  createSolanaKitAdapterFromProvider,
  type CreateAdapterFromProviderParams,
} from "@circle-fin/adapter-solana-kit";
import { useState } from "react";

const kit = new AppKit();

const swapRequest = {
  tokenIn: "USDT",
  tokenOut: "USDC",
  amountIn: "10.00",
  config: { slippageBps: 100 },
} as const;

type ReviewedSolanaSwap = {
  estimate: SwapEstimate;
  request: typeof swapRequest;
};

export function SolanaSwap({
  provider,
}: {
  provider: CreateAdapterFromProviderParams["provider"];
}) {
  const [reviewed, setReviewed] = useState<ReviewedSolanaSwap | null>(null);

  const reviewSwap = async () => {
    const adapter = createSolanaKitAdapterFromProvider({ provider });
    const estimate = await kit.estimateSwap({
      from: { adapter, chain: "Solana" },
      ...swapRequest,
    });
    setReviewed({ estimate, request: swapRequest });
  };

  const executeSwap = async () => {
    if (!reviewed) throw new Error("Review a current estimate first");
    const adapter = createSolanaKitAdapterFromProvider({ provider });
    const result = await kit.swap({
      from: { adapter, chain: "Solana" },
      ...reviewed.request,
    });
    setReviewed(null);
    return result;
  };

  return (
    <>
      <button onClick={() => void reviewSwap()}>Review quote</button>
      {reviewed && (
        <div>
          <p>10 USDT on Solana to USDC</p>
          <p>
            Estimated output: {reviewed.estimate.estimatedOutput.amount}{" "}
            {reviewed.estimate.estimatedOutput.token}
          </p>
          <button onClick={() => void executeSwap()}>
            Swap 10 USDT to USDC
          </button>
        </div>
      )}
    </>
  );
}
```

The visible reviewed quote plus the user's click on the **Swap** button is the
explicit confirmation. Do not add a second prompt or synthetic confirmation
object. Never call `swap()` from the quote handler, an effect, or automatically
after estimation completes.

## Browser rules

- Omit `kitKey` entirely. Do not map it to `VITE_*`, `NEXT_PUBLIC_*`, or any
  other client-visible environment variable.
- Do not import `@circle-fin/adapter-circle-wallets` in a browser. Its main
  entry requires server-side Circle credentials.
- Do not add `process`, Node core-module, or `Buffer` shims for current kit
  releases. Upgrade stale package versions if the bundle asks for them.
- Display the estimate and swap details before enabling or rendering the
  **Swap** button. Call `swap()` only from that button's click handler.
