# Step 2 — Inspect the chosen service

Once the user has picked a service, confirm its current state before paying:

```bash
circle services inspect "<service-url>" --output json
```

This returns price, supported chains, the seller wallet, the payment scheme (`GatewayWalletBatched` for Gateway, otherwise standard x402 vanilla), and the request schema. **It does NOT execute payment.** Use the response to:

1. Confirm the chain you'll pay from is in the seller's accepted list.
2. Read the `method` field (e.g., `GET`, `POST`) — you **must** pass this explicitly via `-X` in Step 3.
3. Read the request schema so the `--data` payload you pass next is valid (wrong shape returns HTTP 422 — see `references/errors.md`).

## Read the raw 402 for the full `accepts[]` array

`inspect` summarizes only the CLI's auto-selected `accepts[]` entry. If the payment method or chain isn't already settled (e.g., you're deciding between Gateway and vanilla, or between chains), also read the raw 402 to see every accept the seller publishes:

```bash
curl -s "<service-url>"
```

Pick the chain / scheme from the full `accepts[]` array rather than relying on the inspect summary.
