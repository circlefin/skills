# Viem Private Key Adapter

Reference implementation for EVM deposit, spend, and balance queries using the Viem private key adapter. Includes examples for both App Kit and standalone Unified Balance Kit.

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

## Deposit (Using App Kit)

```ts
import { AppKit } from "@circle-fin/app-kit";
import { createViemAdapterFromPrivateKey } from "@circle-fin/adapter-viem-v2";
import { inspect } from "util";

const kit = new AppKit();

const deposit = async (): Promise<void> => {
  const privateKey = process.env.EVM_PRIVATE_KEY;
  if (!privateKey || !privateKey.startsWith("0x")) {
    throw new Error("EVM_PRIVATE_KEY env var must be set and 0x-prefixed");
  }

  try {
    const adapter = createViemAdapterFromPrivateKey({
      privateKey: privateKey as `0x${string}`,
    });

    const result = await kit.unifiedBalance.deposit({
      from: { adapter, chain: "Arc_Testnet" },
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
import { createViemAdapterFromPrivateKey } from "@circle-fin/adapter-viem-v2";
import { inspect } from "util";

const kit = new UnifiedBalanceKit();

const deposit = async (): Promise<void> => {
  const privateKey = process.env.EVM_PRIVATE_KEY;
  if (!privateKey || !privateKey.startsWith("0x")) {
    throw new Error("EVM_PRIVATE_KEY env var must be set and 0x-prefixed");
  }

  try {
    const adapter = createViemAdapterFromPrivateKey({
      privateKey: privateKey as `0x${string}`,
    });

    const result = await kit.deposit({
      from: { adapter, chain: "Arc_Testnet" },
      amount: "10.00",
    });

    console.log("RESULT", inspect(result, false, null, true));
  } catch (err) {
    console.error("ERROR", err instanceof Error ? err.message : "Unknown error");
  }
};

void deposit();
```

## Deposit with Allowance Strategy (Using App Kit)

The `allowanceStrategy` parameter controls how USDC spending approval is handled. Defaults to `'authorize'` (EIP-3009) if omitted. Options: `'authorize'`, `'permit'` (EIP-2612), `'approve'` (traditional ERC-20 two-step).

```ts
import { AppKit } from "@circle-fin/app-kit";
import { createViemAdapterFromPrivateKey } from "@circle-fin/adapter-viem-v2";
import { inspect } from "util";

const kit = new AppKit();

const depositWithPermit = async (): Promise<void> => {
  const privateKey = process.env.EVM_PRIVATE_KEY;
  if (!privateKey || !privateKey.startsWith("0x")) {
    throw new Error("EVM_PRIVATE_KEY env var must be set and 0x-prefixed");
  }

  try {
    const adapter = createViemAdapterFromPrivateKey({
      privateKey: privateKey as `0x${string}`,
    });

    // Using EIP-2612 permit (gasless off-chain signature)
    const result = await kit.unifiedBalance.deposit({
      from: { adapter, chain: "Arc_Testnet" },
      amount: "10.00",
      allowanceStrategy: "permit",
    });

    console.log("RESULT", inspect(result, false, null, true));
  } catch (err) {
    console.error("ERROR", err instanceof Error ? err.message : "Unknown error");
  }
};

void depositWithPermit();
```

## Deposit with Allowance Strategy (Using Unified Balance Kit)

```ts
import { UnifiedBalanceKit } from "@circle-fin/unified-balance-kit";
import { createViemAdapterFromPrivateKey } from "@circle-fin/adapter-viem-v2";
import { inspect } from "util";

const kit = new UnifiedBalanceKit();

const depositWithPermit = async (): Promise<void> => {
  const privateKey = process.env.EVM_PRIVATE_KEY;
  if (!privateKey || !privateKey.startsWith("0x")) {
    throw new Error("EVM_PRIVATE_KEY env var must be set and 0x-prefixed");
  }

  try {
    const adapter = createViemAdapterFromPrivateKey({
      privateKey: privateKey as `0x${string}`,
    });

    // Using EIP-2612 permit (gasless off-chain signature)
    const result = await kit.deposit({
      from: { adapter, chain: "Arc_Testnet" },
      amount: "10.00",
      allowanceStrategy: "permit",
    });

    console.log("RESULT", inspect(result, false, null, true));
  } catch (err) {
    console.error("ERROR", err instanceof Error ? err.message : "Unknown error");
  }
};

void depositWithPermit();
```

