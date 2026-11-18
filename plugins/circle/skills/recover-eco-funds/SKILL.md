---
name: recover-eco-funds
description: "Recover USDC from a legacy Circle CLI Gateway `--method eco` deposit whose fixed refund recipient is the SCA's backing EOA. Use this skill for legacy Eco intents that are stuck, expired, waiting for refund, refunded to `eoaOwnerAddress`, missing from Gateway, or need a permissionless self-refund. Do not use its executable recovery phases for current Gateway v2 deposits, which set `refundRecipient` to the SCA. It covers calling Eco's Portal `refund(...)` with exact onchain intent data, then moving refunded USDC from the backing EOA to the linked SCA with ERC-3009, relayed by the SCA so the backing EOA needs no gas. The backing-EOA sweep also applies when USDC was sent directly to an Agent Wallet's backing EOA and the CLI reports \"Wallet not found\" for that address."
allowed-tools: ["Read", "Bash(mkdir -p ./eco-recovery-evidence)", "Bash(circle --version)", "Bash(circle wallet status --output json)", "Bash(circle gateway deposit --help)", "Bash(circle wallet execute --help)", "Bash(circle contract query --help)", "Bash(circle wallet list --chain * --type agent --output json)", "Bash(circle wallet balance --address * --chain * --output json)", "Bash(circle gateway balance --address * --chain * --output json)", "Bash(circle transaction list --address * --chain * --operation transfer --tx-type outbound --state complete --output json)", "Bash(curl -fsS \"https://api.eco.com/circle-gateway/v2/depositAddresses/*\")", "Bash(curl -fsS --request POST --url https://quotes.eco.com/api/v3/intents/intentStatus --header \"Content-Type: application/json\" --data '{\"intentHash\":\"*\"}')", "Bash(curl -fsS --request POST --url https://quotes.eco.com/api/v3/intents/intentStatus --header \"Content-Type: application/json\" --data '{\"intentCreatedHash\":\"*\"}')", "Bash(node */scripts/eco-self-refund.mjs *)", "Bash(node */scripts/sign-eoa-authorization.mjs *)", "Bash(npm ci --prefix * --ignore-scripts)", "Bash(circle transaction list --address * --chain * --operation execute --output json)"]
requirements:
  runtimes: [node]
  connectors: []
---

# Recover Legacy Eco Funds

## Overview

Recover funds from a legacy Circle CLI Eco deposit without guessing intent data, refund recipients, or transaction state. The workflow is evidence-first and defaults to read-only inspection.

> **Legacy-only recovery:** The executable recovery phases in this skill are for deposits whose already-published intent fixes `reward.creator` to the Circle SCA's API-verified `eoaOwnerAddress`. Current Gateway v2/Circle CLI deposits set `refundRecipient` to the SCA and should refund directly there. For a current deposit, use the read-only status checks below, reconcile the SCA and Gateway balances, and escalate through the normal support path if necessary; do not run the legacy backing-EOA sweep.

Do not classify a deposit as legacy from its age or endpoint version alone. Decode the `IntentPublished` event and compare the fixed `reward.creator` with both the SCA and its API-verified `eoaOwnerAddress`:

- `reward.creator == eoaOwnerAddress`: legacy recovery may apply after all read-only checks.
- `reward.creator == SCA`: current direct-to-SCA refund behavior; stop before the executable legacy phases.
- neither: stop because the selected Circle wallet does not own the fixed refund recipient.

If there is no Eco deposit and USDC was simply sent to an Agent Wallet's backing EOA (the CLI reports "Wallet not found" for that address), skip Phases 1 and 2 and go straight to Phase 3.

If the Circle CLI is not installed, the Terms gate is unresolved, or the agent session is invalid, set up first: use the installed `use-agent-wallet` skill; if it isn't installed, fetch `https://agents.circle.com/skills/wallet-login.md` (full bootstrap: `https://agents.circle.com/skills/setup.md`). Do not trigger multiple login requests: each fresh request invalidates the prior OTP.

## Workflow

