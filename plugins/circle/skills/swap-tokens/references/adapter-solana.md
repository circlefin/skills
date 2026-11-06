# Solana Kit Adapter

Token swaps on Solana with the Solana Kit private-key adapter, for App Kit and standalone Swap Kit.

## Setup

```bash
# App Kit (recommended)
npm install @circle-fin/app-kit @circle-fin/adapter-solana-kit @solana/kit @solana/web3.js

# Swap Kit (standalone)
npm install @circle-fin/swap-kit @circle-fin/adapter-solana-kit @solana/kit @solana/web3.js
```

## Environment Variables

```
SOLANA_PRIVATE_KEY=       # Solana wallet private key (Base58, Base64, or JSON byte array)
SWAP_API_KEY=             # Optional Circle API key for authenticated swap requests
```

The examples run keyless. To authenticate, add
`config: { apiKey: process.env.SWAP_API_KEY }` to the `swap()` params.

## Using App Kit

```ts
import { AppKit } from "@circle-fin/app-kit";
import { createSolanaKitAdapterFromPrivateKey } from "@circle-fin/adapter-solana-kit";
import { inspect } from "util";

const kit = new AppKit();

export const swapTokens = async (): Promise<void> => {
  const solanaPrivateKey = process.env.SOLANA_PRIVATE_KEY;
  if (!solanaPrivateKey) {
    throw new Error("SOLANA_PRIVATE_KEY env var must be set");
  }

  try {
    const adapter = createSolanaKitAdapterFromPrivateKey({
      privateKey: solanaPrivateKey,
    });

    const result = await kit.swap({
      from: { adapter, chain: "Solana" },
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
import { createSolanaKitAdapterFromPrivateKey } from "@circle-fin/adapter-solana-kit";
import { inspect } from "util";

const kit = new SwapKit();

export const swapTokens = async (): Promise<void> => {
  const solanaPrivateKey = process.env.SOLANA_PRIVATE_KEY;
  if (!solanaPrivateKey) {
    throw new Error("SOLANA_PRIVATE_KEY env var must be set");
  }

  try {
    const adapter = createSolanaKitAdapterFromPrivateKey({
      privateKey: solanaPrivateKey,
    });

    const result = await kit.swap({
      from: { adapter, chain: "Solana" },
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
