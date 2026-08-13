---
name: recover-eco-funds
description: "Recover USDC from a legacy Circle CLI Gateway `--method eco` deposit whose fixed refund recipient is the SCA's backing EOA. Use this skill for legacy Eco intents that are stuck, expired, waiting for refund, refunded to `eoaOwnerAddress`, missing from Gateway, or need a permissionless self-refund. Do not use its executable recovery phases for current Gateway v2 deposits, which set `refundRecipient` to the SCA. It covers calling Eco's Portal `refund(...)` with exact onchain intent data, then moving refunded USDC from the backing EOA to the linked SCA with ERC-3009, relayed by the SCA so the backing EOA needs no gas."
allowed-tools: ["Read", "Bash(mkdir -p ./eco-recovery-evidence)", "Bash(circle --version)", "Bash(circle wallet status --output json)", "Bash(circle gateway deposit --help)", "Bash(circle wallet execute --help)", "Bash(circle contract query --help)", "Bash(circle wallet list --chain * --type agent --output json)", "Bash(circle wallet balance --address * --chain * --output json)", "Bash(circle gateway balance --address * --chain * --output json)", "Bash(circle transaction list --address * --chain * --operation transfer --tx-type outbound --state confirmed --output json)", "Bash(curl -fsS \"https://api.eco.com/circle-gateway/v2/depositAddresses/*\")", "Bash(curl -fsS --request POST --url https://quotes.eco.com/api/v3/intents/intentStatus --header \"Content-Type: application/json\" --data '{\"intentHash\":\"*\"}')", "Bash(curl -fsS --request POST --url https://quotes.eco.com/api/v3/intents/intentStatus --header \"Content-Type: application/json\" --data '{\"intentCreatedHash\":\"*\"}')", "Bash(*/node_modules/.bin/tsx */scripts/eco-self-refund.mjs *)", "Bash(*/node_modules/.bin/tsx */scripts/eoa-to-sca.mjs *)"]
---

# Recover Legacy Eco Funds

## Overview

Recover funds from a legacy Circle CLI Eco deposit without guessing intent data, refund recipients, or transaction state. The workflow is evidence-first and defaults to read-only inspection.

> **Legacy-only recovery:** The executable recovery phases in this skill are for deposits whose already-published intent fixes `reward.creator` to the Circle SCA's API-verified `eoaOwnerAddress`. Current Gateway v2/Circle CLI deposits set `refundRecipient` to the SCA and should refund directly there. For a current deposit, use the read-only status checks below, reconcile the SCA and Gateway balances, and escalate through the normal support path if necessary; do not run the legacy backing-EOA sweep.

Do not classify a deposit as legacy from its age or endpoint version alone. Decode the `IntentPublished` event and compare the fixed `reward.creator` with both the SCA and its API-verified `eoaOwnerAddress`:

- `reward.creator == eoaOwnerAddress`: legacy recovery may apply after all read-only checks.
- `reward.creator == SCA`: current direct-to-SCA refund behavior; stop before the executable legacy phases.
- neither: stop because the selected Circle wallet does not own the fixed refund recipient.

Use the `use-circle-cli` and `use-agent-wallet` skills first if the Circle CLI is not installed, the Terms gate is unresolved, or the agent session is invalid. Do not trigger multiple login requests: each fresh request invalidates the prior OTP.

## Understand the two recovery legs

A legacy Eco deposit can require two separate operations:

1. **Eco self-refund:** call `Portal.refund(destination, routeHash, reward)` on the vault/refund chain after the reward deadline. The Portal validates the intent and instructs its deterministic vault to return funds to `reward.creator`. Anyone may relay this call, but the recipient is fixed by the original intent.
2. **Backing EOA sweep:** if `reward.creator` was the SCA's backing EOA, authorize USDC to move from that EOA to the linked SCA with ERC-3009. The SCA relays the token call and pays gas; the backing EOA does not need native gas.

