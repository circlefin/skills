# use-agent-economy

Build autonomous agents that earn, hold, and manage their own USDC — with
onchain identity, verifiable reputation, and self-custody. This skill
combines ERC-8004, ERC-8183, Circle Gateway, and Modular Wallets into a
single cohesive pattern: the **agent as economic subject**.

---

## When to use this skill

Use `use-agent-economy` when you are building an agent that:

- Needs a persistent, portable identity across jobs and platforms
- Competes for work autonomously and receives USDC payment on completion
- Accumulates a verifiable reputation that improves future bid outcomes
- Manages its own treasury across chains without a human approving each transaction
- Requires a guardian threshold — human approval only above a spend limit

Do **not** use this skill for:

- Simple human-to-human USDC payments (use `use-developer-controlled-wallets`)
- Crosschain transfers without agent identity (use `bridge-stablecoin` or `use-gateway`)
- Static automation scripts that do not need reputation or bidding

---

## Core concepts

### The four layers

```
┌─────────────────────────────────────────────────────┐
│  1. Identity     ERC-8004 IdentityRegistry           │
│                  Permanent NFT — agent's "passport"  │
├─────────────────────────────────────────────────────┤
│  2. Commerce     ERC-8183 AgenticCommerce            │
│                  Bid → escrow → deliver → payout     │
├─────────────────────────────────────────────────────┤
│  3. Reputation   ERC-8004 ReputationRegistry         │
│                  Onchain score — agent's "CV"        │
├─────────────────────────────────────────────────────┤
│  4. Treasury     Circle Gateway + Modular Wallets    │
│                  Unified balance, self-custody       │
└─────────────────────────────────────────────────────┘
```

Reputation feeds back into Commerce: a higher score justifies lower bids
and still wins jobs, compounding the agent's earning power over time.

---

## Layer 1 — Identity (ERC-8004)

### Contracts on Arc Testnet

| Contract           | Address                                      |
|--------------------|----------------------------------------------|
| IdentityRegistry   | `0x8004A818BFB912233c491871b3d84c89A494BD9e` |
| ReputationRegistry | `0x8004B663056A597Dffe9eCcC1965A193B7388713` |
| ValidationRegistry | `0x8004Cb1BF31DAf7788923b405b754f57acEB4272` |

### Agent metadata schema

Upload a JSON file to IPFS before registering. The fields below are
recommended for agent-economy use cases; add domain-specific fields as needed.

```json
{
  "name": "DataWrangler-v2",
  "description": "Autonomous CSV cleaning and enrichment agent",
  "agent_type": "data_processing",
  "capabilities": ["csv_cleaning", "schema_inference", "deduplication"],
  "avg_latency_ms": 3200,
  "supported_languages": ["en", "pt", "es"],
  "min_bid_usdc": "0.50",
  "version": "2.1.0",
  "contact_hook": "https://agent.example.com/webhook"
}
```

### Registration

```typescript
import { initiateDeveloperControlledWalletsClient } from "@circle-fin/developer-controlled-wallets";

const IDENTITY_REGISTRY = "0x8004A818BFB912233c491871b3d84c89A494BD9e";

async function registerAgent(
  circleClient: ReturnType<typeof initiateDeveloperControlledWalletsClient>,
  ownerWalletAddress: string,
  metadataURI: string   // ipfs://Qm...
) {
  const tx = await circleClient.createContractExecutionTransaction({
    walletAddress: ownerWalletAddress,
    blockchain: "ARC-TESTNET",
    contractAddress: IDENTITY_REGISTRY,
    abiFunctionSignature: "register(string)",
    abiParameters: [metadataURI],
    fee: { type: "level", config: { feeLevel: "MEDIUM" } },
  });
  return tx.data?.id;
}
```

### Retrieving the agent's token ID

After the registration transaction confirms, query the `Transfer` event to
get the minted token ID. Store this ID — every subsequent reputation and
validation call requires it.

```typescript
import { createPublicClient, http, parseAbiItem } from "viem";
import { arcTestnet } from "viem/chains";

const publicClient = createPublicClient({ chain: arcTestnet, transport: http() });

async function getAgentId(ownerAddress: `0x${string}`) {
  const latest = await publicClient.getBlockNumber();
  const from = latest > 10000n ? latest - 10000n : 0n;

  const logs = await publicClient.getLogs({
    address: IDENTITY_REGISTRY,
    event: parseAbiItem(
      "event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)"
    ),
    args: { to: ownerAddress },
    fromBlock: from,
    toBlock: latest,
  });

  if (!logs.length) throw new Error("No identity found for this address");
  return logs[logs.length - 1].args.tokenId!;
}
```

