# Express Integration (Circle Gateway Nanopayments)

Reference code for the `accept-agent-payments` skill: adding the Circle Gateway payment gate to an existing Express / Node API. See SKILL.md for the full workflow, command safety, network and funds safety, and the non-Node proxy pattern.

## Install dependencies

```bash
npm install @circle-fin/x402-batching @x402/core @x402/evm viem express
```

## Express Gateway middleware

```ts
import express from "express";
import { createGatewayMiddleware } from "@circle-fin/x402-batching/server";

const app = express();
app.use(express.json());

const gateway = createGatewayMiddleware({
  sellerAddress: process.env.SELLER_ADDRESS!,
});

app.post("/summarize", gateway.require("$0.01"), async (req, res) => {
  res.json({ summary: "paid result" });
});
```

Use environment variables for addresses and provider config. Never commit private keys, API keys, OTPs, or wallet session material.

## Production retry safety

The minimal middleware example does not define application-level idempotency.
Before using it for a retryable endpoint, add a durable admission layer that
claims a caller-provided idempotency key before settlement, binds the key to the
caller or payer plus a canonical request and payment fingerprint, and stores
the terminal result. Matching retries must reuse that result without another
settlement; mismatched reuse must fail.

Use shared durable storage with an atomic insert or compare-and-set operation.
An in-memory cache cannot protect multiple processes, serverless instances, or
restarts. If `gateway.require()` cannot be placed after the durable claim in
your framework, use a thin payment proxy or the official SDK's documented
custom settlement flow so the claim still happens before payment settlement.

See `testing.md` for the lost-response, concurrent-retry, fingerprint-mismatch,
and restart checks.
