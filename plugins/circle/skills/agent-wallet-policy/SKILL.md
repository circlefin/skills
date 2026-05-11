---
name: agent-wallet-policy
description: "View spending policy on a Circle agent wallet — per-transaction, daily, weekly, and monthly USDC caps via the `circle` CLI. Use when the user wants to inspect current limits. Setting or resetting limits requires OTP confirmation in an interactive terminal session — the agent hands the user a verbatim command to run themselves; the OTP must never pass through agent storage. Mainnet-only — testnet chains are rejected. Triggers on: spending limit, spending policy, wallet limit, per-tx cap, daily cap, weekly cap, monthly cap, set spending limit, reset spending limit, wallet rules, spending cap, OTP confirmation."
---

## Overview

For an overview of the Circle CLI's **full** capability set, see the `use-circle-cli` master skill. This skill is the narrower spending-policy flow.

Circle agent wallets support **spending policies** — per-wallet caps that the CLI enforces on every payment and transfer. There are three operations:

| Operation | Command | OTP required? |
|---|---|---|
| **View** current limits | `circle wallet limit --address <addr> --chain BASE --output json` | No |
| **Set** custom limits | `circle wallet limit set ...` | **Yes — human OTP, run in user's own terminal** |
| **Reset** to defaults | `circle wallet limit reset ...` | **Yes — human OTP, run in user's own terminal** |

Spending policies are **mainnet-only**. Testnet chains return an error if you try to set a policy.

## Prerequisites

```bash
# Confirm session is good
circle wallet status

# Get the wallet address
circle wallet list --chain BASE --type agent --output json
```

If `circle wallet status` errors with "Not logged in" or "Terms acceptance is required", hand off to the `use-agent-wallet` skill — it covers install, terms, login, and wallet creation.

## Viewing current limits (in-agent, no OTP)

```bash
circle wallet limit --address <addr> --chain BASE --output json
```

Shows the current per-tx, daily, weekly, and monthly USDC caps (`null` for any unset tier). Safe to call freely — read-only, no money moves, no OTP.

## Setting or resetting limits (interactive terminal — handoff to user)

`circle wallet limit set` and `circle wallet limit reset` are **interactive**. They send a 6-digit OTP to the user's email mid-execution and wait for the code at the CLI's stdin prompt.

**OTPs are password-equivalent. The agent must NOT receive, store, or relay the OTP.** The agent's job here is to hand the user a verbatim command to run in their own terminal, then wait for them to report back.

### Step 1 — Confirm values with the user

Limits must be **monotonic**: `per-tx ≤ daily ≤ weekly ≤ monthly`.

A typical conservative configuration:

| Tier | Suggested USDC value |
|---|---|
| `--per-tx` | `1` |
| `--daily` | `5` |
| `--weekly` | `20` |
| `--monthly` | `50` |

Adjust based on the user's stated tolerance. Get explicit yes before generating the command.

### Step 2 — Hand the user the command

Tell the user:

> Setting spending limits requires an OTP I shouldn't see. Please run this command in your own terminal — the CLI will email you a 6-digit code; enter it at the prompt. Let me know once it completes.
>
> ```bash
> circle wallet limit set \
>   --address <addr> --chain BASE \
>   --policy-type stablecoin \
>   --per-tx 1 --daily 5 --weekly 20 --monthly 50
> ```

For reset, the verbatim command is:

```bash
circle wallet limit reset --address <addr> --chain BASE --yes
```

Omit `--yes` if you want the user to see a confirmation prompt before the OTP is sent.

### Step 3 — Verify after the user reports done

```bash
circle wallet limit --address <addr> --chain BASE --output json
```

Confirms the new caps. Surface them to the user.

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| User received multiple OTP emails | Command was re-run while a previous invocation was still waiting | Tell the user to use the **most recent** OTP only. Earlier ones are invalidated. |
| OTP rejected with "prefix mismatch" | User entered an OTP from a previous request | Restart — each `set` / `reset` invocation has a fresh prefix. |
| `Spending policies are mainnet-only` | Tried to set a policy on a testnet chain | Re-run with a mainnet `--chain` value (`BASE`, `MATIC`, etc.). |
| `Limits must be monotonic` | per-tx > daily, daily > weekly, etc. | Re-check the values. `per-tx ≤ daily ≤ weekly ≤ monthly`. |
| `Only agent wallets support spending policies` | Tried on a local (non-agent) wallet | Spending policies apply only to agent wallets created via `circle wallet create`. |

## Rules

- NEVER ask the user to share the OTP with you. The OTP must go directly from the user's email to the CLI prompt in their own terminal — it should never touch the agent's context, tool calls, or any local file.
- If email- or messaging-integration tools are connected (e.g., Gmail or Slack via MCP), the OTP can also be fetched through them — note the option to the user; how to handle it is their call.
- ALWAYS hand the user a verbatim `circle wallet limit set` / `reset` command for them to run in their own terminal. Do NOT try to orchestrate the OTP from chat.
- ALWAYS confirm proposed limit values with the user before generating the command. Show the per-tx / daily / weekly / monthly numbers explicitly and wait for explicit yes.
- Spending policies are mainnet-only — testnet chains are rejected. Don't quote testnet examples.
- Only agent wallets support spending policies, not local wallets.
- After the user reports the change is done, run `circle wallet limit --address <addr> --chain BASE --output json` so the user sees the new caps.

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
