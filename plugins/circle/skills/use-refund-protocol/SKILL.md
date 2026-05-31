---
name: use-refund-protocol
description: "Integrate Circle's Refund Protocol for non-custodial USDC escrow with dispute resolution on Arc. Covers pay/withdraw lifecycle with configurable lockup periods (0-180 days), three refund paths (voluntary recipient refund, arbiter-forced refund, early release via EIP-712 signature), arbiter fund management, and refund destination updates. Use when: building merchant chargeback systems, gig economy escrow, AI-validated payment holds, or any scenario requiring reversible USDC payments with third-party arbitration. Triggers on: Refund Protocol, escrow USDC, payment disputes, chargeback, arbiter, lockup period, refund-protocol contract, circlefin/refund-protocol, reversible payments, dispute resolution, merchant escrow."
---

## Overview

The Circle Refund Protocol (`circlefin/refund-protocol`) is a non-custodial escrow system for USDC payments on Arc that supports dispute resolution through a trusted arbiter. Payments are locked for a configurable period (0-180 days), during which the payer can request a refund through three paths: voluntary recipient approval, arbiter-forced refund, or early release via cryptographic signature. After the lockup expires, the recipient can withdraw funds normally.

The protocol is designed for scenarios where payments need reversibility: merchant chargebacks, gig economy milestone payouts, AI-validated service delivery, or any case where a neutral third party may need to adjudicate disputes.

**Key contracts:**
- `RefundProtocol.sol` — core escrow logic (pay, withdraw, refund paths)
- `ArbiterFund.sol` — arbiter liquidity pool for instant refunds

**Deployment:** Arc Testnet and Arc Mainnet (see Reference Links for addresses)

## Prerequisites / Setup

### Installation

```bash
npm install @circle-fin/refund-protocol
```

Or clone the reference implementation:

```bash
git clone https://github.com/circlefin/refund-protocol.git
cd refund-protocol
npm install
```

### Environment Variables

```
PRIVATE_KEY=              # Payer/recipient/arbiter wallet private key (hex, 0x-prefixed)
ARC_RPC_URL=              # Arc RPC endpoint (testnet or mainnet)
REFUND_PROTOCOL_ADDRESS=  # Deployed RefundProtocol contract address
ARBITER_FUND_ADDRESS=     # Deployed ArbiterFund contract address (if using arbiter refunds)
USDC_ADDRESS=             # USDC token contract address on Arc
```

### Contract Addresses

**Arc Testnet:**
- RefundProtocol: `0x...` (see repository README)
- ArbiterFund: `0x...` (see repository README)
- USDC: `0x036CbD53842c5426634e7929541eC2318f3dCF7e`

