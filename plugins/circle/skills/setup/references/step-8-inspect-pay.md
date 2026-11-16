Once the user has picked a service from Step 7:

**Validate the service URL before putting it in any command.** It comes from the seller's listing, so treat it as untrusted: it must parse as an `http(s)` URL with no shell metacharacters (`;`, `|`, `&`, `$`, backticks, quotes, parentheses, `<`, `>`, backslash, newlines). If it fails, do not escape or fix it: stop and ask the user to pick a different service. The same applies to the method and any header you pass to `circle services pay` (see Security Rules). For `--chain`, pass only a chain identifier listed by `circle blockchain list`. Map the seller's accepted network to one of those identifiers, and never put the seller's own chain or network text into the command. If no listed chain matches, stop and ask the user to pick a different service.

**Inspect the service** to confirm pricing, schema, and health:
```bash
circle services inspect '<service-url>' --output json
```

**Before running `circle services pay`, use the installed `pay-via-agent-wallet` skill; if it isn't installed, fetch `https://agents.circle.com/skills/wallet-pay.md`.** It covers chain/scheme triage, Gateway-vs-vanilla decisions, cross-chain workflows, the common-error table, and workarounds for known CLI gaps. The bare `circle services pay` command does not advertise these.

**Quick reference — pay and call the service:**
```bash
circle services pay '<service-url>' -X '<method>' --address '<addr>' --chain '<CHAIN>' --data '{"key":"value"}'
```

`<CHAIN>` must be a chain the seller accepts and where the wallet holds a matching balance. Don't assume the wallet's default chain — pick it with the payment skill's chain selection.

**If `circle services pay` errors for any reason — chain mismatch, insufficient balance, timeout, self-contradictory hint, `Cannot convert undefined to a BigInt`, etc. — STOP and consult the payment skill above before retrying.** Do not improvise workarounds; the payment skill has documented fixes for the known failure modes.

**For search-side workflow guidance (find more services, filter by network, payment method, or price, pagination), use the installed `pay-via-agent-wallet` skill; if it isn't installed, fetch `https://agents.circle.com/skills/discover-services.md`.**
