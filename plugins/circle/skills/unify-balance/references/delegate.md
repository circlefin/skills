# Delegate Lifecycle

Reference implementation for the delegate pattern -- grant spending rights to another address and deposit on behalf of another account. Includes examples for both App Kit and standalone Unified Balance Kit.

Delegation allows a different signer to move funds out of an account owner's unified balance. Common use cases include:

- **SCA depositors**: Smart contract accounts that cannot produce ECDSA signatures directly -- an EOA delegate signs burn intents on their behalf.
- **Operational separation**: A service EOA spending from a treasury EOA's balance, or a payment processor spending from a merchant's unified balance.

Delegates must be added explicitly per chain. `getDelegateStatus()` returns `'none'`, `'pending'`, or `'ready'` -- only spend from a delegate once the status is `'ready'`.

## Setup

```bash
# App Kit (recommended)
npm install @circle-fin/app-kit @circle-fin/adapter-viem-v2 viem

# Unified Balance Kit (standalone)
npm install @circle-fin/unified-balance-kit @circle-fin/adapter-viem-v2 viem
```

## Environment Variables

```
EVM_PRIVATE_KEY=          # Account owner's private key (hex, 0x-prefixed)
DELEGATE_ADDRESS=         # Address to authorize as delegate
DEPOSIT_ACCOUNT=          # Account address to credit (for depositFor)
```

## Deposit For (Using App Kit)

Use `depositFor()` to deposit USDC into another account's unified balance (not the caller's). The USDC is credited to the `depositAccount` address, not the signer's.

```ts
import { AppKit } from "@circle-fin/app-kit";
import { createViemAdapterFromPrivateKey } from "@circle-fin/adapter-viem-v2";
import { inspect } from "util";

const kit = new AppKit();

const depositFor = async (): Promise<void> => {
  const privateKey = process.env.EVM_PRIVATE_KEY;
  if (!privateKey || !privateKey.startsWith("0x")) {
    throw new Error("EVM_PRIVATE_KEY env var must be set and 0x-prefixed");
  }

  const depositAccount = process.env.DEPOSIT_ACCOUNT;
  if (!depositAccount) {
    throw new Error("DEPOSIT_ACCOUNT env var must be set");
  }

  try {
    const adapter = createViemAdapterFromPrivateKey({
      privateKey: privateKey as `0x${string}`,
    });

    const result = await kit.unifiedBalance.depositFor({
      from: { adapter, chain: "Arc_Testnet" },
      depositAccount,
      amount: "10.00",
    });

    console.log("RESULT", inspect(result, false, null, true));
  } catch (err) {
    console.error("ERROR", err instanceof Error ? err.message : "Unknown error");
  }
};

void depositFor();
```

## Deposit For (Using Unified Balance Kit)

```ts
import { UnifiedBalanceKit } from "@circle-fin/unified-balance-kit";
import { createViemAdapterFromPrivateKey } from "@circle-fin/adapter-viem-v2";
import { inspect } from "util";

const kit = new UnifiedBalanceKit();

const depositFor = async (): Promise<void> => {
  const privateKey = process.env.EVM_PRIVATE_KEY;
  if (!privateKey || !privateKey.startsWith("0x")) {
    throw new Error("EVM_PRIVATE_KEY env var must be set and 0x-prefixed");
  }

  const depositAccount = process.env.DEPOSIT_ACCOUNT;
  if (!depositAccount) {
    throw new Error("DEPOSIT_ACCOUNT env var must be set");
  }

  try {
    const adapter = createViemAdapterFromPrivateKey({
      privateKey: privateKey as `0x${string}`,
    });

    const result = await kit.depositFor({
      from: { adapter, chain: "Arc_Testnet" },
      depositAccount,
      amount: "10.00",
    });

    console.log("RESULT", inspect(result, false, null, true));
  } catch (err) {
    console.error("ERROR", err instanceof Error ? err.message : "Unknown error");
  }
};

void depositFor();
```

## Add Delegate (Using App Kit)

Grant spending rights to another address on the owner's account. The owner calls `addDelegate()` with their own adapter and the delegate's address. This must be done per chain before the delegate can spend.

```ts
import { AppKit } from "@circle-fin/app-kit";
import { createViemAdapterFromPrivateKey } from "@circle-fin/adapter-viem-v2";
import { inspect } from "util";

const kit = new AppKit();

const addDelegate = async (): Promise<void> => {
  const privateKey = process.env.EVM_PRIVATE_KEY;
  if (!privateKey || !privateKey.startsWith("0x")) {
    throw new Error("EVM_PRIVATE_KEY env var must be set and 0x-prefixed");
  }

  const delegateAddress = process.env.DELEGATE_ADDRESS;
  if (!delegateAddress) {
    throw new Error("DELEGATE_ADDRESS env var must be set");
  }

  try {
    const adapter = createViemAdapterFromPrivateKey({
      privateKey: privateKey as `0x${string}`,
    });

    const result = await kit.unifiedBalance.addDelegate({
      from: { adapter, chain: "Arc_Testnet" },
      delegateAddress,
    });

    console.log("RESULT", inspect(result, false, null, true));
  } catch (err) {
    console.error("ERROR", err instanceof Error ? err.message : "Unknown error");
  }
};

void addDelegate();
```

