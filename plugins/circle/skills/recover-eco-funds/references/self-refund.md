# Eco permissionless self-refund

This reference is for legacy Eco deposits whose fixed `reward.creator` is the Circle SCA's API-verified `eoaOwnerAddress`. Current Gateway v2/Circle CLI deposits set the refund recipient to the SCA and are outside this executable recovery path.

Read this reference when an eligible legacy Eco intent is expired or reports `WaitingForRefund` and funds remain in an intent vault. If `reward.creator` equals the SCA, stop and use current-flow status and balance reconciliation instead.

## Contract model

Eco stores each intent reward in a deterministic vault. The Portal computes the vault from the intent hash and is the only contract allowed to instruct the vault to refund.

The public entry point is:

```solidity
function refund(
    uint64 destination,
    bytes32 routeHash,
    Reward calldata reward
) external;

struct Reward {
    uint64 deadline;
    address creator;
    address prover;
    uint256 nativeAmount;
    TokenAmount[] tokens;
}

struct TokenAmount {
    address token;
    uint256 amount;
}
```

The exact ABI signature is:

```text
refund(uint64,bytes32,(uint64,address,address,uint256,(address,uint256)[]))
```

`refund(...)` is permissionless. The Portal always passes `reward.creator` to the vault as refund recipient. Calling from the SCA pays gas but does not make the SCA the recipient.

Eco's intended refund path requires no valid correct-destination proof and `block.timestamp >= reward.deadline`. Client-side checks should be stricter than relying on a revert alone: stop when the reward status is already terminal even if a particular deployed contract version would accept a repeated call.

Treat successful `eth_call` of the exact deployed contract as the final pre-broadcast validation. Also enforce the stricter client-side checks below.

## Reconstruct exact intent data

Decode this event from the intent creation transaction:

```solidity
event IntentPublished(
    bytes32 indexed intentHash,
    uint64 destination,
    bytes route,
    address indexed creator,
    address indexed prover,
    uint64 rewardDeadline,
    uint256 rewardNativeAmount,
    TokenAmount[] rewardTokens
);
```

Multiple intents can be published in one transaction. Require the expected `intentHash` when more than one event exists.

Derive:

```text
routeHash  = keccak256(route)
rewardHash = keccak256(abi.encode(reward))
intentHash = keccak256(abi.encodePacked(destination, routeHash, rewardHash))
```

Require the computed `intentHash` to equal the event's indexed hash. A mismatch means at least one decoded field or ABI version is wrong.

Do not build the tuple solely from the Eco status API. The status response is valuable for lifecycle context but can omit `route`, `routeHash`, `prover`, `nativeAmount`, and exact reward tuple structure.

## Separate the relevant chains

A composed Eco Gateway deposit can have several chain concepts:

- **Creation/event chain:** contains the transaction and `IntentPublished` log.
- **Vault/refund chain:** contains the funded deterministic vault and is where `Portal.refund(...)` must execute.
- **Intent destination:** the `uint64 destination` encoded in the intent. It is an argument to `refund`; do not replace it with a guessed source chain ID.
- **Gateway destination:** where the successful deposit was supposed to credit Gateway balance.

These can differ. In the verified Circle CLI incident, the intent event was published on Base while the funded refundable vault and successful refund call were on Polygon.

Find the refund chain by checking the computed vault and reward-token balances on candidate chains implicated by the Eco route. Never broadcast on a chain merely because it hosts the creation transaction.

## Required preflight checks

Perform all checks on the selected vault/refund chain unless stated otherwise:

1. Verify both the creation-chain event Portal and refund-chain Portal addresses against authoritative Eco deployment records or the expected integration configuration. Do not assume they are identical.
2. Verify refund-chain Portal bytecode is present.
3. Decode the event on the creation chain and recompute `routeHash`, `rewardHash`, and `intentHash`.
4. Read the latest refund-chain block timestamp and require it to be at least `reward.deadline`.
5. Call `getRewardStatus(intentHash)`.
6. Stop if status is terminal — `2 = Withdrawn` or `3 = Refunded`. Continue only for `0 = Initial` or `1 = Funded`; `1 = Funded` is the normal refundable state for an expired intent. Full enumeration:
   - `0 = Initial`
   - `1 = Funded` (refundable)
   - `2 = Withdrawn` (terminal — do not refund)
   - `3 = Refunded` (terminal — do not refund)
