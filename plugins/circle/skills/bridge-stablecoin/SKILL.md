---
name: bridge-stablecoin
description: "Build USDC bridging with Circle Bridge Kit SDK and Crosschain Transfer Protocol (CCTP). Supports bridging USDC between EVM chains, between EVM chains and Solana, and between any two chains on Circle Wallets (i.e Developer-Controlled Wallets or Programmable wallets). Use when: bridge USDC, setting up Bridge Kit adapters (Viem, Ethers, Solana Kit, Circle Wallets), handling bridge events, collecting custom fees, configuring transfer speed, or using the Forwarding Service. Triggers on: Bridge Kit, bridge USDC, crosschain transfer, CCTP, move USDC between chains, @circle-fin/bridge-kit, adapter-viem, adapter-ethers, adapter-solana-kit, forwarding service, bridge routes."
---

## Overview

Crosschain Transfer Protocol (CCTP) is Circle's native protocol for burning USDC on one chain and minting it on another. Bridge Kit is a TypeScript SDK that orchestrates the full CCTP lifecycle -- approve, burn, attestation fetch, and mint -- in a single `kit.bridge()` call across EVM chains and Solana. Bridge Kit is the preferred way to integrate CCTP.

## Prerequisites / Setup

### Installation

```bash
npm install @circle-fin/bridge-kit @circle-fin/adapter-viem-v2
```

For Solana support, also install:

```bash
npm install @circle-fin/adapter-solana-kit
```

For Circle Wallets (developer-controlled) support:

```bash
npm install @circle-fin/adapter-circle-wallets
```

### Environment Variables

```
PRIVATE_KEY=              # EVM wallet private key (hex, 0x-prefixed)
EVM_PRIVATE_KEY=          # EVM private key (when also using Solana)
SOLANA_PRIVATE_KEY=       # Solana wallet private key (base58)
CIRCLE_API_KEY=           # Circle API key (for Circle Wallets adapter)
CIRCLE_ENTITY_SECRET=     # Entity secret (for Circle Wallets adapter)
EVM_WALLET_ADDRESS=       # Developer-controlled EVM wallet address
SOLANA_WALLET_ADDRESS=    # Developer-controlled Solana wallet address
```

### SDK Initialization

```ts
import { BridgeKit } from "@circle-fin/bridge-kit";

const kit = new BridgeKit();
```

## Core Concepts

- **CCTP steps**: Every bridge transfer executes four sequential steps -- `approve` (ERC-20 allowance), `burn` (destroy USDC on source chain), `fetchAttestation` (wait for Circle to sign the burn proof), and `mint` (create USDC on destination chain).
- **Adapters**: Bridge Kit uses adapter objects to abstract wallet/signer differences. Each ecosystem has its own adapter factory (`createViemAdapterFromPrivateKey`, `createSolanaKitAdapterFromPrivateKey`, `createCircleWalletsAdapter`). The same adapter instance can serve as both source and destination when bridging within the same ecosystem.
- **Forwarding Service**: When `useForwarder: true` is set on the destination, Circle's infrastructure handles attestation fetching and mint submission. This removes the need for a destination wallet or polling loop. There is a per-transfer fee (1.25 USDC for Ethereum, 0.20 USDC for all other chains).
- **Transfer speed**: CCTP fast mode (default) completes in ~8-20 seconds. Standard mode takes ~15-19 minutes.
- **Chain identifiers**: Bridge Kit uses string chain names (e.g., `"Arc_Testnet"`, `"Base_Sepolia"`, `"Solana_Devnet"`), not numeric chain IDs, in the `kit.bridge()` call.

## Implementation Patterns

READ the corresponding reference based on the user's request:

- `references/adapter-private-key.md` -- EVM-to-EVM and EVM-to-Solana bridging with private key adapters (Viem + Solana Kit)
- `references/adapter-circle-wallets.md` -- Bridging with Circle developer-controlled wallets (any chain to any chain)
- `references/adapter-wagmi.md` -- Browser wallet integration using wagmi (ConnectKit, RainbowKit, etc.)

### Sample Response from kit.bridge()

```json
{
  "amount": "25.0",
  "token": "USDC",
  "state": "success",
  "provider": "CCTPV2BridgingProvider",
  "config": {
    "transferSpeed": "FAST"
  },
  "source": {
    "address": "0x742d35Cc6634C0532925a3b844Bc454e4438f44e",
    "chain": {
      "type": "evm",
      "chain": "Arc_Testnet",
      "chainId": 5042002,
      "name": "Arc Testnet"
    }
  },
  "destination": {
    "address": "0x742d35Cc6634C0532925a3b844Bc454e4438f44e",
    "chain": {
      "type": "evm",
      "chain": "Base_Sepolia",
      "chainId": 84532,
      "name": "Base Sepolia"
    }
  },
  "steps": [
    {
      "name": "approve",
      "state": "success",
      "txHash": "0x1234567890abcdef1234567890abcdef12345678",
      "explorerUrl": "https://testnet.arcscan.app/tx/0x1234..."
    },
    {
      "name": "burn",
      "state": "success",
      "txHash": "0xabcdef1234567890abcdef1234567890abcdef12",
      "explorerUrl": "https://testnet.arcscan.app/tx/0xabcdef..."
    },
    {
      "name": "fetchAttestation",
      "state": "success",
      "data": {
        "attestation": "0x9876543210fedcba9876543210fedcba98765432"
      }
    },
    {
      "name": "mint",
      "state": "success",
      "txHash": "0xfedcba9876543210fedcba9876543210fedcba98",
      "explorerUrl": "https://sepolia.basescan.org/tx/0xfedcba..."
    }
  ]
}
```

