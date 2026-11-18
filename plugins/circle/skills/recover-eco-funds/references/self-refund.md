This procedure is for legacy Eco deposits whose fixed `reward.creator` is the Circle SCA's API-verified `eoaOwnerAddress`, when the intent is expired or reports `WaitingForRefund` and funds remain in its vault. Current Gateway v2/Circle CLI deposits set the refund recipient to the SCA and are outside this executable path: if `reward.creator` equals the SCA, stop and use status and balance reconciliation instead.

### Contract model

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

### Reconstruct exact intent data

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

### Separate the relevant chains

A composed Eco Gateway deposit can have several chain concepts:

- **Creation/event chain:** contains the transaction and `IntentPublished` log.
- **Vault/refund chain:** contains the funded deterministic vault and is where `Portal.refund(...)` must execute.
- **Intent destination:** the `uint64 destination` encoded in the intent. It is an argument to `refund`; do not replace it with a guessed source chain ID.
- **Gateway destination:** where the successful deposit was supposed to credit Gateway balance.

These can differ. In the verified Circle CLI incident, the intent event was published on Base while the funded refundable vault and successful refund call were on Polygon.

Find the refund chain by checking the computed vault and reward-token balances on candidate chains implicated by the Eco route. Never broadcast on a chain merely because it hosts the creation transaction.

### Refund requirements

- Node.js 20.18.2 or newer.
- Circle CLI 1.2.3 or newer: `npm install -g @circle-fin/cli@latest`. Older versions send array and tuple arguments as plain strings, so `circle wallet execute` cannot take the reward tuple; the helper refuses to run on them.
- An active login to the account that owns the SCA: `circle wallet login <email>` (add `--testnet` for testnet chains).
- `viem`, installed once into the skill directory from its pinned lockfile. The published Circle CLI builds viem in but does not ship it, so the scripts can't use the CLI's copy:

  ```bash
  npm ci --prefix '<SKILL_DIR>' --ignore-scripts
  ```
- An RPC URL for the creation chain and one for the refund chain.

`scripts/eco-self-refund.mjs` reads the session the Circle CLI saved locally and never prints or saves session secrets. It loads `viem` from the skill directory and prints the install command if it's missing. It talks only to Circle production (`https://agentic-wallet.circle.com`) and the two RPC URLs. If `CIRCLE_PROXY_URL` is set, it refuses to run: unset the variable, run `circle wallet login` again, and run the printed commands without it too.

### Run the read-only preflight

```bash
node <SKILL_DIR>/scripts/eco-self-refund.mjs \
  --chain '<REFUND_CHAIN>' \
  --event-chain-id '<CREATION_CHAIN_EVM_ID>' \
  --refund-chain-id '<REFUND_CHAIN_EVM_ID>' \
  --event-rpc-url '<CREATION_CHAIN_RPC_URL>' \
  --refund-rpc-url '<REFUND_CHAIN_RPC_URL>' \
  --sca '<SCA>' \
  --event-portal '<CREATION_CHAIN_ECO_PORTAL>' \
  --portal '<REFUND_CHAIN_ECO_PORTAL>' \
  --creation-tx '<SOURCE_TX_HASH>' \
  --intent-hash '<INTENT_HASH>' \
  --evidence-dir '<EVIDENCE_DIR>'
```

The script submits nothing. It performs every check below, writes the preflight to the evidence directory, prints it as JSON, and, only when the intent is eligible, prints two commands to run next. If the selected chain has no funded vault, it stops; inspect other chains indicated by the composed Eco route, and do not assume the event chain owns the vault or that both Portal addresses are identical.

The checks, on the selected vault/refund chain unless stated otherwise:

1. Verify both the creation-chain event Portal and refund-chain Portal addresses against authoritative Eco deployment records or the expected integration configuration. Do not assume they are identical. (You do this; the script cannot.)
2. Verify refund-chain Portal bytecode is present.
3. Decode the event on the creation chain and recompute `routeHash`, `rewardHash`, and `intentHash`.
4. Read the latest refund-chain block timestamp and require it to be at least `reward.deadline`.
5. Call `getRewardStatus(intentHash)`.
6. Stop if status is terminal — `2 = Withdrawn` or `3 = Refunded`. Continue only for `0 = Initial` or `1 = Funded`; `1 = Funded` is the normal refundable state for an expired intent. Full enumeration:
   - `0 = Initial`
   - `1 = Funded` (refundable)
   - `2 = Withdrawn` (terminal — do not refund)
   - `3 = Refunded` (terminal — do not refund)
