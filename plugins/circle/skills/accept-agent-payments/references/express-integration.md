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
