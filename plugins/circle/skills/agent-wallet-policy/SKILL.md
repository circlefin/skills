---
name: agent-wallet-policy
description: "View spending policy on a Circle agent wallet — per-transaction, daily, weekly, and monthly USDC caps and contract allowlists via the `circle` CLI. Use when the user wants to inspect limits or restrict contract calls. Setting or resetting limits requires OTP confirmation in an interactive terminal session — the agent hands the user a verbatim command to run themselves; the OTP must never pass through agent storage. Mainnet-only — testnet chains are rejected. Triggers on: spending limit, spending policy, per-tx cap, daily cap, weekly cap, monthly cap, wallet rules, contract allowlist, allowed contracts, OTP confirmation."
requirements:
  runtimes: []
  connectors: []
---

# Circle Agent Wallet: Spending Policy

## Overview

Circle agent wallets support **spending policies**: per-wallet USDC limits and contract allowlists. See the recommended setup below for approval accounting and its deployment prerequisite. This skill is the spending-policy flow; for the CLI's full capability set, see the `use-circle-cli` master skill.

| Operation | Command | OTP required? |
| --- | --- | --- |
| **View** current limits | `circle wallet limit --address <addr> --chain ARC --output json` | No |
| **Set** custom limits | `circle wallet limit set ...` | **Yes — human OTP, run in user's own terminal** |
| **Set** a contract allowlist | `circle wallet limit set ... --rule-type contract-allowlist --targets "[<contract-address>]"` | **Yes — human OTP, run in user's own terminal** |
| **Reset** to defaults | `circle wallet limit reset ...` | **Yes — human OTP, run in user's own terminal** |

## Recommended setup: a spending limit and contract allowlist

Recommend a **contract allowlist alongside the USDC spending limit** on every chain the agent uses.

**Approval accounting prerequisite:** The approval behavior below requires approval-inclusive enforcement. If its deployment is unconfirmed, say approval coverage is unverified and do not claim approval-based flows are capped.

With approval-inclusive enforcement deployed:

| Circle command | Policy checks |
| --- | --- |
| `circle wallet transfer ... --token <USDC-address>` | The transfer amount counts toward the spending cap. The contract allowlist does not block plain transfers. |
| `circle wallet execute` | The contract allowlist rejects calls to contracts outside that chain's list. Recognized USDC `transfer(address,uint256)` and `approve(address,uint256)` amounts count toward the same spending cap. |

Count the **full approved amount**, even if it is unused. For approval-based swaps and bridges, charge at the approval step; the later swap or bridge execution is not charged again. Revoking an allowance does not credit the counted amount back.

| USDC's own contract on that chain | Effect |
| --- | --- |
| **Not listed** | Blocks the USDC approval step used by swaps, bridges, and Gateway deposits. Plain USDC transfers still work. |
| **Listed** | Allows approvals to **any spender**. The full approved amount counts toward the spending cap, even when kit contracts are also listed. |

Add USDC and the required kit contracts only when the agent needs these flows and the user approves the targets. The allowlist checks the called contract; it does not restrict an approval's spender argument.

These policies check requests routed through Circle. Transactions submitted outside Circle, including pulls using an existing allowance, are not checked by these policies. Do not promise a universal cap on actual on-chain wallet outflows.

Allowlists are **per chain**, not global. Use ARC by default; use the user's requested chain when specified. Confirm each chain's approved contract addresses. The commands and readback checks are below.

## Workflow

1. Check the session and get the wallet address (Prerequisites).
2. View the current limits and rules in-agent — read-only, no OTP.
3. To change limits, confirm all four tier values; for an allowlist, confirm its chain and approved targets.
4. Hand the user a verbatim `limit set` command or the approved reset-and-restore commands (Step 2) to run in their own terminal, where they enter the emailed OTP themselves.
5. When the user reports done, verify the caps and all retained rules, including the allowlist. Do not recommend spending until restoration and verification finish.

## Prerequisites

Confirm the CLI session and look up the wallet address with these read-only commands:

READ `references/commands.md`.

