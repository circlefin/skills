# Direct Cross-Chain Swap

Set `to.chain` and `to.recipientAddress` on one `swap()` call, then track the
destination leg with `waitForSwap()`. Examples run keyless.

## EVM browser example

```tsx
import { AppKit, type SwapEstimate } from "@circle-fin/app-kit";
import { createViemAdapterFromProvider } from "@circle-fin/adapter-viem-v2";
import { useState } from "react";
import type { EIP1193Provider } from "viem";
import { mainnet } from "viem/chains";
import { useConnection, useChainId, useSwitchChain } from "wagmi";

const kit = new AppKit();

const buildSwapRequest = (recipientAddress: `0x${string}`) => ({
  tokenIn: "USDT",
  tokenOut: "USDC",
  amountIn: "100.00",
  to: {
    chain: "Base",
    recipientAddress,
  },
  config: { slippageBps: 100 },
} as const);

type ReviewedCrossChainSwap = {
  estimate: SwapEstimate;
  request: ReturnType<typeof buildSwapRequest>;
};

export function CrossChainSwap() {
  const { address, connector } = useConnection();
  const chainId = useChainId();
  const { switchChainAsync } = useSwitchChain();
  const [reviewed, setReviewed] =
    useState<ReviewedCrossChainSwap | null>(null);

  const getAdapter = async () => {
    if (!address || !connector) throw new Error("Wallet not connected");
    if (chainId !== mainnet.id) {
      await switchChainAsync({ chainId: mainnet.id });
    }
    const provider = (await connector.getProvider()) as EIP1193Provider;
    return await createViemAdapterFromProvider({ provider });
  };

  const reviewSwap = async () => {
    if (!address) throw new Error("Wallet not connected");
    const adapter = await getAdapter();
    const request = buildSwapRequest(address);
    const estimate = await kit.estimateSwap({
      from: { adapter, chain: "Ethereum" },
      ...request,
    });
    setReviewed({ estimate, request });
  };

  const executeSwap = async () => {
    if (!reviewed) throw new Error("Review a current estimate first");
    const adapter = await getAdapter();
    const result = await kit.swap({
      from: { adapter, chain: "Ethereum" },
      ...reviewed.request,
    });
    setReviewed(null);

    return await kit.waitForSwap({
      result,
      onProgress: (snapshot) => {
        console.log(snapshot.progress.substatus ?? snapshot.progress.status);
      },
    });
  };

  return (
    <>
      <button onClick={() => void reviewSwap()}>Review cross-chain quote</button>
      {reviewed && (
        <div>
          <p>100 USDT on Ethereum to USDC on Base</p>
          <p>Recipient: {reviewed.request.to.recipientAddress}</p>
          <p>
            Estimated output: {reviewed.estimate.estimatedOutput.amount}{" "}
            {reviewed.estimate.estimatedOutput.token}
          </p>
          <button onClick={() => void executeSwap()}>
            Swap 100 USDT to USDC on Base
          </button>
        </div>
      )}
    </>
  );
}
```

Display the reviewed estimate, chains, tokens, amount, and recipient before
rendering the **Swap** button; the user's click is the confirmation. Keep the
reviewed request in state so the executed parameters cannot drift from the
displayed quote.

Standalone Swap Kit: initialize `new SwapKit()` and call `kit.estimate()`;
`swap()` and `waitForSwap()` take the same params.

## EVM server example

Export the review and fund-moving operations for the application layer to call.
Do not invoke the execution export at module startup.

```ts
import { AppKit } from "@circle-fin/app-kit";
import { createViemAdapterFromPrivateKey } from "@circle-fin/adapter-viem-v2";

const privateKey = process.env.PRIVATE_KEY;
const recipientAddress = process.env.RECIPIENT_ADDRESS;

if (!privateKey?.startsWith("0x")) {
  throw new Error("PRIVATE_KEY must be set and 0x-prefixed");
}
if (!recipientAddress?.startsWith("0x")) {
  throw new Error("RECIPIENT_ADDRESS must be set and 0x-prefixed");
}

const adapter = createViemAdapterFromPrivateKey({
  privateKey: privateKey as `0x${string}`,
});
const kit = new AppKit();
const swapRequest = {
  tokenIn: "USDT",
  tokenOut: "USDC",
  amountIn: "100.00",
  to: {
    chain: "Base",
    recipientAddress: recipientAddress as `0x${string}`,
  },
  config: { slippageBps: 100 },
} as const;

export const reviewServerCrossChainSwap = () =>
  kit.estimateSwap({
    from: { adapter, chain: "Ethereum" },
    ...swapRequest,
  });

export async function executeServerCrossChainSwap() {
  const result = await kit.swap({
    from: { adapter, chain: "Ethereum" },
    ...swapRequest,
  });

  // The source transaction can confirm before the destination leg settles.
  const finalStatus = await kit.waitForSwap({
    result,
    onProgress: (snapshot) => {
      console.log(snapshot.progress.substatus ?? snapshot.progress.status);
    },
  });

  if (finalStatus.progress.status === "DONE") {
    console.log(
      "Received:",
      finalStatus.destination?.amount,
      finalStatus.destination?.token?.symbol,
    );
    console.log("Destination tx:", finalStatus.destination?.txHash);
  }

  return { result, finalStatus };
}
```

## Persisting and resuming status

Persist `result.txHash`, `result.chainIn`, and `result.chainOut` once the source
transaction confirms. After a restart, resume tracking without resubmitting:

