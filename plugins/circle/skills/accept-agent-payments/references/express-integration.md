# Express Integration (Circle Gateway Nanopayments)

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
  facilitatorUrl: "https://gateway-api-testnet.circle.com",
});

app.post("/summarize", gateway.require("$0.01"), async (req, res) => {
  res.json({ summary: "paid result" });
});
```

Omitting `facilitatorUrl` selects **mainnet** (`https://gateway-api.circle.com`), which verifies and settles real USDC. Keep the testnet URL above for first integration; switch to the mainnet URL (or omit the field) only after the user approves mainnet.
