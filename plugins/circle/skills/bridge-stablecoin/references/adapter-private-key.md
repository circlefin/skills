# Private Key Adapter (Viem + Solana Kit)

Reference implementation for bridging USDC using private key adapters -- covers EVM-to-EVM and EVM-to-Solana routes. Includes examples for both App Kit and standalone Bridge Kit.

## Setup

```bash
# App Kit (recommended)
npm install @circle-fin/app-kit @circle-fin/adapter-viem-v2

# Bridge Kit (standalone)
npm install @circle-fin/bridge-kit @circle-fin/adapter-viem-v2
```

## Environment Variables

```
PRIVATE_KEY=              # EVM wallet private key (hex, 0x-prefixed)
EVM_PRIVATE_KEY=          # EVM private key (when also using Solana)
SOLANA_PRIVATE_KEY=       # Solana wallet private key (base58)
```

## EVM to EVM

### Using App Kit

```ts
import { AppKit } from "@circle-fin/app-kit";
import { createViemAdapterFromPrivateKey } from "@circle-fin/adapter-viem-v2";
import { inspect } from "util";

const kit = new AppKit();

const bridgeUSDC = async (): Promise<void> => {
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

void bridgeUSDC();
```

### Using Bridge Kit

```ts
import { BridgeKit } from "@circle-fin/bridge-kit";
import { createViemAdapterFromPrivateKey } from "@circle-fin/adapter-viem-v2";
import { inspect } from "util";

const kit = new BridgeKit();

const bridgeUSDC = async (): Promise<void> => {
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

void bridgeUSDC();
```

## EVM to Solana

### Using App Kit

```ts
import { AppKit } from "@circle-fin/app-kit";
import { createViemAdapterFromPrivateKey } from "@circle-fin/adapter-viem-v2";
import { createSolanaKitAdapterFromPrivateKey } from "@circle-fin/adapter-solana-kit";
import { inspect } from "util";

const kit = new AppKit();

const bridgeUSDC = async (): Promise<void> => {
  const evmPrivateKey = process.env.EVM_PRIVATE_KEY;
  if (!evmPrivateKey || !evmPrivateKey.startsWith("0x")) {
    throw new Error("EVM_PRIVATE_KEY env var must be set and 0x-prefixed");
  }

  const solanaPrivateKey = process.env.SOLANA_PRIVATE_KEY;
  if (!solanaPrivateKey || !/^[1-9A-HJ-NP-Za-km-z]+$/.test(solanaPrivateKey)) {
    throw new Error("SOLANA_PRIVATE_KEY env var must be set to a base58-encoded private key");
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

void bridgeUSDC();
```

### Using Bridge Kit

```ts
import { BridgeKit } from "@circle-fin/bridge-kit";
import { createViemAdapterFromPrivateKey } from "@circle-fin/adapter-viem-v2";
import { createSolanaKitAdapterFromPrivateKey } from "@circle-fin/adapter-solana-kit";
import { inspect } from "util";

const kit = new BridgeKit();

const bridgeUSDC = async (): Promise<void> => {
  const evmPrivateKey = process.env.EVM_PRIVATE_KEY;
  if (!evmPrivateKey || !evmPrivateKey.startsWith("0x")) {
    throw new Error("EVM_PRIVATE_KEY env var must be set and 0x-prefixed");
  }

  const solanaPrivateKey = process.env.SOLANA_PRIVATE_KEY;
  if (!solanaPrivateKey || !/^[1-9A-HJ-NP-Za-km-z]+$/.test(solanaPrivateKey)) {
    throw new Error("SOLANA_PRIVATE_KEY env var must be set to a base58-encoded private key");
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

void bridgeUSDC();
```