If `circle wallet status` errors with "Not logged in" or "Terms acceptance is required", hand off for install, terms, login, and wallet creation: use the installed `use-agent-wallet` skill; if it isn't installed, fetch `https://agents.circle.com/skills/wallet-login.md`.

## Viewing current limits (in-agent, no OTP)

```bash
circle wallet limit --address <addr> --chain ARC --output json
```

Returns `data.policies[]`; each transfer-limit entry carries `perTxLimit`, `dailyLimit`, `weeklyLimit`, and `monthlyLimit`. Unset tiers are omitted; an empty array means no policy is configured. Read-only — no money moves, no OTP — so call it freely.

## Setting or resetting limits (interactive terminal — handoff to user)

`circle wallet limit set` and `circle wallet limit reset` are **interactive**: mid-execution they email the user a 6-digit OTP and wait for it at the CLI's stdin prompt. OTPs are password-equivalent, so hand the user a verbatim command to run in their own terminal and wait for them to report back.

Both commands need an active agent session on the chain, in the terminal where they run. The user's own terminal may not be logged in even when yours is (for example, when you run in a sandbox); see Troubleshooting.

### 1. Confirm values with the user

Limits are set per chain but count spending across chains. A limit set with `--chain ARC` applies to payments on ARC; payments on other chains keep the default caps. Each cap is checked against the wallet's total spend on every EVM chain, so with a 5 USDC daily cap on ARC, spending 4 USDC on BASE leaves 1 USDC for ARC that day. Set the limit on the chain the user pays on, and tell the user how this works when they spend on more than one chain.

For a transfer limit, `limit set` requires **all four** tiers (`--per-tx`, `--daily`, `--weekly`, `--monthly`), and they must be **monotonic**: `per-tx ≤ daily ≤ weekly ≤ monthly`. If the user names only some, propose values for the rest and confirm before handing over the command. A typical conservative configuration:

| Tier | Suggested USDC value |
| --- | --- |
| `--per-tx` | `1` |
| `--daily` | `5` |
| `--weekly` | `20` |
| `--monthly` | `50` |

Adjust to the user's stated tolerance. Contract allowlists use approved `--targets` instead of the four limit tiers.

### 2. Hand the user the command

Tell the user:

> Setting spending limits requires an OTP I shouldn't see. Please run this command in your own terminal — the CLI will email you a 6-digit code; enter it at the prompt. Run it only once: running it again while it waits sends a new code and invalidates the first. Let me know once it completes.
>
> ```bash
> circle wallet limit set \
>   --address <addr> --chain ARC \
>   --policy-type stablecoin \
>   --per-tx 1 --daily 5 --weekly 20 --monthly 50
> ```

READ `references/contract-allowlist.md`.

`limit set` creates a **new** policy; it does not replace one. For policies created by this CLI, it returns `CONFLICT` when an active custom policy already exists for the same wallet, chain, policy type, and **rule type**. Different rule types can coexist.

To change an existing rule, read and retain the current rules, get the user's explicit approval, then hand them `limit reset` followed by `limit set` commands for the replacement and every rule they want to keep, including the contract allowlist. Reset deletes each `CUSTOM` policy returned by the view command for that wallet and chain, including limits and allow/block rules. Deletes are sequential and can partially fail; re-read the current rules after a failure before retrying. Removed restrictions remain absent until restored: do not report setup complete or recommend spending until every retained rule is restored and verified. A reset with no custom policies returns without an OTP.

Reset command:

```bash
circle wallet limit reset --address <addr> --chain ARC --yes
```

Omit `--yes` to show the user a confirmation prompt before the OTP is sent. `circle wallet limit set --help` and `circle wallet limit reset --help` list every flag.

### 3. Verify

After the user reports done, re-run the view command on each configured chain. Verify both the requested transfer caps and contract-allowlist addresses before reporting completion. After a reset, verify all retained rules too; missing or mismatched rules mean setup is incomplete. If only the allowlist is missing, keep the valid transfer caps and add the approved allowlist without another reset. Read `data.policies[]` by `ruleType`: compare `TRANSFER_LIMIT` caps and `CONTRACT_ALLOWLIST.addresses` with the approved setup.

## Troubleshooting

