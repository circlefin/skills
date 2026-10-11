---
name: use-erc8183
description: "Create and manage agentic commerce jobs on Arc Testnet using ERC-8183. Covers job creation, USDC escrow funding, deliverable submission, and settlement. Triggers: ERC-8183, agentic commerce, job lifecycle, AgenticCommerce, createJob, setBudget, fund escrow, submit deliverable, complete job, job settlement, USDC escrow, agent job, job status."
---

## Overview

ERC-8183 defines a trustless job lifecycle for agentic commerce on Arc Testnet. A client creates a job with USDC budget, a provider completes work and submits a deliverable hash, and an evaluator releases payment on approval.

## Contract Address

| Contract | Address |
|----------|---------|
| AgenticCommerce | 0x0747EEf0706327138c69792bF28Cd525089e4583 |
| USDC (Arc Testnet) | 0x3600000000000000000000000000000000000000 |

## Network

Chain ID: 5042002
RPC: https://rpc.testnet.arc.network
Explorer: https://testnet.arcscan.app

## Job Lifecycle

createJob() -> setBudget() -> approve() -> fund() -> submit() -> complete()

Status values: 0=Open 1=Funded 2=Submitted 3=Completed 4=Rejected 5=Expired

## Core Concepts

- Client and provider cannot be the same address
- Client approves USDC before funding escrow
- Provider submits a bytes32 deliverable hash
- Evaluator (often the client) calls complete() to release payment
- Budget is set by the provider via setBudget()

## Step 1 - Create Job

```typescript
const createJobTx = await circleClient.createContractExecutionTransaction({
  walletAddress: clientWallet.address,
  blockchain: "ARC-TESTNET",
  contractAddress: "0x0747EEf0706327138c69792bF28Cd525089e4583",
  abiFunctionSignature: "createJob(address,address,uint256,string,address)",
  abiParameters: [
    providerWallet.address,
    clientWallet.address,
    expiredAt.toString(),
    "Job description",
    "0x0000000000000000000000000000000000000000"
  ],
  fee: { type: "level", config: { feeLevel: "MEDIUM" } },
});
```

## Step 2 - Set Budget

Provider sets the price for the job.

```typescript
const setBudgetTx = await circleClient.createContractExecutionTransaction({
  walletAddress: providerWallet.address,
  blockchain: "ARC-TESTNET",
  contractAddress: "0x0747EEf0706327138c69792bF28Cd525089e4583",
  abiFunctionSignature: "setBudget(uint256,uint256,bytes)",
  abiParameters: [jobId.toString(), budgetAmount.toString(), "0x"],
  fee: { type: "level", config: { feeLevel: "MEDIUM" } },
});
```

## Step 3 - Approve and Fund Escrow

Client approves USDC then funds the escrow.

```typescript
// Approve USDC
await circleClient.createContractExecutionTransaction({
  walletAddress: clientWallet.address,
  blockchain: "ARC-TESTNET",
  contractAddress: "0x3600000000000000000000000000000000000000",
  abiFunctionSignature: "approve(address,uint256)",
  abiParameters: ["0x0747EEf0706327138c69792bF28Cd525089e4583", budgetAmount.toString()],
  fee: { type: "level", config: { feeLevel: "MEDIUM" } },
});

// Fund escrow
await circleClient.createContractExecutionTransaction({
  walletAddress: clientWallet.address,
  blockchain: "ARC-TESTNET",
  contractAddress: "0x0747EEf0706327138c69792bF28Cd525089e4583",
  abiFunctionSignature: "fund(uint256,bytes)",
  abiParameters: [jobId.toString(), "0x"],
  fee: { type: "level", config: { feeLevel: "MEDIUM" } },
});
```

## Step 4 - Submit Deliverable

Provider submits a keccak256 hash of the deliverable.

```typescript
import { keccak256, toHex } from "viem";

const deliverableHash = keccak256(toHex("deliverable-content-or-ipfs-hash"));

await circleClient.createContractExecutionTransaction({
  walletAddress: providerWallet.address,
  blockchain: "ARC-TESTNET",
  contractAddress: "0x0747EEf0706327138c69792bF28Cd525089e4583",
  abiFunctionSignature: "submit(uint256,bytes32,bytes)",
  abiParameters: [jobId.toString(), deliverableHash, "0x"],
  fee: { type: "level", config: { feeLevel: "MEDIUM" } },
});
```

## Step 5 - Complete Job

Evaluator approves the deliverable and releases payment to the provider.

```typescript
const reasonHash = keccak256(toHex("approved"));

await circleClient.createContractExecutionTransaction({
  walletAddress: evaluatorWallet.address,
  blockchain: "ARC-TESTNET",
  contractAddress: "0x0747EEf0706327138c69792bF28Cd525089e4583",
  abiFunctionSignature: "complete(uint256,bytes32,bytes)",
  abiParameters: [jobId.toString(), reasonHash, "0x"],
  fee: { type: "level", config: { feeLevel: "MEDIUM" } },
});
```

## Common Mistakes

- Client and provider must be different addresses
- Always call setBudget() before fund()
- Always approve USDC before calling fund()
- Use keccak256 hash for deliverable, not raw content

## Integration with ERC-8004

Combine with ERC-8004 identity for trust-verified agent jobs. See the use-erc8004 skill.

## Resources

- Arc ERC-8183 Tutorial: https://docs.arc.io/arc/tutorials/create-your-first-erc-8183-job
- Arc Testnet Explorer: https://testnet.arcscan.app
- Reference implementation: https://github.com/consumeobeydie/arc-agent-api
