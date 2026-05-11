# Circle Wallets Adapter (Developer-Controlled Wallets)

Reference implementation for unified balance deposit and spend using Circle developer-controlled wallets. Server-side only -- uses Circle API key and entity secret for wallet management. Includes examples for both App Kit and standalone Unified Balance Kit.

## Setup

```bash
# App Kit (recommended)
npm install @circle-fin/app-kit @circle-fin/adapter-circle-wallets

# Unified Balance Kit (standalone)
npm install @circle-fin/unified-balance-kit @circle-fin/adapter-circle-wallets
```

## Environment Variables

```
CIRCLE_API_KEY=           # Circle API key (for Circle Wallets adapter)
CIRCLE_ENTITY_SECRET=     # Entity secret (for Circle Wallets adapter)
WALLET_ADDRESS=           # Developer-controlled wallet address
```

## Deposit (Using App Kit)

```ts
import { AppKit } from "@circle-fin/app-kit";
import { createCircleWalletsAdapter } from "@circle-fin/adapter-circle-wallets";
import { inspect } from "util";

const kit = new AppKit();

const deposit = async (): Promise<void> => {
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

    const result = await kit.unifiedBalance.deposit({
      from: {
        adapter,
        chain: "Arc_Testnet",
        address: walletAddress,
      },
      amount: "10.00",
    });

    console.log("RESULT", inspect(result, false, null, true));
  } catch (err) {
    console.error("ERROR", err instanceof Error ? err.message : "Unknown error");
  }
};

void deposit();
```

## Deposit (Using Unified Balance Kit)

```ts
import { UnifiedBalanceKit } from "@circle-fin/unified-balance-kit";
import { createCircleWalletsAdapter } from "@circle-fin/adapter-circle-wallets";
import { inspect } from "util";

const kit = new UnifiedBalanceKit();

const deposit = async (): Promise<void> => {
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

    const result = await kit.deposit({
      from: {
        adapter,
        chain: "Arc_Testnet",
        address: walletAddress,
      },
      amount: "10.00",
    });

    console.log("RESULT", inspect(result, false, null, true));
  } catch (err) {
    console.error("ERROR", err instanceof Error ? err.message : "Unknown error");
  }
};

void deposit();
```

## Spend from Specific Chain (Using App Kit)

Use `allocations` to specify which chain to draw from. For Circle Wallets, `address` is required since developer-controlled wallets don't auto-resolve addresses.

```ts
import { AppKit } from "@circle-fin/app-kit";
import { createCircleWalletsAdapter } from "@circle-fin/adapter-circle-wallets";
import { inspect } from "util";

const kit = new AppKit();

const spend = async (): Promise<void> => {
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

    const result = await kit.unifiedBalance.spend({
      from: {
        adapter,
        address: walletAddress,
        allocations: { amount: "5.00", chain: "Arc_Testnet" },
      },
      to: {
        chain: "Base_Sepolia",
        recipientAddress: "0x742d35Cc6634C0532925a3b844Bc454e4438f44e",
      },
      amount: "5.00",
    });

    console.log("RESULT", inspect(result, false, null, true));
  } catch (err) {
    console.error("ERROR", err instanceof Error ? err.message : "Unknown error");
  }
};

void spend();
```

## Spend from Specific Chain (Using Unified Balance Kit)

```ts
import { UnifiedBalanceKit } from "@circle-fin/unified-balance-kit";
import { createCircleWalletsAdapter } from "@circle-fin/adapter-circle-wallets";
import { inspect } from "util";

const kit = new UnifiedBalanceKit();

const spend = async (): Promise<void> => {
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

    const result = await kit.spend({
      from: {
        adapter,
        address: walletAddress,
        allocations: { amount: "5.00", chain: "Arc_Testnet" },
      },
      to: {
        chain: "Base_Sepolia",
        recipientAddress: "0x742d35Cc6634C0532925a3b844Bc454e4438f44e",
      },
      amount: "5.00",
    });

    console.log("RESULT", inspect(result, false, null, true));
  } catch (err) {
    console.error("ERROR", err instanceof Error ? err.message : "Unknown error");
  }
};

void spend();
```

## Spend with Auto-Allocation (Using App Kit)

When `allocations` is omitted, the provider automatically decides which source chains to draw from.

```ts
import { AppKit } from "@circle-fin/app-kit";
import { createCircleWalletsAdapter } from "@circle-fin/adapter-circle-wallets";
import { inspect } from "util";

const kit = new AppKit();

const spend = async (): Promise<void> => {
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

    const result = await kit.unifiedBalance.spend({
      from: {
        adapter,
        address: walletAddress,
      },
      to: {
        chain: "Arc_Testnet",
        recipientAddress: "0x742d35Cc6634C0532925a3b844Bc454e4438f44e",
      },
      amount: "5.00",
    });

    console.log("RESULT", inspect(result, false, null, true));
  } catch (err) {
    console.error("ERROR", err instanceof Error ? err.message : "Unknown error");
  }
};

void spend();
```

## Spend with Auto-Allocation (Using Unified Balance Kit)

```ts
import { UnifiedBalanceKit } from "@circle-fin/unified-balance-kit";
import { createCircleWalletsAdapter } from "@circle-fin/adapter-circle-wallets";
import { inspect } from "util";

const kit = new UnifiedBalanceKit();

const spend = async (): Promise<void> => {
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

    const result = await kit.spend({
      from: {
        adapter,
        address: walletAddress,
      },
      to: {
        chain: "Arc_Testnet",
        recipientAddress: "0x742d35Cc6634C0532925a3b844Bc454e4438f44e",
      },
      amount: "5.00",
    });

    console.log("RESULT", inspect(result, false, null, true));
  } catch (err) {
    console.error("ERROR", err instanceof Error ? err.message : "Unknown error");
  }
};

void spend();
```
