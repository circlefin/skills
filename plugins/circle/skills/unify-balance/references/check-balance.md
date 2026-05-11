# Check Balance

Reference implementation for querying unified USDC balances using `getBalances()`. Supports both adapter-based sources (derive address from adapter) and address-only sources (provide address directly). Includes examples for both App Kit and standalone Unified Balance Kit.

## Setup

```bash
# App Kit (recommended)
npm install @circle-fin/app-kit @circle-fin/adapter-viem-v2 viem

# Unified Balance Kit (standalone)
npm install @circle-fin/unified-balance-kit @circle-fin/adapter-viem-v2 viem
```

## Environment Variables

```
EVM_PRIVATE_KEY=          # EVM wallet private key (hex, 0x-prefixed) -- for adapter-based queries
```

## Get Balances with Adapter (Using App Kit)

Use an adapter to derive the depositor address automatically.

```ts
import { AppKit } from "@circle-fin/app-kit";
import { createViemAdapterFromPrivateKey } from "@circle-fin/adapter-viem-v2";
import { inspect } from "util";

const kit = new AppKit();

const checkBalance = async (): Promise<void> => {
  const privateKey = process.env.EVM_PRIVATE_KEY;
  if (!privateKey || !privateKey.startsWith("0x")) {
    throw new Error("EVM_PRIVATE_KEY env var must be set and 0x-prefixed");
  }

  try {
    const adapter = createViemAdapterFromPrivateKey({
      privateKey: privateKey as `0x${string}`,
    });

    const balances = await kit.unifiedBalance.getBalances({
      sources: { adapter, chains: "Arc_Testnet" },
    });

    console.log("BALANCES", inspect(balances, false, null, true));
  } catch (err) {
    console.error("ERROR", err instanceof Error ? err.message : "Unknown error");
  }
};

void checkBalance();
```

## Get Balances with Adapter (Using Unified Balance Kit)

```ts
import { UnifiedBalanceKit } from "@circle-fin/unified-balance-kit";
import { createViemAdapterFromPrivateKey } from "@circle-fin/adapter-viem-v2";
import { inspect } from "util";

const kit = new UnifiedBalanceKit();

const checkBalance = async (): Promise<void> => {
  const privateKey = process.env.EVM_PRIVATE_KEY;
  if (!privateKey || !privateKey.startsWith("0x")) {
    throw new Error("EVM_PRIVATE_KEY env var must be set and 0x-prefixed");
  }

  try {
    const adapter = createViemAdapterFromPrivateKey({
      privateKey: privateKey as `0x${string}`,
    });

    const balances = await kit.getBalances({
      sources: { adapter, chains: "Arc_Testnet" },
    });

    console.log("BALANCES", inspect(balances, false, null, true));
  } catch (err) {
    console.error("ERROR", err instanceof Error ? err.message : "Unknown error");
  }
};

void checkBalance();
```

## Get Balances Across All Chains (Using App Kit)

Query balances across all supported chains by omitting `chains`. Set `networkType` to `'testnet'` for testnet chains (defaults to `'mainnet'`).

```ts
import { AppKit } from "@circle-fin/app-kit";

const kit = new AppKit();

const checkAllChains = async (): Promise<void> => {
  const depositorAddress = process.env.DEPOSITOR_ADDRESS;
  if (!depositorAddress) {
    throw new Error("DEPOSITOR_ADDRESS env var must be set");
  }

  try {
    const balances = await kit.unifiedBalance.getBalances({
      sources: { address: depositorAddress },
      networkType: "testnet",
    });

    console.log("TOTAL:", balances.totalConfirmedBalance, "USDC");
    for (const account of balances.breakdown) {
      for (const chain of account.breakdown) {
        console.log(`  ${chain.chain}: ${chain.confirmedBalance} USDC`);
      }
    }
  } catch (err) {
    console.error("ERROR", err instanceof Error ? err.message : "Unknown error");
  }
};

void checkAllChains();
```

## Get Balances Across All Chains (Using Unified Balance Kit)

