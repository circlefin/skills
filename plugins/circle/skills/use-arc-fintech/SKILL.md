# use-arc-fintech

Build multichain treasury systems that consolidate fragmented USDC balances
from multiple blockchains into a single unified Gateway balance on Arc —
enabling near-instant crosschain payouts without pre-funding multiple wallets.

---

## When to use this skill

Use `use-arc-fintech` when you are building:

- **Multichain treasury consolidation** — funds arrive on different chains, consolidate to one balance
- **Instant crosschain payouts** — exchanges, marketplaces, remittance apps, fintech platforms
- **Capital efficiency** — eliminate idle funds pre-funding wallets on each chain
- **Unified settlement hub** — route all USDC through Arc as the liquidity center

Do **not** use this skill for:

- Single-chain USDC transfers (use `use-developer-controlled-wallets`)
- Simple crosschain transfers without treasury consolidation (use `bridge-stablecoin`)
- Gateway balance queries only (use `use-gateway`)

---

## The problem this solves

Stablecoins are deployed and settled independently on each chain. Multichain applications must coordinate liquidity and reconcile balances across networks, which directly impacts capital efficiency, UX latency, and operational risk.

The result without this pattern:
- USDC arrives on Ethereum, Base, Avalanche — separate balances
- Treasury must be pre-funded on each chain before payouts
- Capital sits idle while ops teams constantly rebalance
- Payout latency = bridging time + confirmation time on each chain

---

## Architecture

```
Ethereum Sepolia ──────┐
                       ├─── Bridge Kit (CCTP) ──► Arc Testnet wallet
Base Sepolia ──────────┤                               │
                       │                         approve() + deposit()
Avalanche Fuji ────────┘                               │
                                               Gateway Wallet (unified balance)
                                                       │
                                              ┌────────┴────────┐
                                          Payout ETH        Payout SOL
                                          (sub-500ms)       (sub-500ms)
```

CCTP provides canonical USDC transfer across supported chains, while Gateway consolidates those crosschain flows into a unified USDC balance. Combined with Arc's sub-second finality and predictable fees, these primitives allow developers to route liquidity into a single high-speed settlement environment.

---

## Key contracts on Arc Testnet

| Contract | Address |
|---|---|
| GatewayWallet | `0x0077777d7EBA4688BDeF3E311b846F25870A19B9` |
| USDC | `0x3600000000000000000000000000000000000000` |

---

## Phase 1 — Bridge USDC to Arc (Bridge Kit)

Bridge Kit abstracts CCTP's complexity into a single `kit.bridge()` call that handles the full flow: token approval, burning on source chain, fetching Circle's attestation, and minting on destination. It also provides a `.on()` method for the developer to register event listeners to track each step of the process.

### Setup

```bash
npm install @circle-fin/bridge-kit @circle-fin/adapter-circle-wallets @circle-fin/developer-controlled-wallets tsx typescript
```

### Create unified EVM wallets across chains

```typescript
import { initiateDeveloperControlledWalletsClient } from "@circle-fin/developer-controlled-wallets";

const client = initiateDeveloperControlledWalletsClient({
  apiKey: process.env.CIRCLE_API_KEY!,
  entitySecret: process.env.CIRCLE_ENTITY_SECRET!,
});

// One wallet set — same address on all chains
const walletSet = await client.createWalletSet({
  name: "Treasury Consolidation Wallets",
});

const wallets = await client.createWallets({
  blockchains: ["ARC-TESTNET", "AVAX-FUJI", "BASE-SEPOLIA", "ETH-SEPOLIA"],
  count: 1,
  walletSetId: walletSet.data?.walletSet?.id ?? "",
  metadata: [{ refId: "treasury-depositor" }],
});

// All wallets share the same EVM address — this is DEPOSITOR_ADDRESS
const depositorAddress = wallets.data?.wallets?.[0]?.address;
console.log("Depositor address:", depositorAddress);
// Same address on Ethereum, Base, Avalanche and Arc
```

### Bridge from multiple chains to Arc

```typescript
import { BridgeKit, BridgeChain } from "@circle-fin/bridge-kit";
import { createCircleWalletsAdapter } from "@circle-fin/adapter-circle-wallets";

const kit = new BridgeKit();

// Log every step of the bridge process
kit.on("*", (payload) => console.log(payload.method, payload.values));

const adapter = createCircleWalletsAdapter({
  apiKey: process.env.CIRCLE_API_KEY!,
  entitySecret: process.env.CIRCLE_ENTITY_SECRET!,
});

const sources = [
  { chain: BridgeChain.Ethereum_Sepolia, amount: "2" }, // 2 USDC from Ethereum
  { chain: BridgeChain.Base_Sepolia,      amount: "2" }, // 2 USDC from Base
  { chain: BridgeChain.Avalanche_Fuji,    amount: "2" }, // 2 USDC from Avalanche
];

for (const source of sources) {
  await kit.bridge({
    from: { adapter, chain: source.chain,           address: depositorAddress! },
    to:   { adapter, chain: BridgeChain.Arc_Testnet, address: depositorAddress! },
    amount: source.amount,
  });
}

console.log("All funds consolidated on Arc Testnet");
```