Current Gateway v2/Circle CLI Eco deposits set the SCA as the refund recipient. They are outside the executable scope of this skill: use status and balance reconciliation, and do not run the backing-EOA sweep.

## Safety boundary

- Treat event/creation chain, vault/refund chain, intent destination value, Gateway destination chain, SCA, backing EOA, creation-chain Portal, refund-chain Portal, vault, token, amount, route hash, intent hash, and deadline as different fields. Never substitute one for another. A composed Eco flow can publish the event on one chain while leaving the refundable vault on another, and Portal deployment addresses need not match across chains.
- Derive the backing EOA from the Circle wallet API's `eoaOwnerAddress`; do not accept a user-supplied owner without comparing it to that field.
- Before a legacy self-refund broadcast, require `reward.creator` to equal the selected Circle wallet's API-verified `eoaOwnerAddress`. If it equals the SCA, classify it as the current direct-to-SCA flow and stop before executable recovery. Although `refund(...)` is permissionless, never spend the user's gas to refund an unrelated wallet.
- Reconstruct the refund tuple from the source-chain `IntentPublished` event. The Eco status API is useful context but is not authoritative enough to build calldata.
- Verify the reconstructed intent hash equals the event's indexed intent hash.
- Refuse a refund before the onchain deadline or when reward status is already `Withdrawn` or `Refunded`.
- Simulate the exact calldata from the exact SCA before broadcasting.
- Ask for explicit approval immediately before each money-moving action. Present chain, token, raw and decimal amount, source, destination, contract, intent/nonce, and estimated gas.
- Use one persisted idempotency key per intended broadcast. On an ambiguous response, reconcile onchain state before attempting anything new.
- Never log user tokens, session secrets, OTPs, private keys, or raw EIP-712 signatures. Log a signature hash instead.
- If `CIRCLE_PROXY_URL` overrides Circle's default, inspect the exact origin and obtain explicit user trust before sending an agent session token through it. The helpers require `--allow-proxy-origin <scheme://host>` when an override is present.
- Never use `refundTo(...)` as a shortcut. It can change the recipient and is creator-restricted on current Eco contracts. The permissionless `refund(...)` path is sufficient.

## Create an evidence directory

Create a dedicated directory before diagnosis, for example:

```bash
mkdir -p ./eco-recovery-evidence
```

Capture command time, CLI version, Circle chain code, RPC URL host, public addresses, intent and transaction hashes, sanitized stdout/stderr, exit code, pre/post balances, simulation result, idempotency key, and final explorer link. Keep the directory private because public addresses and account relationships may still be sensitive.

Do not place raw signatures or authentication material in this directory.

## Phase 1: Diagnose without changing state

Run current help before relying on remembered flags:

```bash
circle --version
circle wallet status --output json
circle gateway deposit --help
circle wallet execute --help
circle contract query --help
```

Identify the SCA and inspect the creation chain, candidate vault/refund chains, and Gateway destination:

```bash
circle wallet list --chain <SOURCE_CHAIN> --type agent --output json
circle wallet balance --address <SCA> --chain <SOURCE_CHAIN> --output json
circle gateway balance --address <SCA> --chain <GATEWAY_DESTINATION_CHAIN> --output json
```

Collect at least one intent identifier:

- Eco intent hash, or
- creation-chain transaction hash that published the intent, or
- Eco deposit address plus the funding transaction that reached it.

### Check the current Eco intent status for a Circle SCA

Eco does not provide a list-intents-by-SCA endpoint. Map the SCA to the single-use Eco vault created for the deposit, then query that vault and its intent:

1. Identify the source-chain SCA:

   ```bash
   circle wallet list --chain <SOURCE_CHAIN> --type agent --output json
   ```

2. Get `<VAULT_ADDRESS>` from the original `circle gateway deposit --output json` result or the saved evidence. Its `vaultAddress`, `sourceAddress`, `sourceBlockchain`, `transferTxHash`, and `deadline` fields identify the deposit. If that output was not saved, list the SCA's confirmed outbound transfers and find the exact USDC funding transaction; its `destinationAddress` is the Eco vault:

   ```bash
   circle transaction list \
     --address <SCA> \
     --chain <SOURCE_CHAIN> \
     --operation transfer \
     --tx-type outbound \
     --state confirmed \
     --output json
   ```

   Match the intended amount, time, USDC token, and transaction hash. Do not select a vault from address alone when multiple deposits exist.

