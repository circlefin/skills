# use-refund-protocol

Build stablecoin payment systems with built-in dispute resolution on Arc.
The Refund Protocol lets payers recover funds in case of fraud, errors, or
chargebacks — without reversing the blockchain — through a non-custodial
arbiter system that holds payments in escrow until the lockup period expires
or a dispute is resolved.

---

## When to use this skill

Use `use-refund-protocol` when you are building a payment flow that needs:

- **Merchant refunds** — buyer pays, merchant can voluntarily refund
- **Chargeback protection** — a trusted arbiter can force a refund if fraud is detected
- **Lockup-based settlement** — funds held for N days before recipient can withdraw
- **Early release** — arbiter authorizes early withdrawal with optional fee
- **Institutional treasury** — banks and PSPs managing USDC payment disputes onchain

Do **not** use this skill for:

- Immediate, irrevocable payments (use direct USDC transfer)
- AI-validated job deliverables (use `use-agent-economy` with ERC-8183)
- Crosschain transfers (use `bridge-stablecoin` or `use-gateway`)

---

## Core concepts

### The three roles

```
Payer ──── pay() ──────────────► RefundProtocol (escrow)
                                        │
Recipient ── withdraw() ◄───────────────┤  (after lockup expires)
                                        │
Arbiter ──── refundByArbiter() ─────────►  (dispute resolution)
              earlyWithdrawByArbiter()      (early release with fee)
```

### How lockup works

Every recipient has a configurable lockup period set by the arbiter. Funds
sit in escrow until the lockup expires. This gives the arbiter a window to
investigate disputes and issue refunds before the recipient can withdraw.

```
Day 0        Lockup period (0–180 days)        Release
  │──────────────────────────────────────────────│
  pay()                                    withdraw()
              ↑ refund window ↑
```

A lockup of 0 means funds are available immediately — useful for low-risk
merchant flows. Up to 180 days maximum (`MAX_LOCKUP_SECONDS`).

> **Important:** `lockupSeconds[recipient]` defaults to `0` until the arbiter
> calls `setLockupSeconds()`. The lockup must be configured **before** the
> first payment to that recipient, or funds will be immediately withdrawable.

---

## Repository

Source: https://github.com/circlefin/refund-protocol

The contract is deployed by each application — there is no shared instance.
Deploy your own `RefundProtocol` with your arbiter address and USDC token.

---

## Deploying the contract

### Prerequisites

Install Foundry:
```bash
curl -L https://foundry.paradigm.xyz | bash
foundryup
git clone https://github.com/circlefin/refund-protocol
cd refund-protocol
git submodule update --init --recursive
```

### Deploy on Arc Testnet

```solidity
// Constructor parameters:
// arbiter  — address that can force refunds and authorize early withdrawals
// usdc     — 0x3600000000000000000000000000000000000000 (Arc Testnet)
// name     — EIP-712 domain name (e.g. "MyApp Refund Protocol")
// version  — EIP-712 version (e.g. "1.0")

RefundProtocol protocol = new RefundProtocol(
    arbiterAddress,
    0x3600000000000000000000000000000000000000,
    "MyApp Refund Protocol",
    "1.0"
);
```

```bash
forge create src/RefundProtocol.sol:RefundProtocol \
  --rpc-url https://rpc.testnet.arc.network \
  --private-key $PRIVATE_KEY \
  --constructor-args $ARBITER_ADDRESS \
    0x3600000000000000000000000000000000000000 \
    "MyApp Refund Protocol" \
    "1.0"
```

---

## Core flows

### 1. Basic payment with lockup