```ts
import { UnifiedBalanceKit } from "@circle-fin/unified-balance-kit";

const kit = new UnifiedBalanceKit();

const checkAllChains = async (): Promise<void> => {
  const depositorAddress = process.env.DEPOSITOR_ADDRESS;
  if (!depositorAddress) {
    throw new Error("DEPOSITOR_ADDRESS env var must be set");
  }

  try {
    const balances = await kit.getBalances({
      sources: { address: depositorAddress },
      networkType: "testnet",
    });

    console.log("TOTAL:", balances.totalConfirmedBalance, "USDC");
    for (const account of balances.breakdown) {
      for (const chain of account.breakdown) {
        console.log(`  ${chain.chain}: ${chain.confirmedBalance} USDC`);
      }
    }
  } catch (err) {
    console.error("ERROR", err instanceof Error ? err.message : "Unknown error");
  }
};

void checkAllChains();
```

## Get Balances by Address (Using App Kit)

Query balances for a known address without needing a private key or adapter. Useful for read-only balance checks.

```ts
import { AppKit } from "@circle-fin/app-kit";
import { inspect } from "util";

const kit = new AppKit();

const checkBalanceByAddress = async (): Promise<void> => {
  const depositorAddress = process.env.DEPOSITOR_ADDRESS;
  if (!depositorAddress) {
    throw new Error("DEPOSITOR_ADDRESS env var must be set");
  }

  try {
    const balances = await kit.unifiedBalance.getBalances({
      sources: { address: depositorAddress, chains: "Arc_Testnet" },
    });

    console.log("BALANCES", inspect(balances, false, null, true));
  } catch (err) {
    console.error("ERROR", err instanceof Error ? err.message : "Unknown error");
  }
};

void checkBalanceByAddress();
```

## Get Balances by Address (Using Unified Balance Kit)

```ts
import { UnifiedBalanceKit } from "@circle-fin/unified-balance-kit";
import { inspect } from "util";

const kit = new UnifiedBalanceKit();

const checkBalanceByAddress = async (): Promise<void> => {
  const depositorAddress = process.env.DEPOSITOR_ADDRESS;
  if (!depositorAddress) {
    throw new Error("DEPOSITOR_ADDRESS env var must be set");
  }

  try {
    const balances = await kit.getBalances({
      sources: { address: depositorAddress, chains: "Arc_Testnet" },
    });

    console.log("BALANCES", inspect(balances, false, null, true));
  } catch (err) {
    console.error("ERROR", err instanceof Error ? err.message : "Unknown error");
  }
};

void checkBalanceByAddress();
```

## Get Balances with Mixed Sources (Using App Kit)

Combine adapter-based and address-only sources in a single query.

```ts
import { AppKit } from "@circle-fin/app-kit";
import { createViemAdapterFromPrivateKey } from "@circle-fin/adapter-viem-v2";
import { inspect } from "util";

const kit = new AppKit();

const checkMixedBalances = async (): Promise<void> => {
  const privateKey = process.env.EVM_PRIVATE_KEY;
  if (!privateKey || !privateKey.startsWith("0x")) {
    throw new Error("EVM_PRIVATE_KEY env var must be set and 0x-prefixed");
  }

  const otherAddress = process.env.OTHER_DEPOSITOR_ADDRESS;
  if (!otherAddress) {
    throw new Error("OTHER_DEPOSITOR_ADDRESS env var must be set");
  }

  try {
    const adapter = createViemAdapterFromPrivateKey({
      privateKey: privateKey as `0x${string}`,
    });

    const balances = await kit.unifiedBalance.getBalances({
      sources: [
        { adapter, chains: "Arc_Testnet" },
        { address: otherAddress, chains: "Arc_Testnet" },
      ],
    });

    console.log("BALANCES", inspect(balances, false, null, true));
  } catch (err) {
    console.error("ERROR", err instanceof Error ? err.message : "Unknown error");
  }
};

void checkMixedBalances();
```
