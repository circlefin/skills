# Terms-of-Use Gate

Detailed command reference and consent flow for Circle CLI Terms acceptance. See `../SKILL.md` for where this gate fits in the bootstrap workflow. The agent MUST NEVER accept Circle's Terms on the user's behalf.

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
