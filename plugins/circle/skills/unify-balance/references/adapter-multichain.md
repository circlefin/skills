# Multichain Adapter (EVM + Solana)

Reference implementation for multi-ecosystem unified balance operations combining EVM and Solana adapters. Deposit from multiple chains and spend across ecosystems. Includes examples for both App Kit and standalone Unified Balance Kit.

## Setup

```bash
# App Kit (recommended)
npm install @circle-fin/app-kit @circle-fin/adapter-viem-v2 viem @circle-fin/adapter-solana @solana/web3.js

# Unified Balance Kit (standalone)
npm install @circle-fin/unified-balance-kit @circle-fin/adapter-viem-v2 viem @circle-fin/adapter-solana @solana/web3.js
```

## Environment Variables

```
EVM_PRIVATE_KEY=          # EVM wallet private key (hex, 0x-prefixed)
SOLANA_PRIVATE_KEY=       # Solana wallet private key (base58)
```

## Deposit from Multiple Chains (Using App Kit)

```ts
import { AppKit } from "@circle-fin/app-kit";
import { createViemAdapterFromPrivateKey } from "@circle-fin/adapter-viem-v2";
import { createSolanaAdapterFromPrivateKey } from "@circle-fin/adapter-solana";
import { inspect } from "util";

const kit = new AppKit();

const depositMultichain = async (): Promise<void> => {
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

    const solanaAdapter = createSolanaAdapterFromPrivateKey({
      privateKey: solanaPrivateKey,
    });

    // Deposit from EVM chain
    const evmDeposit = await kit.unifiedBalance.deposit({
      from: { adapter: evmAdapter, chain: "Arc_Testnet" },
      amount: "10.00",
    });
    console.log("EVM deposit:", inspect(evmDeposit, false, null, true));

    // Deposit from Solana
    const solanaDeposit = await kit.unifiedBalance.deposit({
      from: { adapter: solanaAdapter, chain: "Solana_Devnet" },
      amount: "5.00",
    });
    console.log("Solana deposit:", inspect(solanaDeposit, false, null, true));
  } catch (err) {
    console.error("ERROR", err instanceof Error ? err.message : "Unknown error");
  }
};

void depositMultichain();
```

## Deposit from Multiple Chains (Using Unified Balance Kit)

```ts
import { UnifiedBalanceKit } from "@circle-fin/unified-balance-kit";
import { createViemAdapterFromPrivateKey } from "@circle-fin/adapter-viem-v2";
import { createSolanaAdapterFromPrivateKey } from "@circle-fin/adapter-solana";
import { inspect } from "util";

const kit = new UnifiedBalanceKit();

const depositMultichain = async (): Promise<void> => {
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

    const solanaAdapter = createSolanaAdapterFromPrivateKey({
      privateKey: solanaPrivateKey,
    });

    // Deposit from EVM chain
    const evmDeposit = await kit.deposit({
      from: { adapter: evmAdapter, chain: "Arc_Testnet" },
      amount: "10.00",
    });
    console.log("EVM deposit:", inspect(evmDeposit, false, null, true));

    // Deposit from Solana
    const solanaDeposit = await kit.deposit({
      from: { adapter: solanaAdapter, chain: "Solana_Devnet" },
      amount: "5.00",
    });
    console.log("Solana deposit:", inspect(solanaDeposit, false, null, true));
  } catch (err) {
    console.error("ERROR", err instanceof Error ? err.message : "Unknown error");
  }
};

void depositMultichain();
```

## Spend from EVM and Solana Combined (Using App Kit)

Pull funds from both EVM and Solana chains in a single spend by passing multiple sources in the `from` array with explicit per-chain allocations. The allocation amounts must sum to `amount`.