1. Create a private evidence directory.
2. Phase 1: diagnose read-only and classify the intent from the onchain `IntentPublished` event.
3. Phase 2, for a legacy intent past its deadline with a funded vault: run the read-only refund preflight, run the printed tuple check and fee estimate, get approval for that one intent, submit the printed refund command once, and verify.
4. Phase 3, when USDC sits at the verified backing EOA: get approval, sign the ERC-3009 authorization, estimate, get approval for the transfer and fee, submit once, and verify.
5. Report the outcome with the evidence-directory path.

## Understand the two recovery legs

A legacy Eco deposit can require two separate operations:

1. **Eco self-refund:** call `Portal.refund(destination, routeHash, reward)` on the vault/refund chain after the reward deadline. The Portal validates the intent and instructs its deterministic vault to return funds to `reward.creator`. Anyone may relay this call, but the recipient is fixed by the original intent.
2. **Backing EOA sweep:** if `reward.creator` was the SCA's backing EOA, authorize USDC to move from that EOA to the linked SCA with ERC-3009. The SCA relays the token call and pays gas; the backing EOA does not need native gas.

Current Gateway v2/Circle CLI Eco deposits set the SCA as the refund recipient. They are outside the executable scope of this skill: use status and balance reconciliation, and do not run the backing-EOA sweep.

## Safety boundary

