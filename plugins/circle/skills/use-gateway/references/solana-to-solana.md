# Transfer Unified USDC from Solana to Solana

This example burns from Solana Devnet and mints back to Solana Devnet. The same pattern applies to other supported Solana Gateway environments after substituting the correct RPC endpoint, Gateway addresses, and USDC mint address.

Canonical runnable references:
- Transfer unified USDC balance: https://developers.circle.com/gateway/howtos/transfer-unified-usdc-balance.md
- Unified balance Solana quickstart: https://developers.circle.com/gateway/quickstarts/unified-balance-solana.md

## What this does

This script:

1. Builds a Solana Gateway burn intent
2. Signs the encoded burn intent with the Solana keypair
3. Submits the signed burn intent to the Gateway `/transfer` API
4. Prepares the recipient Solana USDC ATA
5. Calls `gatewayMint` on Solana via Anchor
6. Waits for mint confirmation

## Runnable example

```ts
import { randomBytes, sign } from "node:crypto";
import { Buffer } from "buffer";

import {
  AnchorProvider,
  Program,
  Wallet,
  setProvider,
  utils,
} from "@coral-xyz/anchor";
import {
  Layout,
  blob,
  nu64be,
  offset,
  seq,
  struct,
  u32be,
} from "@solana/buffer-layout";
import {
  TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountIdempotentInstruction,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
} from "@solana/web3.js";
import { type Hex } from "viem";

const GATEWAY_API_URL = "https://gateway-api-testnet.circle.com/v1/transfer";

const SOLANA_CONFIG = {
  rpcEndpoint: "https://api.devnet.solana.com",
  domain: 5,
  gatewayWallet: "GATEwdfmYNELfp5wDmmR6noSr2vHnAfBPMm2PvCzX5vu",
  gatewayMinter: "GATEmKK2ECL1brEngQZWCgMWPbvrEYqsV6u29dAaHavr",
  usdc: "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU",
  zeroAddress: "11111111111111111111111111111111",
};

const TRANSFER_AMOUNT = 5_000_000n; // 5 USDC (6 decimals)
// Confirm the appropriate maxFee for the selected chains and environment in the canonical Gateway docs.
const MAX_FEE = 2_010000n;
const MAX_UINT64 = 2n ** 64n - 1n;
const TRANSFER_SPEC_MAGIC = 0xca85def7;
const BURN_INTENT_MAGIC = 0x070afbc2;

const gatewayMinterIdl = {
  address: SOLANA_CONFIG.gatewayMinter,
  metadata: { name: "gatewayMinter", version: "0.1.0", spec: "0.1.0" },
  instructions: [
    {
      name: "gatewayMint",
      discriminator: [12, 0],
      accounts: [
        { name: "payer", writable: true, signer: true },
        { name: "destinationCaller", signer: true },
        { name: "gatewayMinter" },
        { name: "systemProgram" },
        { name: "tokenProgram" },
        { name: "eventAuthority" },
        { name: "program" },
      ],
      args: [
        {
          name: "params",
          type: { defined: { name: "gatewayMintParams" } },
        },
      ],
    },
  ],
  types: [
    {
      name: "gatewayMintParams",
      type: {
        kind: "struct",
        fields: [
          { name: "attestation", type: "bytes" },
          { name: "signature", type: "bytes" },
        ],
      },
    },
  ],
} as const;

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

const MintAttestationElementLayout = struct([
  publicKey("destinationToken"),
  publicKey("destinationRecipient"),
  nu64be("value"),
  blob(32, "transferSpecHash"),
  u32be("hookDataLength"),
  blob(offset(u32be(), -4), "hookData"),
] as never);

const MintAttestationSetLayout = struct([
  u32be("magic"),
  u32be("version"),
  u32be("destinationDomain"),
  publicKey("destinationContract"),
  publicKey("destinationCaller"),
  nu64be("maxBlockHeight"),
  u32be("numAttestations"),
  seq(MintAttestationElementLayout, offset(u32be(), -4), "attestations"),
] as never);

if (!process.env.SOLANA_PRIVATE_KEYPAIR) {
  throw new Error("SOLANA_PRIVATE_KEYPAIR not set");
}

const sourceSecretKey = Uint8Array.from(
  JSON.parse(process.env.SOLANA_PRIVATE_KEYPAIR),
);
const sourceKeypair = Keypair.fromSecretKey(sourceSecretKey);

const recipientAddress =
  process.env.RECIPIENT_ADDRESS ?? sourceKeypair.publicKey.toBase58();

function randomHex32(): Hex {
  return `0x${randomBytes(32).toString("hex")}` as Hex;
}

function solanaAddressToBytes32(addressBytes: Uint8Array): Hex {
  return `0x${Buffer.from(addressBytes).toString("hex")}` as Hex;
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

  const signature = sign(null, Buffer.from(prefixed), {
    key: Buffer.concat([
      Buffer.from("302e020100300506032b657004220420", "hex"),
      Buffer.from(secretKey.slice(0, 32)),
    ]),
    dsaEncoding: "ieee-p1363",
  });

  return `0x${signature.toString("hex")}` as Hex;
}

function findCustodyPda(
  mint: PublicKey,
  minterProgramId: PublicKey,
): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("gateway_minter_custody"), mint.toBuffer()],
    minterProgramId,
  )[0];
}

function findTransferSpecHashPda(
  transferSpecHash: Uint8Array | Buffer,
  minterProgramId: PublicKey,
): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("used_transfer_spec_hash"), Buffer.from(transferSpecHash)],
    minterProgramId,
  )[0];
}

function decodeAttestationSet(attestation: Hex) {
  return MintAttestationSetLayout.decode(
    Buffer.from(attestation.slice(2), "hex"),
  ) as {
    attestations: Array<{
      destinationToken: Buffer;
      destinationRecipient: Buffer;
      transferSpecHash: Uint8Array;
    }>;
  };
}

async function main() {
  const connection = new Connection(SOLANA_CONFIG.rpcEndpoint, "confirmed");
  const sourceWallet = new Wallet(sourceKeypair);
  const recipientPublicKey = new PublicKey(recipientAddress);
  const usdcMint = new PublicKey(SOLANA_CONFIG.usdc);
  const minterProgramId = new PublicKey(SOLANA_CONFIG.gatewayMinter);

  const recipientAta = getAssociatedTokenAddressSync(usdcMint, recipientPublicKey);

  const sourceGatewayWalletBytes = solanaAddressToBytes32(
    Buffer.from(new PublicKey(SOLANA_CONFIG.gatewayWallet).toBytes()),
  );
  const sourceUsdcBytes = solanaAddressToBytes32(
    Buffer.from(new PublicKey(SOLANA_CONFIG.usdc).toBytes()),
  );
  const sourcePublicKeyBytes = solanaAddressToBytes32(
    Buffer.from(sourceWallet.publicKey.toBytes()),
  );
  const recipientAtaBytes = solanaAddressToBytes32(
    Buffer.from(recipientAta.toBytes()),
  );
  const destinationCallerBytes = solanaAddressToBytes32(
    Buffer.from(new PublicKey(SOLANA_CONFIG.zeroAddress).toBytes()),
  );

  const burnIntent = {
    maxBlockHeight: MAX_UINT64,
    maxFee: MAX_FEE,
    spec: {
      version: 1,
      sourceDomain: SOLANA_CONFIG.domain,
      destinationDomain: SOLANA_CONFIG.domain,
      sourceContract: sourceGatewayWalletBytes,
      destinationContract: solanaAddressToBytes32(
        Buffer.from(minterProgramId.toBytes()),
      ),
      sourceToken: sourceUsdcBytes,
      destinationToken: sourceUsdcBytes,
      sourceDepositor: sourcePublicKeyBytes,
      destinationRecipient: recipientAtaBytes,
      sourceSigner: sourcePublicKeyBytes,
      destinationCaller: destinationCallerBytes,
      value: TRANSFER_AMOUNT,
      salt: randomHex32(),
      hookData: "0x" as Hex,
    },
  };

  const encoded = encodeSolanaBurnIntent(burnIntent);
  const burnSignature = signSolanaBurnIntent(sourceSecretKey, encoded);

  const transferResponse = await fetch(GATEWAY_API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify([
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
    ]),
  });

  if (!transferResponse.ok) {
    throw new Error(
      `Gateway API request failed: ${transferResponse.status} ${await transferResponse.text()}`,
    );
  }

  const { attestation, signature } = (await transferResponse.json()) as {
    attestation: Hex;
    signature: Hex;
  };

  const createAtaIx = createAssociatedTokenAccountIdempotentInstruction(
    sourceWallet.publicKey,
    recipientAta,
    recipientPublicKey,
    usdcMint,
  );

  const ataTx = new Transaction().add(createAtaIx);
  const { blockhash, lastValidBlockHeight } =
    await connection.getLatestBlockhash();
  ataTx.recentBlockhash = blockhash;
  ataTx.feePayer = sourceWallet.publicKey;

  const ataSignature = await connection.sendTransaction(ataTx, [sourceKeypair]);
  await connection.confirmTransaction(
    { signature: ataSignature, blockhash, lastValidBlockHeight },
    "confirmed",
  );

  const provider = new AnchorProvider(
    connection,
    sourceWallet,
    AnchorProvider.defaultOptions(),
  );
  setProvider(provider);

  const minterProgram = new Program(gatewayMinterIdl, provider);
  const [minterPda] = PublicKey.findProgramAddressSync(
    [Buffer.from(utils.bytes.utf8.encode("gateway_minter"))],
    minterProgramId,
  );

  const decoded = decodeAttestationSet(attestation);
  const remainingAccounts = decoded.attestations.flatMap((entry) => [
    {
      pubkey: findCustodyPda(new PublicKey(entry.destinationToken), minterProgramId),
      isWritable: true,
      isSigner: false,
    },
    {
      pubkey: new PublicKey(entry.destinationRecipient),
      isWritable: true,
      isSigner: false,
    },
    {
      pubkey: findTransferSpecHashPda(entry.transferSpecHash, minterProgramId),
      isWritable: true,
      isSigner: false,
    },
  ]);

  const mintSignature = await minterProgram.methods
    .gatewayMint({
      attestation: Buffer.from(attestation.slice(2), "hex"),
      signature: Buffer.from(signature.slice(2), "hex"),
    })
    .accountsPartial({
      gatewayMinter: minterPda,
      destinationCaller: sourceWallet.publicKey,
      payer: sourceWallet.publicKey,
      systemProgram: SystemProgram.programId,
      tokenProgram: TOKEN_PROGRAM_ID,
    })
    .remainingAccounts(remainingAccounts)
    .rpc();

  console.log(`Prepared recipient ATA: ${recipientAta.toBase58()}`);
  console.log(`Mint transaction: ${mintSignature}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
```