---

## Phase 2 — Deposit into Gateway (unified balance)

After bridging to Arc, deposit into Gateway with two transactions:
`approve()` then `deposit()`.

```typescript
const GATEWAY_WALLET = "0x0077777d7EBA4688BDeF3E311b846F25870A19B9";
const ARC_USDC       = "0x3600000000000000000000000000000000000000";

// Total bridged amount in USDC subunits — always 6 decimals
const totalUsdc      = 6;         // 2+2+2 USDC
const amountSubunits = (totalUsdc * 1_000_000).toString(); // "6000000"

// Step 1: Approve Gateway to spend USDC
const approveTx = await client.createContractExecutionTransaction({
  walletAddress:        depositorAddress!,
  blockchain:           "ARC-TESTNET",
  contractAddress:      ARC_USDC,
  abiFunctionSignature: "approve(address,uint256)",
  abiParameters:        [GATEWAY_WALLET, amountSubunits],
  fee: { type: "level", config: { feeLevel: "MEDIUM" } },
});

await waitForTx(client, approveTx.data!.id!, "approve");

// Step 2: Deposit into Gateway — creates unified balance
const depositTx = await client.createContractExecutionTransaction({
  walletAddress:        depositorAddress!,
  blockchain:           "ARC-TESTNET",
  contractAddress:      GATEWAY_WALLET,
  abiFunctionSignature: "deposit(address,uint256)",
  abiParameters:        [ARC_USDC, amountSubunits],
  fee: { type: "level", config: { feeLevel: "MEDIUM" } },
});

await waitForTx(client, depositTx.data!.id!, "deposit");

console.log(`${totalUsdc} USDC now in unified Gateway balance`);
```

---

## Helper — polling until transaction confirms

```typescript
async function waitForTx(
  client: ReturnType<typeof initiateDeveloperControlledWalletsClient>,
  txId: string,
  label: string,
) {
  process.stdout.write(`Waiting for ${label}`);
  while (true) {
    const { data } = await client.getTransaction({ id: txId });
    process.stdout.write(".");
    if (data?.transaction?.state === "COMPLETE") {
      console.log(` ✓  tx: https://testnet.arcscan.app/tx/${data.transaction.txHash}`);
      return data.transaction.txHash!;
    }
    if (data?.transaction?.state === "FAILED") throw new Error(`${label} failed`);
    await new Promise(r => setTimeout(r, 3000));
  }
}
```

---

## Full script

```typescript
/**
 * Consolidate USDC from multiple chains into Gateway on Arc.
 *
 * Setup:
 *   npm install @circle-fin/bridge-kit @circle-fin/adapter-circle-wallets
 *               @circle-fin/developer-controlled-wallets tsx typescript
 *
 * .env:
 *   CIRCLE_API_KEY=...
 *   CIRCLE_ENTITY_SECRET=...
 *   DEPOSITOR_ADDRESS=0x...   (wallet address with USDC on source chains)
 *
 * Run:
 *   npx tsx --env-file=.env consolidate.ts
 */

import { BridgeKit, BridgeChain } from "@circle-fin/bridge-kit";
import { createCircleWalletsAdapter } from "@circle-fin/adapter-circle-wallets";
import { initiateDeveloperControlledWalletsClient } from "@circle-fin/developer-controlled-wallets";

const GATEWAY_WALLET = "0x0077777d7EBA4688BDeF3E311b846F25870A19B9";
const ARC_USDC       = "0x3600000000000000000000000000000000000000";

const client = initiateDeveloperControlledWalletsClient({
  apiKey:        process.env.CIRCLE_API_KEY!,
  entitySecret:  process.env.CIRCLE_ENTITY_SECRET!,
});

async function waitForTx(txId: string, label: string) {
  process.stdout.write(`  ⏳ ${label}`);
  while (true) {
    const { data } = await client.getTransaction({ id: txId });
    process.stdout.write(".");
    if (data?.transaction?.state === "COMPLETE") {
      console.log(` ✓`);
      return data.transaction.txHash!;
    }
    if (data?.transaction?.state === "FAILED") throw new Error(`${label} failed`);
    await new Promise(r => setTimeout(r, 3000));
  }
}

