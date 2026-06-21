---
name: use-refund-protocol
description: "Integrate the Circle Refund Protocol to add non-custodial payment disputes, chargebacks, and escrow to any USDC application on Arc. The Refund Protocol introduces an arbiter — a trusted third party who configures per-recipient lockup periods (0–180 days) and can trigger refunds when disputes arise. Payments are held in the contract; recipients withdraw after lockup; the arbiter can force refunds or authorize EIP-712-signed early withdrawals. Use when: building merchant payment flows with chargeback protection, implementing gig-economy or freelance payouts with dispute windows, integrating AI-validated escrow where an agent acts as arbiter, or adding any USDC payment dispute layer to an Arc app. Triggers: Refund Protocol, refund, chargeback, payment dispute, escrow, arbiter, lockup, earlyWithdraw, refundByArbiter, refundByRecipient, updateRefundTo, dispute resolution, payment protection, lockup period, non-custodial escrow, Arc payments, Circle escrow."
---

## Overview

The Circle Refund Protocol is a non-custodial escrow contract for USDC payments on Arc. Instead of sending USDC directly to a recipient, a sender routes funds through `RefundProtocol`, which holds them under a configurable lockup window. An arbiter — a trusted address set at deployment — can mediate disputes, configure per-recipient lockup periods, and trigger refunds. Recipients withdraw only after their lockup expires.

The protocol has three refund paths: voluntary (recipient initiates), forced (arbiter overrides), and early release (arbiter authorizes, recipient signs EIP-712). A debt-settlement mechanism ensures the arbiter is made whole when it covers an insolvent recipient's refund.

> **This is a contract-level integration.** There is no SDK. You interact directly with a deployed `RefundProtocol` instance via `writeContract` / `readContract` (viem/wagmi) or `cast send` / `cast call` (Foundry).

## Prerequisites / Setup

### Deploy a RefundProtocol Instance

`RefundProtocol` is not a singleton — each application deploys its own instance.

```solidity
constructor(
    address _arbiter,      // address with arbiter privileges
    address _usdc,         // USDC token: 0x3600000000000000000000000000000000000000 on Arc Testnet
    string memory eip712Name,     // e.g. "MyApp Refund Protocol"
    string memory eip712version   // e.g. "1"
)
```

```bash
# Deploy with Foundry (local testing only — use a keystore or secrets manager in production)
forge create src/RefundProtocol.sol:RefundProtocol \
  --rpc-url $ARC_TESTNET_RPC_URL \
  --private-key $PRIVATE_KEY \
  --constructor-args \
    $ARBITER_ADDRESS \
    0x3600000000000000000000000000000000000000 \
    "MyApp Refund Protocol" \
    "1"
```

