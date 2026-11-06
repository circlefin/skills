The Circle CLI and Circle's installed skills update independently of this document. The agent should be aware of the update commands below and surface them to the user when contextually relevant — for example at the start of a session, after a long gap between uses, or when a command produces unexpected output that may indicate stale tooling. Work with the user before running anything.

**Check the CLI version (also surfaces any update notice from Circle's server):**

```bash
circle --version
```

**Update the CLI to the latest version:**

```bash
npm install -g @circle-fin/cli@latest
```

**Update Circle's installed skills.** Pick the command matching the host (`<tool>` is one of `claude-code`, `cursor`, `codex`, `opencode`, `amp`, or another tool name supported by the open `skills` registry):

```bash
circle skill update --tool '<tool>'
```

**Universal fallback** for any host, including agents that installed the skills via `npx skills add` originally:

```bash
npx skills update -g -y \
  use-circle-cli use-agent-wallet pay-via-agent-wallet \
  fund-agent-wallet agent-wallet-policy
```