async function main() {
  const depositorAddress = process.env.DEPOSITOR_ADDRESS!;

  // ── Phase 1: Bridge to Arc ──────────────────────────────
  console.log("\n── Phase 1: Bridging to Arc Testnet ──");

  const kit = new BridgeKit();
  kit.on("*", (p) => console.log(" ", p.method, p.values));

  const adapter = createCircleWalletsAdapter({
    apiKey:       process.env.CIRCLE_API_KEY!,
    entitySecret: process.env.CIRCLE_ENTITY_SECRET!,
  });

  const sources = [
    { chain: BridgeChain.Ethereum_Sepolia, amount: "2" },
    { chain: BridgeChain.Base_Sepolia,     amount: "2" },
    { chain: BridgeChain.Avalanche_Fuji,   amount: "2" },
  ];

  for (const source of sources) {
    console.log(`  Bridging ${source.amount} USDC from ${source.chain}...`);
    await kit.bridge({
      from: { adapter, chain: source.chain,            address: depositorAddress },
      to:   { adapter, chain: BridgeChain.Arc_Testnet, address: depositorAddress },
      amount: source.amount,
    });
  }

  // ── Phase 2: Deposit to Gateway ─────────────────────────
  console.log("\n── Phase 2: Depositing to Gateway ──");

  const totalUsdc      = sources.reduce((s, x) => s + parseFloat(x.amount), 0);
  const amountSubunits = Math.floor(totalUsdc * 1_000_000).toString();

  const approveTx = await client.createContractExecutionTransaction({
    walletAddress:        depositorAddress,
    blockchain:           "ARC-TESTNET",
    contractAddress:      ARC_USDC,
    abiFunctionSignature: "approve(address,uint256)",
    abiParameters:        [GATEWAY_WALLET, amountSubunits],
    fee: { type: "level", config: { feeLevel: "MEDIUM" } },
  });
  await waitForTx(approveTx.data!.id!, "approve USDC");

  const depositTx = await client.createContractExecutionTransaction({
    walletAddress:        depositorAddress,
    blockchain:           "ARC-TESTNET",
    contractAddress:      GATEWAY_WALLET,
    abiFunctionSignature: "deposit(address,uint256)",
    abiParameters:        [ARC_USDC, amountSubunits],
    fee: { type: "level", config: { feeLevel: "MEDIUM" } },
  });
  await waitForTx(depositTx.data!.id!, "Gateway deposit");

  console.log(`\n  ✓ ${totalUsdc} USDC consolidated into Gateway balance`);
  console.log(`  Explorer: https://testnet.arcscan.app/address/${depositorAddress}`);
}

main().catch(e => { console.error(e); process.exit(1); });
```

---

## Production considerations

In production environments, these steps would typically be integrated into your existing treasury systems and signing stack (such as MPC or custody providers), with monitoring, retry logic, and payout orchestration layered on top.

Additional layers to add for production:

```typescript
// 1. Retry logic for failed bridge transactions
async function bridgeWithRetry(kit, params, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await kit.bridge(params);
    } catch (e) {
      if (i === maxRetries - 1) throw e;
      await new Promise(r => setTimeout(r, 5000 * (i + 1))); // backoff
    }
  }
}

// 2. Balance check before bridging
async function getUsdcBalance(client, walletId) {
  const { data } = await client.getWalletTokenBalance({ id: walletId });
  return data?.tokenBalances?.find(b => b.token?.symbol === "USDC")?.amount ?? "0";
}

// 3. Minimum threshold — only bridge if worth the gas
const MIN_BRIDGE_USDC = 5;
if (parseFloat(balance) >= MIN_BRIDGE_USDC) {
  await kit.bridge(params);
}
```

---

## Common mistakes

### 1. Using 18 decimals for USDC deposit
```typescript
// WRONG — deposit 6 USDC with 18 decimals overflows
const amount = (6 * 1e18).toString(); // "6000000000000000000"

// CORRECT — USDC uses 6 decimals on Arc
const amount = (6 * 1_000_000).toString(); // "6000000"
```

### 2. Calling deposit() without approve() first
```typescript
// WRONG — Gateway cannot transfer USDC without prior approval
await depositToGateway(amount);

// CORRECT — approve first, then deposit
await approveUsdc(GATEWAY_WALLET, amount);
await depositToGateway(amount);
```

### 3. Bridging before checking source chain balance
```typescript
// WRONG — bridge fails if insufficient USDC on source chain
await kit.bridge({ amount: "100", from: { chain: BridgeChain.Ethereum_Sepolia, ... } });

// CORRECT — check balance first
const balance = await getUsdcBalance(client, ethWalletId);
if (parseFloat(balance) >= 100) {
  await kit.bridge({ amount: "100", ... });
}
```

### 4. Not waiting for bridge confirmation before depositing
```typescript
// WRONG — deposit may run before bridge minting is complete on Arc
await kit.bridge({ ... });
await depositToGateway(amount); // race condition

// CORRECT — Bridge Kit awaits full completion before resolving
await kit.bridge({ ... }); // resolves only after minting on Arc
await depositToGateway(amount); // safe to proceed
```

---

## Decision guide

| Need | Use |
|---|---|
| Bridge USDC from one chain to Arc | `bridge-stablecoin` skill |
| Bridge from multiple chains + consolidate | `use-arc-fintech` (this skill) |
| Query unified Gateway balance | `use-gateway` skill |
| Pay out from Gateway to another chain | `use-gateway` skill |
| Full treasury + agent economy | `use-arc-fintech` + `use-agent-economy` |

---

## Related skills

- [`use-gateway`](../use-gateway/SKILL.md) — unified USDC balance, balance queries, crosschain payouts
- [`bridge-stablecoin`](../bridge-stablecoin/SKILL.md) — single crosschain USDC transfer via CCTP
- [`use-developer-controlled-wallets`](../use-developer-controlled-wallets/SKILL.md) — wallet creation and transaction signing
- [`use-agent-economy`](../use-agent-economy/SKILL.md) — treasury management for autonomous agents
