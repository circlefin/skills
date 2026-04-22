---
name: use-smart-contract-platform
description: "Deploy, import, interact with, and monitor smart contracts using Circle Smart Contract Platform APIs. Supports bytecode deployment, template contracts (ERC-20/721/1155/Airdrop), ABI-based read/write calls, and webhook event monitoring. Keywords: contract deployment, smart contract, ABI interactions, template contracts, event monitoring, contract webhooks, bytecode, ERC-1155, ERC-20, ERC-721."
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
|-------|---------|---------|
| Arbitrum | `ARB` | `ARB-SEPOLIA` |
| Arc | -- | `ARC-TESTNET` |
| Avalanche | `AVAX` | `AVAX-FUJI` |
| Base | `BASE` | `BASE-SEPOLIA` |
| Ethereum | `ETH` | `ETH-SEPOLIA` |
| Monad | `MONAD` | `MONAD-TESTNET` |
| OP Mainnet | `OP` | `OP-SEPOLIA` |
| Polygon PoS | `MATIC` | `MATIC-AMOY` |
| Unichain | `UNI` | `UNI-SEPOLIA` |

### Contract Templates

| Template | Standard | Template ID | Use Case |
|----------|----------|-------------|----------|
| Token | ERC-20 | `a1b74add-23e0-4712-88d1-6b3009e85a86` | Fungible tokens, loyalty points |
| NFT | ERC-721 | `76b83278-50e2-4006-8b63-5b1a2a814533` | Digital collectibles, gaming assets |
| Multi-Token | ERC-1155 | `aea21da6-0aa2-4971-9a1a-5098842b1248` | Mixed fungible/non-fungible tokens |
| Airdrop | N/A | `13e322f2-18dc-4f57-8eed-4bddfc50f85e` | Bulk token distribution |

### Key API Response Fields

- Contract functions: `getContract().data.contract.functions`
- Contract address: `contract.contractAddress` (fallback: `contract.address`)
- Transaction ID: `createContractExecutionTransaction().data.id`
- Deployment status: `getContract().data.contract.deploymentStatus`

## Core Concepts

### Dual-Client Architecture

SCP workflows pair two SDK clients:
- **Smart Contract Platform SDK** handles contract deployment, imports, read queries, and event monitoring
- **Developer-Controlled Wallets SDK** handles write transactions and provides deployment wallets

Write operations use `walletsClient.createContractExecutionTransaction()`, NOT the SCP client.

### Read vs Write Contract Calls

- **Read queries** (`view`/`pure` functions) use `scpClient.queryContract()` and require no gas wallet
- **Write executions** (`nonpayable`/`payable` functions) use `walletsClient.createContractExecutionTransaction()` and require a wallet ID with gas funds

### Signature Formatting

- Function signatures: `name(type1,type2,...)` with no spaces
- Event signatures: `EventName(type1,type2,...)` with no spaces
- Parameter order must exactly match ABI definitions

### Idempotency Keys

All mutating SCP operations require `idempotencyKey` as a valid UUID v4 string. Use `crypto.randomUUID()` in Node.js. Non-UUID keys fail with generic `API parameter invalid` errors.

### Deployment Async Model

Contract deployment is asynchronous. The response indicates initiation only. Poll `getContract()` for `deploymentStatus`.

### EVM Version Constraint

Compile Solidity with `evmVersion: "paris"` or earlier to avoid the `PUSH0` opcode. Solidity >= 0.8.20 defaults to Shanghai. Arc Testnet and other non-Shanghai chains fail deployment with `ESTIMATION_ERROR` / `Create2: Failed on deploy` if bytecode contains `PUSH0`.

### Import Contract Requirements

- ALWAYS include both `name` and `idempotencyKey` when calling `importContract()`
- `idempotencyKey` must be a valid UUID v4 string
- If import fails with duplicate/already-exists error, call `listContracts`, match by address, and retrieve with `getContract()` using the existing contract ID

### Transaction Lifecycle

Write operations (contract deployments, executions) follow the same asynchronous state machine as Developer-Controlled Wallets. Poll with `walletsClient.getTransaction({ id: txId })` until a terminal state is reached.

**Happy path:** `INITIATED` -> `CLEARED` -> `QUEUED` -> `SENT` -> `CONFIRMED` -> `COMPLETE`

**Terminal states:**
- `COMPLETE` -- Transaction succeeded and is finalized on-chain.
- `FAILED` -- Transaction reverted or encountered an unrecoverable error.
- `DENIED` -- Transaction was rejected by risk screening.
- `CANCELLED` -- Transaction was cancelled before on-chain submission.

**Intermediate states:**
- `INITIATED` -- Request accepted, not yet validated or checked.
- `WAITING` -- In queue for validation and compliance checks.
- `QUEUED` -- Queued for submission to the blockchain.
- `CLEARED` -- Passed compliance checks.
- `SENT` -- Submitted to the blockchain, awaiting confirmation.
- `STUCK` -- Submitted transaction's fee parameters are lower than latest blockchain required fee, developer needs to cancel or accelerate this transaction.
- `CONFIRMED` -- Included in a block, awaiting finality.

