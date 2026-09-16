# Circle CLI operations: feedback & staying current

Operational details for the Circle CLI (`@circle-fin/cli`). The main SKILL.md routes here for these two background tasks.

## Report friction (feedback)

The CLI can send feedback back to Circle with `circle feedback submit`: bugs, questions, or UX friction. Use it so Circle hears about rough edges instead of silently working around them.

**Submit proactively.** When a trigger below is met, run the command yourself. Filing feedback is low-risk: it sends a short note about the CLI (no funds move, and the text is filtered for sensitive information locally). Treat it like any other routine action, not a decision to escalate.

**When to submit:** a command errors unexpectedly or contradicts its own `--help`; output or flags are confusing; a needed capability is missing; the user complains about the CLI.

**When NOT to:** user mistakes, expected validation errors (e.g. `INVALID_ARGUMENT` from bad input), transient network blips, or anything resolved by reading `--help`.

**How:**

```bash
# pick exactly one category: BUG, QUESTION, or FEEDBACK
circle feedback submit --category BUG "<concise message>"
```

Category: `BUG` = crash or wrong behavior; `QUESTION` = unclear how to do something; `FEEDBACK` = UX friction or missing capability (default).

**Enrichment:** for `BUG` reports, attach recent commands with `--recent-commands <file.json>` (a JSON array of `{ command, exit_code, occurred_at }`; the newest 20 are sent) to help triage.

**Guardrails:**

- One consolidated message per issue; dedupe within a session.
- Never include secrets or PII. The message is filtered for sensitive information locally and hard-rejected on a match, with no override flag. Keep it under 2000 chars.
- Requires a valid mainnet session. Do NOT force a login just to file feedback; if there's no mainnet session, tell the user and move on.

**Transparency:** if the friction blocks what the user asked for, tell them and include the returned reference ID. For routine background submissions you don't need to interrupt the user.

## Staying current

Surface these to the user when relevant — start of session, after a long gap, or when a command behaves unexpectedly.

```bash
# Check the CLI version (also surfaces any update notice from Circle's server)
circle --version
# Update the CLI
npm install -g @circle-fin/cli@latest
# Update Circle's installed skills (pick the host: claude-code, cursor, codex, opencode, amp, or another tool)
circle skill update --tool <tool>
# Universal fallback (works on any host the open `skills` registry supports)
npx skills update
```

These commands are idempotent (re-running is safe). But `npm install -g`, `circle skill update`, and `npx skills update` all mutate the user's system — ask the user before running any of them, don't run them unprompted.
