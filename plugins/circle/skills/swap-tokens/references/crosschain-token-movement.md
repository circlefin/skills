# Cross-Chain Token Movement (App Kit Only)

Reference implementation for cross-chain token movement using App Kit. This pattern combines separate swap and bridge operations -- bridge only supports USDC, so the intermediate token is always USDC. This requires App Kit (`@circle-fin/app-kit`) because standalone Swap Kit does not include bridge capability.

## Setup

```bash
npm install @circle-fin/app-kit @circle-fin/adapter-viem-v2 viem
```

## Environment Variables

```
PRIVATE_KEY=              # EVM wallet private key (hex, 0x-prefixed)
KIT_KEY=                  # Kit key from Circle Developer Console
```

## Scenario 1: Non-USDC to USDC Cross-Chain

Swap tokenX to USDC on the source chain, then bridge USDC to the destination chain.

Example: USDT on Ethereum -> USDC on Base

```ts
import { AppKit } from "@circle-fin/app-kit";
import { createViemAdapterFromPrivateKey } from "@circle-fin/adapter-viem-v2";
import { inspect } from "util";

const kit = new AppKit();

const crosschainMovement = async (): Promise<void> => {
  const privateKey = process.env.PRIVATE_KEY;
  if (!privateKey || !privateKey.startsWith("0x")) {
    throw new Error("PRIVATE_KEY env var must be set and 0x-prefixed");
  }

  const adapter = createViemAdapterFromPrivateKey({
    privateKey: privateKey as `0x${string}`,
  });

  // Step 1: Swap USDT to USDC on Ethereum
  let swapResult;
  try {
    swapResult = await kit.swap({
      from: { adapter, chain: "Ethereum" },
      tokenIn: "USDT",
      tokenOut: "USDC",
      amountIn: "100.00",
      config: {
        kitKey: process.env.KIT_KEY as string,
      },
    });
    console.log("Swap completed:", inspect(swapResult, false, null, true));
  } catch (err) {
    console.error("Swap failed:", err instanceof Error ? err.message : "Unknown error");
    console.error("No funds were moved. Your USDT remains on Ethereum.");
    return;
  }

  const bridgeAmount = swapResult.amountOut || "0";

  // Step 2: Bridge USDC from Ethereum to Base
  // useForwarder: true lets Circle's Forwarding Service handle attestation
  // fetching and mint submission on the destination chain automatically.
  // See: https://docs.arc.network/app-kit/tutorials/bridge/use-forwarding-service
  try {
    const bridgeResult = await kit.bridge({
      from: { adapter, chain: "Ethereum" },
      to: { adapter, chain: "Base", useForwarder: true },
      amount: bridgeAmount,
    });
    console.log("Bridge completed:", inspect(bridgeResult, false, null, true));
  } catch (err) {
    console.error("Bridge failed:", err instanceof Error ? err.message : "Unknown error");
    console.error(
      `Your ${bridgeAmount} USDC remains on Ethereum. Retry the bridge or swap back to USDT.`
    );
    return;
  }
};

void crosschainMovement();
```

## Scenario 2: USDC to Non-USDC Cross-Chain

Bridge USDC to the destination chain, then swap USDC to the target token.

Example: USDC on Ethereum -> USDT on Base

