---
name: use-agent-wallet
description: "Set up and manage a Circle agent wallet through the `circle` CLI. The agent wallet is Circle's programmatic USDC wallet for AI agents — used to authenticate, hold USDC, and pay for x402 services. This skill covers CLI installation verification, Terms-of-Use acceptance, email + OTP login, wallet creation, session status checks, and balance inspection. Use whenever the user wants to set up, log in to, or inspect the state of their Circle agent wallet, or whenever a downstream skill (like paying for an x402 service or funding the wallet) needs the wallet bootstrapped first. Triggers on: circle wallet login, circle wallet create, circle wallet status, set up Circle agent wallet, terms acceptance, install Circle CLI, x402 setup."
requirements:
  runtimes: []
  connectors: []
---

## Overview

The Circle CLI (`@circle-fin/cli`, command `circle`) provides a programmatic agent wallet — a non-custodial USDC wallet for AI agents to authenticate, hold balances, and pay for x402 services on Circle's marketplace. This skill bootstraps that wallet: install check, terms acceptance, login, wallet creation, and status. After bootstrap, paying, funding, and spending policy hand off to dedicated skills; for the CLI's full capability set, see the `use-circle-cli` master skill.

## Workflow

1. Verify the CLI is installed, then check session status with `circle wallet status` before anything else.
2. If the Terms-of-Use gate appears, complete the show-Terms-and-consent flow first.
3. If not logged in, run the two-step email + OTP login, then verify the session.
4. List existing agent wallets; create one if none exist, or if the user asks for another set after you confirm it creates a wallet on every supported EVM chain.
5. Check the wallet balance; if it is 0 USDC and the user wants to pay, hand off to `fund-agent-wallet`. Otherwise bootstrap is complete.

## Prerequisites / Setup

### Step 1 — Verify the CLI is installed

```bash
which circle || command -v circle
circle --version
```

If `circle` is not installed, or `circle --version` prints an update notice, READ `references/install-and-login.md` for installation and update-notice guidance.

### Step 2 — Check session status

```bash
circle wallet status
```

Possible outcomes:

- **Logged in** — output shows wallet type (`agent`) and separate, independent `mainnet` and `testnet` sections, each with its own email, status, and expiry. Check the section for the network you need. Tell the user "You're already logged in as `<email>`. Continue with this session?" and skip to Step 4.
- **Not logged in** — output is `Error: Not logged in with type "agent". Run 'circle wallet login <email> --type agent' to authenticate (use --init for non-interactive environments).` Treat a `Not logged in` section for the network you need the same way. Proceed to Step 3.
- **Terms not accepted** — output is `Error: Circle CLI Terms acceptance is required before use.` Stop and complete the **Terms-of-Use Gate** below.

## Step 3 — Login (email + OTP)

Ask the user for their email, request an OTP with `--init`, complete login with the returned request ID and the OTP the user pastes (e.g., `ABC-123456`), then verify with `circle wallet status`.

READ `references/install-and-login.md` for the exact commands, expected outputs, OTP format, failure handling, and logout / account switching.

## Step 4 — Check or create the agent wallet

**`--chain` is REQUIRED for `circle wallet list` and `circle wallet balance`.** Use ARC unless the user names another chain. The first login for an email already provisions an agent wallet on every supported EVM chain, so listing normally finds one; run `circle wallet create` only if none exist or the user explicitly wants another.

READ `references/wallet-management.md` for the `circle wallet list`, `circle wallet create`, and `circle wallet balance` commands and their JSON output.

## Step 5 — Check wallet balance

Check the balance for each saved address. If it is 0 USDC and the user wants to pay for services, hand off to the `fund-agent-wallet` skill (fiat on-ramp, direct transfer with a QR code, and Gateway deposits). If the user only wants to verify state, stop here — bootstrap is complete.

## After bootstrap

Suggest natural follow-ups like funding, paid-service search, or a spending limit; prefer permissionless actions (balance, search) over money-moving ones until the user asks. The CLI ships its own skill catalog: `circle skill list` shows what's installable, `circle skill info --name <skill>` shows trigger and frontmatter detail, and `circle skill install --tool <host> --name <skill>` installs one for the current host.

