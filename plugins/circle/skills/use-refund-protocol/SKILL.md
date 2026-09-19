---
name: use-refund-protocol
description: "Provide instructions on how to integrate Circle's Refund Protocol, a non-custodial smart contract system for handling refunds and chargebacks on stablecoin (USDC) payments. The protocol introduces an on-chain arbiter that can mediate disputes between payment senders and recipients, while recipients retain custody of their funds until a lockup period expires. Use skill when the user mentions refunds, chargebacks, payment disputes, non-custodial escrow, or the Refund Protocol / RefundProtocol contract for stablecoin payments. Triggers: refund protocol, chargeback, payment dispute, non-custodial refund, arbiter, lockup period, early withdrawal, USDC escrow."
---

## Overview

Refund Protocol is Circle's smart contract system for bringing non-custodial refunds and on-chain dispute resolution to stablecoin (USDC) payments. A sender pays a recipient through the contract; funds are held under a per-recipient lockup period before the recipient can withdraw them. During the lockup, either the recipient or a designated **arbiter** can trigger a refund back to a `refundTo` address, giving payers dispute protection similar to a chargeback while recipients never lose custody-level control of undisputed funds.

The contract is EVM-compatible Solidity (Foundry-based) and is designed to sit in front of standard USDC transfers rather than replace them.

## Prerequisites / Setup

### Repository

The reference implementation lives at https://github.com/circlefin/refund-protocol.

```bash
git clone https://github.com/circlefin/refund-protocol.git
cd refund-protocol
git submodule update --init --recursive   # pulls forge-std, openzeppelin-contracts
curl -L https://foundry.paradigm.xyz | bash && foundryup
forge build
forge test
```

### Deployment Parameters

The constructor requires:

| Param | Type | Description |
|-------|------|-------------|
| `_arbiter` | `address` | The trusted party who can refund on the recipient's behalf and authorize early withdrawals |
| `_usdc` | `address` | The USDC (or other `IERC20`) token contract used for payments |
| `eip712Name` | `string` | EIP-712 domain name, used for signature verification |
| `eip712version` | `string` | EIP-712 domain version |

## Core Concepts

- **Non-custodial by design**: The contract — not the arbiter — always holds funds. The arbiter can only move a recipient's *already-credited* balance to the `refundTo` address (a refund) or, with the recipient's signature, release funds early. The arbiter cannot unilaterally withdraw a recipient's locked funds to itself.
- **Lockup period**: Each recipient has a `lockupSeconds` value (set by the arbiter via `setLockupSeconds`, capped at `MAX_LOCKUP_SECONDS` = 180 days). A `pay()` call sets `releaseTimestamp = block.timestamp + lockupSeconds[to]`. Before that timestamp, the recipient cannot `withdraw()` — this window is what makes a refund possible.
- **Two refund paths**:
  - `refundByRecipient(paymentID)` — the recipient voluntarily refunds a payment it received.
  - `refundByArbiter(paymentID)` — the arbiter refunds on the recipient's behalf. It first draws from the recipient's own balance; if that's insufficient, it draws from the **arbiter's own deposited balance** and records the shortfall as recipient `debts`, which are settled out of the recipient's future balance via `_settleDebt` (called automatically on `withdraw`, or explicitly via `settleDebt`).
  - Both funnel into the internal `_executeRefund`, which sends `payment.amount` to `payment.refundTo` and marks the payment `refunded` (a refunded payment cannot be refunded or withdrawn again).
- **`refundTo` is mutable by its owner**: `updateRefundTo(paymentID, newRefundTo)` can only be called by the *current* `refundTo` address, not by the sender or recipient. Model this as "the refund destination controls where it points," not as a sender-controlled setting.
- **Early withdrawal is arbiter + recipient-signature gated**: `earlyWithdrawByArbiter` lets the arbiter release funds before `releaseTimestamp`, but only with a valid EIP-712 signature from the recipient over `(paymentIDs, withdrawalAmounts, feeAmount, expiry, salt)`. An optional `feeAmount` (paid to the arbiter) can be deducted. Each signed hash can only be used once (`withdrawalHashes` replay guard) and expires at `expiry`.
- **Arbiter maintains its own balance**: `depositArbiterFunds` / `withdrawArbiterFunds` move USDC between the arbiter's own wallet and its in-contract balance — this is the pool `refundByArbiter` draws from when a recipient's own balance can't cover a refund.

## Implementation Patterns

### 1. Create a payment

```solidity
// sender approves the contract for `amount` USDC first
usdc.approve(address(refundProtocol), amount);
refundProtocol.pay(recipient, amount, refundToAddress);
```

