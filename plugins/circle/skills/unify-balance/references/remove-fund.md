# Remove Fund

Reference implementation for withdrawing USDC from a unified balance back to your wallet. Fund removal is a two-step process with a mandatory 7-day delay. Includes examples for both App Kit and standalone Unified Balance Kit.

## How It Works

1. **`initiateRemoveFund()`** — Starts a delayed withdrawal on a specific chain. The 7-day timer begins at this point.
2. **`removeFund()`** — Completes the withdrawal after the activation period has passed. USDC is transferred from the Gateway Wallet back to your wallet on that chain.

Only one removal may be pending per chain at a time. Initiating a second removal on the same chain adds the requested amount to the existing pending removal and restarts the 7-day timer.

## Setup

```bash
# App Kit (recommended)
npm install @circle-fin/app-kit @circle-fin/adapter-viem-v2 viem

# Unified Balance Kit (standalone)
npm install @circle-fin/unified-balance-kit @circle-fin/adapter-viem-v2 viem
```

## Environment Variables

```
EVM_PRIVATE_KEY=          # EVM wallet private key (hex, 0x-prefixed)
```

## Initiate Remove Fund (Using App Kit)

```ts
import { AppKit } from "@circle-fin/app-kit";
import { createViemAdapterFromPrivateKey } from "@circle-fin/adapter-viem-v2";
import { inspect } from "util";

const kit = new AppKit();

const initiateRemoval = async (): Promise<void> => {
  const privateKey = process.env.EVM_PRIVATE_KEY;
  if (!privateKey || !privateKey.startsWith("0x")) {
    throw new Error("EVM_PRIVATE_KEY env var must be set and 0x-prefixed");
  }

  try {
    const adapter = createViemAdapterFromPrivateKey({
      privateKey: privateKey as `0x${string}`,
    });

    const result = await kit.unifiedBalance.initiateRemoveFund({
      from: { adapter, chain: "Arc_Testnet" },
      amount: "10.00",
    });

    console.log("RESULT", inspect(result, false, null, true));
    console.log(`Withdrawal block: ${result.withdrawalBlock}`);
    console.log("Wait for the 7-day activation period before calling removeFund()");
  } catch (err) {
    console.error("ERROR", err instanceof Error ? err.message : "Unknown error");
  }
};

void initiateRemoval();
```

## Initiate Remove Fund (Using Unified Balance Kit)

```ts
import { UnifiedBalanceKit } from "@circle-fin/unified-balance-kit";
import { createViemAdapterFromPrivateKey } from "@circle-fin/adapter-viem-v2";
import { inspect } from "util";

const kit = new UnifiedBalanceKit();

const initiateRemoval = async (): Promise<void> => {
  const privateKey = process.env.EVM_PRIVATE_KEY;
  if (!privateKey || !privateKey.startsWith("0x")) {
    throw new Error("EVM_PRIVATE_KEY env var must be set and 0x-prefixed");
  }

  try {
    const adapter = createViemAdapterFromPrivateKey({
      privateKey: privateKey as `0x${string}`,
    });

    const result = await kit.initiateRemoveFund({
      from: { adapter, chain: "Arc_Testnet" },
      amount: "10.00",
    });

    console.log("RESULT", inspect(result, false, null, true));
    console.log(`Withdrawal block: ${result.withdrawalBlock}`);
    console.log("Wait for the 7-day activation period before calling removeFund()");
  } catch (err) {
    console.error("ERROR", err instanceof Error ? err.message : "Unknown error");
  }
};

void initiateRemoval();
```

## Complete Remove Fund (Using App Kit)

Call after the 7-day activation period has passed. The `from` context must match the one used when initiating.

```ts
import { AppKit } from "@circle-fin/app-kit";
import { createViemAdapterFromPrivateKey } from "@circle-fin/adapter-viem-v2";
import { inspect } from "util";

const kit = new AppKit();

const completeRemoval = async (): Promise<void> => {
  const privateKey = process.env.EVM_PRIVATE_KEY;
  if (!privateKey || !privateKey.startsWith("0x")) {
    throw new Error("EVM_PRIVATE_KEY env var must be set and 0x-prefixed");
  }

  try {
    const adapter = createViemAdapterFromPrivateKey({
      privateKey: privateKey as `0x${string}`,
    });

    const result = await kit.unifiedBalance.removeFund({
      from: { adapter, chain: "Arc_Testnet" },
    });

    console.log("RESULT", inspect(result, false, null, true));
    console.log(`Removed ${result.amount} ${result.token} on ${result.chain}`);
  } catch (err) {
    console.error("ERROR", err instanceof Error ? err.message : "Unknown error");
  }
};

void completeRemoval();
```

## Complete Remove Fund (Using Unified Balance Kit)

```ts
import { UnifiedBalanceKit } from "@circle-fin/unified-balance-kit";
import { createViemAdapterFromPrivateKey } from "@circle-fin/adapter-viem-v2";
import { inspect } from "util";

const kit = new UnifiedBalanceKit();

const completeRemoval = async (): Promise<void> => {
  const privateKey = process.env.EVM_PRIVATE_KEY;
  if (!privateKey || !privateKey.startsWith("0x")) {
    throw new Error("EVM_PRIVATE_KEY env var must be set and 0x-prefixed");
  }

  try {
    const adapter = createViemAdapterFromPrivateKey({
      privateKey: privateKey as `0x${string}`,
    });

    const result = await kit.removeFund({
      from: { adapter, chain: "Arc_Testnet" },
    });

    console.log("RESULT", inspect(result, false, null, true));
    console.log(`Removed ${result.amount} ${result.token} on ${result.chain}`);
  } catch (err) {
    console.error("ERROR", err instanceof Error ? err.message : "Unknown error");
  }
};

void completeRemoval();
```