3. Query the current Gateway deposit-vault record. Use the EVM chain ID for the chain that funded the vault (`8453` for Base mainnet or `84532` for Base Sepolia; verify current CLI support with `circle gateway deposit --help`):

   ```bash
   curl -fsS \
     "https://api.eco.com/circle-gateway/v2/depositAddresses/<VAULT_ADDRESS>?sourceChainId=<SOURCE_CHAIN_EVM_ID>"
   ```

   Record `state`, `vaultAddress`, `amount`, `deadline`, `sourceChainId`, and `intentHash`. States such as `PENDING` and `FUNDING_DETECTED` are still in progress; `PUBLISHED` means an intent was published, while `FAILED`, `REFUNDED_BY_USER`, and `RECOVERY_PUBLISHED` require reconciliation before another action.

4. When the vault record contains an `intentHash`, query the intent lifecycle:

   ```bash
   curl -fsS \
     --request POST \
     --url https://quotes.eco.com/api/v3/intents/intentStatus \
     --header "Content-Type: application/json" \
     --data '{"intentHash":"<INTENT_HASH>"}'
   ```

   If only the creation transaction hash is available, use the alternate accepted identifier:

   ```bash
   curl -fsS \
     --request POST \
     --url https://quotes.eco.com/api/v3/intents/intentStatus \
     --header "Content-Type: application/json" \
     --data '{"intentCreatedHash":"<CREATION_TRANSACTION_HASH>"}'
   ```

   Capture `data.status`, `data.intentCreated`, `data.fulfillment`, and `data.refund`, including every transaction hash and explorer URL present.

These APIs are supporting evidence. If the response says `WaitingForRefund`, continue with onchain reconstruction; never build refund calldata or broadcast from an API status alone.

Classify the state:

| Observed state | Action |
|---|---|
| Intent still before deadline | Wait or escalate; do not refund |
| Intent fulfilled/completed | Reconcile Gateway or destination funds; do not refund |
| Legacy intent, deadline passed, unfulfilled, vault funded | Run the Eco self-refund leg |
| Fixed refund recipient is the SCA | Current flow: reconcile or escalate; do not run legacy recovery |
| Reward status already `Refunded` | Locate the refund recipient balance; do not call refund again |
| USDC is at the SCA | Recovery is complete |
| USDC is at the verified backing EOA | Run the backing EOA sweep leg |
| Vault and both wallet balances are zero | Stop and trace transfer events; do not guess |

## Helper prerequisites

The bundled helpers require a trusted `circle-cli` developer checkout with dependencies installed because the current public command surface does not expose either raw contract calldata submission or backing-EOA typed-data signing. They reuse Circle CLI's existing secure session and challenge code; they do not read or print keychain secrets directly.

Resolve both paths explicitly:

```text
<SKILL_DIR>       directory containing this SKILL.md
<CIRCLE_CLI_REPO> trusted circle-cli checkout containing apps/cli and node_modules
```

If a newer installed CLI exposes native recovery, raw-calldata, or backing-owner commands in `--help`, prefer those commands and retain the same preflight, approval, and evidence requirements.

## Phase 2: Self-issue the Eco refund

Do not enter this phase until the onchain event proves the deposit is legacy or otherwise proves that the fixed recipient is owned by the selected wallet and requires this manual path. If `reward.creator` is the SCA, stop and use the current-flow reconciliation path.

Read [references/self-refund.md](references/self-refund.md) before acting. It defines the exact event fields, tuple, onchain checks, and raw-calldata fallback.

Prefer a native Circle CLI recovery command if the installed CLI exposes one in `--help`. Otherwise use the bundled helper from a trusted `circle-cli` checkout:

