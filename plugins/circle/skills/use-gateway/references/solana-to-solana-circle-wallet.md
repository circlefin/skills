# Transfer Unified USDC from Solana to Solana via Circle Wallets

This example burns from Solana Devnet and mints on Solana Devnet. The same pattern applies to other supported Solana Gateway environments after substituting the correct RPC endpoint, Gateway addresses, and USDC mint address.

Canonical runnable references:
- Unified balance Solana quickstart: https://developers.circle.com/gateway/quickstarts/unified-balance-solana.md
- Transfer unified USDC balance: https://developers.circle.com/gateway/howtos/transfer-unified-usdc-balance.md

## What this does

This script:

1. Creates the recipient Solana USDC ATA if needed
2. Builds a Solana Gateway burn intent
3. Signs the prefixed burn-intent payload with Circle Wallets `signMessage`
4. Submits the signed burn intent to the Gateway `/transfer` API
5. Builds the Solana `gatewayMint` instruction with Anchor
6. Signs and broadcasts the mint transaction through Circle Wallets

## Runnable example

```ts
import { randomBytes } from "node:crypto";
import { initiateDeveloperControlledWalletsClient } from "@circle-fin/developer-controlled-wallets";
import {
  Wallet,
  AnchorProvider,
  Program,
  setProvider,
  utils,
} from "@coral-xyz/anchor";
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
} from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountIdempotentInstruction,
} from "@solana/spl-token";
import {
  u32be,
  nu64be,
  struct,
  seq,
  blob,
  offset,
  Layout,
} from "@solana/buffer-layout";
import bs58 from "bs58";

const RPC_ENDPOINT = "https://api.devnet.solana.com";
const GATEWAY_WALLET_ADDRESS = "GATEwdfmYNELfp5wDmmR6noSr2vHnAfBPMm2PvCzX5vu";
const GATEWAY_MINTER_ADDRESS = "GATEmKK2ECL1brEngQZWCgMWPbvrEYqsV6u29dAaHavr";
const USDC_ADDRESS = "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU";
const SOLANA_ZERO_ADDRESS = "11111111111111111111111111111111";
const SOLANA_DOMAIN = 5;
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

const MintAttestationElementLayout = struct([
  publicKey("destinationToken"),
  publicKey("destinationRecipient"),
  nu64be("value"),
  blob(32, "transferSpecHash"),
  u32be("hookDataLength"),
  blob(offset(u32be(), -4), "hookData"),
] as any);

const MintAttestationSetLayout = struct([
  u32be("magic"),
  u32be("version"),
  u32be("destinationDomain"),
  publicKey("destinationContract"),
  publicKey("destinationCaller"),
  nu64be("maxBlockHeight"),
  u32be("numAttestations"),
  seq(MintAttestationElementLayout, offset(u32be(), -4), "attestations"),
] as any);

const gatewayMinterIdl = {
  address: GATEWAY_MINTER_ADDRESS,
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
  sourceSigner: string;
}) {
  const { sourceDepositor, destinationRecipient, sourceSigner } = params;

  return {
    maxBlockHeight: MAX_UINT64,
    maxFee: MAX_FEE,
    spec: {
      version: 1,
      sourceDomain: SOLANA_DOMAIN,
      destinationDomain: SOLANA_DOMAIN,
      sourceContract: addressToBytes32(GATEWAY_WALLET_ADDRESS),
      destinationContract: addressToBytes32(GATEWAY_MINTER_ADDRESS),
      sourceToken: addressToBytes32(USDC_ADDRESS),
      destinationToken: addressToBytes32(USDC_ADDRESS),
      sourceDepositor: addressToBytes32(sourceDepositor),
      destinationRecipient: addressToBytes32(destinationRecipient),
      sourceSigner: addressToBytes32(sourceSigner),
      destinationCaller: addressToBytes32(SOLANA_ZERO_ADDRESS),
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

function addressToBytes32(address: string): string {
  const decoded = Buffer.from(bs58.decode(address));
  return `0x${decoded.toString("hex")}`;
}

function hexToPublicKey(hex: string): PublicKey {
  return new PublicKey(Buffer.from(hex.slice(2), "hex"));
}

function decodeAttestationSet(attestation: string) {
  const buffer = Buffer.from(attestation.slice(2), "hex");
  return MintAttestationSetLayout.decode(buffer) as {
    attestations: Array<{
      destinationToken: PublicKey;
      destinationRecipient: PublicKey;
      transferSpecHash: Uint8Array;
    }>;
  };
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

async function signAndBroadcast(
  transaction: Transaction,
  label: string,
): Promise<string> {
  const serialized = transaction.serialize({
    requireAllSignatures: false,
    verifySignatures: false,
  });

  const signResult = await client.signTransaction({
    walletAddress: DEPOSITOR_ADDRESS,
    blockchain: "SOL-DEVNET",
    rawTransaction: serialized.toString("base64"),
  });

  const signedTxBase64 = signResult.data?.signedTransaction;
  if (!signedTxBase64) {
    throw new Error(`Failed to sign ${label}`);
  }

  const signedTxBytes = Buffer.from(signedTxBase64, "base64");
  const connection = new Connection(RPC_ENDPOINT, "confirmed");
  return connection.sendRawTransaction(signedTxBytes);
}

async function main() {
  const connection = new Connection(RPC_ENDPOINT, "confirmed");
  const usdcMint = new PublicKey(USDC_ADDRESS);
  const minterProgramId = new PublicKey(GATEWAY_MINTER_ADDRESS);
  const owner = new PublicKey(DEPOSITOR_ADDRESS);
  const recipientPubkey = new PublicKey(RECIPIENT_ADDRESS);

  const dummyWallet = new Wallet(Keypair.generate());
  const provider = new AnchorProvider(
    connection,
    dummyWallet,
    AnchorProvider.defaultOptions(),
  );
  setProvider(provider);

  const recipientAta = getAssociatedTokenAddressSync(usdcMint, recipientPubkey);

  const { blockhash: ataBlockhash, lastValidBlockHeight: ataBlockHeight } =
    await connection.getLatestBlockhash();
  const ataTx = new Transaction();
  ataTx.add(
    createAssociatedTokenAccountIdempotentInstruction(
      owner,
      recipientAta,
      recipientPubkey,
      usdcMint,
    ),
  );
  ataTx.recentBlockhash = ataBlockhash;
  ataTx.feePayer = owner;

  const ataSig = await signAndBroadcast(ataTx, "ATA creation");
  await connection.confirmTransaction(
    {
      signature: ataSig,
      blockhash: ataBlockhash,
      lastValidBlockHeight: ataBlockHeight,
    },
    "confirmed",
  );

  const burnIntent = createBurnIntent({
    sourceDepositor: owner.toBase58(),
    destinationRecipient: recipientAta.toBase58(),
    sourceSigner: owner.toBase58(),
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
    body: JSON.stringify(
      [{ burnIntent, signature: formattedSignature }],
      (_key, value) => (typeof value === "bigint" ? value.toString() : value),
    ),
  });

  if (!response.ok) {
    throw new Error(
      `Gateway API request failed: ${response.status} ${await response.text()}`,
    );
  }

  const json = await response.json();
  const { attestation, signature: mintSignature } = json as {
    attestation: string;
    signature: string;
  };

  const minterProgram = new Program(gatewayMinterIdl, provider);
  const [minterPda] = PublicKey.findProgramAddressSync(
    [Buffer.from(utils.bytes.utf8.encode("gateway_minter"))],
    minterProgramId,
  );

  const decoded = decodeAttestationSet(attestation);
  const remainingAccounts = decoded.attestations.flatMap((entry) => [
    {
      pubkey: findCustodyPda(entry.destinationToken, minterProgramId),
      isWritable: true,
      isSigner: false,
    },
    { pubkey: entry.destinationRecipient, isWritable: true, isSigner: false },
    {
      pubkey: findTransferSpecHashPda(entry.transferSpecHash, minterProgramId),
      isWritable: true,
      isSigner: false,
    },
  ]);

  const mintIx = await minterProgram.methods
    .gatewayMint({
      attestation: Buffer.from(attestation.slice(2), "hex"),
      signature: Buffer.from(mintSignature.slice(2), "hex"),
    })
    .accountsPartial({
      gatewayMinter: minterPda,
      destinationCaller: owner,
      payer: owner,
      systemProgram: SystemProgram.programId,
      tokenProgram: TOKEN_PROGRAM_ID,
    })
    .remainingAccounts(remainingAccounts)
    .instruction();

  const { blockhash, lastValidBlockHeight } =
    await connection.getLatestBlockhash();
  const mintTx = new Transaction();
  mintTx.add(mintIx);
  mintTx.recentBlockhash = blockhash;
  mintTx.feePayer = owner;

  const mintSig = await signAndBroadcast(mintTx, "mint");
  await connection.confirmTransaction(
    { signature: mintSig, blockhash, lastValidBlockHeight },
    "confirmed",
  );

  console.log(`Minted ${TRANSFER_AMOUNT_USDC} USDC`);
  console.log(`Mint transaction hash (Solana Devnet): ${mintSig}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
```

