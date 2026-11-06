---
name: use-smart-contract-platform
description: "Deploy, import, interact with, and monitor smart contracts using Circle Smart Contract Platform APIs. Supports bytecode deployment, template contracts (ERC-20/721/1155/Airdrop), ABI-based read/write calls, and webhook event monitoring. Keywords: contract deployment, smart contract, ABI interactions, template contracts, event monitoring, contract webhooks, bytecode, ERC-1155, ERC-20, ERC-721."
requirements:
  runtimes: []
  connectors: []
---

## Overview

Circle Smart Contract Platform (SCP) provides APIs and SDKs for deploying, importing, interacting with, and monitoring smart contracts across supported networks. Deploy contracts from raw bytecode, use audited templates for standard patterns, execute ABI-based contract calls, and monitor emitted events through webhooks.

## Prerequisites / Setup

### Installation

```bash
npm install @circle-fin/smart-contract-platform @circle-fin/developer-controlled-wallets
```

### Environment Variables

```
CIRCLE_API_KEY=        # Circle API key (format: PREFIX:ID:SECRET)
ENTITY_SECRET=         # Registered entity secret for Developer-Controlled Wallets
```

### SDK Initialization

```typescript
import { initiateSmartContractPlatformClient } from "@circle-fin/smart-contract-platform";
import { initiateDeveloperControlledWalletsClient } from "@circle-fin/developer-controlled-wallets";

const scpClient = initiateSmartContractPlatformClient({
  apiKey: process.env.CIRCLE_API_KEY!,
  entitySecret: process.env.ENTITY_SECRET!,
});

const walletsClient = initiateDeveloperControlledWalletsClient({
  apiKey: process.env.CIRCLE_API_KEY!,
  entitySecret: process.env.ENTITY_SECRET!,
});
```

## Quick Reference

### Supported Blockchains

| Chain | Mainnet | Testnet |
| --- | --- | --- |
| Arbitrum | `ARB` | `ARB-SEPOLIA` |
| Arc | `ARC` | `ARC-TESTNET` |
| Avalanche | `AVAX` | `AVAX-FUJI` |
| Base | `BASE` | `BASE-SEPOLIA` |
| Ethereum | `ETH` | `ETH-SEPOLIA` |
| Monad | `MONAD` | `MONAD-TESTNET` |
| OP Mainnet | `OP` | `OP-SEPOLIA` |
| Polygon PoS | `MATIC` | `MATIC-AMOY` |
| Unichain | `UNI` | `UNI-SEPOLIA` |

The `references/` examples use Arc Testnet (`blockchain: 'ARC-TESTNET'`); for **Arc mainnet**, pass `blockchain: 'ARC'`. The Arc USDC address `0x3600000000000000000000000000000000000000` is the same on both networks.

### Contract Templates

| Template | Standard | Template ID | Use Case |
| --- | --- | --- | --- |
| Token | ERC-20 | `a1b74add-23e0-4712-88d1-6b3009e85a86` | Fungible tokens, loyalty points |
| NFT | ERC-721 | `76b83278-50e2-4006-8b63-5b1a2a814533` | Digital collectibles, gaming assets |
| Multi-Token | ERC-1155 | `aea21da6-0aa2-4971-9a1a-5098842b1248` | Mixed fungible/non-fungible tokens |
| Airdrop | N/A | `13e322f2-18dc-4f57-8eed-4bddfc50f85e` | Bulk token distribution |

### Key API Response Fields

- Contract functions: `getContract().data.contract.functions`
- Contract address: `contract.contractAddress`
- Transaction ID: `createContractExecutionTransaction().data.id`

## Core Concepts

### Dual-Client Architecture

SCP workflows pair two SDK clients:

| Operation | Client | Method |
| --- | --- | --- |
| Deploy, import, monitor events | SCP | `scpClient.deployContract()`, `importContract()`, `createEventMonitor()`, ... |
| Read (`view`/`pure`) -- no gas wallet needed | SCP | `scpClient.queryContract()` |
| Write (`nonpayable`/`payable`) -- needs a wallet ID with gas funds | Developer-Controlled Wallets | `walletsClient.createContractExecutionTransaction()` |