```ts
const finalStatus = await kit.waitForSwap({
  txHash: persisted.txHash,
  chainIn: persisted.chainIn,
  chainOut: persisted.chainOut,
  onProgress: renderProgress,
});
```

`waitForSwap()` throws a retryable error when its wait budget expires; the
onchain swap has not necessarily failed. Persist the identifiers and poll again.
Never resubmit `swap()` because destination settlement is still pending.

## Cross-chain rules

- Require `to.recipientAddress`; validate it for the destination ecosystem.
- Treat a returned `PENDING` status as in-flight, not failed.
- Use `waitForSwap({ result })` for normal tracking or `getSwapStatus()` for a
  single status snapshot.
- Apply custom fees on the source-chain input token; the fee recipient must be
  valid on the source chain.
- For a server-side Solana fallback leg, read `adapter-solana.md` and import
  `createSolanaKitAdapterFromPrivateKey` from `@circle-fin/adapter-solana-kit`.
  That package does not export `createSolanaAdapter` or
  `createSolanaAdapterFromPrivateKey`.

## Multi-leg fallback when no direct route exists

Try the direct route first. Only a thrown `KitError` with
`name === "INPUT_UNSUPPORTED_ROUTE"` means no direct route exists. Then estimate
three legs (source swap to USDC, USDC bridge, destination swap), present the
plan, and export the executor without auto-invoking it. Persist each leg's
result so a failure resumes from the failed leg instead of re-running earlier
ones.

```ts
import { AppKit, isKitError, isRetryableError, type BridgeResult } from "@circle-fin/app-kit";
import { createViemAdapterFromPrivateKey } from "@circle-fin/adapter-viem-v2";

const kit = new AppKit();
const adapter = createViemAdapterFromPrivateKey({
  privateKey: process.env.PRIVATE_KEY as `0x${string}`,
});
const recipientAddress = process.env.RECIPIENT_ADDRESS as `0x${string}`;

const sourceLeg = { adapter, chain: "Ethereum" } as const;
const destinationLeg = { adapter, chain: "Base" } as const;

export async function estimateDirectOrFallback() {
  try {
    return {
      kind: "direct" as const,
      estimate: await kit.estimateSwap({
        from: sourceLeg,
        tokenIn: "WETH",
        tokenOut: "DAI",
        amountIn: "1.00",
        to: { chain: "Base", recipientAddress },
      }),
    };
  } catch (error) {
    if (!isKitError(error) || error.name !== "INPUT_UNSUPPORTED_ROUTE") {
      throw error; // transport/validation/timeout — not a no-route result
    }

    const [sourceSwap, destinationSwap] = await Promise.all([
      kit.estimateSwap({
        from: sourceLeg,
        tokenIn: "WETH",
        tokenOut: "USDC",
        amountIn: "1.00",
      }),
      kit.estimateSwap({
        from: destinationLeg,
        tokenIn: "USDC",
        tokenOut: "DAI",
        amountIn: "1.00", // refine with the bridged USDC amount before executing
      }),
    ]);

    return { kind: "fallback" as const, sourceSwap, destinationSwap };
  }
}

// Call this only from a user-triggered action, never automatically after the
// estimate above. `saved` lets a retry skip legs that already completed.
// Returns { sourceSwap, pending } | { sourceSwap, error } | { sourceSwap, status } | { sourceSwap, bridge }
// (check bridge.state) | { sourceSwap, bridge, destinationSwap }; persist sourceSwap.
export async function executeFallback(saved: {
  sourceSwap?: Awaited<ReturnType<typeof kit.swap>>;
  bridge?: BridgeResult;
} = {}) {
  const sourceSwap =
    saved.sourceSwap ??
    (await kit.swap({
      from: sourceLeg,
      tokenIn: "WETH",
      tokenOut: "USDC",
      amountIn: "1.00",
    }));

  // amountIn is WETH, never a USDC amount. Without amountOut, wait for the
  // submitted source swap and read the USDC it actually delivered.
  let usdcAmount = sourceSwap.amountOut;
  if (!usdcAmount) {
    let status;
    try {
      status = await kit.waitForSwap({ result: sourceSwap });
    } catch (error) {
      // The swap is already submitted: return it so a retry never resubmits.
      if (isRetryableError(error)) {
        return { sourceSwap, pending: "source-swap-output" as const }; // timeout or transient poll failure
      }
      return { sourceSwap, error }; // auth/validation: fix, then resume with { sourceSwap }
    }
    if (status.progress.status !== "DONE") {
      return { sourceSwap, status }; // FAILED or NOT_FOUND (not proof of failure): reconcile, never resubmit
    }
    usdcAmount = status.destination?.amount;
  }
  if (!usdcAmount) {
    // Persist sourceSwap and call executeFallback({ sourceSwap }) again later.
    return { sourceSwap, pending: "source-swap-output" as const };
  }

  const bridge =
    saved.bridge ??
    (await kit.bridge({
      from: sourceLeg,
      to: destinationLeg,
      amount: usdcAmount,
      config: { transferSpeed: "SLOW" }, // no CCTP fee, so exactly usdcAmount arrives for the next swap
    }));

  if (bridge.state === "error") {
    // Persist { sourceSwap, bridge } and resume the bridge with kit.retryBridge().
    return { sourceSwap, bridge };
  }

  const destinationSwap = await kit.swap({
    from: destinationLeg,
    tokenIn: "USDC",
    tokenOut: "DAI",
    amountIn: usdcAmount,
    to: { recipientAddress },
  });

  return { sourceSwap, bridge, destinationSwap };
}
```