```ts
import { AppKit } from "@circle-fin/app-kit";
import { createViemAdapterFromPrivateKey } from "@circle-fin/adapter-viem-v2";
import { inspect } from "util";

const kit = new AppKit();

const crosschainMovement = async (): Promise<void> => {
  const privateKey = process.env.PRIVATE_KEY;
  if (!privateKey || !privateKey.startsWith("0x")) {
    throw new Error("PRIVATE_KEY env var must be set and 0x-prefixed");
  }

  const adapter = createViemAdapterFromPrivateKey({
    privateKey: privateKey as `0x${string}`,
  });

  // Step 1: Bridge USDC from Ethereum to Base
  // useForwarder: true lets Circle's Forwarding Service handle attestation
  // fetching and mint submission on the destination chain automatically.
  // See: https://docs.arc.network/app-kit/tutorials/bridge/use-forwarding-service
  let bridgeResult;
  try {
    bridgeResult = await kit.bridge({
      from: { adapter, chain: "Ethereum" },
      to: { adapter, chain: "Base", useForwarder: true },
      amount: "100.00",
    });
    console.log("Bridge completed:", inspect(bridgeResult, false, null, true));
  } catch (err) {
    console.error("Bridge failed:", err instanceof Error ? err.message : "Unknown error");
    console.error("Your USDC remains on Ethereum.");
    return;
  }

  // Step 2: Swap USDC to USDT on Base
  try {
    const swapResult = await kit.swap({
      from: { adapter, chain: "Base" },
      tokenIn: "USDC",
      tokenOut: "USDT",
      amountIn: bridgeResult.amount,
      config: {
        kitKey: process.env.KIT_KEY as string,
      },
    });
    console.log("Swap completed:", inspect(swapResult, false, null, true));
  } catch (err) {
    console.error("Swap failed:", err instanceof Error ? err.message : "Unknown error");
    console.error(
      `Your ${bridgeResult.amount} USDC arrived on Base but the swap failed. Retry the swap on Base.`
    );
    return;
  }
};

void crosschainMovement();
```

## Scenario 3: Non-USDC to Non-USDC Cross-Chain

Full three-step pattern: swap tokenX to USDC on source, bridge USDC, swap USDC to tokenY on destination.

Example: USDT on Ethereum -> DAI on Base

```ts
import { AppKit } from "@circle-fin/app-kit";
import { createViemAdapterFromPrivateKey } from "@circle-fin/adapter-viem-v2";
import { inspect } from "util";

const kit = new AppKit();

const crosschainMovement = async (): Promise<void> => {
  const privateKey = process.env.PRIVATE_KEY;
  if (!privateKey || !privateKey.startsWith("0x")) {
    throw new Error("PRIVATE_KEY env var must be set and 0x-prefixed");
  }

  const adapter = createViemAdapterFromPrivateKey({
    privateKey: privateKey as `0x${string}`,
  });

  // Step 1: Swap USDT to USDC on Ethereum
  let swapResult1;
  try {
    swapResult1 = await kit.swap({
      from: { adapter, chain: "Ethereum" },
      tokenIn: "USDT",
      tokenOut: "USDC",
      amountIn: "100.00",
      config: {
        kitKey: process.env.KIT_KEY as string,
      },
    });
    console.log("Swap 1 completed:", inspect(swapResult1, false, null, true));
  } catch (err) {
    console.error("Swap 1 failed:", err instanceof Error ? err.message : "Unknown error");
    console.error("No funds were moved. Your USDT remains on Ethereum.");
    return;
  }

  const bridgeAmount = swapResult1.amountOut || "0";

  // Step 2: Bridge USDC from Ethereum to Base
  // useForwarder: true lets Circle's Forwarding Service handle attestation
  // fetching and mint submission on the destination chain automatically.
  // See: https://docs.arc.network/app-kit/tutorials/bridge/use-forwarding-service
  let bridgeResult;
  try {
    bridgeResult = await kit.bridge({
      from: { adapter, chain: "Ethereum" },
      to: { adapter, chain: "Base", useForwarder: true },
      amount: bridgeAmount,
    });
    console.log("Bridge completed:", inspect(bridgeResult, false, null, true));
  } catch (err) {
    console.error("Bridge failed:", err instanceof Error ? err.message : "Unknown error");
    console.error(
      `Your ${bridgeAmount} USDC remains on Ethereum. Retry the bridge or swap back to USDT.`
    );
    return;
  }

  // Step 3: Swap USDC to DAI on Base
  try {
    const swapResult2 = await kit.swap({
      from: { adapter, chain: "Base" },
      tokenIn: "USDC",
      tokenOut: "DAI",
      amountIn: bridgeResult.amount,
      config: {
        kitKey: process.env.KIT_KEY as string,
      },
    });
    console.log("Swap 2 completed:", inspect(swapResult2, false, null, true));
  } catch (err) {
    console.error("Swap 2 failed:", err instanceof Error ? err.message : "Unknown error");
    console.error(
      `Your ${bridgeResult.amount} USDC arrived on Base but the swap failed. Retry the swap on Base.`
    );
    return;
  }
};

void crosschainMovement();
```