---

## Layer 2 — Commerce (ERC-8183)

### Contract on Arc Testnet

| Contract                        | Address                                      |
|---------------------------------|----------------------------------------------|
| AgenticCommerce (reference impl)| `0x0747EEf0706327138c69792bF28Cd525089e4583` |
| USDC on Arc Testnet             | `0x3600000000000000000000000000000000000000` |

### Job lifecycle

```
Client          Provider (agent)       Evaluator
  │                    │                    │
  ├─ createJob() ─────►│                    │
  │                    ├─ setBudget() ──────►│
  │◄── approve + fund ─┤                    │
  │                    ├─ [execute work]    │
  │                    ├─ submit(hash) ─────►│
  │                    │                    ├─ complete()
  │                    │◄── USDC payout ────┤
```

### Winning a job: the bid-to-fund pattern

ERC-8183 does not include a native auction. The recommended pattern is an
off-chain bid board (a simple API or smart contract event log) where agents
announce their willingness, then the client picks one and calls `createJob`
naming that agent as `provider`.

```typescript
// Agent announces availability (off-chain bid board)
const bid = {
  agentId: agentId.toString(),
  walletAddress: agentWallet.address,
  priceUsdc: "2.50",
  estimatedMs: 4000,
  reputationScore: 87,   // fetched from ReputationRegistry (see Layer 3)
  expiresAt: Date.now() + 300_000,
};
await fetch("https://bidboard.example.com/bids", {
  method: "POST",
  body: JSON.stringify(bid),
});

// Client selects agent and creates job (on-chain)
const AGENTIC_COMMERCE = "0x0747EEf0706327138c69792bF28Cd525089e4583";
const JOB_BUDGET = 2_500_000n; // 2.50 USDC — 6 decimals, never 18

const createJobTx = await circleClient.createContractExecutionTransaction({
  walletAddress: clientWallet.address!,
  blockchain: "ARC-TESTNET",
  contractAddress: AGENTIC_COMMERCE,
  abiFunctionSignature: "createJob(address,address,uint256,string,address)",
  abiParameters: [
    agentWallet.address!,           // provider
    clientWallet.address!,          // evaluator (client self-evaluates in simple flows)
    (Math.floor(Date.now() / 1000) + 3600).toString(), // expiredAt
    "Clean and deduplicate orders.csv",
    "0x0000000000000000000000000000000000000000", // hook: none
  ],
  fee: { type: "level", config: { feeLevel: "MEDIUM" } },
});
```

### Agent submits deliverable

The deliverable is a `bytes32` hash of the actual output. Store the full
output off-chain (IPFS, S3, your own endpoint) and commit its hash onchain.

```typescript
import { keccak256, toHex } from "viem";

// Agent computes output hash
const outputIPFSCID = "bafkreiexampleoutputhash";
const deliverableHash = keccak256(toHex(outputIPFSCID));

const submitTx = await circleClient.createContractExecutionTransaction({
  walletAddress: agentWallet.address!,
  blockchain: "ARC-TESTNET",
  contractAddress: AGENTIC_COMMERCE,
  abiFunctionSignature: "submit(uint256,bytes32,bytes)",
  abiParameters: [jobId.toString(), deliverableHash, "0x"],
  fee: { type: "level", config: { feeLevel: "MEDIUM" } },
});
```

### USDC decimal rule — never forget

Arc uses USDC as the native token. USDC always has **6 decimals**, not 18.

```typescript
import { parseUnits, formatUnits } from "viem";

const TWO_FIFTY  = parseUnits("2.50", 6);  // ✓  2_500_000n
const TWO_FIFTY_WRONG = parseUnits("2.50", 18); // ✗  never use 18 for USDC
const display = formatUnits(TWO_FIFTY, 6);      // "2.5"
```

---

## Layer 3 — Reputation (ERC-8004 ReputationRegistry)

### Dynamic scoring — do not hardcode

The quickstart tutorials use a hardcoded score of `95` for demonstration.
In production, derive the score from measurable outcomes.

```typescript
// Score calculation examples by domain

// Data processing job
function scoreDataJob(result: {
  rowsProcessed: number;
  errorsFound: number;
  latencyMs: number;
  expectedMs: number;
}) {
  const errorRate = result.errorsFound / result.rowsProcessed;
  const latencyRatio = result.latencyMs / result.expectedMs;
  const accuracy = Math.max(0, 100 - errorRate * 1000);
  const speed = latencyRatio <= 1 ? 100 : Math.max(0, 100 - (latencyRatio - 1) * 50);
  return Math.round((accuracy * 0.7) + (speed * 0.3));
}

// Translation / content job
function scoreContentJob(result: {
  humanApproved: boolean;
  revisionRounds: number;
  deliveredOnTime: boolean;
}) {
  if (!result.humanApproved) return 20;
  const revisionPenalty = result.revisionRounds * 10;
  const timeliness = result.deliveredOnTime ? 0 : 15;
  return Math.max(0, 100 - revisionPenalty - timeliness);
}
```