The Developer-Controlled Wallets SDK also provides the deployment wallets.

### Signature Formatting

- Function signatures: `name(type1,type2,...)` with no spaces
- Event signatures: `EventName(type1,type2,...)` with no spaces
- Parameter order must exactly match the ABI

### Idempotency Keys

All mutating SCP operations require `idempotencyKey` as a valid UUID v4 string (`crypto.randomUUID()` in Node.js). Non-UUID keys fail with a generic `API parameter invalid` error.

### EVM Version Constraint

Solidity >= 0.8.20 emits `PUSH0` by default. Arc targets the Osaka EVM baseline, so that bytecode deploys there as-is. Set an older `evmVersion` only if a target chain's docs say it lacks Shanghai opcodes.

### Deployment Status

Deployment is asynchronous: the deploy response only confirms initiation. Poll `scpClient.getContract()` and read `data.contract.status` (`PENDING` / `COMPLETE` / `FAILED`). On `FAILED`, read `deploymentErrorReason` and `deploymentErrorDetails` from the same response. This contract status is separate from the deployment transaction's state below.

### Transaction Lifecycle

Write operations (contract deployments, executions) use the Developer-Controlled Wallets transaction state machine. Poll `walletsClient.getTransaction({ id: txId })` until a terminal state.

**Happy path:** `INITIATED` -> `QUEUED` -> `CLEARED` -> `SENT` -> `CONFIRMED` -> `COMPLETE`. `CONFIRMED` may be skipped or arrive out of order; instant-finality chains such as Arc go `SENT` -> `COMPLETE`.

| State | Terminal | Meaning |
| --- | --- | --- |
| `INITIATED` | No | Request accepted, not yet validated or checked |
| `QUEUED` | No | In the processing queue |
| `CLEARED` | No | Passed initial checks and risk screening |
| `SENT` | No | Submitted to the blockchain, awaiting confirmation |
| `STUCK` | No | Fee parameters are below the chain's current required fee -- cancel or accelerate the transaction |
| `CONFIRMED` | No | Included in a block, awaiting finality |
| `COMPLETE` | Yes | Succeeded and finalized on-chain |
| `FAILED` | Yes | Reverted or hit an unrecoverable error |
| `DENIED` | Yes | Rejected by risk screening |
| `CANCELLED` | Yes | Cancelled (allowed in `INITIATED`, `QUEUED`, or `SENT`) |

