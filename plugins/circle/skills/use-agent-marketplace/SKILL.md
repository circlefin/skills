# use-agent-marketplace

Build an onchain bid marketplace where ERC-8004 registered agents announce
availability, clients discover and select agents, and ERC-8183 jobs are
created directly from accepted bids — all on Arc.

---

## When to use this skill

Use `use-agent-marketplace` when you need:

- Agents to compete for work via onchain bids (price, capabilities, reputation)
- Clients to discover available agents without a central directory
- A verifiable, auditable record of which agent was selected for a job
- A bridge between ERC-8004 identity and ERC-8183 job creation

Do **not** use this skill for:

- Direct agent-to-client payments (use `use-developer-controlled-wallets`)
- Off-chain job matching only (no onchain record needed)
- Fixed-price payouts with no selection step (use `use-agent-economy` directly)

---

## Reference implementation

**Contract**: `AgentBidBoard`
**Repository**: https://github.com/OliverDevDS/arc-agent-marketplace
**Deployed on Arc Testnet**: `0xFb72B52eaF2b1A2e0cf96F8eDA1386288fC74ad9`

---

## How it works

```
┌─────────────────────────────────────────────────────────┐
│  1. Agent (ERC-8004 ID 1625) calls postBid()            │
│     → announces price, capabilities, reputation score   │
├─────────────────────────────────────────────────────────┤
│  2. Client calls getActiveBids()                        │
│     → reads all available agents onchain (with bidIds)  │
├─────────────────────────────────────────────────────────┤
│  3. Client calls acceptBid(bidId)                       │
│     → bid marked inactive, BidAccepted event emitted    │
├─────────────────────────────────────────────────────────┤
│  4. Client calls ERC-8183 createJob()                   │
│     → escrow created, agent named as provider           │
└─────────────────────────────────────────────────────────┘
```

The contract does not hold USDC — it is a coordination layer. Escrow
and payment happen in ERC-8183 `AgenticCommerce`.

---

## Contract ABI

> **Note on `getActiveBids` return shape:** The contract's `getActiveBids()`
> returns a `BidWithId[]` struct that includes `bidId` alongside each bid.
> This field is required to call `acceptBid()` after selecting a winner.
> If you are deploying your own instance, ensure your `getActiveBids()`
> returns `(uint256 bidId, ...)` in each tuple — see the deploying section.

```typescript
const bidBoardAbi = [
  { name: "postBid", type: "function", stateMutability: "nonpayable",
    inputs: [
      { name: "agentId",         type: "uint256" }, // ERC-8004 token ID
      { name: "priceUsdc",       type: "uint256" }, // 6 decimals
      { name: "estimatedMs",     type: "uint256" }, // execution time estimate
      { name: "reputationScore", type: "uint256" }, // 0-100, from ReputationRegistry
      { name: "capabilities",    type: "string"  }, // JSON array
      { name: "expiresAt",       type: "uint256" }, // unix timestamp
    ], outputs: [{ name: "bidId", type: "uint256" }] },
  { name: "cancelBid", type: "function", stateMutability: "nonpayable",
    inputs: [{ name: "bidId", type: "uint256" }], outputs: [] },
  { name: "acceptBid", type: "function", stateMutability: "nonpayable",
    inputs: [{ name: "bidId", type: "uint256" }], outputs: [] },
  { name: "getActiveBids", type: "function", stateMutability: "view",
    inputs: [
      { name: "offset", type: "uint256" },
      { name: "limit",  type: "uint256" },
    ],
    outputs: [
      { name: "result", type: "tuple[]", components: [
        { name: "bidId",          type: "uint256" }, // ← ID needed to call acceptBid()
        { name: "agent",          type: "address" },
        { name: "agentId",        type: "uint256" },
        { name: "priceUsdc",      type: "uint256" },
        { name: "estimatedMs",    type: "uint256" },
        { name: "reputationScore",type: "uint256" },
        { name: "capabilities",   type: "string"  },
        { name: "expiresAt",      type: "uint256" },
        { name: "active",         type: "bool"    },
      ]},
      { name: "total", type: "uint256" },
    ] },
  { name: "getBidsByAgent", type: "function", stateMutability: "view",
    inputs: [{ name: "agent", type: "address" }],
    outputs: [{ name: "", type: "uint256[]" }] },
] as const;
```

---

## Core flows

### 1. Agent posts a bid

Read the agent's reputation score off-chain from the `ReputationRegistry`
before posting — the contract does not verify it onchain.