7. Compute the vault with `intentVaultAddress(destination, route, reward)` or the deployed contract's equivalent.
8. Read the vault's native balance and every `reward.tokens[i].token.balanceOf(vault)`.
9. Require at least one recoverable balance. Note that Eco vault refund transfers the vault's actual balance for each reward token, which can differ by tiny accidental top-ups from the nominal reward amount.
10. Encode the exact `refund(...)` call and simulate it with `eth_call` using `from=<SCA>`.
11. Run the helper with `--estimate-fee` to fetch the selected Circle wallet, require `reward.creator` to equal its API-reported backing EOA, and estimate the exact same raw calldata through the Circle agent-wallet API. If it equals the SCA, stop because this legacy executable path does not apply.

Do not treat `WaitingForRefund` as a substitute for steps 3–10.

## Why raw calldata may be needed

Some Circle hosted ABI parsers reject nested tuple arrays even when the EVM call is valid. A normal invocation can fail generically:

This optional tuple-form estimate is intentionally not preauthorized by the skill's `allowed-tools` because its dynamic arguments cannot be narrowly scoped. Run it only through the host's normal interactive command approval.

```bash
circle wallet execute \
  "refund(uint64,bytes32,(uint64,address,address,uint256,(address,uint256)[]))" \
  ... \
  --estimate
```

If direct RPC simulation of the exact tuple succeeds but this parser path fails, encode the calldata locally with a standard ABI encoder and submit the raw bytes through Circle's contract-execution request. Do not alter token order, tuple layout, or amounts to work around the parser.

The bundled `scripts/eco-self-refund.mjs` uses the Circle CLI repository's existing agent-session and challenge helpers for this raw-calldata path.

## Approval summary

Immediately before broadcast, show:

```text
Operation: Eco permissionless refund
Creation chain: <name/id>
Refund chain: <name/id>
Caller / gas payer: <SCA>
Creation-chain event Portal: <address>
Refund-chain Portal: <address>
Intent: <intentHash>
Route hash: <routeHash>
Vault: <address>
Fixed recipient: <reward.creator>
Fixed recipient ownership: <API-verified backing EOA>
Deadline: <unix and ISO time>
Reward tokens: <address, raw amount, decimals amount, current vault balance>
Native reward / vault balance: <values>
Reward status: <Initial or Funded>
Simulation: success
Estimated network fee: <value>
```

Ask the user to approve this one intent hash. Do not reuse a broad earlier approval for a different intent.

Before asking for approval, fetch the selected Circle wallet by wallet ID. Require `reward.creator` to equal its API-verified `eoaOwnerAddress`, and include the verdict plus fee estimate in the preflight. If it equals the SCA, stop because the current direct-to-SCA flow is outside this legacy executable path. If it matches neither, stop because `refund(...)` is permissionless and omitting this ownership check could charge the selected SCA gas while sending the refund to an unrelated creator.

## Post-broadcast reconciliation

Record the Circle transaction ID, idempotency key, onchain hash, block, network fee, and explorer URL. Then verify:

- transaction receipt succeeded;
- `getRewardStatus(intentHash) == Refunded`;
- `IntentRefunded(intentHash, reward.creator)` exists;
- vault reward-token balances were drained as expected;
- the fixed recipient balance increased by the vault's actual transferred amount.

If the client times out, perform these checks before retrying. A terminal reward status or matching event proves success even if the original CLI process failed to print its final response.

## Lessons from the verified Circle CLI recovery

The verified recovery exposed two edge cases this procedure preserves:

- The `IntentPublished` event was on Base while the funded refundable vault and refund call were on Polygon. Creation chain and refund chain therefore cannot be conflated.
- The vault's actual USDC balance was one atomic unit above the nominal reward amount. Eco's vault refunded the actual balance, so evidence and reconciliation must compare real pre/post balances rather than assuming the tuple amount is the exact payout.

## Sources

- Eco Portal architecture: https://docs.eco.com/routes/architecture/portal
- Eco vault architecture: https://docs.eco.com/routes/architecture/vault
- Eco intent status API: https://docs.eco.com/api-reference/quotes-v3/get-intent-status
- Eco contract source: https://github.com/eco/eco-routes/blob/master/contracts/IntentSource.sol
- Eco vault source: https://github.com/eco/eco-routes/blob/master/contracts/vault/Vault.sol