## Add Delegate (Using Unified Balance Kit)

```ts
import { UnifiedBalanceKit } from "@circle-fin/unified-balance-kit";
import { createViemAdapterFromPrivateKey } from "@circle-fin/adapter-viem-v2";
import { inspect } from "util";

const kit = new UnifiedBalanceKit();

const addDelegate = async (): Promise<void> => {
  const privateKey = process.env.EVM_PRIVATE_KEY;
  if (!privateKey || !privateKey.startsWith("0x")) {
    throw new Error("EVM_PRIVATE_KEY env var must be set and 0x-prefixed");
  }

  const delegateAddress = process.env.DELEGATE_ADDRESS;
  if (!delegateAddress) {
    throw new Error("DELEGATE_ADDRESS env var must be set");
  }

  try {
    const adapter = createViemAdapterFromPrivateKey({
      privateKey: privateKey as `0x${string}`,
    });

    const result = await kit.addDelegate({
      from: { adapter, chain: "Arc_Testnet" },
      delegateAddress,
    });

    console.log("RESULT", inspect(result, false, null, true));
  } catch (err) {
    console.error("ERROR", err instanceof Error ? err.message : "Unknown error");
  }
};

void addDelegate();
```

## Remove Delegate (Using App Kit)

Revoke spending rights from a delegate on a specific chain. This must be called per chain -- to revoke access across multiple chains, invoke `removeDelegate()` separately for each target chain.

```ts
import { AppKit } from "@circle-fin/app-kit";
import { createViemAdapterFromPrivateKey } from "@circle-fin/adapter-viem-v2";
import { inspect } from "util";

const kit = new AppKit();

const removeDelegate = async (): Promise<void> => {
  const privateKey = process.env.EVM_PRIVATE_KEY;
  if (!privateKey || !privateKey.startsWith("0x")) {
    throw new Error("EVM_PRIVATE_KEY env var must be set and 0x-prefixed");
  }

  const delegateAddress = process.env.DELEGATE_ADDRESS;
  if (!delegateAddress) {
    throw new Error("DELEGATE_ADDRESS env var must be set");
  }

  try {
    const adapter = createViemAdapterFromPrivateKey({
      privateKey: privateKey as `0x${string}`,
    });

    await kit.unifiedBalance.removeDelegate({
      from: { adapter, chain: "Arc_Testnet" },
      delegateAddress,
    });

    console.log("Delegate removed.");
  } catch (err) {
    console.error("ERROR", err instanceof Error ? err.message : "Unknown error");
  }
};

void removeDelegate();
```

## Remove Delegate (Using Unified Balance Kit)

```ts
import { UnifiedBalanceKit } from "@circle-fin/unified-balance-kit";
import { createViemAdapterFromPrivateKey } from "@circle-fin/adapter-viem-v2";
import { inspect } from "util";

const kit = new UnifiedBalanceKit();

const removeDelegate = async (): Promise<void> => {
  const privateKey = process.env.EVM_PRIVATE_KEY;
  if (!privateKey || !privateKey.startsWith("0x")) {
    throw new Error("EVM_PRIVATE_KEY env var must be set and 0x-prefixed");
  }

  const delegateAddress = process.env.DELEGATE_ADDRESS;
  if (!delegateAddress) {
    throw new Error("DELEGATE_ADDRESS env var must be set");
  }

  try {
    const adapter = createViemAdapterFromPrivateKey({
      privateKey: privateKey as `0x${string}`,
    });

    await kit.removeDelegate({
      from: { adapter, chain: "Arc_Testnet" },
      delegateAddress,
    });

    console.log("Delegate removed.");
  } catch (err) {
    console.error("ERROR", err instanceof Error ? err.message : "Unknown error");
  }
};

void removeDelegate();
```

## Get Delegate Status (Using App Kit)

Check whether the delegate relationship is finalized before attempting a delegate spend. Returns `'none'`, `'pending'`, or `'ready'`.