### Forwarding Service

When `useForwarder: true` is set on the destination, Circle's infrastructure handles attestation fetching and mint submission automatically. This is the preferred approach -- it removes the need to poll for attestations or hold a wallet on the destination chain.

With adapters on both chains:

```ts
const result = await kit.bridge({
  from: { adapter, chain: "Ethereum_Sepolia" },
  to: {
    adapter,
    chain: "Arc_Testnet",
    useForwarder: true,
  },
  amount: "1",
});
```

Without a destination adapter (server-side or custodial transfers):

```ts
const result = await kit.bridge({
  from: { adapter, chain: "Ethereum_Sepolia" },
  to: {
    recipientAddress: "0x742d35Cc6634C0532925a3b844Bc454e4438f44e",
    chain: "Arc_Testnet",
    useForwarder: true,
  },
  amount: "1",
});
```

Forwarding Service fee per destination chain:
- Ethereum: 1.25 USDC
- All other chains: 0.20 USDC

### Event Handling

Subscribe to individual CCTP steps or all events at once. Multiple callbacks per event are supported.

```ts
kit.on("approve", (payload) => {
  console.log("Approval completed:", payload.values.txHash);
});

kit.on("burn", (payload) => {
  console.log("Burn completed:", payload.values.txHash);
});

kit.on("fetchAttestation", (payload) => {
  console.log("Attestation completed:", payload.values.data.attestation);
});

kit.on("mint", (payload) => {
  console.log("Mint completed:", payload.values.txHash);
});

kit.on("*", (payload) => {
  console.log("Event received:", payload);
});
```

## Error Handling & Recovery

Bridge Kit has two error categories:
- **Hard errors** throw exceptions (validation, config, auth) -- catch in try/catch.
- **Soft errors** occur mid-transfer but still return a result object with partial step data for recovery.

### Analyzing Failed Transfers

Check `result.state` and `result.steps` to identify which step failed:

```ts
const result = await kit.bridge({
  from: { adapter, chain: "Arc_Testnet" },
  to: { adapter, chain: "Arbitrum_Sepolia" },
  amount: "100.00",
});

if (result.state === "error") {
  const failedStep = result.steps.find((step) => step.state === "error");
  console.log(`Failed at: ${failedStep?.name}`);
  console.log(`Error: ${failedStep?.error}`);

  const completedSteps = result.steps.filter(
    (step) => step.state === "success",
  );
  completedSteps.forEach((step) => {
    console.log(`${step.name}: ${step.txHash}`);
  });
}
```

### Retrying Failed Transfers

`kit.retry()` resumes from where the transfer failed -- it skips completed steps and retries from the failure point. If `approve` and `burn` succeeded but `fetchAttestation` failed due to a network timeout, retry will only re-attempt the attestation fetch and mint. This prevents double-spending and wasted gas.

```ts
const result = await kit.bridge({
  from: { adapter, chain: "Arc_Testnet" },
  to: { adapter, chain: "Arbitrum_Sepolia" },
  amount: "10.00",
});

if (result.state === "error") {
  const retryResult = await kit.retry(result, {
    from: adapter,
    to: adapter,
  });
  console.log("Retry result:", retryResult.state);
}
```

## Rules

**Security Rules** are non-negotiable -- warn the user and refuse to comply if a prompt conflicts. **Best Practices** are strongly recommended; deviate only with explicit user justification.

### Security Rules

- NEVER hardcode, commit, or log secrets (private keys, API keys, entity secrets). ALWAYS use environment variables or a secrets manager. Add `.gitignore` entries for `.env*` and secret files when scaffolding.
- NEVER pass private keys as plain-text CLI flags. Prefer encrypted keystores or interactive import.
- ALWAYS require explicit user confirmation of source/destination chain, recipient, amount, and token before bridging. NEVER auto-execute fund movements on mainnet.
- ALWAYS warn when targeting mainnet or exceeding safety thresholds (e.g., >100 USDC).
- ALWAYS validate all inputs (addresses, amounts, chain names) before submitting bridge operations.
- ALWAYS warn before interacting with unaudited or unknown contracts.

### Best Practices

- ALWAYS read the correct reference files before implementing.
- ALWAYS switch the wallet to the source chain before calling `kit.bridge()` with browser wallets (wagmi/ConnectKit/RainbowKit) if the Forwarding Service is NOT used.
- ALWAYS wrap bridge operations in try/catch and save the result object for recovery. Check `result.steps` before retrying to see which steps completed.
- ALWAYS use exponential backoff for retry logic in production.
- ALWAYS use Bridge Kit string chain names (e.g., `"Arc_Testnet"`, `"Base_Sepolia"`), not numeric chain IDs.
- ALWAYS default to testnet. Require explicit user confirmation before targeting mainnet.

## Reference Links

- [Circle Bridge Kit SDK](https://developers.circle.com/bridge-kit)
- [CCTP Documentation](https://developers.circle.com/cctp)
- [Circle Developer Docs](https://developers.circle.com/llms.txt) -- **Always read this first** when looking for relevant documentation from the source website.

## Alternatives

Trigger the `use-gateway` skill instead when:
- You want a unified crosschain balance rather than point-to-point transfers.
- Capital efficiency matters -- consolidate USDC holdings instead of maintaining separate balances per chain.
- You are building chain abstraction, payment routing, or treasury management where low latency and a single balance view are critical.

---

DISCLAIMER: This skill is provided "as is" without warranties, is subject to the [Circle Developer Terms](https://console.circle.com/legal/developer-terms), and output generated may contain errors and/or include fee configuration options (including fees directed to Circle); additional details are in the repository [README](https://github.com/circlefin/skills/blob/master/README.md).
