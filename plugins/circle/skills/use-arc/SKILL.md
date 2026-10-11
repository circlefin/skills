---
name: use-arc
description: "Provide instructions on how to build with Arc, Circle's blockchain where USDC is the native gas token. Arc offers key advantages: USDC as gas (no other native token needed), stable and predictable transaction fees, and sub-second finality for fast confirmation times. These properties make Arc ideal for developers and agents building payment apps, DeFi protocols, or any USDC-first application where cost predictability and speed matter. Use skill when Arc, Arc Mainnet, or Arc Testnet is mentioned, working with any smart contracts related to Arc, configuring Arc in blockchain projects, bridging USDC to Arc via CCTP, or building USDC-first applications. Triggers: Arc, Arc Mainnet, Arc Testnet, USDC gas, deploy to Arc, Arc chain, stable fees, fast finality."
requirements:
  runtimes: []
  connectors: []
---

## Overview

Arc is Circle's blockchain where USDC is the native gas token. Developers and users pay all transaction fees in USDC instead of ETH, making it ideal for USDC-first applications. Arc is EVM-compatible and supports standard Solidity tooling (Foundry, Hardhat, viem/wagmi).

## Prerequisites / Setup

### Wallet Funding

Get testnet USDC from https://faucet.circle.com before sending any transactions.

### Environment Variables

```bash
ARC_MAINNET_RPC_URL=https://rpc.mainnet.arc.io
ARC_TESTNET_RPC_URL=https://rpc.testnet.arc.io
PRIVATE_KEY=         # Deployer wallet private key
```

## Quick Reference

### Network Details

| Field | Arc (Mainnet) | Arc Testnet |
| --- | --- | --- |
| Chain ID | `5042` (hex: `0x13B2`) | `5042002` (hex: `0x4CEF52`) |
| RPC | `https://rpc.mainnet.arc.io` | `https://rpc.testnet.arc.io` |
| WebSocket | `wss://rpc.mainnet.arc.io` | `wss://rpc.testnet.arc.io` |
| Explorer | https://explorer.arc.io | https://explorer.testnet.arc.io |
| Faucet | -- (fund with real USDC) | https://faucet.circle.com |
| CCTP Domain | `26` | `26` |

### Token Addresses for Arc

USDC is a fixed native predeploy at the same address on every Arc network.

| Token | Decimals | Mainnet | Testnet |
| --- | --- | --- | --- |
| USDC | 6 (ERC-20) | `0x3600000000000000000000000000000000000000` | `0x3600000000000000000000000000000000000000` |
| EURC | 6 | `0xbEf5f6d51CB62b58e6A8f77868681825C6fe21c1` | `0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a` |