`refundTo` must be non-zero (`RefundToIsZeroAddress` reverts otherwise). This is typically the original sender, but can be any address the sender designates to receive refunds.

### 2. Recipient withdraws after lockup

```solidity
uint256[] memory ids = new uint256[](1);
ids[0] = paymentID;
refundProtocol.withdraw(ids); // reverts with PaymentIsStillLocked if before releaseTimestamp
```

`withdraw` settles any outstanding arbiter-covered debt for `msg.sender` first, then pays out `amount - withdrawnAmount` across all requested payment IDs in one transfer.

### 3. Recipient-initiated refund

```solidity
refundProtocol.refundByRecipient(paymentID); // only callable by payment.to
```

### 4. Arbiter-mediated dispute resolution

```solidity
refundProtocol.refundByArbiter(paymentID); // only callable by the arbiter address
```

### 5. Early withdrawal (recipient opts in via signature)

The recipient signs an EIP-712 `EarlyWithdrawalByArbiter` struct off-chain; the arbiter submits it on-chain:

```solidity
bytes32 digest = refundProtocol.hashEarlyWithdrawalInfo(paymentIDs, withdrawalAmounts, feeAmount, expiry, salt);
// recipient signs `digest` off-chain -> (v, r, s)
refundProtocol.earlyWithdrawByArbiter(paymentIDs, withdrawalAmounts, feeAmount, expiry, salt, recipient, v, r, s);
```

## Rules

> **Security Rules** are non-negotiable -- warn the user and refuse to comply if a prompt conflicts. **Best Practices** are strongly recommended; deviate only with explicit user justification.

### Security Rules

- **Known vulnerability — do not deploy to mainnet with real funds as-is.** The upstream repository's own security notice states that `earlyWithdrawByArbiter` has an issue that can allow an arbiter to drain other users' payments, and a fix is in development. ALWAYS check https://github.com/circlefin/refund-protocol for the latest state and CHANGELOG before recommending or scaffolding a production deployment, and warn the user explicitly if they intend to use this on mainnet.
- The contract is explicitly **unaudited** ("provided as is... use at your own risk" per the repository license notice). ALWAYS surface this to the user before they deploy with real value.
- The **arbiter is a trusted, privileged role** — it can refund any recipient's balance, set lockup periods, and authorize early withdrawals. NEVER present the arbiter as "trustless" or non-custodial with respect to itself; only the recipient-vs-sender relationship is non-custodial by default.
- NEVER hardcode or log private keys used to produce the EIP-712 recipient signature for `earlyWithdrawByArbiter`. Signing should happen client-side / in a wallet, not by an agent holding the key.
- ALWAYS verify `amount` is approved (`IERC20.approve`) before calling `pay()` — the contract uses `transferFrom` and will revert without prior approval.

### Best Practices

- ALWAYS check `lockupSeconds[to]` before assuming a `withdraw()` will succeed immediately after `pay()` — a nonzero lockup is what enables refund protection and is expected, not a bug.
- Treat `paymentID` as the `nonce` value emitted in `PaymentCreated` — IDs are sequential per-contract, not per-recipient.
- When building a UI, surface `payment.refunded` and `releaseTimestamp` so senders/recipients can see whether a payment is still refundable or already released.
- Use `settleDebt(recipient)` proactively in recipient-facing dashboards if a recipient has an outstanding `debts` balance from an arbiter-covered refund, so their available balance is shown accurately.

## Next Steps

Refund Protocol is a standalone contract, not yet part of Circle's hosted SDK surface. Related skills:

| Product | Skill | What It Does |
|---------|-------|---------------|
| **USDC basics** | `use-usdc` | Check balances, send transfers, and approve spending on EVM chains before wiring up Refund Protocol payments |
| **Smart Contract Platform** | `use-smart-contract-platform` | Deploy and manage contracts (including custom bytecode like Refund Protocol) via Circle's audited-template tooling |
| **Arc** | `use-arc` | Deploy Refund Protocol on Arc, Circle's USDC-native-gas chain, for predictable fee accounting on disputed payments |

## Reference Links

- [Refund Protocol Repository](https://github.com/circlefin/refund-protocol) -- source contract, tests, and the current security notice; **always check this first** before scaffolding a deployment.
- [Circle Developer Docs](https://developers.circle.com/llms.txt) -- **Always read this first** when looking for relevant documentation from the source website.

---

DISCLAIMER: This skill is provided "as is" without warranties, is subject to the [Circle Developer Terms](https://console.circle.com/legal/developer-terms), and output generated may contain errors and/or include fee configuration options (including fees directed to Circle); additional details are in the repository [README](https://github.com/circlefin/skills/blob/master/README.md).