```bash
<CIRCLE_CLI_REPO>/node_modules/.bin/tsx \
  <SKILL_DIR>/scripts/eco-self-refund.mjs \
  --circle-cli-repo <CIRCLE_CLI_REPO> \
  --chain <REFUND_CHAIN> \
  --event-chain-id <CREATION_CHAIN_EVM_ID> \
  --refund-chain-id <REFUND_CHAIN_EVM_ID> \
  --event-rpc-url <CREATION_CHAIN_RPC_URL> \
  --refund-rpc-url <REFUND_CHAIN_RPC_URL> \
  --sca <SCA> \
  --event-portal <CREATION_CHAIN_ECO_PORTAL> \
  --portal <REFUND_CHAIN_ECO_PORTAL> \
  --creation-tx <SOURCE_TX_HASH> \
  --intent-hash <INTENT_HASH> \
  --evidence-dir <EVIDENCE_DIR> \
  --estimate-fee
```

The invocation is read-only. It decodes `IntentPublished` from the explicitly selected creation-chain Portal, verifies the intent hash, then reads reward status and vault balances from the separately selected refund-chain Portal, constructs the exact `refund(...)` calldata, and performs `eth_call` from the SCA. `--estimate-fee` additionally loads the Circle session, verifies that the fixed recipient is the selected SCA or its API-reported backing EOA, and includes the fee estimate in the approval preflight. Omit that flag only for session-free diagnosis; such output is not sufficient for approval. If the selected chain has no funded vault, stop and inspect other chains indicated by the composed Eco route; do not assume the event chain owns the vault or that both Portal addresses are identical.

After showing a preflight with `recipientOwnership.checked: true` and an `estimatedFee`, and receiving explicit user approval, re-run with both:

```bash
--submit --confirm-intent <INTENT_HASH>
```

The confirmation value binds approval to one intent rather than to an open-ended refund operation.

When `CIRCLE_PROXY_URL` is set, the helper stops before sending a session token. Inspect the reported origin, ask the user to trust that exact origin, and only then add `--allow-proxy-origin <scheme://host>`.

After confirmation, verify:

- Circle transaction state is confirmed and has a transaction hash.
- Portal reward status is `Refunded`.
- Each reward-token vault balance is zero or lower by the refunded amount.
- The fixed refund recipient's balance increased.
- The receipt includes `IntentRefunded` for the expected intent and recipient.

The optional normal `circle wallet execute` tuple-form estimate is not preauthorized by this skill's `allowed-tools` because its dynamic tuple arguments cannot be narrowly scoped. Run it only through the host's normal interactive command approval. If that estimate fails while direct RPC simulation succeeds, use the preauthorized helper's raw calldata path. Do not change tuple values to make the hosted parser accept them.

## Phase 3: Move backing-EOA USDC to the linked SCA

Skip this phase when the refund already reached the SCA.

Read [references/eoa-to-sca.md](references/eoa-to-sca.md) before acting. This is a standard USDC ERC-3009 transfer authorized by the backing EOA and relayed by its linked SCA.

Inspect only:

```bash
<CIRCLE_CLI_REPO>/node_modules/.bin/tsx \
  <SKILL_DIR>/scripts/eoa-to-sca.mjs \
  --circle-cli-repo <CIRCLE_CLI_REPO> \
  --chain <SOURCE_CHAIN> \
  --chain-id <EVM_CHAIN_ID> \
  --rpc-url <SOURCE_RPC_URL> \
  --sca <SCA> \
  --usdc <USDC_CONTRACT> \
  --amount-atomic <RAW_USDC_AMOUNT> \
  --evidence-dir <EVIDENCE_DIR> \
  --estimate-fee
```

This resolves `eoaOwnerAddress`, reads balances, checks USDC metadata, and prints the unsigned authorization plan with a pre-signing fee estimate. The fee probe uses an ephemeral local signer and a zero-value ERC-3009 authorization, so it cannot move user funds and does not request a Circle signature from the backing EOA.

