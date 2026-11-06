# Inspect commands

```bash
circle services inspect "<service-url>" --output json
```

## List the seller's full `accepts[]`

- **CLI ≥1.2:** read `paymentOptions[]` from the inspect JSON above — one entry per `accepts[]` item, with `network`, `scheme`, `assetTransferMethod`, `amount`, and `clientSupport`.
- **CLI 1.1.x:** `inspect` summarizes only the auto-selected entry, so read the raw 402:

```bash
curl -s "<service-url>"
```
