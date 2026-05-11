# Solana Adapter

Reference implementation for Solana deposit and spend using the `@circle-fin/adapter-solana` adapter. Includes examples for both App Kit and standalone Unified Balance Kit.

## Setup

```bash
# App Kit (recommended)
npm install @circle-fin/app-kit @circle-fin/adapter-solana @solana/web3.js

# Unified Balance Kit (standalone)
npm install @circle-fin/unified-balance-kit @circle-fin/adapter-solana @solana/web3.js
```

## Environment Variables

```
SOLANA_PRIVATE_KEY=       # Solana wallet private key (base58)
```

## Deposit (Using App Kit)

```ts
import { AppKit } from "@circle-fin/app-kit";
import { createSolanaAdapterFromPrivateKey } from "@circle-fin/adapter-solana";
import { inspect } from "util";

const kit = new AppKit();

const deposit = async (): Promise<void> => {
  const solanaPrivateKey = process.env.SOLANA_PRIVATE_KEY;
  if (!solanaPrivateKey || !/^[1-9A-HJ-NP-Za-km-z]+$/.test(solanaPrivateKey)) {
    throw new Error("SOLANA_PRIVATE_KEY env var must be set to a base58-encoded private key");
  }

  try {
    const adapter = createSolanaAdapterFromPrivateKey({
      privateKey: solanaPrivateKey,
    });

    const result = await kit.unifiedBalance.deposit({
      from: { adapter, chain: "Solana_Devnet" },
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
import { createSolanaAdapterFromPrivateKey } from "@circle-fin/adapter-solana";
import { inspect } from "util";

const kit = new UnifiedBalanceKit();

const deposit = async (): Promise<void> => {
  const solanaPrivateKey = process.env.SOLANA_PRIVATE_KEY;
  if (!solanaPrivateKey || !/^[1-9A-HJ-NP-Za-km-z]+$/.test(solanaPrivateKey)) {
    throw new Error("SOLANA_PRIVATE_KEY env var must be set to a base58-encoded private key");
  }

  try {
    const adapter = createSolanaAdapterFromPrivateKey({
      privateKey: solanaPrivateKey,
    });

    const result = await kit.deposit({
      from: { adapter, chain: "Solana_Devnet" },
      amount: "10.00",
    });

    console.log("RESULT", inspect(result, false, null, true));
  } catch (err) {
    console.error("ERROR", err instanceof Error ? err.message : "Unknown error");
  }
};

void deposit();
```

## Spend from Solana Devnet (Using App Kit)

Use `allocations` to specify the source chain explicitly.

```ts
import { AppKit } from "@circle-fin/app-kit";
import { createSolanaAdapterFromPrivateKey } from "@circle-fin/adapter-solana";
import { inspect } from "util";

const kit = new AppKit();

const spend = async (): Promise<void> => {
  const solanaPrivateKey = process.env.SOLANA_PRIVATE_KEY;
  if (!solanaPrivateKey || !/^[1-9A-HJ-NP-Za-km-z]+$/.test(solanaPrivateKey)) {
    throw new Error("SOLANA_PRIVATE_KEY env var must be set to a base58-encoded private key");
  }

  try {
    const adapter = createSolanaAdapterFromPrivateKey({
      privateKey: solanaPrivateKey,
    });

    const result = await kit.unifiedBalance.spend({
      from: {
        adapter,
        allocations: { amount: "5.00", chain: "Solana_Devnet" },
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

## Spend from Solana Devnet (Using Unified Balance Kit)

```ts
import { UnifiedBalanceKit } from "@circle-fin/unified-balance-kit";
import { createSolanaAdapterFromPrivateKey } from "@circle-fin/adapter-solana";
import { inspect } from "util";

const kit = new UnifiedBalanceKit();

const spend = async (): Promise<void> => {
  const solanaPrivateKey = process.env.SOLANA_PRIVATE_KEY;
  if (!solanaPrivateKey || !/^[1-9A-HJ-NP-Za-km-z]+$/.test(solanaPrivateKey)) {
    throw new Error("SOLANA_PRIVATE_KEY env var must be set to a base58-encoded private key");
  }

  try {
    const adapter = createSolanaAdapterFromPrivateKey({
      privateKey: solanaPrivateKey,
    });

    const result = await kit.spend({
      from: {
        adapter,
        allocations: { amount: "5.00", chain: "Solana_Devnet" },
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

