# Circle Wallets Adapter (Developer-Controlled Wallets)

Reference implementation for bridging USDC using Circle developer-controlled wallets. Supports any chain to any chain (EVM <-> EVM, EVM <-> Solana, Solana <-> Solana). Includes examples for both App Kit and standalone Bridge Kit.

## Setup

```bash
# App Kit (recommended)
npm install @circle-fin/app-kit @circle-fin/adapter-circle-wallets

# Bridge Kit (standalone)
npm install @circle-fin/bridge-kit @circle-fin/adapter-circle-wallets
```

## Environment Variables

```
CIRCLE_API_KEY=           # Circle API key (for Circle Wallets adapter)
CIRCLE_ENTITY_SECRET=     # Entity secret (for Circle Wallets adapter)
EVM_WALLET_ADDRESS=       # Developer-controlled EVM wallet address
SOLANA_WALLET_ADDRESS=    # Developer-controlled Solana wallet address
```

## Using App Kit

```ts
import { AppKit } from "@circle-fin/app-kit";
import { createCircleWalletsAdapter } from "@circle-fin/adapter-circle-wallets";
import { inspect } from "util";

const kit = new AppKit();

export const bridgeUSDC = async (): Promise<void> => {
  const apiKey = process.env.CIRCLE_API_KEY;
  const entitySecret = process.env.CIRCLE_ENTITY_SECRET;
  const evmWalletAddress = process.env.EVM_WALLET_ADDRESS;
  const solanaWalletAddress = process.env.SOLANA_WALLET_ADDRESS;
  if (!apiKey || !entitySecret) {
    throw new Error("CIRCLE_API_KEY and CIRCLE_ENTITY_SECRET env vars must be set");
  }
  if (!evmWalletAddress || !solanaWalletAddress) {
    throw new Error("EVM_WALLET_ADDRESS and SOLANA_WALLET_ADDRESS env vars must be set");
  }

  try {
    const adapter = createCircleWalletsAdapter({
      apiKey,
      entitySecret,
    });

    const result = await kit.bridge({
      from: {
        adapter,
        chain: "Arc_Testnet",
        address: evmWalletAddress,
      },
      to: {
        adapter,
        chain: "Solana_Devnet",
        address: solanaWalletAddress,
      },
      amount: "1.00",
    });

    console.log("RESULT", inspect(result, false, null, true));
  } catch (err) {
    console.error("ERROR", err instanceof Error ? err.message : "Unknown error");
  }
};

// Call bridgeUSDC() only from the user's explicit confirm action -- never at module startup.
```

## Using Bridge Kit

```ts
import { BridgeKit } from "@circle-fin/bridge-kit";
import { createCircleWalletsAdapter } from "@circle-fin/adapter-circle-wallets";
import { inspect } from "util";

const kit = new BridgeKit();

export const bridgeUSDC = async (): Promise<void> => {
  const apiKey = process.env.CIRCLE_API_KEY;
  const entitySecret = process.env.CIRCLE_ENTITY_SECRET;
  const evmWalletAddress = process.env.EVM_WALLET_ADDRESS;
  const solanaWalletAddress = process.env.SOLANA_WALLET_ADDRESS;
  if (!apiKey || !entitySecret) {
    throw new Error("CIRCLE_API_KEY and CIRCLE_ENTITY_SECRET env vars must be set");
  }
  if (!evmWalletAddress || !solanaWalletAddress) {
    throw new Error("EVM_WALLET_ADDRESS and SOLANA_WALLET_ADDRESS env vars must be set");
  }

  try {
    const adapter = createCircleWalletsAdapter({
      apiKey,
      entitySecret,
    });

    const result = await kit.bridge({
      from: {
        adapter,
        chain: "Arc_Testnet",
        address: evmWalletAddress,
      },
      to: {
        adapter,
        chain: "Solana_Devnet",
        address: solanaWalletAddress,
      },
      amount: "1.00",
    });

    console.log("RESULT", inspect(result, false, null, true));
  } catch (err) {
    console.error("ERROR", err instanceof Error ? err.message : "Unknown error");
  }
};

// Call bridgeUSDC() only from the user's explicit confirm action -- never at module startup.
```
