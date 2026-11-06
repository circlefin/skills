---
name: agent-wallet-policy
description: "View spending policy on a Circle agent wallet — per-transaction, daily, weekly, and monthly USDC caps via the `circle` CLI. Use when the user wants to inspect current limits. Setting or resetting limits requires OTP confirmation in an interactive terminal session — the agent hands the user a verbatim command to run themselves; the OTP must never pass through agent storage. Mainnet-only — testnet chains are rejected. Triggers on: spending limit, spending policy, per-tx cap, daily cap, weekly cap, monthly cap, wallet rules, OTP confirmation."
requirements:
  runtimes: []
  connectors: []
---

## Overview

Circle agent wallets support **spending policies**: per-wallet USDC caps that the CLI enforces on every payment and transfer. This skill is the spending-policy flow; for the CLI's full capability set, see the `use-circle-cli` master skill.

| Operation | Command | OTP required? |
| --- | --- | --- |
| **View** current limits | `circle wallet limit --address <addr> --chain ARC --output json` | No |
| **Set** custom limits | `circle wallet limit set ...` | **Yes — human OTP, run in user's own terminal** |
| **Reset** to defaults | `circle wallet limit reset ...` | **Yes — human OTP, run in user's own terminal** |

## Prerequisites

READ `references/commands.md` for the session check (`circle wallet status`) and wallet-address lookup (`circle wallet list ... --output json`).

If `circle wallet status` errors with "Not logged in" or "Terms acceptance is required", hand off to the `use-agent-wallet` skill — it covers install, terms, login, and wallet creation.

## Viewing current limits (in-agent, no OTP)

```bash
circle wallet limit --address <addr> --chain ARC --output json
```

Returns `data.policies[]`; each transfer-limit entry carries `perTxLimit`, `dailyLimit`, `weeklyLimit`, and `monthlyLimit`. Unset tiers are omitted; an empty array means no policy is configured. Read-only — no money moves, no OTP — so call it freely.

## Setting or resetting limits (interactive terminal — handoff to user)

`circle wallet limit set` and `circle wallet limit reset` are **interactive**: mid-execution they email the user a 6-digit OTP and wait for it at the CLI's stdin prompt. OTPs are password-equivalent, so hand the user a verbatim command to run in their own terminal and wait for them to report back.

### 1. Confirm values with the user

`limit set` requires **all four** tiers (`--per-tx`, `--daily`, `--weekly`, `--monthly`), and they must be **monotonic**: `per-tx ≤ daily ≤ weekly ≤ monthly`. If the user names only some, propose values for the rest and confirm before handing over the command. A typical conservative configuration:

| Tier | Suggested USDC value |
| --- | --- |
| `--per-tx` | `1` |
| `--daily` | `5` |
| `--weekly` | `20` |
| `--monthly` | `50` |

Adjust to the user's stated tolerance.

### 2. Hand the user the command

Tell the user:

> Setting spending limits requires an OTP I shouldn't see. Please run this command in your own terminal — the CLI will email you a 6-digit code; enter it at the prompt. Let me know once it completes.
>
> ```bash
> circle wallet limit set \
>   --address <addr> --chain ARC \
>   --policy-type stablecoin \
>   --per-tx 1 --daily 5 --weekly 20 --monthly 50
> ```

`limit set` only creates a **new** policy; it fails with `CONFLICT` if a custom policy already exists for that wallet, chain, and policy type. To change existing limits, hand the user `limit reset` first, then `limit set` again. `limit reset` deletes **every** custom policy for that wallet and chain (all limits and allow/block rules), so get the user's explicit approval and re-apply anything they want to keep.

Reset command:

```bash
circle wallet limit reset --address <addr> --chain ARC --yes
```

Omit `--yes` to show the user a confirmation prompt before the OTP is sent.

### 3. Verify

After the user reports done, re-run the view command above and show the user the new caps.

## Troubleshooting

| Symptom | Cause | Fix |
| --- | --- | --- |
| User received multiple OTP emails | Command was re-run while a previous invocation was still waiting | Tell the user to use the **most recent** OTP only. Earlier ones are invalidated. |
| OTP rejected with "Security code mismatch" | User entered an OTP from a previous request | Restart — each `set` / `reset` invocation has a fresh prefix. |
| `Policy limits are only available on mainnet chains` / `Policy writes are only available on mainnet chains` | Tried to view or set a policy on a testnet chain | Re-run with a mainnet `--chain` value (`BASE`, `MATIC`, etc.). |
| `Limits must satisfy: per-tx ≤ daily ≤ weekly ≤ monthly.` | Values are not monotonic | Re-confirm values with the user so each tier is ≤ the next. |
| `Policy limits are only available for agent wallets` / `Local wallets have no spending policy` | Tried on a local (non-agent) wallet | Use an agent wallet (provisioned at first login or via `circle wallet create`). |
| `limit set` fails with `CONFLICT` | A custom policy already exists for this wallet/chain/policy type | With the user's approval (reset clears every custom policy), hand them `limit reset`, then `limit set` (Step 2). |

## Rules

- NEVER ask the user to share the OTP with you. The OTP goes directly from the user's email to the CLI prompt in their own terminal — never into the agent's context, tool calls, or any local file.
- NEVER read the user's email or messages (e.g., Gmail or Slack via MCP) to fetch the OTP, even if those tools are connected. An agent that can read the OTP can change its own spending limits.
- ALWAYS hand the user a verbatim `circle wallet limit set` / `reset` command to run in their own terminal. Do NOT try to orchestrate the OTP from chat.
- ALWAYS confirm proposed limit values with the user before generating the command. Show the per-tx / daily / weekly / monthly numbers explicitly and wait for an explicit yes.
- Spending policies are mainnet-only — testnet chains are rejected. Don't quote testnet examples.
- Only agent wallets support spending policies, not local wallets.

## Reference Links

- Full policy walkthrough (extended examples, edge cases): https://agents.circle.com/skills/wallet-policy.md
- Circle Developer Docs: https://developers.circle.com/llms.txt

## Alternatives

Trigger the `use-agent-wallet` skill instead when:

- The user has not yet logged in to the CLI or accepted Terms.
- `circle wallet status` errors with "Not logged in" or "Terms acceptance is required".
- The user is asking about wallet setup, login, or session state — not policy.

Trigger the `pay-via-agent-wallet` skill instead when:

- The user wants to call, pay for, or use a paid x402 service.
- Limits are already set and the user is ready to spend.

Trigger the `fund-agent-wallet` skill instead when:

- The user wants to add USDC before setting limits.
- The user mentions deposit, fiat on-ramp, fiat purchase, QR-code transfer, or Gateway deposit.

---

DISCLAIMER: This skill is provided "as is" without warranties, is subject to the [Circle Developer Terms](https://console.circle.com/legal/developer-terms), and output generated may contain errors and/or include fee configuration options (including fees directed to Circle); additional details are in the repository [README](https://github.com/circlefin/skills/blob/master/README.md).
