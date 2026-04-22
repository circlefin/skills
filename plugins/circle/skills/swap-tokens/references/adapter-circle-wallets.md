# Circle Wallets Adapter (Developer-Controlled Wallets)

Reference implementation for token swaps using Circle developer-controlled wallets. Server-side only -- uses Circle API key and entity secret for wallet management.

## Setup

```bash
# App Kit (recommended)
npm install @circle-fin/app-kit @circle-fin/adapter-circle-wallets

# Swap Kit (standalone)
npm install @circle-fin/swap-kit @circle-fin/adapter-circle-wallets
```

## Environment Variables

```
CIRCLE_API_KEY=           # Circle API key (for Circle Wallets adapter)
CIRCLE_ENTITY_SECRET=     # Entity secret (for Circle Wallets adapter)
KIT_KEY=                  # Kit key from Circle Developer Console
```

## Using App Kit

```ts
import { AppKit } from "@circle-fin/app-kit";
import { createCircleWalletsAdapter } from "@circle-fin/adapter-circle-wallets";
import { inspect } from "util";

const kit = new AppKit();

const swapTokens = async (): Promise<void> => {
  const apiKey = process.env.CIRCLE_API_KEY;
  const entitySecret = process.env.CIRCLE_ENTITY_SECRET;
  const walletAddress = process.env.WALLET_ADDRESS;
  if (!apiKey || !entitySecret) {
    throw new Error("CIRCLE_API_KEY and CIRCLE_ENTITY_SECRET env vars must be set");
  }
  if (!walletAddress) {
    throw new Error("WALLET_ADDRESS env var must be set");
  }

  try {
    const adapter = createCircleWalletsAdapter({
      apiKey,
      entitySecret,
    });

    const result = await kit.swap({
      from: {
        adapter,
        chain: "Ethereum",
        address: walletAddress,
      },
      tokenIn: "USDT",
      tokenOut: "USDC",
      amountIn: "1.00",
      config: {
        kitKey: process.env.KIT_KEY as string,
      },
    });

    console.log("RESULT", inspect(result, false, null, true));
  } catch (err) {
    console.error("ERROR", err instanceof Error ? err.message : "Unknown error");
  }
};

void swapTokens();
```

## Using Swap Kit

```ts
import { SwapKit } from "@circle-fin/swap-kit";
import { createCircleWalletsAdapter } from "@circle-fin/adapter-circle-wallets";
import { inspect } from "util";

const kit = new SwapKit();

const swapTokens = async (): Promise<void> => {
  const apiKey = process.env.CIRCLE_API_KEY;
  const entitySecret = process.env.CIRCLE_ENTITY_SECRET;
  const walletAddress = process.env.WALLET_ADDRESS;
  if (!apiKey || !entitySecret) {
    throw new Error("CIRCLE_API_KEY and CIRCLE_ENTITY_SECRET env vars must be set");
  }
  if (!walletAddress) {
    throw new Error("WALLET_ADDRESS env var must be set");
  }

  try {
    const adapter = createCircleWalletsAdapter({
      apiKey,
      entitySecret,
    });

    const result = await kit.swap({
      from: {
        adapter,
        chain: "Ethereum",
        address: walletAddress,
      },
      tokenIn: "USDT",
      tokenOut: "USDC",
      amountIn: "1.00",
      config: {
        kitKey: process.env.KIT_KEY as string,
      },
    });

    console.log("RESULT", inspect(result, false, null, true));
  } catch (err) {
    console.error("ERROR", err instanceof Error ? err.message : "Unknown error");
  }
};

void swapTokens();
```
