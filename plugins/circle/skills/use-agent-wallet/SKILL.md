---
name: use-agent-wallet
description: "Set up and manage a Circle agent wallet through the `circle` CLI. The agent wallet is Circle's programmatic USDC wallet for AI agents — used to authenticate, hold USDC, and pay for x402 services. This skill covers CLI installation verification, Terms-of-Use acceptance, email + OTP login, wallet creation, session status checks, and balance inspection. Use whenever the user wants to set up, log in to, or inspect the state of their Circle agent wallet, or whenever a downstream skill (like paying for an x402 service or funding the wallet) needs the wallet bootstrapped first. Triggers on: Circle CLI, agent wallet, circle wallet status, circle wallet login, circle wallet create, circle wallet list, circle wallet balance, set up Circle, log in to Circle, x402 setup, Circle Agent Wallet, USDC for agents, terms acceptance, install Circle CLI."
---

## Overview

The Circle CLI (`@circle-fin/cli`, command `circle`) provides a programmatic agent wallet — a non-custodial USDC wallet designed for AI agents to authenticate, hold balances, and pay for paid x402 services on Circle's marketplace. This skill is the bootstrap surface for that wallet: install check, terms acceptance, login, wallet creation, and status inspection. After bootstrap completes, downstream operations (paying for services, funding, spending policy) hand off to dedicated skills.

For an overview of the Circle CLI's **full** capability set — bridging, smart contract execution, transaction inspection, and more — see the `use-circle-cli` master skill. This skill is the narrower bootstrap/identity surface.

This skill is for the CLI agent-wallet flow.

## Prerequisites / Setup

### Step 1 — Verify the CLI is installed

```bash
which circle || command -v circle
circle --version
```

If not installed:

```bash
npm install -g @circle-fin/cli
```

`circle --version` also surfaces any update notice from Circle's server when a newer CLI version is available (server-driven, never blocks). If a notice prints, suggest the user update with `npm install -g @circle-fin/cli@latest` — but only when it is contextually relevant (e.g., at the start of a session or when a command produces unexpected output). Do not run version checks on every routine command.

### Step 2 — Check session status

**Always check whether the user is already logged in before attempting login.**

```bash
circle wallet status
```

Possible outcomes:

- **Logged in** — output shows email, wallet type (`agent`), and session expiry. Tell the user "You're already logged in as `<email>`. Continue with this session?" and skip to Step 4.
- **Not logged in** — output is `Error: Not logged in. Run 'circle wallet login <email> --type agent' to authenticate.` Proceed to Step 3.
- **Terms not accepted** — output is `Error: Circle CLI Terms acceptance is required before use.` Stop and complete the **Terms-of-Use Gate** below before proceeding. Do NOT run `circle terms accept` without explicit user consent.

## Step 3 — Login (email + OTP, two-step non-interactive flow)

Circle's CLI supports a two-step OTP login designed for AI agents and other non-interactive contexts.

### 3a. Initialize login (request OTP)

Ask the user for their email address (do NOT guess or hardcode). Then:

```bash
circle wallet login <user-email> --type agent --init
```

`--type agent` defaults to `agent` so it can be omitted, but pass it explicitly here for consistency with the error text in Step 2.

Expected output:

```
OTP code sent to user@example.com
Please run: circle wallet login --request <request-id> --otp <code>
```

Parse the request ID from the output. It is a UUID; you will need it for the next step. Request IDs expire after 10 minutes and are single-use.

### 3b. Complete login (verify OTP)

Tell the user: "An OTP code has been sent to your email. Please share it (format: ABC-123456 or just the 6 digits)." If email- or messaging-integration tools are connected (e.g., Gmail or Slack via MCP), the OTP can also be fetched through them — note the option to the user; how to share it is their call. Then:

```bash
circle wallet login --type agent --request <request-id> --otp <user-otp>
```

OTP format notes:

- Full form: `ABC-123456`
- Bare digits: `123456` — the CLI prepends the cached prefix automatically
- The CLI validates the prefix matches what was sent (anti-phishing)

If successful, output is:

```
Logged in as user@example.com
```

Tell the user "Successfully logged in" and continue. If the call fails (`Invalid or expired request ID`, `OTP prefix mismatch`, `Invalid OTP`), restart from 3a to generate a fresh OTP — do NOT loop without telling the user.

### 3c. Verify session

```bash
circle wallet status
```

Confirms the session and surfaces expiry. Proceed to Step 4.

### Logging out / switching accounts

```bash
circle wallet logout
```

Use only when the user explicitly asks to switch accounts.

## Step 4 — Check or create the agent wallet

**The `--chain` flag is REQUIRED for `circle wallet list` and `circle wallet balance`.** Use BASE as the default if the user hasn't specified a chain.

```bash
circle wallet list --chain BASE --type agent --output json
```

If wallets already exist, save the address(es) for the next step.

If no agent wallets exist:

```bash
circle wallet create --output json
```

