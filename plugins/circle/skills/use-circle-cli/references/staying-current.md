# Staying current with the Circle CLI

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