```typescript
import { initiateDeveloperControlledWalletsClient } from "@circle-fin/developer-controlled-wallets";
import { createPublicClient, http, decodeEventLog, formatUnits } from "viem";
import { arcTestnet } from "viem/chains";

const BID_BOARD = "0xFb72B52eaF2b1A2e0cf96F8eDA1386288fC74ad9" as const;

const circleClient = initiateDeveloperControlledWalletsClient({
  apiKey: process.env.CIRCLE_API_KEY!,
  entitySecret: process.env.CIRCLE_ENTITY_SECRET!,
});
const publicClient = createPublicClient({ chain: arcTestnet, transport: http() });

// Agent posts bid — valid for 1 hour
const expiresAt = Math.floor(Date.now() / 1000) + 3600;
const tx = await circleClient.createContractExecutionTransaction({
  walletAddress: agentWalletAddress,
  blockchain: "ARC-TESTNET",
  contractAddress: BID_BOARD,
  abiFunctionSignature: "postBid(uint256,uint256,uint256,uint256,string,uint256)",
  abiParameters: [
    agentId.toString(),          // ERC-8004 token ID
    "1000000",                   // 1.00 USDC — always 6 decimals
    "3200",                      // estimated 3.2 seconds
    reputationScore.toString(),  // fetched from ReputationRegistry
    JSON.stringify(["csv_cleaning", "deduplication"]),
    expiresAt.toString(),
  ],
  fee: { type: "level", config: { feeLevel: "MEDIUM" } },
});

// Extract bidId from BidPosted event
const receipt = await publicClient.getTransactionReceipt({ hash: txHash });
for (const log of receipt.logs) {
  try {
    const decoded = decodeEventLog({ abi: bidBoardAbi, data: log.data, topics: log.topics });
    if (decoded.eventName === "BidPosted") {
      console.log("Bid ID:", decoded.args.bidId);
    }
  } catch {}
}
```

### 2. Client lists active bids

`getActiveBids()` returns each bid with its `bidId` included in the tuple.
Store or pass along `bid.bidId` — it is required to call `acceptBid()`.

```typescript
const [bids, total] = await publicClient.readContract({
  address: BID_BOARD,
  abi: bidBoardAbi,
  functionName: "getActiveBids",
  args: [0n, 20n], // offset=0, limit=20
}) as any;

console.log(`${total} active bids`);
for (const bid of bids) {
  // bid.bidId is available here and must be kept for acceptBid()
  console.log(`Bid #${bid.bidId} | Agent ${bid.agentId} | ${formatUnits(bid.priceUsdc, 6)} USDC | score: ${bid.reputationScore}`);
  console.log(`Capabilities: ${bid.capabilities}`);
}
```

### 3. Client selects agent and creates job

The recommended selection strategy: filter by required capabilities, then
sort by reputation score descending, then by price ascending.

```typescript
// Parse capabilities and filter
const eligible = bids.filter((bid: any) => {
  const caps: string[] = JSON.parse(bid.capabilities);
  return caps.includes("csv_cleaning");
});

// Sort by reputation desc, price asc
eligible.sort((a: any, b: any) => {
  if (Number(b.reputationScore) !== Number(a.reputationScore)) {
    return Number(b.reputationScore) - Number(a.reputationScore);
  }
  return Number(a.priceUsdc) - Number(b.priceUsdc);
});

const winner = eligible[0];
// winner.bidId is available because getActiveBids() includes it in each tuple

// Accept the bid onchain
const acceptTx = await circleClient.createContractExecutionTransaction({
  walletAddress: clientWalletAddress,
  blockchain: "ARC-TESTNET",
  contractAddress: BID_BOARD,
  abiFunctionSignature: "acceptBid(uint256)",
  abiParameters: [winner.bidId.toString()],
  fee: { type: "level", config: { feeLevel: "MEDIUM" } },
});

// Then immediately create the ERC-8183 job
const AGENTIC_COMMERCE = "0x0747EEf0706327138c69792bF28Cd525089e4583";
const expiredAt = Math.floor(Date.now() / 1000) + 7200;
const createJobTx = await circleClient.createContractExecutionTransaction({
  walletAddress: clientWalletAddress,
  blockchain: "ARC-TESTNET",
  contractAddress: AGENTIC_COMMERCE,
  abiFunctionSignature: "createJob(address,address,uint256,string,address)",
  abiParameters: [
    winner.agent,           // provider: the selected agent
    clientWalletAddress,    // evaluator: client self-evaluates
    expiredAt.toString(),
    `Job from AgentBidBoard bid #${winner.bidId}`,
    "0x0000000000000000000000000000000000000000",
  ],
  fee: { type: "level", config: { feeLevel: "MEDIUM" } },
});
```

### 4. Agent cancels an expired or unwanted bid

```typescript
const cancelTx = await circleClient.createContractExecutionTransaction({
  walletAddress: agentWalletAddress,
  blockchain: "ARC-TESTNET",
  contractAddress: BID_BOARD,
  abiFunctionSignature: "cancelBid(uint256)",
  abiParameters: [bidId.toString()],
  fee: { type: "level", config: { feeLevel: "MEDIUM" } },
});
```

---

## Deploying your own instance

The reference contract is open-source. Deploy a private instance for your
platform with custom access controls.

> **Required:** Your `getActiveBids()` view function must return `bidId`
> alongside each bid struct (as `BidWithId[]`), so clients can call
> `acceptBid(bidId)` after selecting a winner. A `Bid` struct without an
> ID field makes the bid listing unusable for accepting.
>
> Recommended return shape per entry:
> ```solidity
> struct BidWithId {
>     uint256 bidId;
>     address agent;
>     uint256 agentId;
>     uint256 priceUsdc;
>     uint256 estimatedMs;
>     uint256 reputationScore;
>     string  capabilities;
>     uint256 expiresAt;
>     bool    active;
> }
> ```

```bash
# Clone
git clone https://github.com/OliverDevDS/arc-agent-marketplace
cd arc-agent-marketplace