```ts
import { AppKit } from "@circle-fin/app-kit";
import { createViemAdapterFromPrivateKey } from "@circle-fin/adapter-viem-v2";
import { inspect } from "util";

const kit = new AppKit();

const checkDelegateStatus = async (): Promise<void> => {
  const privateKey = process.env.EVM_PRIVATE_KEY;
  if (!privateKey || !privateKey.startsWith("0x")) {
    throw new Error("EVM_PRIVATE_KEY env var must be set and 0x-prefixed");
  }

  const delegateAddress = process.env.DELEGATE_ADDRESS;
  if (!delegateAddress) {
    throw new Error("DELEGATE_ADDRESS env var must be set");
  }

  try {
    const adapter = createViemAdapterFromPrivateKey({
      privateKey: privateKey as `0x${string}`,
    });

    const status = await kit.unifiedBalance.getDelegateStatus({
      from: { adapter, chain: "Arc_Testnet" },
      delegateAddress,
    });

    console.log("DELEGATE STATUS", inspect(status, false, null, true));
  } catch (err) {
    console.error("ERROR", err instanceof Error ? err.message : "Unknown error");
  }
};

void checkDelegateStatus();
```

## Get Delegate Status (Using Unified Balance Kit)

```ts
import { UnifiedBalanceKit } from "@circle-fin/unified-balance-kit";
import { createViemAdapterFromPrivateKey } from "@circle-fin/adapter-viem-v2";
import { inspect } from "util";

const kit = new UnifiedBalanceKit();

const checkDelegateStatus = async (): Promise<void> => {
  const privateKey = process.env.EVM_PRIVATE_KEY;
  if (!privateKey || !privateKey.startsWith("0x")) {
    throw new Error("EVM_PRIVATE_KEY env var must be set and 0x-prefixed");
  }

  const delegateAddress = process.env.DELEGATE_ADDRESS;
  if (!delegateAddress) {
    throw new Error("DELEGATE_ADDRESS env var must be set");
  }

  try {
    const adapter = createViemAdapterFromPrivateKey({
      privateKey: privateKey as `0x${string}`,
    });

    const status = await kit.getDelegateStatus({
      from: { adapter, chain: "Arc_Testnet" },
      delegateAddress,
    });

    console.log("DELEGATE STATUS", inspect(status, false, null, true));
  } catch (err) {
    console.error("ERROR", err instanceof Error ? err.message : "Unknown error");
  }
};

void checkDelegateStatus();
```

## Delegate Spend (Using App Kit)

Once the delegate status is `'ready'`, the delegate can spend from the account owner's unified balance. The delegate's adapter is used for signing, while `sourceAccount` specifies whose balance to draw from.

```ts
import { AppKit } from "@circle-fin/app-kit";
import { createViemAdapterFromPrivateKey } from "@circle-fin/adapter-viem-v2";
import { inspect } from "util";

const kit = new AppKit();

const delegateSpend = async (): Promise<void> => {
  // The delegate's private key (the signer)
  const delegatePrivateKey = process.env.DELEGATE_PRIVATE_KEY;
  if (!delegatePrivateKey || !delegatePrivateKey.startsWith("0x")) {
    throw new Error("DELEGATE_PRIVATE_KEY env var must be set and 0x-prefixed");
  }

  // The account owner whose unified balance to spend from
  const sourceAccount = process.env.SOURCE_ACCOUNT;
  if (!sourceAccount) {
    throw new Error("SOURCE_ACCOUNT env var must be set");
  }

  try {
    const adapter = createViemAdapterFromPrivateKey({
      privateKey: delegatePrivateKey as `0x${string}`,
    });

    const result = await kit.unifiedBalance.spend({
      from: {
        adapter,
        sourceAccount,
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

void delegateSpend();
```

## Delegate Spend (Using Unified Balance Kit)

```ts
import { UnifiedBalanceKit } from "@circle-fin/unified-balance-kit";
import { createViemAdapterFromPrivateKey } from "@circle-fin/adapter-viem-v2";
import { inspect } from "util";

const kit = new UnifiedBalanceKit();

const delegateSpend = async (): Promise<void> => {
  // The delegate's private key (the signer)
  const delegatePrivateKey = process.env.DELEGATE_PRIVATE_KEY;
  if (!delegatePrivateKey || !delegatePrivateKey.startsWith("0x")) {
    throw new Error("DELEGATE_PRIVATE_KEY env var must be set and 0x-prefixed");
  }

  // The account owner whose unified balance to spend from
  const sourceAccount = process.env.SOURCE_ACCOUNT;
  if (!sourceAccount) {
    throw new Error("SOURCE_ACCOUNT env var must be set");
  }

  try {
    const adapter = createViemAdapterFromPrivateKey({
      privateKey: delegatePrivateKey as `0x${string}`,
    });

    const result = await kit.spend({
      from: {
        adapter,
        sourceAccount,
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

void delegateSpend();
```