### Recording feedback

Reputation must be recorded by a **third party**, never by the agent's own
wallet. This is an ERC-8004 protocol rule to prevent self-dealing.

```typescript
import { keccak256, toHex } from "viem";

const REPUTATION_REGISTRY = "0x8004B663056A597Dffe9eCcC1965A193B7388713";

async function recordJobOutcome(
  circleClient: ReturnType<typeof initiateDeveloperControlledWalletsClient>,
  evaluatorWalletAddress: string,  // must NOT be the agent's wallet
  agentId: bigint,
  score: number,                   // 0–100, derived dynamically
  tag: string,                     // e.g. "data_processing_completed"
) {
  const feedbackHash = keccak256(toHex(`${tag}-${agentId}-${Date.now()}`));

  return circleClient.createContractExecutionTransaction({
    walletAddress: evaluatorWalletAddress,
    blockchain: "ARC-TESTNET",
    contractAddress: REPUTATION_REGISTRY,
    abiFunctionSignature:
      "giveFeedback(uint256,int128,uint8,string,string,string,string,bytes32)",
    abiParameters: [
      agentId.toString(),
      score.toString(),
      "0",       // feedbackType: 0 = general
      tag,
      "",        // metadataURI: optional IPFS link to full feedback
      "",        // evidenceURI: optional link to output artifact
      "",        // comment
      feedbackHash,
    ],
    fee: { type: "level", config: { feeLevel: "MEDIUM" } },
  });
}
```

### Reading an agent's composite score

There is no single aggregate score on-chain; compute it from the event log.

```typescript
async function getCompositeScore(agentId: bigint): Promise<number> {
  const latest = await publicClient.getBlockNumber();
  const from = latest > 50000n ? latest - 50000n : 0n;

  const logs = await publicClient.getLogs({
    address: REPUTATION_REGISTRY,
    fromBlock: from,
    toBlock: "latest",
  });

  // Filter logs for this agent (parse ABI to decode properly in production)
  const relevant = logs.filter(log => {
    try {
      // agentId is first topic after event signature in this contract
      return log.topics[1] === `0x${agentId.toString(16).padStart(64, "0")}`;
    } catch { return false; }
  });

  if (!relevant.length) return 0;

  // Weighted average: recent feedback counts more (simple decay)
  const scores = relevant.map((log, i) => ({
    weight: i + 1,  // more recent = higher index = higher weight
    score: parseInt(log.data.slice(2, 66), 16),
  }));

  const totalWeight = scores.reduce((s, r) => s + r.weight, 0);
  const weightedSum  = scores.reduce((s, r) => s + r.score * r.weight, 0);
  return Math.round(weightedSum / totalWeight);
}
```

---

## Layer 4 — Treasury (Gateway + Modular Wallets)

### Unified balance with Circle Gateway

Gateway keeps a single logical USDC balance across chains with sub-500ms
crosschain transfers. Use it when the agent earns on Arc but needs to pay
sub-agents or suppliers on Ethereum or Solana.

```typescript
// After job payout lands in agent's Arc wallet,
// rebalance to Ethereum if needed for a sub-agent payment

import { CircleGateway } from "@circle-fin/gateway"; // pseudo-import, see Circle docs

const gateway = new CircleGateway({ apiKey: process.env.CIRCLE_API_KEY! });

async function rebalance(
  fromChain: "ARC" | "ETH" | "SOL",
  toChain: "ARC" | "ETH" | "SOL",
  amountUsdc: string   // human-readable, e.g. "1.50"
) {
  return gateway.transfer({
    sourceChain: fromChain,
    destinationChain: toChain,
    amount: amountUsdc,
    currency: "USDC",
  });
}
```

### Self-custody with guardian threshold

Use a Modular Wallet (ERC-4337) so the agent transacts without a human
approving every operation — but enforce a guardian approval for large spends.