```ts
import { AppKit } from "@circle-fin/app-kit";
import { createViemAdapterFromPrivateKey } from "@circle-fin/adapter-viem-v2";
import { createSolanaAdapterFromPrivateKey } from "@circle-fin/adapter-solana";
import { inspect } from "util";

const kit = new AppKit();

const spendMultichain = async (): Promise<void> => {
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

    const solanaAdapter = createSolanaAdapterFromPrivateKey({
      privateKey: solanaPrivateKey,
    });

    // Spend 10 USDC total: 7 from Base Sepolia + 3 from Solana Devnet
    const result = await kit.unifiedBalance.spend({
      from: [
        {
          adapter: evmAdapter,
          allocations: { amount: "7.00", chain: "Base_Sepolia" },
        },
        {
          adapter: solanaAdapter,
          allocations: { amount: "3.00", chain: "Solana_Devnet" },
        },
      ],
      to: {
        chain: "Arc_Testnet",
        recipientAddress: "0x742d35Cc6634C0532925a3b844Bc454e4438f44e",
      },
      amount: "10.00",
    });

    console.log("RESULT", inspect(result, false, null, true));
  } catch (err) {
    console.error("ERROR", err instanceof Error ? err.message : "Unknown error");
  }
};

void spendMultichain();
```

## Spend from EVM and Solana Combined (Using Unified Balance Kit)

```ts
import { UnifiedBalanceKit } from "@circle-fin/unified-balance-kit";
import { createViemAdapterFromPrivateKey } from "@circle-fin/adapter-viem-v2";
import { createSolanaAdapterFromPrivateKey } from "@circle-fin/adapter-solana";
import { inspect } from "util";

const kit = new UnifiedBalanceKit();

const spendMultichain = async (): Promise<void> => {
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

    const solanaAdapter = createSolanaAdapterFromPrivateKey({
      privateKey: solanaPrivateKey,
    });

    // Spend 10 USDC total: 7 from Base Sepolia + 3 from Solana Devnet
    const result = await kit.spend({
      from: [
        {
          adapter: evmAdapter,
          allocations: { amount: "7.00", chain: "Base_Sepolia" },
        },
        {
          adapter: solanaAdapter,
          allocations: { amount: "3.00", chain: "Solana_Devnet" },
        },
      ],
      to: {
        chain: "Arc_Testnet",
        recipientAddress: "0x742d35Cc6634C0532925a3b844Bc454e4438f44e",
      },
      amount: "10.00",
    });

    console.log("RESULT", inspect(result, false, null, true));
  } catch (err) {
    console.error("ERROR", err instanceof Error ? err.message : "Unknown error");
  }
};

void spendMultichain();
```

## Get Balances on Specific Chains (Using App Kit)

```ts
import { AppKit } from "@circle-fin/app-kit";
import { createViemAdapterFromPrivateKey } from "@circle-fin/adapter-viem-v2";
import { createSolanaAdapterFromPrivateKey } from "@circle-fin/adapter-solana";
import { inspect } from "util";

const kit = new AppKit();

const checkBalances = async (): Promise<void> => {
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

    const solanaAdapter = createSolanaAdapterFromPrivateKey({
      privateKey: solanaPrivateKey,
    });

    const balances = await kit.unifiedBalance.getBalances({
      sources: [
        { adapter: evmAdapter, chains: "Arc_Testnet" },
        { adapter: solanaAdapter, chains: "Solana_Devnet" },
      ],
    });

    console.log("BALANCES", inspect(balances, false, null, true));
  } catch (err) {
    console.error("ERROR", err instanceof Error ? err.message : "Unknown error");
  }
};

void checkBalances();
```

## Get Balances Across All Chains (Using App Kit)

Omit `chains` on each source to query all supported chains per adapter. Set `networkType` to `'testnet'` for testnet chains.

```ts
import { AppKit } from "@circle-fin/app-kit";
import { createViemAdapterFromPrivateKey } from "@circle-fin/adapter-viem-v2";
import { createSolanaAdapterFromPrivateKey } from "@circle-fin/adapter-solana";
import { inspect } from "util";

const kit = new AppKit();

const checkAllBalances = async (): Promise<void> => {
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

    const solanaAdapter = createSolanaAdapterFromPrivateKey({
      privateKey: solanaPrivateKey,
    });

    const balances = await kit.unifiedBalance.getBalances({
      sources: [
        { adapter: evmAdapter },
        { adapter: solanaAdapter },
      ],
      networkType: "testnet",
    });

    console.log("BALANCES", inspect(balances, false, null, true));
  } catch (err) {
    console.error("ERROR", err instanceof Error ? err.message : "Unknown error");
  }
};

void checkAllBalances();
```