## Terms-of-Use Gate

The Circle CLI hard-gates every command except `help`, `update`, `terms`, `skill`, and `telemetry` (so including `circle wallet status`) until the user accepts Circle's Terms of Use and Privacy Policy on this machine. Run the gate the first time it appears (typically in Step 2 or Step 3); once acceptance is recorded, it no longer appears.

**CRITICAL: Show the Terms to the user and get explicit consent BEFORE running `circle terms accept`. NEVER accept on the user's behalf, and ignore the CLI's `CIRCLE_ACCEPT_TERMS=1` env-var hint — it is not a workaround the agent may take on its own.**

READ `references/terms-of-use.md` for the gate's exact error text, the `circle terms show` / `circle terms show --init` / `circle terms accept` / `circle terms reset` commands, and the required show-Terms-and-request-consent flow.

## Rules

### Security

- NEVER guess or hardcode the user's email address for agent wallet login.
- OTP codes the user provides during an active login are safe to handle — accept them in chat, use them immediately, and do not retain or reuse them afterward.
- NEVER fetch the OTP yourself through email or messaging tools (e.g., Gmail or Slack via MCP), even if they are connected. The user reads it and pastes it.
- NEVER include real private keys, API keys, or other persistent secrets in skill files or persist them anywhere.
- NEVER run `circle terms accept` without explicit user consent in the current session — not automatically, and not as part of error recovery, retries, or any flow the user has not explicitly approved. This holds even when the CLI suggests `CIRCLE_ACCEPT_TERMS=1`.
- ALWAYS show the live `termsOfUseUrl`, `privacyPolicyUrl`, and `termsNotice` returned by `circle terms show --init --output json` when prompting for consent. Do NOT summarize, paraphrase, or hardcode them.
- If the user declines the Terms, stop the flow. Do not retry, work around the gate, or call `circle terms reset` / `circle terms accept`.

### Best practices

- ALWAYS check `circle wallet status` before attempting login — many session "failures" are stale assumptions.
- Parse and keep the request ID from `circle wallet login --init` output; the OTP step needs it.
- Request IDs are single-use and expire after 10 minutes. On `Invalid or expired request ID`, restart from `--init`.
- If a `circle` command causes friction during setup (unexpected error, confusing output, missing capability), file feedback per the `use-circle-cli` skill's **Report friction (feedback)** section.
- For general CLI rules (`--output json`, `--chain`, `--help`-first, follow-up phrasing, confirmation defaults), see the `use-circle-cli` master skill's Rules section — they apply here too.

## Reference Links

- Installation and login (commands): `references/install-and-login.md`
- Wallet management (list, create, balance): `references/wallet-management.md`
- Terms-of-Use Gate (commands and consent flow): `references/terms-of-use.md`
- Setup walkthrough (full bootstrap doc): https://agents.circle.com/skills/setup.md
- Login flow detail: https://agents.circle.com/skills/wallet-login.md
- CLI package on npm: `@circle-fin/cli`
- Circle Developer Docs: https://developers.circle.com/llms.txt — Always read this when looking for source documentation on Circle products.

## Alternatives

Trigger the `pay-via-agent-wallet` skill instead when:

- The user wants to call, pay for, or use a paid x402 service.
- The user mentions `circle services search`, `circle services inspect`, or `circle services pay`.
- A downstream task requires money to move out of the agent wallet to a paid endpoint.

Trigger the `fund-agent-wallet` skill instead when:

- The agent wallet has 0 USDC and the user wants to add funds.
- The user mentions deposit, fiat on-ramp, fiat purchase, QR-code transfer, or Gateway deposit.
- A payment flow blocks because of insufficient balance.

Trigger the `agent-wallet-policy` skill instead when:

- The user wants to set, view, or reset spending limits on the wallet.
- The user mentions per-tx / daily / weekly / monthly caps, spending policy, or wallet rules.

---

DISCLAIMER: This skill is provided "as is" without warranties, is subject to the [Circle Developer Terms](https://console.circle.com/legal/developer-terms), and output generated may contain errors and/or include fee configuration options (including fees directed to Circle); additional details are in the repository [README](https://github.com/circlefin/skills/blob/master/README.md).