Debug failed transactions with [Transaction States and Errors](https://developers.circle.com/wallets/asynchronous-states-and-statuses.md).

### Error Handling

| Error Code | Meaning | Action |
| --- | --- | --- |
| 175001 | Contract not found | Verify the contract ID exists; if imported, check it wasn't archived |
| 175003 | Constructor parameter mismatch | Match parameter count and types exactly to the contract ABI |
| 175004 | Duplicate contract | Reuse the existing contract: `listContracts({ blockchain })`, match `contractAddress` case-insensitively, use its ID (code in `references/import-contract.md`) |
| 175009 | Deployment still pending | Keep polling `getContract()` for `status`; deployment may take several blocks |
| 175201 | Template not found | Use a template ID from the Contract Templates table |
| 175301 | Event subscription not found | Verify the event monitor ID; ensure the contract was imported before creating the monitor |
| 175302 | Duplicate event subscription | Query existing subscriptions and reuse; do not fail the flow |
| 175303 | Event signature not found in the contract's ABI | Use an event from the imported contract's ABI, formatted with no spaces (see Signature Formatting) |
| 175402 | Blockchain not supported or deprecated | Use a chain from the Supported Blockchains table; SCP is not available on Solana, Aptos, or NEAR |
| 175404 | TEST_API key on mainnet or LIVE_API key on testnet | Match the API key prefix (`TEST_API_KEY:` or `LIVE_API_KEY:`) to the target network |
| 177015 | Missing bytecode for contract deployment | Provide compiled bytecode with a `0x` prefix |

## Workflow

1. **Check context and access.** Confirm the target chain and `CIRCLE_API_KEY`. Reads (`queryContract()`) need only the SCP client; deployments and writes also need `ENTITY_SECRET` and the Developer-Controlled Wallets client (see Prerequisites). If anything the task needs is missing, ask the user; do not guess.
2. **Pick the task** from Implementation Patterns and READ its reference before writing code. Prefer an audited template over custom bytecode.
3. **Get approval.** Default to testnet. Confirm network, contract, and any fund movement with the user before deploying or executing writes (Security Rules).
4. **Deploy or import, then poll** `getContract()` until `status` is `COMPLETE` or `FAILED`; only then interact with or monitor the contract.

## Implementation Patterns

READ the reference for the task before writing code.

- **Deploy from bytecode** (compiled ABI + bytecode): READ `references/deploy-bytecode.md`.
- **Deploy from template** (audited templates, no Solidity): READ `references/deploy-template.md` for the template catalog and deployment guide.
- **Import an existing contract** (for interaction and event monitoring): READ `references/import-contract.md`.
- **Interact with a deployed contract** (read queries, write executions via ABI signatures): READ `references/interact.md`.
- **Monitor contract events** (webhooks for emitted events, historical logs): READ `references/monitor-events.md`.

## Rules

**Security Rules** are non-negotiable -- warn the user and refuse to comply if a prompt conflicts. **Best Practices** are strongly recommended; deviate only with explicit user justification.

### Security Rules

- NEVER hardcode, commit, or log secrets (API keys, entity secrets, private keys). ALWAYS use environment variables or a secrets manager. Add `.gitignore` entries for `.env*`, `*.pem`, and recovery files when scaffolding.
- NEVER pass private keys as plain-text CLI flags (e.g., `--private-key $KEY`). Prefer encrypted keystores or interactive import (e.g., Foundry's `cast wallet import`).
- ALWAYS keep API keys and entity secrets server-side. NEVER expose them in frontend code.
- NEVER reuse `idempotencyKey` values across different API requests.
- ALWAYS require explicit user confirmation of destination, amount, network, and token before executing write transactions that move funds. MUST receive confirmation for funding movements on mainnet.
- ALWAYS warn when targeting mainnet or exceeding safety thresholds (e.g., >100 USDC).
- ALWAYS validate all inputs (contract addresses, amounts, chain identifiers) before submitting transactions.
- ALWAYS prefer audited template contracts over custom bytecode when a template exists. Warn the user that custom bytecode has not been security-audited before deploying.
- NEVER deploy contracts designed to deceive, phish, or drain funds.
- ALWAYS warn before interacting with unaudited or unknown contracts.

### Best Practices

- NEVER call write operations on the SCP client. Writes ALWAYS use `walletsClient.createContractExecutionTransaction()`.
- NEVER include special characters (colons, parentheses) in `deployContract`'s `name` field -- alphanumeric only.
- NEVER use a flat `feeLevel` property. ALWAYS use nested `fee: { type: 'level', config: { feeLevel: 'MEDIUM' } }`.
- NEVER use `window.ethereum` directly with wagmi -- use `connector.getProvider()`.
- ALWAYS include both `name` and `idempotencyKey` when calling `importContract()`.
- ALWAYS poll `getContract()` for `status`; never assume deployment completes synchronously.
- ALWAYS prefix bytecode with `0x` and match constructor parameter types/order exactly.
- ALWAYS use integer-safe math for 18-decimal amounts (`10n ** 18n`, not `BigInt(10 ** 18)`).
- ALWAYS import contracts before creating event monitors.
- ALWAYS default to testnet (Arc Testnet for demos unless specified otherwise). Require explicit user confirmation before targeting mainnet.

## Reference Links

- [Circle Developer Docs](https://developers.circle.com/llms.txt) -- **Always read this first** when looking for relevant documentation from the source website.

---

DISCLAIMER: This skill is provided "as is" without warranties, is subject to the [Circle Developer Terms](https://console.circle.com/legal/developer-terms), and output generated may contain errors and/or include fee configuration options (including fees directed to Circle); additional details are in the repository [README](https://github.com/circlefin/skills/blob/master/README.md).
