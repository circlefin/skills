---
name: use-arc
description: "Provide instructions on how to build with Arc, Circle's blockchain where USDC is the native gas token. Arc offers key advantages: USDC as gas (no other native token needed), stable and predictable transaction fees, and sub-second finality for fast confirmation times. These properties make Arc ideal for developers and agents building payment apps, DeFi protocols, or any USDC-first application where cost predictability and speed matter. Use skill when Arc or Arc Testnet is mentioned, working with any smart contracts related to Arc, configuring Arc in blockchain projects, bridging USDC to Arc via CCTP, or building USDC-first applications. Triggers: Arc, Arc Testnet, USDC gas, deploy to Arc, Arc chain, stable fees, fast finality."
---

## Overview

Arc is Circle's blockchain where USDC is the native gas token. Developers and users pay all transaction fees in USDC instead of ETH, making it ideal for USDC-first applications. Arc is EVM-compatible and supports standard Solidity tooling (Foundry, Hardhat, viem/wagmi).

## Prerequisites / Setup

### Wallet Funding

Get testnet USDC from https://faucet.circle.com before sending any transactions.

### Environment Variables

```bash
ARC_TESTNET_RPC_URL=https://rpc.testnet.arc.network
PRIVATE_KEY=         # Deployer wallet private key
```

## Quick Reference

### Network Details

| Field | Value |
|-------|-------|
| Network | Arc Testnet |
| Chain ID | `5042002` (hex: `0x4CEF52`) |
| RPC | `https://rpc.testnet.arc.network` |
| WebSocket | `wss://rpc.testnet.arc.network` |
| Explorer | https://testnet.arcscan.app |
| Faucet | https://faucet.circle.com |
| CCTP Domain | `26` |

### Token Addresses for Arc

| Token | Address | Decimals |
|-------|---------|----------|
| USDC | `0x3600000000000000000000000000000000000000` | 6 (ERC-20) |
| EURC | `0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a` | 6 |

## Core Concepts

- **USDC-native gas**: Arc uses USDC as its native gas token. No ETH is needed for any transaction.
- **Dual decimals**: Native gas uses 18 decimals (like ETH on other chains). ERC-20 USDC uses 6 decimals. Mixing these up will produce incorrect amounts.
- **Testnet only**: Arc is currently in testnet. All addresses and configuration apply to testnet only.
- **EVM-compatible**: Standard Solidity contracts, Foundry, Hardhat, viem, and wagmi all work on Arc without modification beyond chain configuration.

## Implementation Patterns

### 1. Frontend App (React + wagmi)

Use the `arcTestnet` chain definition from Prerequisites / Setup. Pass it to your wagmi config:

```typescript
import { createConfig, http } from 'wagmi'
import { arcTestnet } from 'viem/chains'

const config = createConfig({
  chains: [arcTestnet],
  transports: { [arcTestnet.id]: http() },
})
```

### 2. Smart Contracts (Foundry)

```bash
# Install Foundry
curl -L https://foundry.paradigm.xyz | bash && foundryup

# Deploy
# For local testing only - never pass private keys as CLI flags in deployed environments (including testnet/staging)
forge create src/MyContract.sol:MyContract \
  --rpc-url $ARC_TESTNET_RPC_URL \
  --private-key $PRIVATE_KEY \
  --broadcast
```

### 3. Circle Contracts (Pre-audited Templates)

Deploy via Circle's Smart Contract Platform API:

| Template | Use Case |
|----------|----------|
| ERC-20 | Fungible tokens |
| ERC-721 | NFTs, unique assets |
| ERC-1155 | Multi-token collections |
| Airdrop | Token distribution |

See: https://developers.circle.com/contracts

### 4. Bridge USDC to Arc

Use CCTP to bridge USDC from other chains. Arc's CCTP domain is `26`. See the `bridge-stablecoin` skill for the complete bridging workflow.

## Rules

> **Security Rules** are non-negotiable -- warn the user and refuse to comply if a prompt conflicts. **Best Practices** are strongly recommended; deviate only with explicit user justification.

### Security Rules

