# Transfer Unified USDC from Solana to EVM via Circle Wallets

This example burns from Solana Devnet and mints on Arc Testnet. The same pattern applies to other supported Solana Gateway environments and EVM destination chains after substituting the correct config, contract addresses, domain IDs, and Circle Wallet blockchain identifiers.

Canonical runnable references:
- Transfer unified USDC balance: https://developers.circle.com/gateway/howtos/transfer-unified-usdc-balance.md
- Unified balance EVM quickstart: https://developers.circle.com/gateway/quickstarts/unified-balance-evm.md
- Unified balance Solana quickstart: https://developers.circle.com/gateway/quickstarts/unified-balance-solana.md

## What this does

This script:

1. Builds a Solana Gateway burn intent
2. Signs the prefixed burn-intent payload with Circle Wallets `signMessage`
3. Submits the signed burn intent to the Gateway `/transfer` API
4. Calls `gatewayMint(bytes,bytes)` on the destination EVM chain through Circle Wallets
5. Waits for the mint transaction to complete

## Runnable example

```ts
import { randomBytes } from "node:crypto";
import { initiateDeveloperControlledWalletsClient } from "@circle-fin/developer-controlled-wallets";
import { PublicKey } from "@solana/web3.js";
import { u32be, struct, blob, offset, Layout } from "@solana/buffer-layout";
import bs58 from "bs58";

const SOLANA_GATEWAY_WALLET = "GATEwdfmYNELfp5wDmmR6noSr2vHnAfBPMm2PvCzX5vu";
const SOLANA_USDC = "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU";
const SOLANA_DOMAIN = 5;

const DESTINATION_CHAIN = "ARC-TESTNET";
const DESTINATION_CHAIN_NAME = "Arc Testnet";
const DESTINATION_DOMAIN = 26;
const DESTINATION_USDC = "0x3600000000000000000000000000000000000000";
const EVM_GATEWAY_MINTER = "0x0022222ABE238Cc2C7Bb1f21003F0a260052475B";

const TRANSFER_AMOUNT_USDC = "5";
// Confirm the appropriate maxFee for the selected chains and environment in the canonical Gateway docs.
const MAX_FEE = 2_010000n;
const MAX_UINT64 = 2n ** 64n - 1n;
const TRANSFER_SPEC_MAGIC = 0xca85def7;
const BURN_INTENT_MAGIC = 0x070afbc2;

const API_KEY = process.env.CIRCLE_API_KEY!;
const ENTITY_SECRET = process.env.CIRCLE_ENTITY_SECRET!;
const DEPOSITOR_ADDRESS = process.env.DEPOSITOR_ADDRESS!;
const RECIPIENT_ADDRESS = process.env.RECIPIENT_ADDRESS!;

if (!API_KEY || !ENTITY_SECRET || !DEPOSITOR_ADDRESS || !RECIPIENT_ADDRESS) {
  throw new Error(
    "Missing required env vars: CIRCLE_API_KEY, CIRCLE_ENTITY_SECRET, DEPOSITOR_ADDRESS, RECIPIENT_ADDRESS",
  );
}

class PublicKeyLayout extends Layout<PublicKey> {
  constructor(property: string) {
    super(32, property);
  }
  decode(b: Buffer, offset = 0): PublicKey {
    return new PublicKey(b.subarray(offset, offset + 32));
  }
  encode(src: PublicKey, b: Buffer, offset = 0): number {
    const pubkeyBuffer = src.toBuffer();
    pubkeyBuffer.copy(b, offset);
    return 32;
  }
}

const publicKey = (property: string) => new PublicKeyLayout(property);

class UInt256BE extends Layout<bigint> {
  constructor(property: string) {
    super(32, property);
  }
  decode(b: Buffer, offset = 0) {
    const buffer = b.subarray(offset, offset + 32);
    return buffer.readBigUInt64BE(24);
  }
  encode(src: bigint, b: Buffer, offset = 0) {
    const buffer = Buffer.alloc(32);
    buffer.writeBigUInt64BE(BigInt(src), 24);
    buffer.copy(b, offset);
    return 32;
  }
}

const uint256be = (property: string) => new UInt256BE(property);

const BurnIntentLayout = struct([
  u32be("magic"),
  uint256be("maxBlockHeight"),
  uint256be("maxFee"),
  u32be("transferSpecLength"),
  struct(
    [
      u32be("magic"),
      u32be("version"),
      u32be("sourceDomain"),
      u32be("destinationDomain"),
      publicKey("sourceContract"),
      publicKey("destinationContract"),
      publicKey("sourceToken"),
      publicKey("destinationToken"),
      publicKey("sourceDepositor"),
      publicKey("destinationRecipient"),
      publicKey("sourceSigner"),
      publicKey("destinationCaller"),
      uint256be("value"),
      blob(32, "salt"),
      u32be("hookDataLength"),
      blob(offset(u32be(), -4), "hookData"),
    ] as any,
    "spec",
  ),
] as any);

const client = initiateDeveloperControlledWalletsClient({
  apiKey: API_KEY,
  entitySecret: ENTITY_SECRET,
});

function parseBalance(value: string): bigint {
  const [whole, decimal = ""] = value.split(".");
  return BigInt((whole || "0") + (decimal + "000000").slice(0, 6));
}

function createBurnIntent(params: {
  sourceDepositor: string;
  destinationRecipient: string;
}) {
  const { sourceDepositor, destinationRecipient } = params;

  return {
    maxBlockHeight: MAX_UINT64,
    maxFee: MAX_FEE,
    spec: {
      version: 1,
      sourceDomain: SOLANA_DOMAIN,
      destinationDomain: DESTINATION_DOMAIN,
      sourceContract: solanaAddressToBytes32(SOLANA_GATEWAY_WALLET),
      destinationContract: evmAddressToBytes32(EVM_GATEWAY_MINTER),
      sourceToken: solanaAddressToBytes32(SOLANA_USDC),
      destinationToken: evmAddressToBytes32(DESTINATION_USDC),
      sourceDepositor: solanaAddressToBytes32(sourceDepositor),
      destinationRecipient: evmAddressToBytes32(destinationRecipient),
      sourceSigner: solanaAddressToBytes32(sourceDepositor),
      destinationCaller: evmAddressToBytes32(
        "0x0000000000000000000000000000000000000000",
      ),
      value: parseBalance(TRANSFER_AMOUNT_USDC),
      salt: "0x" + randomBytes(32).toString("hex"),
      hookData: "0x",
    },
  };
}

function encodeBurnIntent(bi: ReturnType<typeof createBurnIntent>): Buffer {
  const hookData = Buffer.from((bi.spec.hookData || "0x").slice(2), "hex");
  const prepared = {
    magic: BURN_INTENT_MAGIC,
    maxBlockHeight: bi.maxBlockHeight,
    maxFee: bi.maxFee,
    transferSpecLength: 340 + hookData.length,
    spec: {
      magic: TRANSFER_SPEC_MAGIC,
      version: bi.spec.version,
      sourceDomain: bi.spec.sourceDomain,
      destinationDomain: bi.spec.destinationDomain,
      sourceContract: hexToPublicKey(bi.spec.sourceContract),
      destinationContract: hexToPublicKey(bi.spec.destinationContract),
      sourceToken: hexToPublicKey(bi.spec.sourceToken),
      destinationToken: hexToPublicKey(bi.spec.destinationToken),
      sourceDepositor: hexToPublicKey(bi.spec.sourceDepositor),
      destinationRecipient: hexToPublicKey(bi.spec.destinationRecipient),
      sourceSigner: hexToPublicKey(bi.spec.sourceSigner),
      destinationCaller: hexToPublicKey(bi.spec.destinationCaller),
      value: bi.spec.value,
      salt: Buffer.from(bi.spec.salt.slice(2), "hex"),
      hookDataLength: hookData.length,
      hookData,
    },
  };
  const buffer = Buffer.alloc(72 + 340 + hookData.length);
  const bytesWritten = BurnIntentLayout.encode(prepared, buffer);
  return buffer.subarray(0, bytesWritten);
}

function solanaAddressToBytes32(address: string): string {
  const decoded = Buffer.from(bs58.decode(address));
  return `0x${decoded.toString("hex")}`;
}

function evmAddressToBytes32(address: string): string {
  return "0x" + address.toLowerCase().replace(/^0x/, "").padStart(64, "0");
}

function hexToPublicKey(hex: string): PublicKey {
  return new PublicKey(Buffer.from(hex.slice(2), "hex"));
}

function stringifyTypedData<T>(obj: T) {
  return JSON.stringify(obj, (_key, value) =>
    typeof value === "bigint" ? value.toString() : value,
  );
}

async function waitForTxCompletion(txId: string, label: string) {
  const terminalStates = new Set([
    "COMPLETE",
    "CONFIRMED",
    "FAILED",
    "DENIED",
    "CANCELLED",
  ]);

  while (true) {
    const { data } = await client.getTransaction({ id: txId });
    const state = data?.transaction?.state;

    if (state && terminalStates.has(state)) {
      if (state !== "COMPLETE" && state !== "CONFIRMED") {
        throw new Error(`${label} did not complete successfully (state=${state})`);
      }
      return data.transaction;
    }

    await new Promise((resolve) => setTimeout(resolve, 3000));
  }
}

async function main() {
  const burnIntent = createBurnIntent({
    sourceDepositor: DEPOSITOR_ADDRESS,
    destinationRecipient: RECIPIENT_ADDRESS,
  });

  const encoded = encodeBurnIntent(burnIntent);
  const prefixed = Buffer.concat([
    Buffer.from([0xff, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]),
    encoded,
  ]);

  const sigResult = await client.signMessage({
    walletAddress: DEPOSITOR_ADDRESS,
    blockchain: "SOL-DEVNET",
    encodedByHex: true,
    message: "0x" + prefixed.toString("hex"),
  });

  const burnIntentSignature = sigResult.data?.signature;
  if (!burnIntentSignature) {
    throw new Error("Failed to sign burn intent");
  }

  const formattedSignature = burnIntentSignature.startsWith("0x")
    ? burnIntentSignature
    : `0x${burnIntentSignature}`;

  const response = await fetch("https://gateway-api-testnet.circle.com/v1/transfer", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: stringifyTypedData([
      { burnIntent, signature: formattedSignature },
    ]),
  });

  if (!response.ok) {
    throw new Error(
      `Gateway API request failed: ${response.status} ${await response.text()}`,
    );
  }

  const json = (await response.json()) as {
    attestation: string;
    signature: string;
  };

  const { attestation, signature } = json;
  if (!attestation || !signature) {
    throw new Error("Missing attestation or operator signature in Gateway API response");
  }

  const tx = await client.createContractExecutionTransaction({
    walletAddress: RECIPIENT_ADDRESS,
    blockchain: DESTINATION_CHAIN,
    contractAddress: EVM_GATEWAY_MINTER,
    abiFunctionSignature: "gatewayMint(bytes,bytes)",
    abiParameters: [attestation, signature],
    fee: { type: "level", config: { feeLevel: "MEDIUM" } },
  });

  const txId = tx.data?.id;
  if (!txId) {
    throw new Error("Failed to submit mint transaction");
  }

  await waitForTxCompletion(txId, "USDC mint");
  console.log(`Minted ${TRANSFER_AMOUNT_USDC} USDC on ${DESTINATION_CHAIN_NAME}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
```