- Treat event/creation chain, vault/refund chain, intent destination value, Gateway destination chain, SCA, backing EOA, creation-chain Portal, refund-chain Portal, vault, token, amount, route hash, intent hash, and deadline as different fields. Never substitute one for another. A composed Eco flow can publish the event on one chain while leaving the refundable vault on another, and Portal deployment addresses need not match across chains.
- Check every value before putting it in a command, whether it came from the user, an evidence file, or the Eco API: addresses are `0x` + 40 hex characters; transaction and intent hashes are `0x` + 64 hex characters; chains are Circle CLI codes (`BASE`, `ARB-SEPOLIA`); chain IDs are digits only; RPC URLs start with `http://` or `https://` and contain no whitespace, quotes, backticks, `$`, `;`, `|`, `&`, `(`, `)`, `<`, `>`, or backslashes. Single-quote every value in the command. If a value fails, stop and ask the user; never edit it to make it pass. A host may pre-approve the two scripts with any arguments, so this check is the guard; the scripts re-validate the same fields and single-quote every value in the commands they print.
- Derive the backing EOA from the Circle wallet API's `eoaOwnerAddress`; do not accept a user-supplied owner without comparing it to that field.
- Before a legacy self-refund broadcast, require `reward.creator` to equal the selected Circle wallet's API-verified `eoaOwnerAddress`. If it equals the SCA, classify it as the current direct-to-SCA flow and stop before executable recovery. Although `refund(...)` is permissionless, never spend the user's gas to refund an unrelated wallet.
- Reconstruct the refund tuple from the source-chain `IntentPublished` event. The Eco status API is useful context but is not authoritative enough to build calldata.
- Verify the reconstructed intent hash equals the event's indexed intent hash.
- Refuse a refund before the onchain deadline or when reward status is already `Withdrawn` or `Refunded`.
- Simulate the exact calldata from the exact SCA before broadcasting.
- Ask for explicit approval immediately before each money-moving action. Present chain, token, raw and decimal amount, source, destination, contract, intent/nonce, and estimated gas.
- `circle wallet execute` moves funds, so this skill never pre-approves it: run every printed estimate and submit command through your host's normal per-command approval.
- Use one persisted idempotency key per intended broadcast. On an ambiguous response, reconcile onchain state before attempting anything new.
- Never log user tokens, session secrets, OTPs, private keys, or raw EIP-712 signatures. Log a signature hash instead.
- Both scripts talk only to Circle production (`https://agentic-wallet.circle.com`) and refuse to run while `CIRCLE_PROXY_URL` is set, because the printed `circle wallet execute` commands would send the session token through that override too. Unset it, run `circle wallet login` again, and run the printed commands without it.
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
circle wallet list --chain '<SOURCE_CHAIN>' --type agent --output json
circle wallet balance --address '<SCA>' --chain '<SOURCE_CHAIN>' --output json
circle gateway balance --address '<SCA>' --chain '<GATEWAY_DESTINATION_CHAIN>' --output json
```

Collect at least one intent identifier:

- Eco intent hash, or
- creation-chain transaction hash that published the intent, or
- Eco deposit address plus the funding transaction that reached it.

### Check the current Eco intent status for a Circle SCA

Eco does not provide a list-intents-by-SCA endpoint. Map the SCA to the single-use Eco vault created for the deposit, then query that vault and its intent:

1. Identify the source-chain SCA:

   ```bash
   circle wallet list --chain '<SOURCE_CHAIN>' --type agent --output json
   ```

2. Get `<VAULT_ADDRESS>` from the original `circle gateway deposit --output json` result or the saved evidence. Its `vaultAddress`, `sourceAddress`, `sourceBlockchain`, `transferTxHash`, and `deadline` fields identify the deposit. If that output was not saved, list the SCA's completed outbound transfers and find the exact USDC funding transaction; its `destinationAddress` is the Eco vault:

   ```bash
   circle transaction list \
     --address '<SCA>' \
     --chain '<SOURCE_CHAIN>' \
     --operation transfer \
     --tx-type outbound \
     --state complete \
     --output json
   ```

   Match the intended amount, time, USDC token, and transaction hash. Do not select a vault from address alone when multiple deposits exist.

3. Query the current Gateway deposit-vault record with the EVM chain ID of the chain that funded the vault — `8453` (Base), `42161` (Arbitrum), `10` (OP Mainnet), or `84532` (Base Sepolia). Verify current CLI support with `circle gateway deposit --help`:

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
| --- | --- |
| Intent still before deadline | Wait or escalate; do not refund |
| Intent fulfilled/completed | Reconcile Gateway or destination funds; do not refund |
| Legacy intent, deadline passed, unfulfilled, vault funded | Run the Eco self-refund leg |
| Fixed refund recipient is the SCA | Current flow: reconcile or escalate; do not run legacy recovery |
| Reward status already `Refunded` | Locate the refund recipient balance; do not call refund again |
| USDC is at the SCA | Recovery is complete |
| USDC is at the verified backing EOA | Run the backing EOA sweep leg |
| Vault and both wallet balances are zero | Stop and trace transfer events; do not guess |

## Recovery script prerequisites

Phases 2 and 3 run two bundled scripts with Node.js 20.18.2+ and the public `@circle-fin/cli`, logged in with `circle wallet login`. Phase 2 needs `@circle-fin/cli` 1.2.3 or newer, which takes tuple arguments as JSON. No Circle CLI source checkout is needed. `<SKILL_DIR>` is the directory containing this SKILL.md. Both scripts also need `viem`, which the published CLI doesn't ship. `<SKILL_DIR>` has a `package.json` and `package-lock.json` that pin it and every package it pulls in, with integrity hashes. Install exactly that tree once, without install scripts:

```bash
npm ci --prefix '<SKILL_DIR>' --ignore-scripts
```

If you are reading this as a web page, install the Circle skills first (`circle skill install --tool '<tool>'` or `npx skills add circlefin/skills -g`) and use the installed `recover-eco-funds` directory as `<SKILL_DIR>`; never fetch the scripts from anywhere else.

If a newer installed CLI exposes native recovery or backing-owner commands in `--help`, prefer those commands and retain the same preflight, approval, and evidence requirements.

## Phase 2: Self-issue the Eco refund

Do not enter this phase until the onchain event proves the deposit is legacy or otherwise proves that the fixed recipient is owned by the selected wallet and requires this manual path. If `reward.creator` is the SCA, stop and use the current-flow reconciliation path.

The procedure below defines the exact event fields, tuple, onchain checks, the read-only preflight script, and the commands it prints:

READ `references/self-refund.md`.

Approval and verification, in order:

1. Run the read-only preflight. Continue only when it reports `action: "eligible-after-approval"` and `recipientOwnership.checked: true`. Nothing is submitted. The ownership check needs an active `circle wallet login`; a "No active Circle login" error means log in and re-run, not that the intent is ineligible.
2. Run the printed tuple check and `circle wallet execute ... --estimate` command. Stop and escalate if the tuple check returns a different vault or the estimate fails; never alter tuple values to get past it.
3. Show the approval summary with the estimated fee, and get explicit approval for this one intent hash.
4. Re-run the preflight with `--confirm-intent '<INTENT_HASH>'` and the same evidence directory, then run the printed submit command exactly once. If the confirm step runs again (a timeout, a lost context), it reuses the key already saved for this intent, so the printed submit stays the same; never start over with a new evidence directory. If that submit definitively failed, follow **Ambiguous or failed submissions** to release the key.

After the submit command returns, verify:

- Circle transaction state is confirmed and has a transaction hash.
- Portal reward status is `Refunded`.
- Each reward-token vault balance is zero or lower by the refunded amount.
- The fixed refund recipient's balance increased.
- The receipt includes `IntentRefunded` for the expected intent and recipient.

## Phase 3: Move backing-EOA USDC to the linked SCA

Skip this phase when the refund already reached the SCA. This is a standard USDC ERC-3009 transfer authorized by the backing EOA and relayed by its linked SCA; the procedure below covers the inputs, the signing script, the commands it prints, and troubleshooting:

READ `references/eoa-to-sca.md`.

Approval and verification, in order:

1. Confirm the backing EOA's USDC balance. Show the chain, USDC contract, backing EOA (from), SCA (to), and raw and decimal amount, and get explicit approval before signing.
2. Run the printed commands before the authorization expires: check it is unused, then run the `circle wallet execute ... --estimate` command.
3. Show the estimate and get explicit approval for the transfer and network fee, then run the printed submit command exactly once. It contains the raw signature: keep it out of the evidence directory and record a signature hash instead.

After the submit command returns, verify:

- Backing EOA USDC decreased by the exact amount.
- SCA USDC increased by the exact amount.
- `authorizationState(backing EOA, nonce)` is true.
- The receipt contains the expected USDC transfer.

## Ambiguous or failed submissions

Do not create a fresh authorization or idempotency key just because a client timed out.

The confirm step reuses the idempotency key saved for an intent, and Circle returns the same transaction for the same key. Release the key only when both are true:

- the Circle transaction for that key is `FAILED`, `DENIED` or `CANCELLED` (from the submit output, or `circle transaction list --address '<SCA>' --chain '<REFUND_CHAIN>' --operation execute --output json`), not pending or unknown;
- a fresh read-only preflight still shows reward status `Funded`.

Then move that intent's `*-eco-self-refund-submission-intent.json` file into a `released/` folder inside the evidence directory, keeping it as a record, and re-run the confirm step for a new key. Get the user's approval for the new submit as for the first.

For Eco refund ambiguity, check reward status, vault balance, recipient balance, transaction list, and `IntentRefunded` logs. If any proves success, record the result and stop.

For ERC-3009 ambiguity, check `authorizationState`, both USDC balances, transaction list, and transfer logs. A consumed nonce or completed balance movement proves the authorization was used. Never sign a second transfer until the first is reconciled.

If a signed authorization was never submitted, let its `validBefore` expire before creating another with the same amount unless onchain state proves the nonce unused and the original signature cannot be replayed by an unintended party.

If the `circle` CLI itself misbehaves (unexpected error, confusing output, missing capability), file feedback per the installed `use-circle-cli` skill's **Report friction (feedback)** section; if it isn't installed, fetch `https://agents.circle.com/skills/feedback.md`.

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

To deposit the recovered USDC into Gateway afterwards, use the installed `fund-agent-wallet` skill; if it isn't installed, fetch `https://agents.circle.com/skills/wallet-fund.md`.

## Reference links

- Eco Portal contract: https://docs.eco.com/routes/architecture/portal
- Eco vaults: https://docs.eco.com/routes/architecture/vault
- Eco intent status (undocumented legacy endpoint): `POST https://quotes.eco.com/api/v3/intents/intentStatus`
- Eco contracts: https://github.com/eco/eco-routes
- EIP-3009: https://eips.ethereum.org/EIPS/eip-3009
- Circle USDC contracts: https://developers.circle.com/stablecoins/usdc-contract-addresses
- Circle Agent Wallet setup: the `use-agent-wallet` skill, or `https://agents.circle.com/skills/wallet-login.md`

---

DISCLAIMER: This skill is provided "as is" without warranties, is subject to the [Circle Developer Terms](https://console.circle.com/legal/developer-terms), and output generated may contain errors. Review every address, amount, deadline, contract, simulation, fee, and approval before broadcasting a transaction.
