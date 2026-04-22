# Solana Kit Adapter

Reference implementation for token swaps on Solana using the Solana Kit adapter. Includes examples for both App Kit and standalone Swap Kit.

## Setup

```bash
# App Kit (recommended)
npm install @circle-fin/app-kit @circle-fin/adapter-solana-kit @solana/kit @solana/web3.js

# Swap Kit (standalone)
npm install @circle-fin/swap-kit @circle-fin/adapter-solana-kit @solana/kit @solana/web3.js
```

## Environment Variables

```
SOLANA_PRIVATE_KEY=       # Solana wallet private key (base58)
KIT_KEY=                  # Kit key from Circle Developer Console
```

## Using App Kit

```ts
import { AppKit } from "@circle-fin/app-kit";
import { createSolanaKitAdapterFromPrivateKey } from "@circle-fin/adapter-solana-kit";
import { inspect } from "util";

const kit = new AppKit();

const swapTokens = async (): Promise<void> => {
  const solanaPrivateKey = process.env.SOLANA_PRIVATE_KEY;
  if (!solanaPrivateKey || !/^[1-9A-HJ-NP-Za-km-z]+$/.test(solanaPrivateKey)) {
    throw new Error("SOLANA_PRIVATE_KEY env var must be set to a base58-encoded private key");
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
import { createSolanaKitAdapterFromPrivateKey } from "@circle-fin/adapter-solana-kit";
import { inspect } from "util";

const kit = new SwapKit();

const swapTokens = async (): Promise<void> => {
  const solanaPrivateKey = process.env.SOLANA_PRIVATE_KEY;
  if (!solanaPrivateKey || !/^[1-9A-HJ-NP-Za-km-z]+$/.test(solanaPrivateKey)) {
    throw new Error("SOLANA_PRIVATE_KEY env var must be set to a base58-encoded private key");
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
