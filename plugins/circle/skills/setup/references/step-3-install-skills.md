Save Circle's official skills onto the user's machine so the agent has sticky, local guidance in every future session — without re-fetching this setup doc each time.

**The agent should run this so that the user can use the Circle CLI without having to install the skills manually.**

Pick the command matching the host (`<tool>` is one of `claude-code`, `cursor`, `codex`, `opencode`, `amp`, or another tool name supported by the open `skills` registry):

```bash
circle skill install --tool '<tool>'
```

**Universal fallback** for any host (does not require the Circle CLI to be installed first):

```bash
npx skills add circlefin/skills -g
```

Both forms install Circle's official skill plugin so they auto-load in every future session. They are idempotent — safe to re-run.

- `circle skill install` is preferred when the Circle CLI is already installed. For Claude Code it uses the native plugin marketplace; for other hosts it routes through the open `skills` registry. It also wires into `circle skill update` for later refreshes.
- `npx skills add circlefin/skills -g` is the universal catch-all from the open `skills` registry. Works on any host the registry supports.

If this step errors (network, plugin permission denied, etc.), continue to Step 4 — the install can be retried later with the same command.