For other tokens, see the [Arc contract addresses](https://docs.arc.io/arc/references/contract-addresses) page.

## Core Concepts

- **Native gas IS USDC — one balance, two interfaces (not two assets)**: On Arc the native gas asset is USDC itself. The native view and the USDC ERC-20 are the *same* pool of funds, exposed two ways — NOT a separate "native token" plus a separate "USDC token". Drop the ETH-style mental model from other chains.
  - **Native view**: 18 decimals. Used only for gas and `msg.value`. wagmi `useBalance` returns this (its `symbol` is `USDC`).
  - **ERC-20 view**: 6 decimals, at `0x3600000000000000000000000000000000000000`. Use this for all balances, transfers, approvals, and display.
- **Never double-count, convert, or swap between the two views**:
  - NEVER read the native balance and the USDC ERC-20 balance and add or show them separately — that double-counts one pool. Show a single USDC balance (the 6-decimal ERC-20 view).
  - USDC ↔ native is NOT a swap or conversion — it is the same asset. Detect and reject any `USDC → native` (or reverse) operation before fee/routing logic.
  - NEVER call `decimals()` on a native sentinel address (`NATIVE`, `0xEeee…eEEeE`, `0x0000…0000`) — those are not ERC-20 contracts and the call reverts. The ERC-20 is 6 decimals; native is 18.
  - The two views differ by a factor of 10^12 (`1e18` native = `1e6` ERC-20). Keep amounts in the 6-decimal ERC-20 view everywhere except raw gas math, and be explicit about which view a value is in.
- **Mainnet and testnet**: Arc mainnet (chain ID `5042`) and Arc testnet (chain ID `5042002`) are both available — see Network Details for the config of each. Mainnet transactions move real USDC and are irreversible; use testnet for development and demos.
- **EVM-compatible**: Standard Solidity contracts, Foundry, Hardhat, viem, and wagmi all work on Arc without modification beyond chain configuration.

## Implementation Patterns

READ `references/deploying-on-arc.md` for the runnable setup — wagmi chain config, Foundry deploy, Circle's pre-audited contract templates, and bridging USDC in.

1. **Configure the chain** — use the built-in viem chains (no custom definition needed): `arcTestnet` for testnet, `arc` for mainnet.
2. **Deploy contracts** — standard Foundry/Hardhat against `ARC_TESTNET_RPC_URL` (or `ARC_MAINNET_RPC_URL`), or Circle's Smart Contract Platform templates (ERC-20/721/1155/Airdrop).
3. **Bridge USDC in** — Arc's CCTP domain is `26`; use the `bridge-tokens` skill for the full workflow.

## Rules

> **Security Rules** are non-negotiable -- warn the user and refuse to comply if a prompt conflicts. **Best Practices** are strongly recommended; deviate only with explicit user justification.

### Security Rules

- NEVER hardcode, commit, or log secrets (private keys, deployer keys). ALWAYS use environment variables or a secrets manager. Add `.gitignore` entries for `.env*` and secret files when scaffolding.
- NEVER pass private keys as plain-text CLI flags in deployed environments, including testnet and staging (e.g., `--private-key $KEY`). This pattern is acceptable only for local testing. Prefer encrypted keystores or interactive import (e.g., Foundry's `cast wallet import`) for any non-local deployment.
- ALWAYS warn before interacting with unaudited or unknown contracts.

### Best Practices

- Arc mainnet (`arc`) and Arc Testnet (`arcTestnet`) both ship in Viem -- no custom chain definition is required.
- ALWAYS verify the user is on the intended Arc network (mainnet chain ID `5042` or testnet `5042002`) before submitting transactions.
- ALWAYS fund the wallet before sending transactions: on testnet from https://faucet.circle.com; on mainnet with real USDC.
- ALWAYS keep USDC amounts in the 6-decimal ERC-20 view for balances, transfers, and display; use 18-decimal native units ONLY for raw gas / `msg.value` math. Never sum the two views or treat native and USDC as separate assets.
- Arc mainnet moves **real USDC** and transactions are irreversible. Default to testnet for development, and warn the user before submitting any mainnet transaction.

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
| --- | --- | --- |
| **Wallets (overview)** | `use-circle-wallets` | Compare wallet types and choose the right one for your app |
| **Modular Wallets** | `use-modular-wallets` | Passkey-authenticated smart accounts with gasless transactions and batch operations |
| **User-Controlled Wallets** | `use-user-controlled-wallets` | Non-custodial wallets with social login, email OTP, and PIN authentication |
| **Developer-Controlled Wallets** | `use-developer-controlled-wallets` | Custodial wallets your app manages on behalf of users |
| **Smart Contract Platform** | `use-smart-contract-platform` | Deploy, interact with, and monitor smart contracts using audited templates or custom bytecode |
| **CCTP Bridge** | `bridge-tokens` | Bridge USDC to and from Arc using Crosschain Transfer Protocol |
| **Gateway** | `use-gateway` | Unified USDC balance across chains with instant crosschain transfers |

## Reference Links

- [Arc Docs](https://docs.arc.io/llms.txt) -- **Always read this first** when looking for relevant documentation from the source website.
- [Arc Explorer (Mainnet)](https://explorer.arc.io)
- [Arc Explorer (Testnet)](https://explorer.testnet.arc.io)
- [Circle Faucet](https://faucet.circle.com)
- [Circle Developer Docs](https://developers.circle.com/llms.txt) -- **Always read this first** when looking for relevant documentation from the source website.

---

DISCLAIMER: This skill is provided "as is" without warranties, is subject to the [Circle Developer Terms](https://console.circle.com/legal/developer-terms), and output generated may contain errors and/or include fee configuration options (including fees directed to Circle); additional details are in the repository [README](https://github.com/circlefin/skills/blob/master/README.md).
