# Viem Private Key Adapter

Same-chain token swaps with the Viem private-key adapter, for App Kit and standalone Swap Kit.

## Setup

```bash
# App Kit (recommended)
npm install @circle-fin/app-kit @circle-fin/adapter-viem-v2 viem

# Swap Kit (standalone)
npm install @circle-fin/swap-kit @circle-fin/adapter-viem-v2 viem
```

## Environment Variables

```
PRIVATE_KEY=              # EVM wallet private key (hex, 0x-prefixed)
SWAP_API_KEY=             # Optional Circle API key for authenticated swap requests
```

The examples run keyless. To authenticate, add
`config: { apiKey: process.env.SWAP_API_KEY }` to the `swap()` params.

## Using App Kit

```ts
import { AppKit } from "@circle-fin/app-kit";
import { createViemAdapterFromPrivateKey } from "@circle-fin/adapter-viem-v2";
import { inspect } from "util";

const kit = new AppKit();

export const swapTokens = async (): Promise<void> => {
  const privateKey = process.env.PRIVATE_KEY;
  if (!privateKey || !privateKey.startsWith("0x")) {
    throw new Error("PRIVATE_KEY env var must be set and 0x-prefixed");
  }

  try {
    const adapter = createViemAdapterFromPrivateKey({
      privateKey: privateKey as `0x${string}`,
    });

    const result = await kit.swap({
      from: { adapter, chain: "Ethereum" },
      tokenIn: "USDT",
      tokenOut: "USDC",
      amountIn: "1.00",
    });

    console.log("RESULT", inspect(result, false, null, true));
  } catch (err) {
    console.error("ERROR", err instanceof Error ? err.message : "Unknown error");
  }
};

// Call swapTokens() only from the user's explicit confirm action, never at module startup.
```

## Using Swap Kit

```ts
import { SwapKit } from "@circle-fin/swap-kit";
import { createViemAdapterFromPrivateKey } from "@circle-fin/adapter-viem-v2";
import { inspect } from "util";

const kit = new SwapKit();

export const swapTokens = async (): Promise<void> => {
  const privateKey = process.env.PRIVATE_KEY;
  if (!privateKey || !privateKey.startsWith("0x")) {
    throw new Error("PRIVATE_KEY env var must be set and 0x-prefixed");
  }

  try {
    const adapter = createViemAdapterFromPrivateKey({
      privateKey: privateKey as `0x${string}`,
    });

    const result = await kit.swap({
      from: { adapter, chain: "Ethereum" },
      tokenIn: "USDT",
      tokenOut: "USDC",
      amountIn: "1.00",
    });

    console.log("RESULT", inspect(result, false, null, true));
  } catch (err) {
    console.error("ERROR", err instanceof Error ? err.message : "Unknown error");
  }
};

// Call swapTokens() only from the user's explicit confirm action, never at module startup.
```
