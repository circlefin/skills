# Browser Wallet Adapters

Keyless swaps from a connected browser wallet, using provider-based adapters.
Requires the browser-safe kit versions listed in SKILL.md; current releases omit
Node-only request headers.

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

Targets `wagmi@^3`. Switch the wallet to the source chain before creating the
adapter; `createViemAdapterFromProvider` is async.

```tsx
import { AppKit, type SwapEstimate } from "@circle-fin/app-kit";
import { createViemAdapterFromProvider } from "@circle-fin/adapter-viem-v2";
import type { EIP1193Provider } from "viem";
import { mainnet } from "viem/chains";
import { useState } from "react";
import { useConnection, useChainId, useSwitchChain } from "wagmi";

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
  const { connector, address } = useConnection();
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

Standalone Swap Kit: change the kit import/initialization and call
`kit.estimate()` instead of `kit.estimateSwap()`:

```ts
import { SwapKit } from "@circle-fin/swap-kit";

const kit = new SwapKit();
```

## Solana wallet provider

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

The adapter
connects the wallet if needed.

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

## Confirmation

Render the **Swap** button only after the reviewed estimate and swap details
are displayed; the user's click on it is the explicit confirmation (no second
prompt or synthetic confirmation object). Call `swap()` only from that click
handler -- never from the quote handler, an effect, or automatically after
estimation.