**Arc Mainnet:**
- Check the [refund-protocol repository](https://github.com/circlefin/refund-protocol) for latest addresses

### Setup with Viem

```ts
import { createWalletClient, createPublicClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { arcTestnet } from "viem/chains";
import { refundProtocolABI, arbiterFundABI } from "@circle-fin/refund-protocol";

const account = privateKeyToAccount(process.env.PRIVATE_KEY as `0x${string}`);

const walletClient = createWalletClient({
  account,
  chain: arcTestnet,
  transport: http(process.env.ARC_RPC_URL),
});

const publicClient = createPublicClient({
  chain: arcTestnet,
  transport: http(process.env.ARC_RPC_URL),
});
```

## Decision Guide

ALWAYS walk through these questions with the user before writing any code. Do not skip steps or assume answers.

### Use Case Validation

**Question 1 — Why does this payment need escrow?**
- Merchant chargeback window (buyer protection) → Refund Protocol with arbiter
- Milestone-based gig payment (work validation) → Refund Protocol with arbiter or AI validator
- Subscription with refund period → Refund Protocol with voluntary refund path
- Instant payment with no disputes → Skip escrow, use direct USDC transfer instead

**Question 2 — Who decides if a refund happens?**
- Recipient can voluntarily approve → Use voluntary refund path (cheapest, no arbiter needed)
- Neutral third party adjudicates → Use arbiter-forced refund path (requires ArbiterFund)
- Payer and recipient pre-agree on conditions → Use early release with EIP-712 signature
- No refunds ever → Don't use Refund Protocol, use direct transfer

**Question 3 — How long should funds be locked?**
- 0 days → Recipient can withdraw immediately, but refund window stays open until withdrawal
- 1-30 days → Standard chargeback/dispute window
- 31-180 days → Extended escrow (e.g., construction milestones, long-term contracts)
- 180+ days → Not supported by protocol, consider alternative escrow design

### Arbiter Setup

**Question 4 — Do you need an arbiter?**
- Yes, for forced refunds → Deploy or use existing ArbiterFund, ensure arbiter has sufficient USDC deposited
- No, voluntary refunds only → Skip ArbiterFund, set arbiter address to `address(0)` in pay() call
- Unsure → Start with arbiter for flexibility, can always skip arbiter refund path if not needed

## Core Concepts

- **Lockup period**: Time (in seconds) before recipient can withdraw. Refunds are possible during lockup and after (until withdrawal). Range: 0-180 days (15552000 seconds).
- **Three refund paths**:
  1. **Voluntary refund** — recipient calls `refund()`, returns USDC to `refundTo` address (gas-efficient, no arbiter needed)
  2. **Arbiter-forced refund** — arbiter calls `refundByArbiter()`, draws from ArbiterFund liquidity, arbiter recoups from recipient later
  3. **Early release** — recipient signs EIP-712 message, payer submits signature to `refundWithSignature()`, instant refund
- **Arbiter fund**: Separate contract holding arbiter's USDC liquidity. When arbiter forces a refund, funds come from this pool, and the recipient owes the arbiter (tracked as debt). Arbiter later calls `settleDebt()` to recoup from recipient's balance.
- **refundTo address**: Where refunds go (usually the payer, but can be different). Can be updated via `updateRefundTo()` before withdrawal.
- **State transitions**: Payment starts in escrow → either withdrawn by recipient (final) OR refunded to payer (final). Once withdrawn or refunded, the payment is closed and cannot be reversed.

## Implementation Patterns

### 1. Basic Pay Flow (Payer)

```ts
import { parseUnits } from "viem";

// Step 1: Approve USDC spending
const approveHash = await walletClient.writeContract({
  address: process.env.USDC_ADDRESS as `0x${string}`,
  abi: erc20ABI,
  functionName: "approve",
  args: [
    process.env.REFUND_PROTOCOL_ADDRESS as `0x${string}`,
    parseUnits("100", 6), // 100 USDC (6 decimals)
  ],
});

await publicClient.waitForTransactionReceipt({ hash: approveHash });

// Step 2: Pay into escrow
const lockupPeriod = 7 * 24 * 60 * 60; // 7 days in seconds
const arbiterAddress = process.env.ARBITER_ADDRESS as `0x${string}`; // or address(0) if no arbiter

const payHash = await walletClient.writeContract({
  address: process.env.REFUND_PROTOCOL_ADDRESS as `0x${string}`,
  abi: refundProtocolABI,
  functionName: "pay",
  args: [
    process.env.RECIPIENT_ADDRESS as `0x${string}`,
    parseUnits("100", 6),
    lockupPeriod,
    arbiterAddress,
    account.address, // refundTo address (where refunds go)
  ],
});

const receipt = await publicClient.waitForTransactionReceipt({ hash: payHash });
console.log("Payment escrowed:", receipt.transactionHash);
```

### 2. Withdraw Flow (Recipient)

Recipient can withdraw after lockup period expires:

```ts
const paymentId = 1n; // Get from Pay event logs or off-chain tracking

// Check if lockup has expired
const payment = await publicClient.readContract({
  address: process.env.REFUND_PROTOCOL_ADDRESS as `0x${string}`,
  abi: refundProtocolABI,
  functionName: "payments",
  args: [paymentId],
});

const currentTime = Math.floor(Date.now() / 1000);
const canWithdraw = currentTime >= payment.timestamp + payment.lockupPeriod;

if (!canWithdraw) {
  console.log("Lockup period not expired yet");
  return;
}

// Withdraw
const withdrawHash = await walletClient.writeContract({
  address: process.env.REFUND_PROTOCOL_ADDRESS as `0x${string}`,
  abi: refundProtocolABI,
  functionName: "withdraw",
  args: [paymentId],
});

await publicClient.waitForTransactionReceipt({ hash: withdrawHash });
console.log("Funds withdrawn");
```

### 3. Voluntary Refund (Recipient Approves)

Recipient voluntarily returns funds to payer:

```ts
const paymentId = 1n;

const refundHash = await walletClient.writeContract({
  address: process.env.REFUND_PROTOCOL_ADDRESS as `0x${string}`,
  abi: refundProtocolABI,
  functionName: "refund",
  args: [paymentId],
});

await publicClient.waitForTransactionReceipt({ hash: refundHash });
console.log("Refund processed voluntarily");
```

### 4. Arbiter-Forced Refund

Arbiter forces refund using their liquidity pool:

```ts
// Arbiter must first deposit USDC into ArbiterFund (one-time setup)
// Then call refundByArbiter when dispute is resolved in payer's favor

const paymentId = 1n;

const arbiterRefundHash = await walletClient.writeContract({
  address: process.env.REFUND_PROTOCOL_ADDRESS as `0x${string}`,
  abi: refundProtocolABI,
  functionName: "refundByArbiter",
  args: [paymentId],
});

await publicClient.waitForTransactionReceipt({ hash: arbiterRefundHash });
console.log("Arbiter forced refund");

// Arbiter now has debt claim against recipient
// Later, arbiter calls settleDebt() to recoup from recipient's balance
```

### 5. Early Release via Signature (EIP-712)

Recipient signs off-chain, payer submits signature for instant refund:

```ts
import { signTypedData } from "viem/accounts";

// Recipient signs (off-chain)
const domain = {
  name: "RefundProtocol",
  version: "1",
  chainId: arcTestnet.id,
  verifyingContract: process.env.REFUND_PROTOCOL_ADDRESS as `0x${string}`,
};

const types = {
  Refund: [
    { name: "paymentId", type: "uint256" },
    { name: "recipient", type: "address" },
  ],
};

const paymentId = 1n;
const recipientAddress = process.env.RECIPIENT_ADDRESS as `0x${string}`;

const signature = await signTypedData({
  account,
  domain,
  types,
  primaryType: "Refund",
  message: {
    paymentId,
    recipient: recipientAddress,
  },
});

// Payer submits signature (on-chain)
const refundWithSigHash = await walletClient.writeContract({
  address: process.env.REFUND_PROTOCOL_ADDRESS as `0x${string}`,
  abi: refundProtocolABI,
  functionName: "refundWithSignature",
  args: [paymentId, signature],
});

await publicClient.waitForTransactionReceipt({ hash: refundWithSigHash });
console.log("Early release refund processed");
```

### 6. Update Refund Destination

Change where refunds go (before withdrawal):

```ts
const paymentId = 1n;
const newRefundAddress = "0x..." as `0x${string}`;

const updateHash = await walletClient.writeContract({
  address: process.env.REFUND_PROTOCOL_ADDRESS as `0x${string}`,
  abi: refundProtocolABI,
  functionName: "updateRefundTo",
  args: [paymentId, newRefundAddress],
});

await publicClient.waitForTransactionReceipt({ hash: updateHash });
console.log("Refund destination updated");
```

### 7. Arbiter Fund Management

Arbiter deposits liquidity and settles debts:

```ts
// Deposit USDC into arbiter fund (one-time or top-up)
const depositAmount = parseUnits("10000", 6); // 10k USDC

const approveHash = await walletClient.writeContract({
  address: process.env.USDC_ADDRESS as `0x${string}`,
  abi: erc20ABI,
  functionName: "approve",
  args: [process.env.ARBITER_FUND_ADDRESS as `0x${string}`, depositAmount],
});

await publicClient.waitForTransactionReceipt({ hash: approveHash });

const depositHash = await walletClient.writeContract({
  address: process.env.ARBITER_FUND_ADDRESS as `0x${string}`,
  abi: arbiterFundABI,
  functionName: "deposit",
  args: [depositAmount],
});

await publicClient.waitForTransactionReceipt({ hash: depositHash });

// Settle debt after forced refund (recoup from recipient)
const recipientAddress = "0x..." as `0x${string}`;

const settleHash = await walletClient.writeContract({
  address: process.env.ARBITER_FUND_ADDRESS as `0x${string}`,
  abi: arbiterFundABI,
  functionName: "settleDebt",
  args: [recipientAddress],
});

await publicClient.waitForTransactionReceipt({ hash: settleHash });
console.log("Debt settled");
```

## Antipatterns

### 1. Zero refundTo Address

**Problem:** Setting `refundTo` to `address(0)` in `pay()` call locks funds permanently if refund is needed.

**Fix:** Always set `refundTo` to a valid address (usually the payer). Validate before calling `pay()`.

```ts
// Bad
const refundTo = "0x0000000000000000000000000000000000000000";

// Good
const refundTo = account.address; // payer's address
```

### 2. Missing USDC Approve

**Problem:** Calling `pay()` without prior `approve()` on USDC contract causes transaction to revert.

**Fix:** Always approve USDC spending before calling `pay()`. Check allowance first to avoid redundant approvals.

```ts
// Check current allowance
const allowance = await publicClient.readContract({
  address: usdcAddress,
  abi: erc20ABI,
  functionName: "allowance",
  args: [account.address, refundProtocolAddress],
});

if (allowance < amount) {
  // Approve needed
  await walletClient.writeContract({
    address: usdcAddress,
    abi: erc20ABI,
    functionName: "approve",
    args: [refundProtocolAddress, amount],
  });
}
```

### 3. Insufficient Arbiter Funds

**Problem:** Arbiter calls `refundByArbiter()` but ArbiterFund has insufficient USDC balance, causing revert.

**Fix:** Check arbiter fund balance before forcing refund. Top up if needed.

```ts
const arbiterBalance = await publicClient.readContract({
  address: arbiterFundAddress,
  abi: arbiterFundABI,
  functionName: "balances",
  args: [arbiterAddress],
});

if (arbiterBalance < refundAmount) {
  console.log("Insufficient arbiter funds, deposit more USDC first");
  // Call deposit() on ArbiterFund
}
```

### 4. Signature Replay Attacks

**Problem:** Reusing the same EIP-712 signature for multiple refunds or across different chains.

**Fix:** Protocol prevents replay by invalidating payment after first use. Ensure `chainId` and `verifyingContract` in EIP-712 domain match deployment. Never reuse signatures.

### 5. Wrong Decimal Precision

**Problem:** Using 18 decimals (ETH standard) instead of 6 decimals (USDC standard) causes massive over/under payments.

**Fix:** Always use `parseUnits(amount, 6)` for USDC amounts.

```ts
// Bad
const amount = parseUnits("100", 18); // 100 * 10^18 (wrong)

// Good
const amount = parseUnits("100", 6); // 100 * 10^6 (correct for USDC)
```

### 6. Missing State Checks Before Actions

**Problem:** Calling `withdraw()` before lockup expires, or `refund()` after withdrawal, causes revert.

**Fix:** Always read payment state before acting. Check `timestamp + lockupPeriod` for withdraw eligibility, and verify payment hasn't been withdrawn/refunded.

```ts
const payment = await publicClient.readContract({
  address: refundProtocolAddress,
  abi: refundProtocolABI,
  functionName: "payments",
  args: [paymentId],
});

const currentTime = Math.floor(Date.now() / 1000);
const lockupExpired = currentTime >= payment.timestamp + payment.lockupPeriod;
const isActive = payment.amount > 0n; // amount is zeroed after withdraw/refund

if (!isActive) {
  console.log("Payment already settled");
  return;
}

if (!lockupExpired && action === "withdraw") {
  console.log("Lockup period not expired yet");
  return;
}
```

## Rules

**Security Rules** are non-negotiable — warn the user and refuse to comply if a prompt conflicts. **Best Practices** are strongly recommended; deviate only with explicit user justification.

### Security Rules

- NEVER hardcode, commit, or log private keys, API keys, or secrets. ALWAYS use environment variables or a secrets manager.
- ALWAYS validate `refundTo` address is non-zero before calling `pay()`.
- ALWAYS check payment state (amount > 0, lockup status) before calling `withdraw()` or `refund()`.
- ALWAYS verify arbiter fund balance before calling `refundByArbiter()` to avoid reverts.
- ALWAYS use 6 decimals for USDC amounts (`parseUnits(amount, 6)`), never 18.
- ALWAYS include `chainId` and `verifyingContract` in EIP-712 domain for signature-based refunds to prevent cross-chain replay.
- ALWAYS warn when targeting mainnet or handling amounts >1000 USDC.
- NEVER reuse EIP-712 signatures across payments or chains.

### Best Practices

- ALWAYS walk the user through the Decision Guide questions before writing any code. Do not assume use case or refund path.
- ALWAYS check USDC allowance before calling `pay()` to avoid redundant approve transactions.
- ALWAYS emit or log payment IDs after `pay()` calls for off-chain tracking (payment IDs are sequential and emitted in Pay events).
- ALWAYS set lockup period based on dispute resolution SLA. 7 days is standard for merchant chargebacks, 30 days for milestone-based work.
- ALWAYS default to testnet. Require explicit user confirmation before targeting mainnet.
- ALWAYS wrap contract calls in try/catch and provide clear error messages.
- ALWAYS use exponential backoff for retry logic in production.
- ALWAYS monitor arbiter fund balance and set up alerts for low liquidity if using arbiter-forced refunds at scale.

## Use Cases

### Merchant Chargeback System

E-commerce platform holds payment in escrow for 14 days. If buyer disputes, arbiter (platform support team) investigates and forces refund if valid. If no dispute, merchant withdraws after lockup.

**Pattern:** Pay with 14-day lockup + arbiter → arbiter-forced refund if dispute → merchant withdraw if no dispute

### Gig Economy Milestone Payments

Client pays freelancer for project milestone. Funds locked until client approves work. If approved, recipient signs EIP-712 message for early release. If rejected, arbiter reviews and decides.

**Pattern:** Pay with 30-day lockup + arbiter → early release via signature if approved → arbiter-forced refund if rejected

### AI-Validated Service Delivery

User pays for AI service (e.g., content generation). AI validator checks output quality. If valid, recipient withdraws. If invalid, voluntary refund or arbiter review.

**Pattern:** Pay with 1-day lockup + arbiter → voluntary refund if AI rejects → withdraw if AI approves

## Reference Links

- [Refund Protocol Repository](https://github.com/circlefin/refund-protocol) — source code, deployment addresses, tests
- [Arc Escrow Sample App](https://github.com/circlefin/arc-escrow) — full-stack reference implementation
- [Circle Developer Docs](https://developers.circle.com/llms.txt) — always read this first when looking for Circle documentation
- [EIP-712 Typed Data Signing](https://eips.ethereum.org/EIPS/eip-712) — signature standard used for early release

## Alternatives

Trigger the `use-gateway` skill instead when:
- You need unified crosschain balance, not point-to-point escrow.
- Capital efficiency matters more than dispute resolution.
- You're building treasury management or payment routing without refund requirements.

Trigger the `bridge-stablecoin` skill instead when:
- You need to move USDC between chains without escrow.
- No dispute resolution or lockup period is needed.

Trigger the `use-arc` skill instead when:
- You're deploying custom smart contracts on Arc and need general chain setup guidance.
- You need Arc-specific tooling (RPC endpoints, block explorers, faucets) beyond the Refund Protocol.

---

DISCLAIMER: This skill is provided "as is" without warranties, is subject to the [Circle Developer Terms](https://console.circle.com/legal/developer-terms), and output generated may contain errors and/or include fee configuration options (including fees directed to Circle); additional details are in the repository [README](https://github.com/circlefin/skills/blob/master/README.md).