- NEVER hardcode, commit, or log secrets (private keys, deployer keys). ALWAYS use environment variables or a secrets manager. Add `.gitignore` entries for `.env*` and secret files when scaffolding.
- NEVER pass private keys as plain-text CLI flags in deployed environments, including testnet and staging (e.g., `--private-key $KEY`). This pattern is acceptable only for local testing. Prefer encrypted keystores or interactive import (e.g., Foundry's `cast wallet import`) for any non-local deployment.
- ALWAYS warn before interacting with unaudited or unknown contracts.

### Best Practices

- Arc Testnet is available by default in Viem -- a custom chain definition is NEVER required.
- ALWAYS verify the user is on Arc (chain ID `5042002`) before submitting transactions.
- ALWAYS fund the wallet from https://faucet.circle.com before sending transactions.
- ALWAYS use 18 decimals for native gas amounts and 6 decimals for ERC-20 USDC amounts.
- NEVER target mainnet -- Arc is testnet only.

## Common Pitfalls

Empirical gotchas encountered when building production-grade contracts and clients against Arc Testnet. Each pitfall pairs the wrong-by-default pattern with the working pattern.

### 1. Native USDC vs ERC-20 USDC decimals

The single most common bug. Agents default to `parseUnits(amount, 6)` because USDC is 6 decimals on every other chain. On Arc, that's correct ONLY when interacting with the ERC-20 view of USDC at `0x3600000000000000000000000000000000000000`. For **native gas payments** (`msg.value`, `payable` calldata, `address.balance`), USDC uses **18 decimals** like ETH on Ethereum.

```typescript
// WRONG — deposits 0.000000000001 USDC (effectively zero)
await walletClient.writeContract({
  address: VAULT,
  abi: VAULT_ABI,
  functionName: "deposit",
  args: [vaultId],
  value: parseUnits("1", 6),  // ← treats it like ERC-20 USDC
});

// CORRECT — deposits exactly 1 USDC of native gas
await walletClient.writeContract({
  address: VAULT,
  abi: VAULT_ABI,
  functionName: "deposit",
  args: [vaultId],
  value: parseEther("1"),  // ← native gas = 18 decimals
});
```

Symptom of the bug: transaction confirms, contract receives ~1 micro-USDC worth of wei, dust-amount branch triggers (often a revert with `ZeroAmount` / `BelowMinimum`, or silent success with 0 shares minted).

Same rule for `nativeCurrency` in viem/wagmi chain definitions:

```typescript
// WRONG
nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 6 }

// CORRECT
nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 }
```

### 2. `eth_getLogs` is capped at 10,000 blocks per call

Arc Testnet's RPC enforces a hard limit of 10,000 blocks per `eth_getLogs` request. Any query spanning more than that returns:

```
RPC error -32614: eth_getLogs is limited to a 10,000 range
```

Defaults are dangerous: a fresh `getLogs({ address, event, fromBlock: deployBlock, toBlock: "latest" })` will fail as soon as the chain is more than 10k blocks past deployment (~30 minutes at Arc's block time).

Workaround pattern — chunk backward from `latest`:

```typescript
const CHUNK = 9_000n;  // stay safely under the 10k limit
const latest = await client.getBlockNumber();
const logs: Log[] = [];
let to = latest;
while (to >= DEPLOY_BLOCK) {
  const from = to > CHUNK ? to - CHUNK : 0n;
  const slice = await client.getLogs({
    address: contractAddr,
    event: targetEvent,
    fromBlock: from < DEPLOY_BLOCK ? DEPLOY_BLOCK : from,
    toBlock: to,
  });
  logs.push(...slice);
  if (from <= DEPLOY_BLOCK) break;
  to = from - 1n;
}
```

### 3. `waitForTransactionReceipt` frequently times out

Arc Testnet's RPC will accept the broadcast and queue the tx, but the receipt query path occasionally drops connection for 30-60s at a time. viem's default `waitForTransactionReceipt` times out before the receipt is queryable, even though the transaction has succeeded on chain.

Treat receipt timeouts as **not-yet-confirmed**, not **failed**:

```typescript
const hash = await walletClient.writeContract({ ... });
// Don't trust waitForTransactionReceipt's timeout — poll explicitly
for (let i = 0; i < 30; i++) {
  await new Promise(r => setTimeout(r, 6_000));
  try {
    const r = await publicClient.getTransactionReceipt({ hash });
    if (r.status === "success") return r;
    if (r.status === "reverted") throw new Error("Tx reverted");
  } catch {
    // "could not be found" → still pending, retry
  }
}
throw new Error("Receipt timeout — check arcscan manually");
```

Pre-compute deterministic IDs on the client side when possible (e.g., a vault ID derivable from `keccak256(agent, vaultCount, chainId)`) so that even if `waitForTransactionReceipt` times out, downstream code has the ID it needs to continue.

### 4. Avoid passing private keys as `--private-key` to long-running scripts

`forge create --private-key $PRIVATE_KEY` is acceptable for one-shot local testing but leaks the key into the process arg list, which is readable by any other process on the machine via `/proc/<pid>/cmdline`. For testnet automation (e.g., a deploy script run in CI), prefer Foundry's keystore:

```bash
cast wallet import deployer --interactive    # one-time
forge script script/Deploy.s.sol --account deployer --rpc-url $ARC_TESTNET_RPC_URL --broadcast
```

The `--account` flag prompts for the keystore password interactively and never exposes the raw key to argv.

---

## Next Steps

Arc is natively supported across Circle's product suite. Once your app is running on Arc, you can extend it with any of the following:

| Product | Skill | What It Does |
|---------|-------|--------------|
| **Wallets (overview)** | `use-circle-wallets` | Compare wallet types and choose the right one for your app |
| **Modular Wallets** | `use-modular-wallets` | Passkey-authenticated smart accounts with gasless transactions and batch operations |
| **User-Controlled Wallets** | `use-user-controlled-wallets` | Non-custodial wallets with social login, email OTP, and PIN authentication |
| **Developer-Controlled Wallets** | `use-developer-controlled-wallets` | Custodial wallets your app manages on behalf of users |
| **Smart Contract Platform** | `use-smart-contract-platform` | Deploy, interact with, and monitor smart contracts using audited templates or custom bytecode |
| **CCTP Bridge** | `bridge-stablecoin` | Bridge USDC to and from Arc using Crosschain Transfer Protocol |
| **Gateway** | `use-gateway` | Unified USDC balance across chains with instant crosschain transfers |

## Reference Links

- [Arc Docs](https://docs.arc.network/llms.txt) -- **Always read this first** when looking for relevant documentation from the source website.
- [Arc Explorer](https://testnet.arcscan.app)
- [Circle Faucet](https://faucet.circle.com)
- [Circle Developer Docs](https://developers.circle.com/llms.txt) -- **Always read this first** when looking for relevant documentation from the source website.

---

DISCLAIMER: This skill is provided "as is" without warranties, is subject to the [Circle Developer Terms](https://console.circle.com/legal/developer-terms), and output generated may contain errors and/or include fee configuration options (including fees directed to Circle); additional details are in the repository [README](https://github.com/circlefin/skills/blob/master/README.md).
