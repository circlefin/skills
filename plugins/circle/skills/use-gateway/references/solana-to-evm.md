# Transfer Unified USDC from Solana to EVM

This example burns from Solana Devnet and mints on Arc Testnet. The same pattern applies to other supported Solana Gateway environments and EVM destination chains after substituting the correct config, contract addresses, domain IDs, and recipient address.

Canonical runnable references:
- Transfer unified USDC balance: https://developers.circle.com/gateway/howtos/transfer-unified-usdc-balance.md
- Unified balance EVM quickstart: https://developers.circle.com/gateway/quickstarts/unified-balance-evm.md
- Unified balance Solana quickstart: https://developers.circle.com/gateway/quickstarts/unified-balance-solana.md
- Arc crosschain USDC tutorial: https://docs.arc.network/arc/tutorials/access-usdc-crosschain.md

## What this does

This script:

1. Builds a Solana Gateway burn intent
2. Signs the encoded burn intent with the Solana wallet
3. Submits the signed burn intent to the Gateway `/transfer` API
4. Calls `gatewayMint(bytes,bytes)` on the destination EVM chain
5. Waits for the mint transaction receipt

## Runnable example

```ts
import { randomBytes, sign } from "node:crypto";
import { Buffer } from "buffer";

import {
  Layout,
  blob,
  offset,
  struct,
  u32be,
} from "@solana/buffer-layout";
import {
  createPublicClient,
  createWalletClient,
  getContract,
  http,
  pad,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { arcTestnet } from "viem/chains";

const GATEWAY_API_URL = "https://gateway-api-testnet.circle.com/v1/transfer";

const SOLANA_CONFIG = {
  domain: 5,
  gatewayWallet: "GATEwdfmYNELfp5wDmmR6noSr2vHnAfBPMm2PvCzX5vu",
  usdc: "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU",
};

const DESTINATION_CHAIN = {
  chain: arcTestnet,
  domain: 26,
  gatewayMinter: "0x0022222ABE238Cc2C7Bb1f21003F0a260052475B",
  usdc: "0x3600000000000000000000000000000000000000",
};

const TRANSFER_AMOUNT = 5_000_000n; // 5 USDC (6 decimals)
// Confirm the appropriate maxFee for the selected chains and environment in the canonical Gateway docs.
const MAX_FEE = 2_010000n;
const MAX_UINT64 = 2n ** 64n - 1n;
const TRANSFER_SPEC_MAGIC = 0xca85def7;
const BURN_INTENT_MAGIC = 0x070afbc2;

const gatewayMinterAbi = [
  {
    type: "function",
    name: "gatewayMint",
    inputs: [
      { name: "attestationPayload", type: "bytes" },
      { name: "signature", type: "bytes" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
] as const;

class PublicKeyLayout extends Layout<Buffer> {
  constructor(property: string) {
    super(32, property);
  }

  decode(buffer: Buffer, byteOffset = 0): Buffer {
    return buffer.subarray(byteOffset, byteOffset + 32);
  }

  encode(source: Buffer, buffer: Buffer, byteOffset = 0): number {
    source.copy(buffer, byteOffset);
    return 32;
  }
}

class UInt256BELayout extends Layout<bigint> {
  constructor(property: string) {
    super(32, property);
  }

  decode(buffer: Buffer, byteOffset = 0): bigint {
    return buffer.subarray(byteOffset, byteOffset + 32).readBigUInt64BE(24);
  }

  encode(source: bigint, buffer: Buffer, byteOffset = 0): number {
    const valueBuffer = Buffer.alloc(32);
    valueBuffer.writeBigUInt64BE(source, 24);
    valueBuffer.copy(buffer, byteOffset);
    return 32;
  }
}

const publicKey = (property: string) => new PublicKeyLayout(property);
const uint256be = (property: string) => new UInt256BELayout(property);

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
    ] as never,
    "spec",
  ),
] as never);

if (!process.env.SOLANA_PRIVATE_KEYPAIR) {
  throw new Error("SOLANA_PRIVATE_KEYPAIR not set");
}

if (!process.env.EVM_PRIVATE_KEY) {
  throw new Error("EVM_PRIVATE_KEY not set");
}

const solanaSecretKey = Uint8Array.from(
  JSON.parse(process.env.SOLANA_PRIVATE_KEYPAIR),
);
const evmAccount = privateKeyToAccount(
  process.env.EVM_PRIVATE_KEY as `0x${string}`,
);

function randomHex32(): Hex {
  return `0x${randomBytes(32).toString("hex")}` as Hex;
}

function solanaAddressToBytes32(addressBytes: Uint8Array): Hex {
  return `0x${Buffer.from(addressBytes).toString("hex")}` as Hex;
}

function evmAddressToBytes32(address: Hex): Hex {
  return pad(address.toLowerCase(), { size: 32 });
}

function hexToSolanaBuffer(address: Hex): Buffer {
  return Buffer.from(address.slice(2), "hex");
}

function encodeSolanaBurnIntent(burnIntent: {
  maxBlockHeight: bigint;
  maxFee: bigint;
  spec: {
    version: number;
    sourceDomain: number;
    destinationDomain: number;
    sourceContract: Hex;
    destinationContract: Hex;
    sourceToken: Hex;
    destinationToken: Hex;
    sourceDepositor: Hex;
    destinationRecipient: Hex;
    sourceSigner: Hex;
    destinationCaller: Hex;
    value: bigint;
    salt: Hex;
    hookData: Hex;
  };
}): Buffer {
  const hookData = Buffer.from(burnIntent.spec.hookData.slice(2), "hex");
  const prepared = {
    magic: BURN_INTENT_MAGIC,
    maxBlockHeight: burnIntent.maxBlockHeight,
    maxFee: burnIntent.maxFee,
    transferSpecLength: 340 + hookData.length,
    spec: {
      magic: TRANSFER_SPEC_MAGIC,
      version: burnIntent.spec.version,
      sourceDomain: burnIntent.spec.sourceDomain,
      destinationDomain: burnIntent.spec.destinationDomain,
      sourceContract: hexToSolanaBuffer(burnIntent.spec.sourceContract),
      destinationContract: hexToSolanaBuffer(burnIntent.spec.destinationContract),
      sourceToken: hexToSolanaBuffer(burnIntent.spec.sourceToken),
      destinationToken: hexToSolanaBuffer(burnIntent.spec.destinationToken),
      sourceDepositor: hexToSolanaBuffer(burnIntent.spec.sourceDepositor),
      destinationRecipient: hexToSolanaBuffer(burnIntent.spec.destinationRecipient),
      sourceSigner: hexToSolanaBuffer(burnIntent.spec.sourceSigner),
      destinationCaller: hexToSolanaBuffer(burnIntent.spec.destinationCaller),
      value: burnIntent.spec.value,
      salt: Buffer.from(burnIntent.spec.salt.slice(2), "hex"),
      hookDataLength: hookData.length,
      hookData,
    },
  };

  const out = Buffer.alloc(72 + 340 + hookData.length);
  const bytesWritten = BurnIntentLayout.encode(prepared, out);
  return out.subarray(0, bytesWritten);
}

function signSolanaBurnIntent(secretKey: Uint8Array, encodedBurnIntent: Uint8Array): Hex {
  const prefixed = new Uint8Array(16 + encodedBurnIntent.length);
  prefixed.set([0xff], 0);
  prefixed.set(encodedBurnIntent, 16);

  const privateKey = Buffer.concat([
    Buffer.from(secretKey.slice(0, 32)),
    Buffer.from(secretKey.slice(32, 64)),
  ]);

  const signature = sign(null, Buffer.from(prefixed), {
    key: Buffer.concat([
      Buffer.from("302e020100300506032b657004220420", "hex"),
      privateKey.subarray(0, 32),
    ]),
    dsaEncoding: "ieee-p1363",
  });

  return `0x${signature.toString("hex")}` as Hex;
}

async function main() {
  const solanaPublicKey = solanaSecretKey.slice(32, 64);
  const recipient = evmAccount.address;
  const sourceGatewayWalletBytes = solanaAddressToBytes32(
    Buffer.from(new PublicKey(SOLANA_CONFIG.gatewayWallet).toBytes()),
  );
  const sourceUsdcBytes = solanaAddressToBytes32(
    Buffer.from(new PublicKey(SOLANA_CONFIG.usdc).toBytes()),
  );

  const burnIntent = {
    maxBlockHeight: MAX_UINT64,
    maxFee: MAX_FEE,
    spec: {
      version: 1,
      sourceDomain: SOLANA_CONFIG.domain,
      destinationDomain: DESTINATION_CHAIN.domain,
      sourceContract: sourceGatewayWalletBytes,
      destinationContract: evmAddressToBytes32(
        DESTINATION_CHAIN.gatewayMinter as `0x${string}`,
      ),
      sourceToken: sourceUsdcBytes,
      destinationToken: evmAddressToBytes32(
        DESTINATION_CHAIN.usdc as `0x${string}`,
      ),
      sourceDepositor: solanaAddressToBytes32(solanaPublicKey),
      destinationRecipient: evmAddressToBytes32(recipient),
      sourceSigner: solanaAddressToBytes32(solanaPublicKey),
      destinationCaller: evmAddressToBytes32(
        "0x0000000000000000000000000000000000000000",
      ),
      value: TRANSFER_AMOUNT,
      salt: randomHex32(),
      hookData: "0x" as Hex,
    },
  };

  const encoded = encodeSolanaBurnIntent(burnIntent);
  const burnSignature = signSolanaBurnIntent(solanaSecretKey, encoded);

  const transferResponse = await fetch(GATEWAY_API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(
      [
        {
          burnIntent: {
            ...burnIntent,
            maxBlockHeight: burnIntent.maxBlockHeight.toString(),
            maxFee: burnIntent.maxFee.toString(),
            spec: {
              ...burnIntent.spec,
              value: burnIntent.spec.value.toString(),
            },
          },
          signature: burnSignature,
        },
      ],
    ),
  });

  if (!transferResponse.ok) {
    throw new Error(
      `Gateway API request failed: ${transferResponse.status} ${await transferResponse.text()}`,
    );
  }

  const { attestation, signature } = (await transferResponse.json()) as {
    attestation: `0x${string}`;
    signature: `0x${string}`;
  };

  const publicClient = createPublicClient({
    chain: DESTINATION_CHAIN.chain,
    transport: http(),
  });

  const walletClient = createWalletClient({
    account: evmAccount,
    chain: DESTINATION_CHAIN.chain,
    transport: http(),
  });

  const gatewayMinter = getContract({
    address: DESTINATION_CHAIN.gatewayMinter,
    abi: gatewayMinterAbi,
    client: walletClient,
  });

  const mintTx = await gatewayMinter.write.gatewayMint([attestation, signature], {
    account: evmAccount,
  });
  await publicClient.waitForTransactionReceipt({ hash: mintTx });

  console.log(`Minted destination USDC to ${recipient}`);
  console.log(`Mint transaction hash: ${mintTx}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
```