7. Compute the vault with `intentVaultAddress(destination, route, reward)`.
8. Read the vault's native balance and every `reward.tokens[i].token.balanceOf(vault)`.
9. Require at least one recoverable balance. The vault's native balance always counts, whatever `reward.nativeAmount` says. Eco's vault refund transfers the vault's actual balance for each reward token, which can differ by tiny accidental top-ups from the nominal reward amount.
10. Encode the exact `refund(...)` call and simulate it with `eth_call` using `from=<SCA>`.
11. Stop with `action: "stop-current-direct-to-sca"` if `reward.creator` equals the SCA. Otherwise find the SCA among the logged-in account's Agent Wallets, fetch it by wallet ID, and require `reward.creator` to equal its `eoaOwnerAddress`. If it matches neither, stop: `refund(...)` is permissionless, and skipping this check could charge the selected SCA gas while sending the refund to an unrelated creator.

Do not treat `WaitingForRefund` as a substitute for steps 3–10.

### Run the printed checks

For an eligible intent (`action: "eligible-after-approval"`, `recipientOwnership.checked: true`), the script prints, with every value filled in and single-quoted:

1. **Tuple check:** `circle contract query "intentVaultAddress(uint64,bytes,(...))" ...` with the same reward tuple. Its `outputData` must end in the vault address the script computed. This shows the Circle CLI and API read the tuple exactly as the onchain Portal does.
2. **Fee estimate:**

   ```text
   circle wallet execute "refund(uint64,bytes32,(uint64,address,address,uint256,(address,uint256)[]))" '<DESTINATION>' '<ROUTE_HASH>' '<REWARD_JSON>' --contract '<REFUND_CHAIN_ECO_PORTAL>' --address '<SCA>' --chain '<REFUND_CHAIN>' --estimate
   ```

`<REWARD_JSON>` is the reward tuple as a JSON array in ABI order, with every integer as a quoted string, for example `["1700000000","0x<creator>","0x<prover>","0",[["0x<token>","12345678"]]]`. Do not retype or reorder it; copy the printed command.

If the tuple check returns a different vault, or the estimate fails while the script's `eth_call` simulation succeeded, stop and escalate with the evidence. Do not alter token order, tuple layout, or amounts to make the hosted parser accept them, and do not hand-build raw calldata.

### Approval summary

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
Tuple check: vault matches
Estimated network fee: <from the --estimate command>
```

Ask the user to approve this one intent hash. Do not reuse a broad earlier approval for a different intent.

### Submit once

After explicit approval, re-run the same preflight command with two more flags:

```text
--confirm-intent '<INTENT_HASH>' --evidence-dir '<EVIDENCE_DIR>'
```

The confirmation value binds approval to one intent rather than to an open-ended refund operation. The script repeats every check, saves a fresh idempotency key to the evidence directory, and prints the single submit command (the estimate command with `--idempotency-key '<UUID>' --output json` in place of `--estimate`) followed by verification queries. It exits with code 2 and prints nothing to submit if the intent stopped being eligible.

Run the submit command once. Expect `"state": "COMPLETE"` (or `CONFIRMED`) and a `txHash`. If you must re-run the confirm step, use the same `--evidence-dir`: the script reuses the saved key, so a retry cannot create a second transaction. If the submit definitively failed (`FAILED`, `DENIED` or `CANCELLED`) and the reward status is still `Funded`, release the key as described in the skill's Ambiguous or failed submissions section, then confirm again.

### Post-broadcast reconciliation

Record the Circle transaction ID, idempotency key, onchain hash, block, network fee, and explorer URL. Then run the printed queries and re-run the read-only preflight, and verify:

- transaction receipt succeeded;
- `getRewardStatus(intentHash)` is `3 = Refunded` (the preflight reports `rewardStatus.name: "Refunded"`);
- `IntentRefunded(intentHash, reward.creator)` exists in the receipt;
- vault reward-token balances were drained as expected;
- the fixed recipient balance increased by the vault's actual transferred amount.

If the client times out, perform these checks before retrying. A terminal reward status or matching event proves success even if the original CLI process failed to print its final response.

### Lessons from the verified Circle CLI recovery

The verified recovery exposed two edge cases this procedure preserves:

- The `IntentPublished` event was on Base while the funded refundable vault and refund call were on Polygon. Creation chain and refund chain therefore cannot be conflated.
- The vault's actual USDC balance was one atomic unit above the nominal reward amount. Eco's vault refunded the actual balance, so evidence and reconciliation must compare real pre/post balances rather than assuming the tuple amount is the exact payout.

### Refund sources

- Eco Portal architecture: https://docs.eco.com/routes/architecture/portal
- Eco vault architecture: https://docs.eco.com/routes/architecture/vault
- Eco intent status (undocumented legacy endpoint): `POST https://quotes.eco.com/api/v3/intents/intentStatus`
- Eco contract source: https://github.com/eco/eco-routes/blob/master/contracts/IntentSource.sol
- Eco vault source: https://github.com/eco/eco-routes/blob/master/contracts/vault/Vault.sol