```typescript
// Pseudocode — adapt to Circle Modular Wallets SDK
const wallet = await circleClient.createModularWallet({
  blockchain: "ARC-TESTNET",
  authType: "passkey",
  guardians: [humanOperatorAddress],
  guardianThresholdUsdc: "50.00",  // guardian required for spends above this
});

// Routine job payout (below threshold) — agent signs autonomously
await wallet.transfer({ to: subAgentAddress, amount: "2.50", currency: "USDC" });

// Large rebalance (above threshold) — guardian approval required
await wallet.transferWithGuardian({
  to: liquidityPool,
  amount: "120.00",
  currency: "USDC",
  guardianSignature: await requestGuardianSignature(humanOperatorAddress),
});
```

---

## Full lifecycle example

```typescript
// 1. Bootstrap once
const agentWallet  = await createDeveloperControlledWallet("ARC-TESTNET");
const agentId      = await registerAgent(circleClient, agentWallet.address, METADATA_URI);

// 2. Per job (in a loop / event listener)
async function handleJob(jobId: bigint, clientAddress: string) {
  // Accept job (off-chain — notify client)
  console.log(`Accepting job ${jobId}`);

  // Execute work
  const output = await runTask(jobId);
  const deliverableHash = keccak256(toHex(await uploadToIPFS(output)));

  // Submit deliverable on-chain
  await submitDeliverable(circleClient, agentWallet.address, jobId, deliverableHash);

  // Score will be recorded by evaluator (client) after completion
  // Listen for JobCompleted event to confirm payout
}

// 3. Treasury management (scheduled)
async function manageTreasury() {
  const balance = await getUSDCBalance(agentWallet.address);
  const reserve = 5_000_000n; // 5 USDC minimum on Arc for gas

  if (balance > reserve + 20_000_000n) { // surplus above 20 USDC
    await rebalance("ARC", "ETH", formatUnits(balance - reserve, 6));
  }
}
```

---

## Common mistakes

### 1. Agent records its own reputation
```typescript
// WRONG — self-dealing, violates ERC-8004
await recordJobOutcome(circleClient, agentWallet.address, agentId, 99, "great_job");

// CORRECT — always use an independent evaluator wallet
await recordJobOutcome(circleClient, evaluatorWallet.address, agentId, score, tag);
```

### 2. Using 18 decimals for USDC
```typescript
// WRONG
const amount = parseUnits("5.00", 18);  // 5000000000000000000 — will fail or overdraw

// CORRECT
const amount = parseUnits("5.00", 6);   // 5000000
```

### 3. Job with no expiry safety net
```typescript
// WRONG — no expiry, job can be funded forever
abiParameters: [provider, evaluator, "9999999999", description, hook]

// CORRECT — reasonable deadline (e.g. 2 hours)
const expiredAt = Math.floor(Date.now() / 1000) + 7200;
abiParameters: [provider, evaluator, expiredAt.toString(), description, hook]
```

### 4. Spending treasury without reserve
```typescript
// WRONG — drains all USDC, agent can't pay gas on next job
await transfer({ amount: totalBalance });

// CORRECT — always keep a gas reserve
const GAS_RESERVE = parseUnits("3.00", 6);
await transfer({ amount: formatUnits(totalBalance - GAS_RESERVE, 6) });
```

### 5. Storing full output on-chain
```typescript
// WRONG — storing megabytes of data on-chain is extremely expensive
abiParameters: [jobId, outputData, "0x"]

// CORRECT — store output off-chain, commit only its hash
const cid = await uploadToIPFS(outputData);
const hash = keccak256(toHex(cid));
abiParameters: [jobId.toString(), hash, "0x"]
```

---

## Decision guide: which Circle primitive fits each agent need?

| Agent need                              | Primitive                          |
|-----------------------------------------|------------------------------------|
| Persistent identity across jobs         | ERC-8004 IdentityRegistry          |
| Get paid for completing a task          | ERC-8183 AgenticCommerce           |
| Build verifiable work history           | ERC-8004 ReputationRegistry        |
| Hold and move USDC across chains        | Circle Gateway                     |
| Transact without human per-tx approval  | Modular Wallet (ERC-4337)          |
| Large spend with human oversight        | Modular Wallet + guardian threshold|
| Bridge USDC to non-Gateway chains       | CCTP via `bridge-stablecoin`       |
| Custodial flow where dev controls keys  | Developer-controlled wallets       |

---

## Related skills

- [`use-arc`](../use-arc/SKILL.md) — chain config, contract deployment, CCTP basics
- [`use-gateway`](../use-gateway/SKILL.md) — unified USDC balance across chains
- [`use-modular-wallets`](../use-modular-wallets/SKILL.md) — passkey wallets, ERC-4337 account abstraction
- [`use-developer-controlled-wallets`](../use-developer-controlled-wallets/SKILL.md) — custodial flows
- [`bridge-stablecoin`](../bridge-stablecoin/SKILL.md) — CCTP crosschain transfers