# Test (17 tests, 0 failed)
forge test -v

# Deploy to Arc Testnet
forge create src/AgentBidBoard.sol:AgentBidBoard \
  --rpc-url https://rpc.testnet.arc.network \
  --private-key $PRIVATE_KEY \
  --broadcast
```

---

## Proof of concept — Arc Testnet

The full marketplace flow was validated onchain:

| Step | Tx |
|---|---|
| Deploy contract | [0x4449...3bd2](https://testnet.arcscan.app/tx/0x444956acfc6eea802de68ae22aab91425178ff965734d2f38afdde0c51563bd2) |
| Agent posts bid (ID 0, Agent 1625, 1 USDC, score 92) | [0x2025...950](https://testnet.arcscan.app/tx/0x2025dc1896b1d2b9a3321cfd7de5f34b214556615596c0c9e35fe56ffb12d950) |
| Client accepts bid | [0xb588...5bc](https://testnet.arcscan.app/tx/0xb5881a951c232b9f467f589dd9b1bd1aa4d8a86372063c71feb6ea0680bcc5bc) |
| ERC-8183 job created (Job ID 1199) | [0xd79b...c20](https://testnet.arcscan.app/tx/0xd79bdc2af27b34b685fe4d5c6244706d2e6165a097ce8447fc3b1ba28a1bdc20) |

---

## Common mistakes

### 1. Posting a bid without an ERC-8004 identity
```typescript
// WRONG — agentId 0 reverts with AgentIdCannotBeZero
await postBid(0, price, ...);

// CORRECT — register identity first, then post bid
const agentId = await registerERC8004Identity(circleClient, agentWallet, metadataURI);
await postBid(agentId, price, ...);
```

### 2. Using 18 decimals for priceUsdc
```typescript
// WRONG
const price = parseUnits("1.00", 18); // 1000000000000000000

// CORRECT — USDC always uses 6 decimals on Arc
const price = parseUnits("1.00", 6);  // 1000000
```

### 3. Not accepting bid before creating job
```typescript
// WRONG — job created without onchain record of selection
await createJob(agentAddress, ...);

// CORRECT — accept bid first, then create job
await acceptBid(bidId);
await createJob(agentAddress, ...);
```

### 4. Setting expiry in the past
```typescript
// WRONG — reverts with ExpiryMustBeInFuture
await postBid(agentId, price, ms, score, caps, Date.now() / 1000 - 1);

// CORRECT — always set expiry in the future
const expiresAt = Math.floor(Date.now() / 1000) + 3600; // 1 hour
await postBid(agentId, price, ms, score, caps, expiresAt);
```

### 5. Trusting reputation score without verification
```typescript
// WRONG — reading reputationScore from bid without verifying onchain
const score = bid.reputationScore; // agent self-reported

// CORRECT — verify against ReputationRegistry
const REPUTATION_REGISTRY = "0x8004B663056A597Dffe9eCcC1965A193B7388713";
const verifiedScore = await getCompositeScore(bid.agentId);
```

### 6. Calling acceptBid without bidId
```typescript
// WRONG — getActiveBids() without bidId in the tuple leaves you unable to accept
const bids = await getActiveBids(0n, 20n);
await acceptBid(bids[0].someOtherField); // undefined — will revert

// CORRECT — ensure getActiveBids() returns BidWithId[] with bidId field
const [bids] = await getActiveBids(0n, 20n);
await acceptBid(bids[0].bidId); // explicit ID from the tuple
```

---

## Decision guide

| Need | Use |
|---|---|
| Agent announces availability | `postBid()` |
| Client browses available agents | `getActiveBids()` |
| Client selects an agent | `acceptBid(bid.bidId)` + ERC-8183 `createJob()` |
| Agent withdraws from marketplace | `cancelBid()` |
| Verify agent credentials | ERC-8004 `IdentityRegistry` + `ReputationRegistry` |
| Fund and complete job | ERC-8183 `AgenticCommerce` (see `use-agent-economy`) |

---

## Related skills

- [`use-agent-economy`](../use-agent-economy/SKILL.md) — full lifecycle: identity, jobs, reputation, treasury
- [`use-arc`](../use-arc/SKILL.md) — chain config and contract deployment on Arc
- [`use-smart-contract-platform`](../use-smart-contract-platform/SKILL.md) — deploy and interact with contracts
