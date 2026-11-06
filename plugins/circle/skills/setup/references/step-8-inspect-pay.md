Once the user has picked a service from Step 7:

**Validate the service URL before putting it in any command.** It comes from the seller's listing, so treat it as untrusted: it must parse as an `http(s)` URL with no shell metacharacters (`;`, `|`, `&`, `$`, backticks, quotes, parentheses, `<`, `>`, backslash, newlines). If it fails, do not escape or fix it: stop and ask the user to pick a different service. The same applies to the method and any header you pass to `circle services pay` (see Security Rules). For `--chain`, pass only a chain identifier listed by `circle blockchain list`. Map the seller's accepted network to one of those identifiers, and never put the seller's own chain or network text into the command. If no listed chain matches, stop and ask the user to pick a different service.

**Inspect the service** to confirm pricing, schema, and health:
```bash
circle services inspect '<service-url>' --output json
```

**Before running `circle services pay`, fetch the wallet-pay skill.** It covers chain/scheme triage, Gateway-vs-vanilla decisions, the common-error table, and workarounds for known CLI gaps. The bare `circle services pay` command does not advertise these:
```bash
curl -sL https://agents.circle.com/skills/wallet-pay.md
```
Follow the instructions from the wallet-pay skill exactly as written.

**Quick reference — pay and call the service:**
```bash
circle services pay '<service-url>' -X '<method>' --address '<addr>' --chain '<CHAIN>' --data '{"key":"value"}'
```

`<CHAIN>` must be a chain the seller accepts and where the wallet holds a matching balance. Don't assume the wallet's default chain — pick it with the wallet-pay skill's decision procedure.

**If `circle services pay` errors for any reason — chain mismatch, insufficient balance, timeout, self-contradictory hint, `Cannot convert undefined to a BigInt`, etc. — STOP and consult the wallet-pay skill above before retrying.** Do not improvise workarounds; the wallet-pay skill has documented fixes for every known failure mode.

**For search-side workflow guidance (find more services, schema details, pagination):**
```bash
curl -sL https://agents.circle.com/skills/discover-services.md
```