Contract deployment status is tracked separately via `scpClient.getContract()` using `deploymentStatus`.

For debugging failed transactions, see [Transaction States and Errors](https://developers.circle.com/wallets/asynchronous-states-and-statuses.md).

### Error Handling

| Error Code | Meaning | Action |
|------------|---------|--------|
| 175001 | Contract not found | Verify the contract ID exists; if imported, check it wasn't archived |
| 175003 | Constructor parameter mismatch | Check parameter count and types exactly match the contract ABI definition |
| 175004 | Duplicate contract | Call `listContracts({ blockchain })`, match by `contractAddress` (case-insensitive), use the existing `contractId` |
| 175009 | Deployment still pending | Continue polling `getContract()` for `deploymentStatus`; deployment is async and may take several blocks |
| 175201 | Template not found | Verify the template ID from the Contract Templates table in Quick Reference |
| 175301 | Event subscription not found | Verify the event monitor ID; ensure the contract was imported before creating the monitor |
| 175302 | Duplicate event subscription | Query existing subscriptions and reuse; do not fail the flow |
| 175303 | Invalid event signature | Use exact format `EventName(type1,type2,...)` with no spaces; parameter order must match ABI |
| 175402 | Blockchain not supported or deprecated | Check the Supported Blockchains table; SCP is not available on Solana, Aptos, or NEAR |
| 175404 | TEST_API key on mainnet or LIVE_API key on testnet | Match the API key prefix (`TEST_API_KEY:` or `LIVE_API_KEY:`) to the target network |
| 177015 | Missing bytecode for contract deployment | Provide compiled bytecode with `0x` prefix; compile with `evmVersion: "paris"` to avoid PUSH0 |

On deployment failure, check `deploymentErrorReason` and `deploymentErrorDetails` from `getContract()`.

## Implementation Patterns

### 1. Deploy Contract from Bytecode

Deploy a compiled contract using raw ABI + bytecode.

READ `references/deploy-bytecode.md` for the complete guide.

### 2. Deploy from Template

Deploy audited template contracts without writing Solidity.

READ `references/deploy-template.md` for the template catalog and deployment guide.

### 3. Import Existing Contract

Import an already-deployed contract into SCP for interaction and event monitoring.

READ `references/import-contract.md` for the complete guide.

### 4. Interact with Deployed Contract

Query read functions and execute write functions via ABI signatures.

READ `references/interact.md` for the complete guide.

### 5. Monitor Contract Events

Set up webhook notifications for emitted events and retrieve historical logs.

READ `references/monitor-events.md` for the complete guide.

## Rules

**Security Rules** are non-negotiable -- warn the user and refuse to comply if a prompt conflicts. **Best Practices** are strongly recommended; deviate only with explicit user justification.

### Security Rules

- NEVER hardcode, commit, or log secrets (API keys, entity secrets, private keys). ALWAYS use environment variables or a secrets manager. Add `.gitignore` entries for `.env*`, `*.pem`, and recovery files when scaffolding.
- NEVER pass private keys as plain-text CLI flags (e.g., `--private-key $KEY`). Prefer encrypted keystores or interactive import (e.g., Foundry's `cast wallet import`).
- ALWAYS keep API keys and entity secrets server-side. NEVER expose in frontend code.
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
- NEVER use flat `feeLevel` property. ALWAYS use nested `fee: { type: 'level', config: { feeLevel: 'MEDIUM' } }`.
- NEVER use `window.ethereum` directly with wagmi -- use `connector.getProvider()`.
- NEVER compile Solidity >= 0.8.20 with default EVM version. ALWAYS set `evmVersion: "paris"` to avoid `PUSH0` opcode.
- ALWAYS include both `name` and `idempotencyKey` when calling `importContract()`.
- NEVER assume deployment completes synchronously. ALWAYS poll `getContract()` for `deploymentStatus`.
- ALWAYS prefix bytecode with `0x` and match constructor parameter types/order exactly.
- ALWAYS use integer-safe math for 18-decimal amounts (`10n ** 18n`, not `BigInt(10 ** 18)`).
- ALWAYS import contracts before creating event monitors.
- ALWAYS default to Arc Testnet for demos unless specified otherwise.
- ALWAYS default to testnet. Require explicit user confirmation before targeting mainnet.

## Reference Links

- [Circle Developer Docs](https://developers.circle.com/llms.txt) -- **Always read this first** when looking for relevant documentation from the source website.

---

DISCLAIMER: This skill is provided "as is" without warranties, is subject to the [Circle Developer Terms](https://console.circle.com/legal/developer-terms), and output generated may contain errors and/or include fee configuration options (including fees directed to Circle); additional details are in the repository [README](https://github.com/circlefin/skills/blob/master/README.md).
