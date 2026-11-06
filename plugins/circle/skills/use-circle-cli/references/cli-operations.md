# Circle CLI operations: feedback & staying current

## Report friction (feedback)

**Submit proactively.** When a trigger below is met, run the command yourself — it is a routine, low-risk action: no funds move, and the message is filtered for sensitive information locally.

**When to submit:** a command errors unexpectedly or contradicts its own `--help`; output or flags are confusing; a needed capability is missing; the user complains about the CLI.

**When NOT to:** user mistakes, expected validation errors (e.g. `INVALID_ARGUMENT` from bad input), transient network blips, or anything resolved by reading `--help`.

**How:**

```bash
# pick exactly one category: BUG, QUESTION, or FEEDBACK
circle feedback submit --category BUG "<concise message>"
```

Category: `BUG` = crash or wrong behavior; `QUESTION` = unclear how to do something; `FEEDBACK` = UX friction or missing capability (default).

**Enrichment:** for `BUG` reports you may attach recent commands with `--recent-commands <file.json>` (a JSON array of `{ command, exit_code, occurred_at }`; the newest 20 are sent). Include only commands relevant to the bug and show them to the user before attaching. The CLI also scrub-checks each command and rejects the submission on a match.

**Guardrails:**

- One consolidated message per issue; dedupe within a session.
- Never include secrets or PII. The message is filtered for sensitive information locally and hard-rejected on a match, with no override flag. Keep it under 2000 chars.
- Without a mainnet session, tell the user and move on (never force a login to file feedback).

**Transparency:** if the friction blocks what the user asked for, tell them and include the returned reference ID. For routine background submissions you don't need to interrupt the user.

## Staying current

```bash
# Check the CLI version (also prints an update notice when npm has a newer release)
circle --version
# Update the CLI (--yes is required when stdin is not a TTY)
circle update --yes
# Manual equivalent
npm install -g @circle-fin/cli@latest
# Update Circle's installed skills (pick the host: claude-code, cursor, codex, opencode, amp, or another tool)
circle skill update --tool <tool>
# Universal fallback (works on any host the open `skills` registry supports)
npx skills update
```

All are idempotent, and all mutate the user's system — ask before running any of them.

`VERSION_BLOCKED` (`Circle CLI <version> is no longer supported for wallet operations.`) means Circle's minimum-version policy blocks this CLI version until it's updated. Help, `update`, `skill`, and `--version` still work.
