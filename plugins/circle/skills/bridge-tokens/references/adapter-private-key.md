# Private Key Adapter (Viem + Solana Kit)

Bridge USDC with private-key adapters (EVM-to-EVM and EVM-to-Solana), using App Kit or standalone Bridge Kit. Each example exports `bridgeUSDC()`: call it only from the user's explicit confirm action, never at module startup.

## Setup

```bash
# App Kit (recommended)
npm install @circle-fin/app-kit @circle-fin/adapter-viem-v2

# Bridge Kit (standalone)
npm install @circle-fin/bridge-kit @circle-fin/adapter-viem-v2

# EVM to Solana: add the Solana Kit adapter
npm install @circle-fin/adapter-solana-kit @solana/kit @solana/web3.js
```

## Environment Variables

```
PRIVATE_KEY=              # EVM wallet private key (hex, 0x-prefixed)
EVM_PRIVATE_KEY=          # EVM private key (when also using Solana)
SOLANA_PRIVATE_KEY=       # Solana wallet private key (Base58, Base64, or JSON byte array)
```

## EVM to EVM

### Using App Kit

```ts
import { AppKit } from "@circle-fin/app-kit";
import { createViemAdapterFromPrivateKey } from "@circle-fin/adapter-viem-v2";
import { inspect } from "util";

const kit = new AppKit();

export const bridgeUSDC = async (): Promise<void> => {
  const privateKey = process.env.PRIVATE_KEY;
  if (!privateKey || !privateKey.startsWith("0x")) {
    throw new Error("PRIVATE_KEY env var must be set and 0x-prefixed");
  }

  try {
    const adapter = createViemAdapterFromPrivateKey({
      privateKey: privateKey as `0x${string}`,
    });

    const result = await kit.bridge({
      from: { adapter, chain: "Arc_Testnet" },
      to: { adapter, chain: "Base_Sepolia" },
      amount: "1.00",
    });

    console.log("RESULT", inspect(result, false, null, true));
  } catch (err) {
    console.error("ERROR", err instanceof Error ? err.message : "Unknown error");
  }
};
```

### Using Bridge Kit

```ts
import { BridgeKit } from "@circle-fin/bridge-kit";
import { createViemAdapterFromPrivateKey } from "@circle-fin/adapter-viem-v2";
import { inspect } from "util";

const kit = new BridgeKit();

export const bridgeUSDC = async (): Promise<void> => {
  const privateKey = process.env.PRIVATE_KEY;
  if (!privateKey || !privateKey.startsWith("0x")) {
    throw new Error("PRIVATE_KEY env var must be set and 0x-prefixed");
  }

  try {
    const adapter = createViemAdapterFromPrivateKey({
      privateKey: privateKey as `0x${string}`,
    });

    const result = await kit.bridge({
      from: { adapter, chain: "Arc_Testnet" },
      to: { adapter, chain: "Base_Sepolia" },
      amount: "1.00",
    });

    console.log("RESULT", inspect(result, false, null, true));
  } catch (err) {
    console.error("ERROR", err instanceof Error ? err.message : "Unknown error");
  }
};
```

## EVM to Solana

### Using App Kit

```ts
import { AppKit } from "@circle-fin/app-kit";
import { createViemAdapterFromPrivateKey } from "@circle-fin/adapter-viem-v2";
import { createSolanaKitAdapterFromPrivateKey } from "@circle-fin/adapter-solana-kit";
import { inspect } from "util";

const kit = new AppKit();

export const bridgeUSDC = async (): Promise<void> => {
  const evmPrivateKey = process.env.EVM_PRIVATE_KEY;
  if (!evmPrivateKey || !evmPrivateKey.startsWith("0x")) {
    throw new Error("EVM_PRIVATE_KEY env var must be set and 0x-prefixed");
  }

  const solanaPrivateKey = process.env.SOLANA_PRIVATE_KEY;
  if (!solanaPrivateKey) {
    throw new Error("SOLANA_PRIVATE_KEY env var must be set");
  }

  try {
    const evmAdapter = createViemAdapterFromPrivateKey({
      privateKey: evmPrivateKey as `0x${string}`,
    });

    const solanaAdapter = createSolanaKitAdapterFromPrivateKey({
      privateKey: solanaPrivateKey,
    });

    const result = await kit.bridge({
      from: { adapter: evmAdapter, chain: "Ethereum_Sepolia" },
      to: { adapter: solanaAdapter, chain: "Solana_Devnet" },
      amount: "1.00",
    });

    console.log("RESULT", inspect(result, false, null, true));
  } catch (err) {
    console.error("ERROR", err instanceof Error ? err.message : "Unknown error");
  }
};
```

### Using Bridge Kit

```ts
import { BridgeKit } from "@circle-fin/bridge-kit";
import { createViemAdapterFromPrivateKey } from "@circle-fin/adapter-viem-v2";
import { createSolanaKitAdapterFromPrivateKey } from "@circle-fin/adapter-solana-kit";
import { inspect } from "util";

const kit = new BridgeKit();

export const bridgeUSDC = async (): Promise<void> => {
  const evmPrivateKey = process.env.EVM_PRIVATE_KEY;
  if (!evmPrivateKey || !evmPrivateKey.startsWith("0x")) {
    throw new Error("EVM_PRIVATE_KEY env var must be set and 0x-prefixed");
  }

  const solanaPrivateKey = process.env.SOLANA_PRIVATE_KEY;
  if (!solanaPrivateKey) {
    throw new Error("SOLANA_PRIVATE_KEY env var must be set");
  }

  try {
    const evmAdapter = createViemAdapterFromPrivateKey({
      privateKey: evmPrivateKey as `0x${string}`,
    });

    const solanaAdapter = createSolanaKitAdapterFromPrivateKey({
      privateKey: solanaPrivateKey,
    });

    const result = await kit.bridge({
      from: { adapter: evmAdapter, chain: "Ethereum_Sepolia" },
      to: { adapter: solanaAdapter, chain: "Solana_Devnet" },
      amount: "1.00",
    });

    console.log("RESULT", inspect(result, false, null, true));
  } catch (err) {
    console.error("ERROR", err instanceof Error ? err.message : "Unknown error");
  }
};
```
