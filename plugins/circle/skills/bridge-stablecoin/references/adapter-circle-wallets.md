# Circle Wallets Adapter (Developer-Controlled Wallets)

Reference implementation for bridging USDC using Circle developer-controlled wallets. Supports any chain to any chain (EVM ↔ EVM, EVM ↔ Solana, Solana ↔ Solana).

## Setup

```bash
npm install @circle-fin/bridge-kit @circle-fin/adapter-circle-wallets
```

## Environment Variables

```
CIRCLE_API_KEY=           # Circle API key (for Circle Wallets adapter)
CIRCLE_ENTITY_SECRET=     # Entity secret (for Circle Wallets adapter)
EVM_WALLET_ADDRESS=       # Developer-controlled EVM wallet address
SOLANA_WALLET_ADDRESS=    # Developer-controlled Solana wallet address
```

## Bridge with Circle Wallets

```ts
import { BridgeKit } from "@circle-fin/bridge-kit";
import { createCircleWalletsAdapter } from "@circle-fin/adapter-circle-wallets";
import { inspect } from "util";

const kit = new BridgeKit();

const bridgeUSDC = async (): Promise<void> => {
  try {
    const adapter = createCircleWalletsAdapter({
      apiKey: process.env.CIRCLE_API_KEY!,
      entitySecret: process.env.CIRCLE_ENTITY_SECRET!,
    });

    const result = await kit.bridge({
      from: {
        adapter,
        chain: "Arc_Testnet",
        address: process.env.EVM_WALLET_ADDRESS!,
      },
      to: {
        adapter,
        chain: "Solana_Devnet",
        address: process.env.SOLANA_WALLET_ADDRESS!,
      },
      amount: "1.00",
    });

    console.log("RESULT", inspect(result, false, null, true));
  } catch (err) {
    console.log("ERROR", inspect(err, false, null, true));
  }
};

void bridgeUSDC();
```
