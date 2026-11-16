# Circle CLI Feedback

`circle feedback submit` sends a bug report, a question, or product feedback about the Circle CLI itself to the Circle CLI team. Feedback is stored in Circle's product database and reviewed by humans.

## When to submit

There are two cases.

**1. You notice CLI friction: submit proactively.** When a trigger below is met, run the command yourself. It is a routine, low-risk action: no funds move, and the message is filtered for sensitive information locally.

- **Submit when:** a command errors unexpectedly or contradicts its own `--help`; output or flags are confusing; a needed capability is missing; the user complains about the CLI.
- **Don't submit for:** user mistakes, expected validation errors (e.g. `INVALID_ARGUMENT` from bad input), transient network blips, or anything resolved by reading `--help`.

**2. The user asks to send feedback.** Help them write it, remind them what not to include before you run the command, and confirm after (see **What to tell the user**).

## Before you submit

Feedback requires a mainnet agent session; testnet-only sessions are rejected.

If there is no mainnet session, whether you noticed the friction or the user asked, tell the user that sending feedback needs one and ask whether they want to log in now. Don't log in, or skip the feedback, without asking.

- **Yes:** use the installed `use-agent-wallet` skill; if it isn't installed, fetch `https://agents.circle.com/skills/wallet-login.md`. Then submit.
- **No:** skip the feedback and carry on with what the user asked for.

## What never to include

Never include, even abbreviated or masked:

- **Secrets:** private keys, mnemonics or seed phrases, API keys, JWTs, OTP codes, passwords, session tokens.
- **Personal data (the user's or anyone else's):** emails, phone numbers, US SSNs, credit card numbers, government IDs.
- **Other users' wallet addresses or transaction hashes.**

Rules:

- NEVER suggest the user include credentials, secrets, OTPs, or PII in feedback.
- NEVER pre-fill feedback with your own conversation context; earlier parts of the session may hold sensitive data. Write the message from scratch about the CLI issue only.
- If the user explicitly asks you to include something that looks sensitive, refuse and explain why.

The CLI scans the message locally and hard-rejects any submission that matches a credential or PII pattern. There is no override flag. If a submission is rejected, rephrase it without the value and try again. Keep the message under 2000 characters; longer input is rejected.

## Submit

```bash
# pick exactly one category: BUG, QUESTION, or FEEDBACK
circle feedback submit --category BUG "<concise message>"
# long-form message from a plain-text file (the whole file becomes the message)
circle feedback submit --category QUESTION --from-file ./notes.txt --output json
```

Category: `BUG` = crash or wrong behavior; `QUESTION` = unclear how to do something; `FEEDBACK` = UX friction or missing capability (default).

Use one input mode per call: a positional message, `--message`, `--from-file`, or piped stdin.

| Flag | Purpose |
| --- | --- |
| `--category <c>` | `BUG`, `QUESTION`, or `FEEDBACK` (default `FEEDBACK`) |
| `--message <text>` | Inline message body, instead of the positional message |
| `--from-file <p>` | Read the message body from a plain-text file |
| stdin | Pipe the message in instead of passing it as an argument |
| `-q`, `--quiet` | Print only the reference ID |
| `--output json` | Structured result: `id` (the reference ID), `category`, and `createdAt` |

Run `circle feedback submit --help` for the full list.

**Recent commands (`BUG` only):** you may attach recent commands with `--recent-commands <file.json>`, a JSON array of `{ command, exit_code, occurred_at }` (ISO-8601 time); the newest 20 are sent. Include only commands relevant to the bug and show them to the user before attaching. The CLI also scrub-checks each command and rejects the whole submission on a match.

Keep each submission to one issue, and don't submit the same issue twice in a session.

## What to tell the user

**When the user asked to send feedback,** remind them before running the command:

> "Feedback is reviewed by Circle's team and stored in our product database. Please don't include private keys, OTP codes, API keys, emails, phone numbers, or other personal data — the CLI will reject any message that contains them."

After a successful submission:

> "Thanks! Feedback submitted (ref: <id>). The Circle CLI team will review it."

**When you submitted proactively,** tell the user only if the friction blocks what they asked for, and include the returned reference ID. Routine background submissions don't need to interrupt the user.