After showing the estimate and receiving explicit user approval for both the transfer and a native-token fee ceiling, run:

```bash
--submit \
  --confirm-transfer <BACKING_EOA>:<SCA>:<RAW_USDC_AMOUNT> \
  --max-network-fee <APPROVED_DECIMAL_NATIVE_TOKEN_AMOUNT>
```

The helper repeats the zero-value fee probe and refuses before requesting the backing EOA signature when it exceeds `--max-network-fee`. After signing, it estimates the exact calldata and refuses before broadcast if that exact fee exceeds the same ceiling. If this post-signing refusal occurs, retain the nonce evidence and let the authorization expire before creating another.

When `CIRCLE_PROXY_URL` is set, apply the same explicit `--allow-proxy-origin <scheme://host>` gate before resolving or signing with the backing EOA.

The helper then:

1. Verifies the fresh pre-signing fee estimate is within the explicitly approved ceiling.
2. Builds `TransferWithAuthorization` with `from=backing EOA`, `to=linked SCA`, exact raw amount, a fresh 32-byte nonce, and a short expiry.
3. Requests typed-data signing with `walletAddress=<backing EOA>` and `blockchain=<SOURCE_CHAIN>`. Signing by the SCA wallet ID is incorrect because it can produce an EIP-1271 replay-safe SCA wrapper instead of the raw EOA signature USDC expects.
4. Recovers the signer locally and requires it to equal `eoaOwnerAddress`.
5. Requires `authorizationState(backing EOA, nonce) == false`, simulates the exact USDC call from the SCA, and verifies its exact fee is still within the approved ceiling.
6. Submits `transferWithAuthorization(...)` through the linked SCA as relayer.

After confirmation, verify:

- Backing EOA USDC decreased by the exact amount.
- SCA USDC increased by the exact amount.
- `authorizationState(backing EOA, nonce)` is true.
- The receipt contains the expected USDC transfer.

## Ambiguous or failed submissions

Do not create a fresh authorization or idempotency key just because a client timed out.

For Eco refund ambiguity, check reward status, vault balance, recipient balance, transaction list, and `IntentRefunded` logs. If any proves success, record the result and stop.

For ERC-3009 ambiguity, check `authorizationState`, both USDC balances, transaction list, and transfer logs. A consumed nonce or completed balance movement proves the authorization was used. Never sign a second transfer until the first is reconciled.

If a signed authorization was never submitted, let its `validBefore` expire before creating another with the same amount unless onchain state proves the nonce unused and the original signature cannot be replayed by an unintended party.

## Completion report

Report:

- Initial diagnosis and selected branch.
- Creation/event, vault/refund, intent-destination, and Gateway-destination chain names and IDs.
- SCA, verified backing EOA, creation-chain Portal, refund-chain Portal, vault, token, and fixed refund recipient.
- Intent hash, route hash, deadline, reward status before/after.
- Amounts in atomic units and USDC.
- Simulation results and gas estimate.
- Circle transaction IDs, onchain transaction hashes, and explorer links.
- Pre/post balances and ERC-3009 authorization state.
- Evidence-directory path and a note that secrets/signatures were excluded.

## Reference links

- Eco Portal contract: https://docs.eco.com/routes/architecture/portal
- Eco vaults: https://docs.eco.com/routes/architecture/vault
- Eco intent status API: https://docs.eco.com/api-reference/quotes-v3/get-intent-status
- Eco contracts: https://github.com/eco/eco-routes
- EIP-3009: https://eips.ethereum.org/EIPS/eip-3009
- Circle USDC contracts: https://developers.circle.com/stablecoins/usdc-contract-addresses
- Circle Agent Wallet setup skill: `use-agent-wallet`

---

DISCLAIMER: This skill is provided "as is" without warranties, is subject to the [Circle Developer Terms](https://console.circle.com/legal/developer-terms), and output generated may contain errors. Review every address, amount, deadline, contract, simulation, fee, and approval before broadcasting a transaction.