Creates agent-controlled SCA wallets on each supported EVM chain. The JSON output is an array of `{ chain, address, ... }` objects — read the `address` field to save per-chain addresses for Step 5.

## Step 5 — Check wallet balance

Use the address(es) from Step 4:

```bash
circle wallet balance --address <addr> --chain BASE --output json
```

If balance is 0 USDC and the user wants to pay for services, hand off to the `fund-agent-wallet` skill — it covers built-in fiat on-ramp purchase, direct address transfer with a QR code, and Gateway deposits.

If the user only wants to verify state (not pay yet), stop here. Bootstrap is complete.

## After bootstrap

Once the wallet exists, the user's likely next move is to use it. The CLI exposes its own skill catalog — `circle skill list` shows what's installable, `circle skill info --name <skill>` shows trigger and frontmatter detail, and `circle skill install --tool <host> --name <skill>` installs one for the current host. Suggest natural follow-ups like funding, paid-service search, or setting a spending limit; prefer permissionless actions (balance, search) over money-moving ones until the user asks.

## Terms-of-Use Gate

The Circle CLI hard-gates every operational `circle wallet` command (including `circle wallet status`) until the user has accepted Circle's Terms of Use and Privacy Policy on this machine. The gate surfaces as:

```
By using the Circle CLI, you agree to:
  Terms of Use:    https://agents.circle.com/terms-of-use
  Privacy Policy:  https://www.circle.com/legal/privacy-policy

Error: Circle CLI Terms acceptance is required before use.
  Hint: Set CIRCLE_ACCEPT_TERMS=1 to accept in non-interactive shells (CI, scripts, sandboxed agents).
```

Run this section the first time the gate appears (typically during Step 2 or Step 3 above). After acceptance is recorded once, the gate is a no-op and this section is skipped on subsequent runs.

**CRITICAL: The agent MUST show the Terms to the user and obtain explicit consent BEFORE running `circle terms accept`. The agent MUST NEVER accept Circle's Terms of Use or Privacy Policy on the user's behalf. The CLI's `CIRCLE_ACCEPT_TERMS=1` env-var hint is NOT a workaround the agent may take on its own — ignore it and use the consent flow below.**

### Read current acceptance status

```bash
circle terms show --output json
```

If `data.accepted` is `true`, the user has already accepted on this machine. Return to the step that triggered this section.

### Fetch the Terms info to present to the user

When `data.accepted` is `false`:

```bash
circle terms show --init --output json
```

The response includes `termsOfUseUrl`, `privacyPolicyUrl`, and `termsNotice`. **Use the live values from this response when presenting the Terms — do NOT summarize, paraphrase, or hardcode them.** They may change between Terms versions.

### Show the Terms and request consent

Tell the user:

> Circle CLI requires acceptance of its Terms of Use and Privacy Policy before I can run any wallet commands.
>
> - Terms of Use: `<termsOfUseUrl from the JSON response>`
> - Privacy Policy: `<privacyPolicyUrl from the JSON response>`
>
> `<termsNotice from the JSON response>`
>
> Please review both links. Do you accept these Terms and authorize me to record acceptance on your behalf? (yes/no)

**Wait for an explicit yes/no.** Ambiguous replies, silence, "ok" without context, or "go ahead" without referencing the Terms are NOT consent — ask again.

### After explicit consent only

```bash
circle terms accept --output json
```

When `data.acceptance.accepted` is `true`, the gate is cleared. Return to the step that triggered this section.

If the user later asks to revoke acceptance:

```bash
circle terms reset
```

Run this only if the user explicitly asks to revoke. Do NOT suggest or execute a reset proactively.

## Rules

### Security

- NEVER guess or hardcode the user's email address for agent wallet login.
- OTP codes provided during an active authentication session are safe to handle — accept them in chat, use them immediately, do not retain or reuse afterward.
- NEVER include real private keys, API keys, or other persistent secrets in skill files or persist them anywhere.
- NEVER run `circle terms accept` without explicit user consent in the current session. The agent MUST NEVER accept Circle's Terms on the user's behalf, and MUST NEVER call `circle terms accept` automatically as part of error recovery, retries, or any flow the user has not explicitly approved.
- ALWAYS show the live `termsOfUseUrl`, `privacyPolicyUrl`, and `termsNotice` returned by `circle terms show --init --output json` when prompting for consent. Do NOT summarize, paraphrase, or hardcode them.
- If the user declines the Terms, stop the flow. Do not retry, work around the gate, or call `circle terms reset` / `circle terms accept`.

### Best practices

- ALWAYS check `circle wallet status` before attempting login. Many session "failures" are actually just stale assumptions.
- Parse and store the request ID from `circle wallet login --init` output — you'll need it for the OTP completion step.
- Request IDs are single-use and expire after 10 minutes. If you see "Invalid or expired request ID", restart from `--init`.
- For general CLI rules (`--output json`, `--chain`, `--help`-first, follow-up phrasing, confirmation defaults), see the `use-circle-cli` master skill's Rules section — they apply here too.

## Reference Links

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