> **Prerequisite:** The arbiter must call `setLockupSeconds()` for the
> recipient **before** any payment is made. `lockupSeconds[to]` defaults to
> `0`, so payments made before this step are immediately withdrawable.
> See [Section 2](#2-arbiter-sets-lockup-period) for the arbiter setup.

```typescript
import { createPublicClient, createWalletClient, http, parseUnits } from "viem";
import { arcTestnet } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";

const USDC = "0x3600000000000000000000000000000000000000" as const;
const REFUND_PROTOCOL = "0xYOUR_DEPLOYED_CONTRACT" as const;
const AMOUNT = parseUnits("10.00", 6); // 10 USDC — always 6 decimals

const publicClient = createPublicClient({ chain: arcTestnet, transport: http() });
const payerWallet = createWalletClient({
  account: privateKeyToAccount(process.env.PAYER_KEY as `0x${string}`),
  chain: arcTestnet,
  transport: http(),
});

const refundProtocolAbi = [
  { name: "pay", type: "function", stateMutability: "nonpayable",
    inputs: [
      { name: "to",        type: "address" },
      { name: "amount",    type: "uint256" },
      { name: "refundTo",  type: "address" },  // where funds go if refunded
    ], outputs: [] },
  { name: "withdraw", type: "function", stateMutability: "nonpayable",
    inputs: [{ name: "paymentIDs", type: "uint256[]" }], outputs: [] },
  { name: "refundByRecipient", type: "function", stateMutability: "nonpayable",
    inputs: [{ name: "paymentID", type: "uint256" }], outputs: [] },
  { name: "refundByArbiter", type: "function", stateMutability: "nonpayable",
    inputs: [{ name: "paymentID", type: "uint256" }], outputs: [] },
  { name: "setLockupSeconds", type: "function", stateMutability: "nonpayable",
    inputs: [{ name: "recipient", type: "address" }, { name: "recipientLockupSeconds", type: "uint256" }], outputs: [] },
  { name: "payments", type: "function", stateMutability: "view",
    inputs: [{ name: "paymentID", type: "uint256" }],
    outputs: [
      { name: "to",               type: "address" },
      { name: "amount",           type: "uint256" },
      { name: "releaseTimestamp", type: "uint256" },
      { name: "refundTo",         type: "address" },
      { name: "withdrawnAmount",  type: "uint256" },
      { name: "refunded",         type: "bool"    },
    ] },
  { name: "balances", type: "function", stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }] },
  { name: "nonce", type: "function", stateMutability: "view",
    inputs: [], outputs: [{ name: "", type: "uint256" }] },
] as const;

const erc20Abi = [
  { name: "approve", type: "function", stateMutability: "nonpayable",
    inputs: [{ name: "spender", type: "address" }, { name: "amount", type: "uint256" }],
    outputs: [{ name: "", type: "bool" }] },
] as const;

// Step 1: Arbiter configures lockup for this recipient (run once per recipient)
// Must be done BEFORE the first pay() — otherwise lockupSeconds[to] is 0
// and funds are immediately withdrawable.
const arbiterWallet = createWalletClient({
  account: privateKeyToAccount(process.env.ARBITER_KEY as `0x${string}`),
  chain: arcTestnet,
  transport: http(),
});
const lockupHash = await arbiterWallet.writeContract({
  address: REFUND_PROTOCOL,
  abi: refundProtocolAbi,
  functionName: "setLockupSeconds",
  args: [recipientAddress, BigInt(7 * 24 * 3600)], // 7-day lockup
});
await publicClient.waitForTransactionReceipt({ hash: lockupHash });

// Step 2: Approve USDC spend
const approveHash = await payerWallet.writeContract({
  address: USDC,
  abi: erc20Abi,
  functionName: "approve",
  args: [REFUND_PROTOCOL, AMOUNT],
});
await publicClient.waitForTransactionReceipt({ hash: approveHash });

// Step 3: Get current nonce (this will be the payment ID)
const paymentId = await publicClient.readContract({
  address: REFUND_PROTOCOL,
  abi: refundProtocolAbi,
  functionName: "nonce",
});

// Step 4: Pay — funds go into escrow
const payHash = await payerWallet.writeContract({
  address: REFUND_PROTOCOL,
  abi: refundProtocolAbi,
  functionName: "pay",
  args: [
    recipientAddress,
    AMOUNT,
    payerAddress,   // refundTo — payer gets money back if refunded
  ],
});
await publicClient.waitForTransactionReceipt({ hash: payHash });

// Step 5: Read the actual release timestamp from the contract
// (do not estimate — read the value recorded by pay() for correctness)
const [, , releaseTimestamp] = await publicClient.readContract({
  address: REFUND_PROTOCOL,
  abi: refundProtocolAbi,
  functionName: "payments",
  args: [paymentId],
});

console.log(`Payment ID: ${paymentId}`);
console.log(`Funds locked until: ${new Date(Number(releaseTimestamp) * 1000).toISOString()}`);
```

### 2. Arbiter sets lockup period

The arbiter must set the lockup period for each recipient before payments
are made. Lockup of 0 = no lockup (immediate withdrawal allowed).

```typescript
const arbiterWallet = createWalletClient({
  account: privateKeyToAccount(process.env.ARBITER_KEY as `0x${string}`),
  chain: arcTestnet,
  transport: http(),
});

// Set 7-day lockup for a merchant
await arbiterWallet.writeContract({
  address: REFUND_PROTOCOL,
  abi: refundProtocolAbi,
  functionName: "setLockupSeconds",
  args: [merchantAddress, BigInt(7 * 24 * 3600)],
});
```

### 3. Recipient withdraws after lockup

```typescript
const recipientWallet = createWalletClient({
  account: privateKeyToAccount(process.env.RECIPIENT_KEY as `0x${string}`),
  chain: arcTestnet,
  transport: http(),
});

// Withdraw multiple payments at once
const withdrawHash = await recipientWallet.writeContract({
  address: REFUND_PROTOCOL,
  abi: refundProtocolAbi,
  functionName: "withdraw",
  args: [[paymentId]], // array of payment IDs
});
await publicClient.waitForTransactionReceipt({ hash: withdrawHash });
```

### 4. Voluntary refund by recipient

The merchant can issue a refund without arbiter involvement.

```typescript
const refundHash = await recipientWallet.writeContract({
  address: REFUND_PROTOCOL,
  abi: refundProtocolAbi,
  functionName: "refundByRecipient",
  args: [paymentId],
});
// Funds go back to the refundTo address specified in pay()
```

### 5. Forced refund by arbiter

Used when fraud is detected or the recipient refuses to issue a refund.
The arbiter can use the recipient's balance or its own deposited funds.

```typescript
// Arbiter forces refund — draws from recipient's balance first,
// then from arbiter's own deposited balance if insufficient
const forceRefundHash = await arbiterWallet.writeContract({
  address: REFUND_PROTOCOL,
  abi: refundProtocolAbi,
  functionName: "refundByArbiter",
  args: [paymentId],
});
// Funds go to the refundTo address — recipient cannot block this
```

### 6. Early withdrawal authorized by arbiter

> ⚠️ **Security notice — do not use in production without reviewing the
> upstream status.** The `refund-protocol` README currently has an active
> Security Notice stating that `earlyWithdrawByArbiter()` contains an issue
> that allows an arbiter to drain other users' payments. A fix is still in
> development. Do not expose this function in a production system until the
> upstream contract is patched and audited.
>
> The integration below is provided for reference only so you understand the
> signing pattern. Gate it behind a feature flag and audit the contract fix
> before enabling it.

The arbiter can release funds before the lockup expires, with an optional
fee. The recipient must sign the withdrawal parameters.

**Signing note:** The contract's `_hashEarlyWithdrawalInfo()` hashes the
parameters with `abi.encode(...)` directly — it does **not** use EIP-712
typed-data encoding. Using `signTypedData()` produces a different digest and
the signature will not verify onchain. Use `encodeAbiParameters` + `keccak256`
+ `sign` to match the contract exactly.

```typescript
import { encodeAbiParameters, keccak256, parseUnits } from "viem";
import { sign } from "viem/accounts";

const feeAmount = parseUnits("0.50", 6); // 0.50 USDC arbiter fee
const expiry    = BigInt(Math.floor(Date.now() / 1000) + 3600); // 1 hour
const salt      = BigInt(Math.floor(Math.random() * 1e15));     // unique per call

// Hash parameters exactly as _hashEarlyWithdrawalInfo() does in the contract:
// keccak256(abi.encode(paymentIDs, withdrawalAmounts, feeAmount, expiry, salt))
const hash = keccak256(
  encodeAbiParameters(
    [
      { type: "uint256[]" },
      { type: "uint256[]" },
      { type: "uint256"   },
      { type: "uint256"   },
      { type: "uint256"   },
    ],
    [[paymentId], [AMOUNT], feeAmount, expiry, salt]
  )
);

// Sign the raw keccak256 hash — no EIP-712 domain, no Ethereum prefix
const { v, r, s } = await sign({
  hash,
  privateKey: process.env.RECIPIENT_KEY as `0x${string}`,
});

// Arbiter executes early withdrawal with recipient's signature
const earlyWithdrawAbi = [{
  name: "earlyWithdrawByArbiter",
  type: "function",
  stateMutability: "nonpayable",
  inputs: [
    { name: "paymentIDs",        type: "uint256[]" },
    { name: "withdrawalAmounts", type: "uint256[]" },
    { name: "feeAmount",         type: "uint256"   },
    { name: "expiry",            type: "uint256"   },
    { name: "salt",              type: "uint256"   },
    { name: "recipient",         type: "address"   },
    { name: "v",                 type: "uint8"     },
    { name: "r",                 type: "bytes32"   },
    { name: "s",                 type: "bytes32"   },
  ],
  outputs: [],
}] as const;

await arbiterWallet.writeContract({
  address: REFUND_PROTOCOL,
  abi: earlyWithdrawAbi,
  functionName: "earlyWithdrawByArbiter",
  args: [
    [paymentId],
    [AMOUNT],
    feeAmount,
    expiry,
    salt,
    recipientAddress,
    v, r, s,
  ],
});
```

---

## Arbiter fund management

The arbiter can pre-fund the contract to cover forced refunds when the
recipient has already withdrawn their balance.

```typescript
const depositAbi = [
  { name: "depositArbiterFunds", type: "function", stateMutability: "nonpayable",
    inputs: [{ name: "amount", type: "uint256" }], outputs: [] },
  { name: "withdrawArbiterFunds", type: "function", stateMutability: "nonpayable",
    inputs: [{ name: "amount", type: "uint256" }], outputs: [] },
] as const;

// Deposit 100 USDC as arbiter reserve (approve first)
await arbiterWallet.writeContract({
  address: REFUND_PROTOCOL,
  abi: depositAbi,
  functionName: "depositArbiterFunds",
  args: [parseUnits("100.00", 6)],
});
```

When the arbiter covers a refund from its own balance, the recipient incurs
a debt. New payments via `pay()` increase the recipient's balance but do
**not** settle the debt automatically — `pay()` does not call `_settleDebt`.
Debt is only cleared when `settleDebt(recipient)` is called explicitly, or
when the recipient calls `withdraw()`, which settles outstanding debt before
releasing funds.

```typescript
const settleDebtAbi = [
  { name: "settleDebt", type: "function", stateMutability: "nonpayable",
    inputs: [{ name: "recipient", type: "address" }], outputs: [] },
  { name: "debts", type: "function", stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }] },
] as const;

// Check outstanding debt before deciding whether to call settleDebt
const debt = await publicClient.readContract({
  address: REFUND_PROTOCOL,
  abi: settleDebtAbi,
  functionName: "debts",
  args: [recipientAddress],
});

if (debt > 0n) {
  await arbiterWallet.writeContract({
    address: REFUND_PROTOCOL,
    abi: settleDebtAbi,
    functionName: "settleDebt",
    args: [recipientAddress],
  });
}
```

---

## Reading payment state

```typescript
const payment = await publicClient.readContract({
  address: REFUND_PROTOCOL,
  abi: refundProtocolAbi,
  functionName: "payments",
  args: [paymentId],
}) as readonly [string, bigint, bigint, string, bigint, boolean];

const [to, amount, releaseTimestamp, refundTo, withdrawnAmount, refunded] = payment;
const isLocked    = Date.now() / 1000 < Number(releaseTimestamp);
const canWithdraw = !isLocked && !refunded;

console.log("Recipient  :", to);
console.log("Amount     :", formatUnits(amount, 6), "USDC");
console.log("Locked     :", isLocked);
console.log("Refunded   :", refunded);
console.log("Can withdraw:", canWithdraw);
```

---

## Decision guide: which refund path to use

| Situation | Who acts | Function |
|---|---|---|
| Merchant wants to refund voluntarily | Recipient | `refundByRecipient()` |
| Fraud detected, merchant unresponsive | Arbiter | `refundByArbiter()` |
| Recipient needs funds early, agrees to fee | Arbiter + Recipient sig | `earlyWithdrawByArbiter()` ⚠️ |
| Lockup expired, no dispute | Recipient | `withdraw()` |
| Recipient spent balance, arbiter covered refund | On `withdraw()` or explicit call | `settleDebt()` |

---

## Common mistakes

### 1. Setting refundTo as zero address
```typescript
// WRONG — will revert with RefundToIsZeroAddress
await pay(recipient, amount, "0x0000000000000000000000000000000000000000");

// CORRECT — always provide a valid refundTo address
await pay(recipient, amount, payerAddress);
```

### 2. Forgetting to approve USDC before pay()
```typescript
// WRONG — transferFrom will fail without prior approval
await writeContract({ functionName: "pay", args: [to, amount, refundTo] });

// CORRECT — approve first, then pay
await writeContract({ address: USDC, functionName: "approve", args: [REFUND_PROTOCOL, amount] });
await writeContract({ functionName: "pay", args: [to, amount, refundTo] });
```

### 3. Paying before setLockupSeconds is configured
```typescript
// WRONG — lockupSeconds[recipient] defaults to 0; payment is immediately withdrawable
await pay(recipient, amount, refundTo); // no lockup in effect

// CORRECT — arbiter sets lockup first, then payer sends funds
await arbiterWallet.writeContract({ functionName: "setLockupSeconds", args: [recipient, lockupDuration] });
await payerWallet.writeContract({ functionName: "pay", args: [recipient, amount, refundTo] });
```

### 4. Arbiter trying to refund with no funds available
```typescript
// If recipient already withdrew AND arbiter has no deposited balance,
// refundByArbiter() will revert with InsufficientFunds.
// Always keep arbiter reserve funded for dispute coverage.
```

### 5. Reusing early withdrawal signatures (replay attack)
```typescript
// WRONG — using the same salt twice
const salt = 0n;
// second call with same params will revert with WithdrawalHashAlreadyUsed

// CORRECT — always use a unique salt per withdrawal
const salt = BigInt(Date.now()); // or crypto.getRandomValues
```

### 6. Not checking payment state before withdraw
```typescript
// CORRECT — always verify lockup and refund status before calling withdraw
const [, , releaseTimestamp, , , refunded] = await readContract({
  functionName: "payments", args: [paymentId]
});
if (refunded) throw new Error("Payment already refunded");
if (Date.now() / 1000 < Number(releaseTimestamp)) throw new Error("Still locked");
```

### 7. Using 18 decimals for USDC
```typescript
// WRONG
const amount = parseUnits("10.00", 18);

// CORRECT — USDC always uses 6 decimals on Arc
const amount = parseUnits("10.00", 6);
```

### 8. Using signTypedData for earlyWithdrawByArbiter signatures
```typescript
// WRONG — signTypedData produces EIP-712 canonical array encoding;
// the contract uses abi.encode() directly, so the digests differ and
// the signature will not verify onchain.
const signature = await signTypedData({ domain, types, primaryType, message });

// CORRECT — match _hashEarlyWithdrawalInfo() exactly with encodeAbiParameters
const hash = keccak256(encodeAbiParameters([...], [[paymentId], [amount], fee, expiry, salt]));
const { v, r, s } = await sign({ hash, privateKey });
```

---

## Use cases

### Merchant payments with chargeback protection

Deploy one `RefundProtocol` per merchant tier. Set lockup based on risk:
high-risk merchants get 30-day lockup, trusted merchants get 3 days.
The arbiter is your compliance/fraud team wallet.

### Gig economy payouts

Freelancer completes work → client pays via `pay()` with 48h lockup →
client reviews → approves (lockup expires, freelancer withdraws) or
disputes (arbiter investigates, calls `refundByArbiter()` if justified).

### AI-validated escrow (arc-escrow pattern)

AI agent validates deliverable quality → calls `refundByArbiter()` to
reverse payment if quality threshold not met, or lets lockup expire for
automatic release. Combines with ERC-8183 for full `use-agent-economy`
integration.

---

## Related skills

- [`use-agent-economy`](../use-agent-economy/SKILL.md) — combine with ERC-8183 for AI-validated job escrow
- [`use-developer-controlled-wallets`](../use-developer-controlled-wallets/SKILL.md) — manage arbiter wallet
- [`use-arc`](../use-arc/SKILL.md) — chain config and contract deployment on Arc

---

## Updating the refund address

The payer (or whoever is the current `refundTo`) can update where funds
go if a refund is triggered. Useful when the payer's wallet changes.

```typescript
const updateRefundToAbi = [{
  name: "updateRefundTo",
  type: "function",
  stateMutability: "nonpayable",
  inputs: [
    { name: "paymentID",  type: "uint256" },
    { name: "newRefundTo", type: "address" },
  ],
  outputs: [],
}] as const;

// Only the current refundTo address can call this
await refundToWallet.writeContract({
  address: REFUND_PROTOCOL,
  abi: updateRefundToAbi,
  functionName: "updateRefundTo",
  args: [paymentId, newRefundToAddress],
});
```
