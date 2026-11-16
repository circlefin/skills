### 3a. Request a one-time code

Ask the user: "What email address would you like to use for your Circle agent wallet?" Then:

```bash
circle wallet login '<user-email>' --type agent --init
```

`--type` defaults to `agent`; pass it explicitly anyway to match the Step 2 error text.

Expected output:

```
OTP code sent to user@example.com
Please run: circle wallet login --request <request-id> --otp <code>
```

Save the request ID (a UUID) from the output; the next step needs it. Request IDs are single-use and expire after 10 minutes, so complete 3b promptly.

The CLI also prints a warning (on stderr; the `warning` field with `--output json`) telling the user never to give an AI agent access to their email, since anyone who can read the OTP can log in and change spending policies. Relay it to the user.

### 3b. Complete login with the code

Tell the user: "An OTP code has been sent to your email. Please read it and paste it here (format: ABC-123456 or just the 6 digits)." Then:

```bash
circle wallet login --type agent --request '<request-id>' --otp '<user-otp>'
```

OTP format:

- Full form: a 3-character prefix of letters and digits, a dash, then 6 digits, e.g. `B1X-123456`
- Bare digits: `123456` — the CLI prepends the cached prefix automatically
- The CLI checks that the prefix matches the one it sent (anti-phishing)

On success, output is:

```
Logged in as user@example.com
```

Tell the user "Successfully logged in" and continue.

### 3c. Verify the session

```bash
circle wallet status
```

Confirms the session and shows its expiry. Proceed to Step 4.

### If login fails

Tell the user what happened; do NOT loop silently.

| Error | What to do |
|---|---|
| `Invalid or expired request ID` | The request was already used or is over 10 minutes old. Restart from 3a for a fresh code. |
| `OTP prefix mismatch` | The user likely pasted a code from an earlier request. Ask for the most recent code in their email; if it still fails, restart from 3a. |
| `Invalid or expired OTP code` or `Invalid OTP format` | Ask the user to check the code. If it still fails, restart from 3a. |
| `fetch failed` | Check connectivity and try once more. If the environment routes traffic through an HTTP proxy, re-run the command with `NODE_USE_ENV_PROXY=1` in front (needs Node.js 22.21+ or 24+). |
| `Circle CLI Terms acceptance is required before use.` | Complete the Terms-of-Use Gate first, then restart from 3a. |

Each `--init` sends a new code and invalidates the previous one, so do not start a second login while one is in progress.

### Logging out / switching accounts

```bash
circle wallet logout
```

Use only when the user explicitly asks to switch accounts. It clears both the mainnet and testnet sessions. Then log in again from 3a.
