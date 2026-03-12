# Private Key Adapter (Viem + Solana Kit)

Reference implementation for bridging USDC using private key adapters -- covers EVM-to-EVM and EVM-to-Solana routes.

## EVM to EVM

```ts
import { BridgeKit } from "@circle-fin/bridge-kit";
import { createViemAdapterFromPrivateKey } from "@circle-fin/adapter-viem-v2";
import { inspect } from "util";

const kit = new BridgeKit();

const bridgeUSDC = async (): Promise<void> => {
  try {
    const adapter = createViemAdapterFromPrivateKey({
      privateKey: process.env.PRIVATE_KEY as string,
    });

    const result = await kit.bridge({
      from: { adapter, chain: "Arc_Testnet" },
      to: { adapter, chain: "Base_Sepolia" },
      amount: "1.00",
    });

    console.log("RESULT", inspect(result, false, null, true));
  } catch (err) {
    console.log("ERROR", inspect(err, false, null, true));
  }
};

void bridgeUSDC();
```

## EVM to Solana

```ts
import { BridgeKit } from "@circle-fin/bridge-kit";
import { createViemAdapterFromPrivateKey } from "@circle-fin/adapter-viem-v2";
import { createSolanaKitAdapterFromPrivateKey } from "@circle-fin/adapter-solana-kit";
import { inspect } from "util";

const kit = new BridgeKit();

const bridgeUSDC = async (): Promise<void> => {
  try {
    const evmAdapter = createViemAdapterFromPrivateKey({
      privateKey: process.env.EVM_PRIVATE_KEY as `0x${string}`,
    });

    const solanaAdapter = createSolanaKitAdapterFromPrivateKey({
      privateKey: process.env.SOLANA_PRIVATE_KEY as string,
    });

    const result = await kit.bridge({
      from: { adapter: evmAdapter, chain: "Ethereum_Sepolia" },
      to: { adapter: solanaAdapter, chain: "Solana_Devnet" },
      amount: "1.00",
    });

    console.log("RESULT", inspect(result, false, null, true));
  } catch (err) {
    console.log("ERROR", inspect(err, false, null, true));
  }
};

void bridgeUSDC();
```