## Spend from Specific Chain (Using App Kit)

Use `allocations` to specify exactly which chain to draw from.

```ts
import { AppKit } from "@circle-fin/app-kit";
import { createViemAdapterFromPrivateKey } from "@circle-fin/adapter-viem-v2";
import { inspect } from "util";

const kit = new AppKit();

const spend = async (): Promise<void> => {
  const privateKey = process.env.EVM_PRIVATE_KEY;
  if (!privateKey || !privateKey.startsWith("0x")) {
    throw new Error("EVM_PRIVATE_KEY env var must be set and 0x-prefixed");
  }

  try {
    const adapter = createViemAdapterFromPrivateKey({
      privateKey: privateKey as `0x${string}`,
    });

    const result = await kit.unifiedBalance.spend({
      from: {
        adapter,
        allocations: { amount: "5.00", chain: "Base_Sepolia" },
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

## Spend from Specific Chain (Using Unified Balance Kit)

```ts
import { UnifiedBalanceKit } from "@circle-fin/unified-balance-kit";
import { createViemAdapterFromPrivateKey } from "@circle-fin/adapter-viem-v2";
import { inspect } from "util";

const kit = new UnifiedBalanceKit();

const spend = async (): Promise<void> => {
  const privateKey = process.env.EVM_PRIVATE_KEY;
  if (!privateKey || !privateKey.startsWith("0x")) {
    throw new Error("EVM_PRIVATE_KEY env var must be set and 0x-prefixed");
  }

  try {
    const adapter = createViemAdapterFromPrivateKey({
      privateKey: privateKey as `0x${string}`,
    });

    const result = await kit.spend({
      from: {
        adapter,
        allocations: { amount: "5.00", chain: "Base_Sepolia" },
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

## Spend with Auto-Allocation (Using App Kit)

When `allocations` is omitted, the provider automatically decides which source chains to draw from. Just pass the adapter and the total amount.

```ts
import { AppKit } from "@circle-fin/app-kit";
import { createViemAdapterFromPrivateKey } from "@circle-fin/adapter-viem-v2";
import { inspect } from "util";

const kit = new AppKit();

const spend = async (): Promise<void> => {
  const privateKey = process.env.EVM_PRIVATE_KEY;
  if (!privateKey || !privateKey.startsWith("0x")) {
    throw new Error("EVM_PRIVATE_KEY env var must be set and 0x-prefixed");
  }

  try {
    const adapter = createViemAdapterFromPrivateKey({
      privateKey: privateKey as `0x${string}`,
    });

    const result = await kit.unifiedBalance.spend({
      from: { adapter },
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
import { createViemAdapterFromPrivateKey } from "@circle-fin/adapter-viem-v2";
import { inspect } from "util";

const kit = new UnifiedBalanceKit();

const spend = async (): Promise<void> => {
  const privateKey = process.env.EVM_PRIVATE_KEY;
  if (!privateKey || !privateKey.startsWith("0x")) {
    throw new Error("EVM_PRIVATE_KEY env var must be set and 0x-prefixed");
  }

  try {
    const adapter = createViemAdapterFromPrivateKey({
      privateKey: privateKey as `0x${string}`,
    });

    const result = await kit.spend({
      from: { adapter },
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

## Spend with Forwarding Service (Using App Kit)

Set `useForwarder: true` on the destination to have Circle's Forwarding Service handle attestation fetching and mint submission automatically. This removes the need to maintain a wallet on the destination chain. The Forwarding Service deducts a fee from the minted amount.

With a destination adapter:

```ts
import { AppKit } from "@circle-fin/app-kit";
import { createViemAdapterFromPrivateKey } from "@circle-fin/adapter-viem-v2";
import { inspect } from "util";

const kit = new AppKit();

const spendWithForwarder = async (): Promise<void> => {
  const privateKey = process.env.EVM_PRIVATE_KEY;
  if (!privateKey || !privateKey.startsWith("0x")) {
    throw new Error("EVM_PRIVATE_KEY env var must be set and 0x-prefixed");
  }

  try {
    const adapter = createViemAdapterFromPrivateKey({
      privateKey: privateKey as `0x${string}`,
    });

    const result = await kit.unifiedBalance.spend({
      from: {
        adapter,
        allocations: { amount: "1.00", chain: "Base_Sepolia" },
      },
      to: {
        adapter,
        chain: "Arc_Testnet",
        useForwarder: true,
      },
      amount: "1.00",
    });

    console.log("RESULT", inspect(result, false, null, true));
  } catch (err) {
    console.error("ERROR", err instanceof Error ? err.message : "Unknown error");
  }
};

void spendWithForwarder();
```

Without a destination adapter (server-side or custodial workflows). Provide `recipientAddress` instead. Since the Forwarding Service submits the mint transaction, no locally-signed transaction hash is generated.

```ts
import { AppKit } from "@circle-fin/app-kit";
import { createViemAdapterFromPrivateKey } from "@circle-fin/adapter-viem-v2";
import { inspect } from "util";

const kit = new AppKit();

const spendWithForwarder = async (): Promise<void> => {
  const privateKey = process.env.EVM_PRIVATE_KEY;
  if (!privateKey || !privateKey.startsWith("0x")) {
    throw new Error("EVM_PRIVATE_KEY env var must be set and 0x-prefixed");
  }

  try {
    const sourceAdapter = createViemAdapterFromPrivateKey({
      privateKey: privateKey as `0x${string}`,
    });

    const result = await kit.unifiedBalance.spend({
      from: {
        adapter: sourceAdapter,
        allocations: { amount: "1.00", chain: "Base_Sepolia" },
      },
      to: {
        chain: "Arc_Testnet",
        recipientAddress: process.env.EVM_RECIPIENT_ADDRESS as string,
        useForwarder: true,
      },
      amount: "1.00",
    });

    console.log("RESULT", inspect(result, false, null, true));
  } catch (err) {
    console.error("ERROR", err instanceof Error ? err.message : "Unknown error");
  }
};

void spendWithForwarder();
```

## Get Balances on Specific Chain (Using App Kit)

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

## Get Balances on Specific Chain (Using Unified Balance Kit)

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

Omit `chains` to query balances across all supported chains. Set `networkType` to `'testnet'` for testnet chains (defaults to `'mainnet'`).

```ts
import { AppKit } from "@circle-fin/app-kit";
import { createViemAdapterFromPrivateKey } from "@circle-fin/adapter-viem-v2";
import { inspect } from "util";

const kit = new AppKit();

const checkAllBalances = async (): Promise<void> => {
  const privateKey = process.env.EVM_PRIVATE_KEY;
  if (!privateKey || !privateKey.startsWith("0x")) {
    throw new Error("EVM_PRIVATE_KEY env var must be set and 0x-prefixed");
  }

  try {
    const adapter = createViemAdapterFromPrivateKey({
      privateKey: privateKey as `0x${string}`,
    });

    const balances = await kit.unifiedBalance.getBalances({
      sources: { adapter },
      networkType: "testnet",
    });

    console.log("BALANCES", inspect(balances, false, null, true));
  } catch (err) {
    console.error("ERROR", err instanceof Error ? err.message : "Unknown error");
  }
};

void checkAllBalances();
```

## Get Balances Across All Chains (Using Unified Balance Kit)

```ts
import { UnifiedBalanceKit } from "@circle-fin/unified-balance-kit";
import { createViemAdapterFromPrivateKey } from "@circle-fin/adapter-viem-v2";
import { inspect } from "util";

const kit = new UnifiedBalanceKit();

const checkAllBalances = async (): Promise<void> => {
  const privateKey = process.env.EVM_PRIVATE_KEY;
  if (!privateKey || !privateKey.startsWith("0x")) {
    throw new Error("EVM_PRIVATE_KEY env var must be set and 0x-prefixed");
  }

  try {
    const adapter = createViemAdapterFromPrivateKey({
      privateKey: privateKey as `0x${string}`,
    });

    const balances = await kit.getBalances({
      sources: { adapter },
      networkType: "testnet",
    });

    console.log("BALANCES", inspect(balances, false, null, true));
  } catch (err) {
    console.error("ERROR", err instanceof Error ? err.message : "Unknown error");
  }
};

void checkAllBalances();
```
