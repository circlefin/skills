# Installation and login

Detailed command reference for installing the Circle CLI and completing the email + OTP login. See `../SKILL.md` for the overall bootstrap workflow and decision logic.

## Installing the CLI

If not installed:

```bash
npm install -g @circle-fin/cli
```

`circle --version` also surfaces any server-driven update notice (never blocks). If one prints, suggest `npm install -g @circle-fin/cli@latest` — but only when contextually relevant (session start, or unexpected output), not on every command.

## Login (email + OTP, two-step non-interactive flow)

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
