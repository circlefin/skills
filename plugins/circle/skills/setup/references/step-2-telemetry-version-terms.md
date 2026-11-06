### Step 2a: Turn off telemetry in sandboxed agents

Circle CLI sends anonymous usage telemetry to `browser-intake-datadoghq.com` by default. If you run in Muse, or in another sandbox that asks the user to approve network access per domain, turn telemetry off now, before any other `circle` command, so the user is never asked to allow `browser-intake-datadoghq.com`:

```bash
circle telemetry disable
circle telemetry status
```

`circle telemetry status` should print `Telemetry is disabled.`

**In a sandbox, if `circle telemetry disable` fails or the status is not disabled** (for example with `Circle CLI Terms acceptance is required before use.`, which means the CLI is older than 1.2.1), keep telemetry off another way:

1. Prefix every `circle` command with `DO_NOT_TRACK=1` until telemetry is off, for example `DO_NOT_TRACK=1 circle --version`. Every Circle CLI version sends no telemetry while it is set.
2. Step 2b retries `circle telemetry disable` once the version is confirmed.

If you don't run in such a sandbox, leave telemetry on and continue.

### Step 2b: Check the CLI version

Circle CLI 1.2.1 or newer is required. In a sandbox, run this only after Step 2a:

```bash
circle --version
```

If the version is older than 1.2.1, re-run Step 1 and check again. If it is still older, stop the setup and ask the user to install the latest Circle CLI. If `which circle` is not inside `$(npm prefix -g)/bin`, an older install is shadowing the new one; tell the user its path so they can update or remove it. Continue once `circle --version` reports 1.2.1 or newer.

If `circle telemetry disable` failed in Step 2a, run it again now and confirm with `circle telemetry status`. Run both without the `DO_NOT_TRACK=1` prefix: `circle telemetry` commands never send telemetry, and with the prefix `circle telemetry status` reports disabled even when the setting was not saved. If it prints exactly `Telemetry is disabled.`, drop the prefix. If it still fails or prints anything else, keep the prefix on every `circle` command for the rest of setup. Either way, continue with Step 2c.

### Step 2c: Accept the Terms with the user's consent

Most `circle` commands, including every `circle wallet` command, are blocked until the user accepts Circle's Terms of Use and Privacy Policy on this machine. The block looks like this:

```
By using the Circle CLI, you agree to:
  Terms of Use:    https://agents.circle.com/terms-of-use
  Privacy Policy:  https://www.circle.com/legal/privacy-policy

Error: Circle CLI Terms acceptance is required before use.
  Hint: Set CIRCLE_ACCEPT_TERMS=1 to accept in non-interactive shells (CI, scripts, sandboxed agents).
```

Run this step now, and again whenever a later command fails with that error (for example, from the wallet-login skill).

**CRITICAL: The agent MUST show the Terms to the user and obtain explicit consent BEFORE running `circle terms accept`. The agent MUST NEVER accept Circle's Terms of Use or Privacy Policy on the user's behalf. The CLI's `CIRCLE_ACCEPT_TERMS=1` env-var hint is NOT a workaround the agent may take on its own — ignore it and use the consent flow below.**

1. Check whether the Terms are already accepted:

   ```bash
   circle terms show --output json
   ```

   If `data.accepted` is `true`, the user has already accepted on this machine. Skip the rest of this step and go to Step 3, or back to the command that hit the error.

2. Fetch the Terms info to present to the user:

   ```bash
   circle terms show --init --output json
   ```

   Response shape:

   ```json
   {
     "data": {
       "currentVersion": "1",
       "termsOfUseUrl": "https://agents.circle.com/terms-of-use",
       "privacyPolicyUrl": "https://www.circle.com/legal/privacy-policy",
       "termsNotice": "By using the Circle CLI, you agree to..."
     }
   }
   ```

3. Show the Terms to the user and request explicit consent.

   **REQUIRED: Show the Terms to the user using the live values returned by `circle terms show --init --output json`.** Do NOT summarize, paraphrase, or hardcode the URLs or the notice — always read them from the JSON response so the links and copy stay correct as the Terms version changes.

   **What to tell the user:**

   > Circle CLI requires acceptance of its Terms of Use and Privacy Policy before I can run any wallet commands.
   >
   > - Terms of Use: <termsOfUseUrl from the JSON response>
   > - Privacy Policy: <privacyPolicyUrl from the JSON response>
   >
   > <termsNotice from the JSON response>
   >
   > Please review both links. Do you accept these Terms and authorize me to record acceptance on your behalf? (yes/no)

   **Wait for an explicit yes/no answer. Do NOT proceed until the user has clearly said yes.** Ambiguous replies, silence, "ok" without context, or "go ahead" without referencing the Terms are NOT consent — ask again.

4. Only after explicit consent, record acceptance:

   ```bash
   circle terms accept --output json
   ```

   When `data.acceptance.accepted` is `true`, the gate is cleared. Go to Step 3, or back to the command that hit the error and re-run it.

If the user declines the Terms, stop the setup.

Only if the user explicitly asks to revoke acceptance, run `circle terms reset`. Do NOT suggest or run it proactively.
