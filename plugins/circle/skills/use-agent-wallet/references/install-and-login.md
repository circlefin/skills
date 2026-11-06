# Installation and login

## Installing the CLI

If not installed:

```bash
npm install -g @circle-fin/cli
```

`circle --version` also prints an update notice when npm has a newer `@circle-fin/cli` (never blocks). If one prints, suggest `npm install -g @circle-fin/cli@latest` — only when contextually relevant (session start, or unexpected output), not on every command.

## Login (email + OTP, two-step non-interactive flow)

### 3a. Initialize login (request OTP)

Ask the user for their email address, then:

```bash
circle wallet login <user-email> --type agent --init
```

`--type` defaults to `agent`; pass it explicitly anyway to match the Step 2 error text.

Expected output:

```
OTP code sent to user@example.com
Please run: circle wallet login --request <request-id> --otp <code>
```

Parse the request ID (a UUID) from the output; the next step needs it.

The CLI also prints a warning (on stderr; the `warning` field with `--output json`) telling the user never to give an AI agent access to their email, since anyone who can read the OTP can log in and change spending policies. Relay it to the user.

### 3b. Complete login (verify OTP)

Tell the user: "An OTP code has been sent to your email. Please read it and paste it here (format: ABC-123456 or just the 6 digits)." Then:

```bash
circle wallet login --type agent --request <request-id> --otp <user-otp>
```

OTP format:

- Full form: `ABC-123456`
- Bare digits: `123456` — the CLI prepends the cached prefix automatically
- The CLI validates that the prefix matches what was sent (anti-phishing)

On success, output is:

```
Logged in as user@example.com
```

Tell the user "Successfully logged in" and continue. If the call fails (`Invalid or expired request ID`, `OTP prefix mismatch`, `Invalid or expired OTP code`, `Invalid OTP format`), tell the user and restart from 3a for a fresh OTP — do NOT loop silently.

### 3c. Verify session

```bash
circle wallet status
```

Confirms the session and shows its expiry. Proceed to Step 4.

### Logging out / switching accounts

```bash
circle wallet logout
```

Use only when the user explicitly asks to switch accounts.