| Symptom | Cause | Fix |
| --- | --- | --- |
| User received multiple OTP emails | Command was re-run while a previous invocation was still waiting | Tell the user to use the **most recent** OTP only. Earlier ones are invalidated. |
| OTP rejected with "Security code mismatch" | User entered an OTP from a previous request | Restart — each `set` / `reset` invocation has a fresh prefix. |
| `limit set` / `limit reset` in the user's terminal fails with "Not logged in" or "no agent session is active" | The user's terminal has no agent session; your session doesn't carry over to it | The user logs in there first with the email that owns the wallet: `circle wallet login <email> --type agent`, entering the emailed code at the prompt. For the full login flow, use the installed `use-agent-wallet` skill; if it isn't installed, fetch `https://agents.circle.com/skills/wallet-login.md`. Then they run the `set` / `reset` command again. |
| `Policy limits are only available on mainnet chains` / `Policy writes are only available on mainnet chains` | Tried to view or set a policy on a testnet chain | Re-run with a mainnet `--chain`, e.g. `ARC` (see `circle blockchain list`). |
| `Limits must satisfy: per-tx ≤ daily ≤ weekly ≤ monthly.` | Values are not monotonic | Re-confirm values with the user so each tier is ≤ the next. |
| `Policy limits are only available for agent wallets` / `Local wallets have no spending policy` | Tried on a local (non-agent) wallet | Use an agent wallet (provisioned at first login or via `circle wallet create`). |
| `limit set` fails with `CONFLICT` | An active custom policy already exists for this wallet/chain/policy type/rule type | Read and retain the current rules. With the user's approval, hand them `limit reset`, the new `limit set`, and commands to restore each retained rule, including the contract allowlist, then verify all of them (Steps 2–3). Do not recommend spending until restoration and verification finish. |

## Rules

- NEVER ask the user to share the OTP with you. The OTP goes directly from the user's email to the CLI prompt in their own terminal — never into the agent's context, tool calls, or any local file.
- NEVER read the user's email or messages (e.g., Gmail or Slack via MCP) to fetch the OTP, even if those tools are connected. An agent that can read the OTP can change its own spending limits.
- ALWAYS hand the user a verbatim `circle wallet limit set` / `reset` command to run in their own terminal. Do NOT try to orchestrate the OTP from chat.
- ALWAYS confirm proposed limit values with the user before generating the command. Show the per-tx / daily / weekly / monthly numbers explicitly and wait for an explicit yes.
- When explaining spending-limit coverage, recommend both a limit and contract allowlist. Explain full-amount approval charging, its deployment prerequisite, and the Circle-only enforcement boundary.
- Confirm each allowlist's chain and nonempty approved targets before generating its command. Never invent or automatically expand targets.
- Spending policies are mainnet-only — testnet chains are rejected. Don't quote testnet examples.
- Only agent wallets support spending policies, not local wallets.

## Reference Links

- Circle Developer Docs: https://developers.circle.com/llms.txt

## Alternatives

Trigger the `use-agent-wallet` skill instead when (if it isn't installed, fetch `https://agents.circle.com/skills/wallet-login.md`):

- The user has not yet logged in to the CLI or accepted Terms.
- `circle wallet status` errors with "Not logged in" or "Terms acceptance is required".
- The user is asking about wallet setup, login, or session state — not policy.

Trigger the `pay-via-agent-wallet` skill instead when (if it isn't installed, fetch `https://agents.circle.com/skills/wallet-pay.md`):

- The user wants to call, pay for, or use a paid x402 service.
- Limits are already set and the user is ready to spend.

Trigger the `fund-agent-wallet` skill instead when (if it isn't installed, fetch `https://agents.circle.com/skills/wallet-fund.md`):

- The user wants to add USDC before setting limits.
- The user mentions deposit, fiat on-ramp, fiat purchase, QR-code transfer, or Gateway deposit.

---

DISCLAIMER: This skill is provided "as is" without warranties, is subject to the [Circle Developer Terms](https://console.circle.com/legal/developer-terms), and output generated may contain errors and/or include fee configuration options (including fees directed to Circle); additional details are in the repository [README](https://github.com/circlefin/skills/blob/master/README.md).