Source: [circlefin/refund-protocol](https://github.com/circlefin/refund-protocol)

### Environment Variables

```bash
ARC_TESTNET_RPC_URL=https://rpc.testnet.arc.network
REFUND_PROTOCOL_ADDRESS=   # your deployed contract address
ARBITER_PRIVATE_KEY=       # arbiter key — never commit, use a secrets manager
USDC_ADDRESS=0x3600000000000000000000000000000000000000
```

### Install Dependencies

```bash
npm install viem wagmi
```

## Quick Reference

### Arc Testnet

| Field | Value |
|---|---|
| Chain ID | `5042002` |
| RPC | `https://rpc.testnet.arc.network` |
| Explorer | https://testnet.arcscan.app |
| USDC (ERC-20, 6 decimals) | `0x3600000000000000000000000000000000000000` |
| Faucet | https://faucet.circle.com |

### Contract Constants

| Constant | Value | Notes |
|---|---|---|
| `MAX_LOCKUP_SECONDS` | `15,552,000` | 180 days |
| USDC decimals | `6` | Always use `parseUnits(amount, 6)` |
| Default lockup | `0` | No lockup until arbiter sets one |

### Key Functions at a Glance

| Function | Caller | Phase |
|---|---|---|
| `setLockupSeconds(recipient, secs)` | arbiter | Setup |
| `depositArbiterFunds(amount)` | arbiter | Setup |
| `pay(to, amount, refundTo)` | payer | Payment |
| `withdraw(paymentIDs[])` | recipient | Settlement |
| `refundByRecipient(paymentID)` | recipient | Dispute |
| `refundByArbiter(paymentID)` | arbiter | Dispute |
| `earlyWithdrawByArbiter(...)` | arbiter | Early release ⚠️ |
| `updateRefundTo(paymentID, new)` | current refundTo | Maintenance |
| `settleDebt(recipient)` | anyone | Maintenance |

## Core Concepts

- **Arbiter**: A trusted address (EOA, multisig, or smart contract) set at deployment. Controls lockup configuration, dispute resolution, and early withdrawals. The arbiter cannot change after deployment.
- **Lockup period**: Per-recipient delay (0–180 days) before the recipient can `withdraw()`. Default is 0 (immediate). Set by arbiter via `setLockupSeconds`.
- **Payment ID (`nonce`)**: An auto-incrementing `uint256` assigned to each `pay()` call. Used to reference specific payments in all subsequent operations.
- **`balances` mapping**: Tracks both recipient balances (from incoming payments) and the arbiter's dispute reserve (from `depositArbiterFunds`). A recipient can only `withdraw()` amounts within their balance.
- **`debts` mapping**: When arbiter covers a refund for an insolvent recipient, the shortfall is recorded here. Auto-settled on the recipient's next `withdraw()`.
- **`refundTo` address**: The address that receives funds if a refund is triggered. Set by the payer at `pay()` time. Can be updated by the current `refundTo` address via `updateRefundTo`.
- **EIP-712 domain**: Set at deployment via `eip712Name` and `eip712version`. Required for early withdrawal signatures.

## Implementation Patterns

### 1. Arbiter Setup

Before accepting payments, the arbiter configures lockup and funds the dispute reserve.

```typescript
import { createPublicClient, createWalletClient, http, parseUnits } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { arcTestnet } from 'viem/chains'

const arbiterAccount = privateKeyToAccount(process.env.ARBITER_PRIVATE_KEY as `0x${string}`)
const walletClient = createWalletClient({ account: arbiterAccount, chain: arcTestnet, transport: http() })

// Set a 7-day lockup for a merchant
await walletClient.writeContract({
  address: process.env.REFUND_PROTOCOL_ADDRESS as `0x${string}`,
  abi: REFUND_PROTOCOL_ABI,
  functionName: 'setLockupSeconds',
  args: [merchantAddress, BigInt(7 * 24 * 60 * 60)], // 604800 seconds
})

// Approve and fund the dispute reserve (50 USDC)
await walletClient.writeContract({
  address: USDC_ADDRESS,
  abi: ERC20_ABI,
  functionName: 'approve',
  args: [process.env.REFUND_PROTOCOL_ADDRESS as `0x${string}`, parseUnits('50', 6)],
})
await walletClient.writeContract({
  address: process.env.REFUND_PROTOCOL_ADDRESS as `0x${string}`,
  abi: REFUND_PROTOCOL_ABI,
  functionName: 'depositArbiterFunds',
  args: [parseUnits('50', 6)],
})
```

### 2. Making a Payment

The payer approves USDC to the contract, then calls `pay()`. The `refundTo` address receives funds if a refund is triggered.

```typescript
const REFUND_PROTOCOL = process.env.REFUND_PROTOCOL_ADDRESS as `0x${string}`
const amount = parseUnits('10', 6) // 10 USDC — always 6 decimals

// Step 1: Approve
await walletClient.writeContract({
  address: USDC_ADDRESS,
  abi: ERC20_ABI,
  functionName: 'approve',
  args: [REFUND_PROTOCOL, amount],
})

// Step 2: Pay
const payTx = await walletClient.writeContract({
  address: REFUND_PROTOCOL,
  abi: REFUND_PROTOCOL_ABI,
  functionName: 'pay',
  args: [
    recipientAddress,  // to: merchant or service provider
    amount,            // amount: USDC (6 decimals)
    refundToAddress,   // refundTo: payer's address or escrow vault — MUST NOT be zero
  ],
})

// The PaymentCreated event includes the paymentID (nonce)
const receipt = await publicClient.waitForTransactionReceipt({ hash: payTx })
// Parse PaymentCreated log to get paymentID
```

**Solidity signature:**
```solidity
function pay(address to, uint256 amount, address refundTo) external
// emits: PaymentCreated(paymentID, to, amount, releaseTimestamp, refundTo)
```

### 3. Recipient Withdraws After Lockup

After `releaseTimestamp` passes, the recipient withdraws one or more payments.

```typescript
const publicClient = createPublicClient({ chain: arcTestnet, transport: http() })

// Check a payment's status before attempting withdrawal
const payment = await publicClient.readContract({
  address: REFUND_PROTOCOL,
  abi: REFUND_PROTOCOL_ABI,
  functionName: 'payments',
  args: [paymentId],
}) // returns: { to, amount, releaseTimestamp, refundTo, withdrawnAmount, refunded }

const now = BigInt(Math.floor(Date.now() / 1000))
if (now < payment.releaseTimestamp) {
  throw new Error(`Payment locked until ${new Date(Number(payment.releaseTimestamp) * 1000)}`)
}

await walletClient.writeContract({
  address: REFUND_PROTOCOL,
  abi: REFUND_PROTOCOL_ABI,
  functionName: 'withdraw',
  args: [[paymentId]], // array — batch multiple IDs in one tx
})
```

**Solidity signature:**
```solidity
function withdraw(uint256[] calldata paymentIDs) external
// emits: Withdrawal(to, amount)
// auto-calls _settleDebt() first — any arbiter-covered debt is repaid before payout
```

### 4. Refund Path A — Voluntary (Recipient Initiates)

The recipient proactively returns funds, for example when a buyer reports an issue.

```typescript
await walletClient.writeContract({  // caller must be payment.to
  address: REFUND_PROTOCOL,
  abi: REFUND_PROTOCOL_ABI,
  functionName: 'refundByRecipient',
  args: [paymentId],
})
// emits: Refund(paymentID, refundTo, amount)
// funds go to payment.refundTo immediately, no lockup
```

### 5. Refund Path B — Forced (Arbiter Overrides)

The arbiter forces a refund regardless of the recipient's consent. If the recipient's balance is insufficient, the arbiter covers the shortfall and records it as a debt.

```typescript
await walletClient.writeContract({  // arbiterAccount must sign
  address: REFUND_PROTOCOL,
  abi: REFUND_PROTOCOL_ABI,
  functionName: 'refundByArbiter',
  args: [paymentId],
})
// If recipient balance < payment.amount:
//   arbiter.balances -= payment.amount
//   debts[recipient] += payment.amount
//   → recipient repays debt on next withdraw()
```

### 6. Refund Path C — Early Release (EIP-712 Signed)

> ⚠️ **Known Security Issue — read before using**
>
> The `earlyWithdrawByArbiter` function has a **known vulnerability** that may allow the arbiter to drain funds belonging to other payments. Circle has acknowledged this in the repository README: *"We have discovered an issue resulting from the early withdrawal function that allows an arbiter to drain other user's payments. A fix is in development."*
>
> **Do not use `earlyWithdrawByArbiter` in production until Circle publishes a security advisory confirming the fix.** Check the [circlefin/refund-protocol](https://github.com/circlefin/refund-protocol) repository for an updated README or a new contract version before enabling this path.

For reference, the flow when safe to use:

1. Arbiter constructs the withdrawal struct and signs it.
2. Recipient signs the same struct hash (EIP-712) to consent to early release and any fee.
3. Arbiter submits `earlyWithdrawByArbiter` with both signatures.

```typescript
// EIP-712 typehash (from contract):
// EarlyWithdrawalByArbiter(
//   uint256[] paymentIDs,
//   uint256[] withdrawalAmounts,
//   uint256 feeAmount,
//   uint256 expiry,
//   uint256 salt
// )

// Recipient signs the withdrawal hash
const withdrawalHash = await publicClient.readContract({
  address: REFUND_PROTOCOL,
  abi: REFUND_PROTOCOL_ABI,
  functionName: 'hashEarlyWithdrawalInfo',
  args: [paymentIds, withdrawalAmounts, feeAmount, expiry, salt],
})

const recipientSignature = await recipientWalletClient.signMessage({
  message: { raw: withdrawalHash },
})
// Then arbiter calls earlyWithdrawByArbiter(..., v, r, s)
// guard: withdrawalHashes[hash] prevents replay
```

**Solidity signature:**
```solidity
function earlyWithdrawByArbiter(
    uint256[] calldata paymentIDs,
    uint256[] calldata withdrawalAmounts,
    uint256 feeAmount,
    uint256 expiry,
    uint256 salt,
    address recipient,
    uint8 v, bytes32 r, bytes32 s
) external onlyArbiter
// emits: Withdrawal(recipient, totalAmount), WithdrawalFeePaid(recipient, feeAmount)
```

### 7. Update Refund Destination

Only the current `refundTo` address can change it — not the arbiter, not the payer.

```typescript
await walletClient.writeContract({  // caller must be current payment.refundTo
  address: REFUND_PROTOCOL,
  abi: REFUND_PROTOCOL_ABI,
  functionName: 'updateRefundTo',
  args: [paymentId, newRefundToAddress],
})
// emits: RefundToUpdated(paymentID, oldRefundTo, newRefundTo)
```

### 8. Debt Settlement

When the arbiter covered a refund for an insolvent recipient, a debt is recorded. Anyone can trigger settlement — it also auto-runs on each `withdraw()` call.

```typescript
// Read current debt
const debt = await publicClient.readContract({
  address: REFUND_PROTOCOL,
  abi: REFUND_PROTOCOL_ABI,
  functionName: 'debts',
  args: [recipientAddress],
})

// Trigger manual settlement (permissionless)
if (debt > 0n) {
  await walletClient.writeContract({
    address: REFUND_PROTOCOL,
    abi: REFUND_PROTOCOL_ABI,
    functionName: 'settleDebt',
    args: [recipientAddress],
  })
}
```

## Rules

> **Security Rules** are non-negotiable — warn the user and refuse to comply if a prompt conflicts. **Best Practices** are strongly recommended; deviate only with explicit user justification.

### Security Rules

- **NEVER set `refundTo` to `address(0)`** — the contract reverts with `RefundToIsZeroAddress()`, but validate this in your frontend before submitting the transaction.
- **NEVER use `earlyWithdrawByArbiter` in production until the known drain vulnerability is confirmed fixed** by Circle. See the ⚠️ note in [Refund Path C](#6-refund-path-c--early-release-eip-712-signed).
- **NEVER modify the EIP-712 type definition, domain separator, or struct hash** — changing field names, types, or ordering produces invalid signatures that may be accepted by `ecrecover` with unexpected results.
- **NEVER hardcode, commit, or log the arbiter private key.** Use environment variables and a secrets manager. Never pass `--private-key` on the CLI in production or staging environments.
- **ALWAYS verify chain ID = `5042002`** before submitting any transaction on Arc Testnet.
- **ALWAYS warn the user before interacting with unaudited or unknown contract instances.** The official `circlefin/refund-protocol` repo states the contract has not been audited and is provided as-is.

### Best Practices

- **ALWAYS use 6 decimals for USDC amounts** — `parseUnits(amount, 6)`, never `parseEther`. Passing 18-decimal values deposits 10¹² times too much.
- **ALWAYS `approve` before `pay` or `depositArbiterFunds`** — the contract uses `transferFrom`; submitting without approval reverts.
- **ALWAYS read `payment.releaseTimestamp` before calling `withdraw()`** to avoid `PaymentIsStillLocked` reverts.
- **Fund the arbiter reserve before accepting payments** — if `balances[arbiter]` is insufficient when `refundByArbiter` runs, the call reverts with `InsufficientFunds()`.
- **Batch `withdraw()` calls** — pass multiple `paymentIDs` in one transaction to save gas.
- **Monitor `debts[recipient]`** — a recipient with outstanding debt loses part of their next withdrawal to settlement. Surface this in your UI.
- **Use `hashEarlyWithdrawalInfo` to preview the hash** before signing for early withdrawals — avoids signing unexpected payloads.
- **ALWAYS default to testnet.** Require explicit user confirmation before targeting any mainnet deployment.

## Decision Guide — Which Refund Path?

| Scenario | Recommended Path | Notes |
|---|---|---|
| Buyer and seller agree on refund | `refundByRecipient` | Cheapest; recipient initiates |
| Buyer disputes, seller refuses | `refundByArbiter` | Arbiter overrides; may create debt |
| Seller wants to release funds early (with consent) | `earlyWithdrawByArbiter` ⚠️ | **Only when vulnerability is patched** |
| Lockup expired, no dispute | `withdraw()` | Normal settlement; no arbiter involvement |
| Refund destination changed (e.g. new wallet) | `updateRefundTo` | Only current refundTo can call |

## Antipatterns

**AP1 — Zero `refundTo` address**
```typescript
// ❌ WRONG — reverts with RefundToIsZeroAddress()
await walletClient.writeContract({
  functionName: 'pay',
  args: [recipient, amount, '0x0000000000000000000000000000000000000000'],
})

// ✅ CORRECT — validate before submission
if (!refundTo || refundTo === zeroAddress) throw new Error('refundTo is required')
await walletClient.writeContract({ functionName: 'pay', args: [recipient, amount, refundTo] })
```

**AP2 — Missing USDC approve before pay()**
```typescript
// ❌ WRONG — reverts silently in transferFrom
await walletClient.writeContract({ functionName: 'pay', args: [to, amount, refundTo] })

// ✅ CORRECT — approve first, then pay
await walletClient.writeContract({ functionName: 'approve', args: [REFUND_PROTOCOL, amount] })
await walletClient.writeContract({ functionName: 'pay', args: [to, amount, refundTo] })
```

**AP3 — Insufficient arbiter reserve**
```typescript
// ❌ WRONG — refundByArbiter reverts if arbiter balance < payment.amount
// and recipient balance is also insufficient

// ✅ CORRECT — maintain a buffer; check before dispute resolution
const arbiterBalance = await publicClient.readContract({
  functionName: 'balances', args: [arbiterAddress],
})
if (arbiterBalance < payment.amount) {
  // top up first
  await walletClient.writeContract({ functionName: 'depositArbiterFunds', args: [topUpAmount] })
}
await walletClient.writeContract({ functionName: 'refundByArbiter', args: [paymentId] })
```

**AP4 — Signature replay in early withdrawal**
```typescript
// ❌ WRONG — reusing a previously submitted withdrawal hash
// The contract tracks withdrawalHashes[hash] and reverts with WithdrawalHashAlreadyUsed()

// ✅ CORRECT — always use a fresh salt for each earlyWithdrawByArbiter call
const salt = BigInt(Date.now()) // unique per call
```

**AP5 — Wrong USDC decimal precision**
```typescript
// ❌ WRONG — 18-decimal value deposits 10^12× too much
const amount = parseEther('10') // 10_000_000_000_000_000_000

// ✅ CORRECT — always 6 decimals for ERC-20 USDC on Arc
const amount = parseUnits('10', 6) // 10_000_000
```

**AP6 — Missing state check before withdraw**
```typescript
// ❌ WRONG — reverts with PaymentIsStillLocked or PaymentRefunded
await walletClient.writeContract({ functionName: 'withdraw', args: [[paymentId]] })

// ✅ CORRECT — guard with on-chain state
const payment = await publicClient.readContract({ functionName: 'payments', args: [paymentId] })
const now = BigInt(Math.floor(Date.now() / 1000))
if (payment.refunded) throw new Error('Payment already refunded')
if (now < payment.releaseTimestamp) throw new Error('Lockup not expired')
await walletClient.writeContract({ functionName: 'withdraw', args: [[paymentId]] })
```

**AP7 — Using `earlyWithdrawByArbiter` without checking the known drain vulnerability**
```typescript
// ❌ WRONG — deploying earlyWithdrawByArbiter in production before the fix
// The vulnerability allows an arbiter to drain payments belonging to other recipients.
// Confirmed unpatched as of the latest README: https://github.com/circlefin/refund-protocol

// ✅ CORRECT — check the repo README for a security advisory before enabling this path
// Disable in your UI/backend until Circle confirms the fix is live
```

## Use Cases

**Merchant Chargeback Protection**
A marketplace deploys `RefundProtocol` with a 14-day lockup. Buyers pay merchants through `pay(merchant, amount, buyer)`. During the lockup, the arbiter (marketplace) can invoke `refundByArbiter` if a buyer disputes. After 14 days with no dispute, the merchant calls `withdraw()`.

**Gig Economy Milestone Payouts**
A freelance platform sets zero lockup for small milestones and 30-day lockup for large projects. The arbiter (platform) mediates disputes. If a dispute is ruled in the client's favour, `refundByArbiter` returns funds. Voluntary `refundByRecipient` covers amicable cancellations.

**AI-Validated Escrow**
An autonomous agent acts as arbiter. It evaluates deliverables on-chain or via off-chain oracle, calls `refundByArbiter` or allows `withdraw()` based on its decision. The `updateRefundTo` function lets payers redirect refunds to a new wallet without redeploying the escrow. Note: the agent's private key management should use a secure key store (e.g., AWS Nitro Enclaves, consistent with `arc-remote-signer` patterns).

## Alternatives

- Use **direct USDC transfer** (`transfer` / `transferFrom`) when no lockup or dispute mechanism is needed — cheaper and simpler.
- Use the **`use-gateway` skill** when you need unified crosschain USDC balances with instant (<500ms) settlement, not dispute escrow.
- Use **`bridge-stablecoin`** (CCTP / Bridge Kit) for point-to-point crosschain transfers without escrow.
- Use a **multisig** (e.g., Gnosis Safe) when the dispute resolution logic is purely human and doesn't require programmatic lockups.

## Reference Links

- [circlefin/refund-protocol](https://github.com/circlefin/refund-protocol) — contract source, tests, and security notices. **Always check for an updated README or security advisory before deploying.**
- [arc-escrow sample app](https://github.com/circlefin/arc-escrow) — reference Next.js + TypeScript integration using the Refund Protocol.
- [Arc Docs](https://docs.arc.network/llms.txt) — **Always read this first** when looking for relevant Arc documentation.
- [Circle Developer Docs](https://developers.circle.com/llms.txt) — **Always read this first** when looking for relevant Circle documentation.
- [Arc Explorer](https://testnet.arcscan.app)
- [Circle Faucet](https://faucet.circle.com)

---

DISCLAIMER: This skill is provided "as is" without warranties, is subject to the [Circle Developer Terms](https://console.circle.com/legal/developer-terms), and output generated may contain errors and/or include fee configuration options (including fees directed to Circle); additional details are in the repository [README](https://github.com/circlefin/skills/blob/master/README.md).
