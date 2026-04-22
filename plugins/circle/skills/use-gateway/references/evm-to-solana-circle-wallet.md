# Transfer Unified USDC from EVM to Solana via Circle Wallets

This example burns from Ethereum Sepolia and mints on Solana Devnet. The same pattern applies to other supported EVM source chains and Solana Gateway environments after substituting the correct config, contract addresses, domain IDs, and Circle Wallet blockchain identifiers.

Canonical runnable references:
- Transfer unified USDC balance: https://developers.circle.com/gateway/howtos/transfer-unified-usdc-balance.md
- Unified balance EVM quickstart: https://developers.circle.com/gateway/quickstarts/unified-balance-evm.md
- Unified balance Solana quickstart: https://developers.circle.com/gateway/quickstarts/unified-balance-solana.md

## What this does

This script:

1. Creates the recipient Solana USDC ATA if needed
2. Builds an EVM Gateway burn intent
3. Signs the burn intent with Circle Wallets `signTypedData`
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

const SOURCE_CHAIN = "ETH-SEPOLIA";
const SOURCE_CHAIN_NAME = "Ethereum Sepolia";
const SOURCE_DOMAIN = 0;
const SOURCE_USDC = "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238";
const EVM_GATEWAY_WALLET = "0x0077777d7EBA4688BDeF3E311b846F25870A19B9";

const RPC_ENDPOINT = "https://api.devnet.solana.com";
const SOLANA_GATEWAY_MINTER = "GATEmKK2ECL1brEngQZWCgMWPbvrEYqsV6u29dAaHavr";
const SOLANA_USDC = "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU";
const SOLANA_DOMAIN = 5;
const SOLANA_ZERO_ADDRESS = "11111111111111111111111111111111";

const TRANSFER_AMOUNT_USDC = "5";
// Confirm the appropriate maxFee for the selected chains and environment in the canonical Gateway docs.
const MAX_FEE = 2_010000n;
const MAX_UINT64 = 2n ** 64n - 1n;
const MAX_UINT64_DEC = MAX_UINT64.toString();

const API_KEY = process.env.CIRCLE_API_KEY!;
const ENTITY_SECRET = process.env.CIRCLE_ENTITY_SECRET!;
const DEPOSITOR_ADDRESS = process.env.DEPOSITOR_ADDRESS!;
const RECIPIENT_ADDRESS = process.env.RECIPIENT_ADDRESS!;

if (!API_KEY || !ENTITY_SECRET || !DEPOSITOR_ADDRESS || !RECIPIENT_ADDRESS) {
  throw new Error(
    "Missing required env vars: CIRCLE_API_KEY, CIRCLE_ENTITY_SECRET, DEPOSITOR_ADDRESS, RECIPIENT_ADDRESS",
  );
}

const eip712Domain = { name: "GatewayWallet", version: "1" };

const EIP712Domain = [
  { name: "name", type: "string" },
  { name: "version", type: "string" },
];

const TransferSpec = [
  { name: "version", type: "uint32" },
  { name: "sourceDomain", type: "uint32" },
  { name: "destinationDomain", type: "uint32" },
  { name: "sourceContract", type: "bytes32" },
  { name: "destinationContract", type: "bytes32" },
  { name: "sourceToken", type: "bytes32" },
  { name: "destinationToken", type: "bytes32" },
  { name: "sourceDepositor", type: "bytes32" },
  { name: "destinationRecipient", type: "bytes32" },
  { name: "sourceSigner", type: "bytes32" },
  { name: "destinationCaller", type: "bytes32" },
  { name: "value", type: "uint256" },
  { name: "salt", type: "bytes32" },
  { name: "hookData", type: "bytes" },
];

const BurnIntent = [
  { name: "maxBlockHeight", type: "uint256" },
  { name: "maxFee", type: "uint256" },
  { name: "spec", type: "TransferSpec" },
];

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
  address: SOLANA_GATEWAY_MINTER,
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
  depositorAddress: string;
  recipientAta: string;
}) {
  const { depositorAddress, recipientAta } = params;

  return {
    maxBlockHeight: MAX_UINT64_DEC,
    maxFee: MAX_FEE,
    spec: {
      version: 1,
      sourceDomain: SOURCE_DOMAIN,
      destinationDomain: SOLANA_DOMAIN,
      sourceContract: EVM_GATEWAY_WALLET,
      destinationContract: solanaAddressToBytes32(SOLANA_GATEWAY_MINTER),
      sourceToken: SOURCE_USDC,
      destinationToken: solanaAddressToBytes32(SOLANA_USDC),
      sourceDepositor: depositorAddress,
      destinationRecipient: solanaAddressToBytes32(recipientAta),
      sourceSigner: depositorAddress,
      destinationCaller: solanaAddressToBytes32(SOLANA_ZERO_ADDRESS),
      value: parseBalance(TRANSFER_AMOUNT_USDC),
      salt: "0x" + randomBytes(32).toString("hex"),
      hookData: "0x",
    },
  };
}

function burnIntentTypedData(burnIntent: ReturnType<typeof createBurnIntent>) {
  return {
    types: { EIP712Domain, TransferSpec, BurnIntent },
    domain: eip712Domain,
    primaryType: "BurnIntent",
    message: {
      ...burnIntent,
      spec: {
        ...burnIntent.spec,
        sourceContract: evmAddressToBytes32(burnIntent.spec.sourceContract),
        destinationContract: burnIntent.spec.destinationContract,
        sourceToken: evmAddressToBytes32(burnIntent.spec.sourceToken),
        destinationToken: burnIntent.spec.destinationToken,
        sourceDepositor: evmAddressToBytes32(burnIntent.spec.sourceDepositor),
        destinationRecipient: burnIntent.spec.destinationRecipient,
        sourceSigner: evmAddressToBytes32(burnIntent.spec.sourceSigner),
        destinationCaller: burnIntent.spec.destinationCaller,
      },
    },
  };
}

function solanaAddressToBytes32(address: string): string {
  const decoded = Buffer.from(bs58.decode(address));
  return `0x${decoded.toString("hex")}`;
}

function evmAddressToBytes32(address: string): string {
  return "0x" + address.toLowerCase().replace(/^0x/, "").padStart(64, "0");
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
  walletAddress: string,
  label: string,
): Promise<string> {
  const serialized = transaction.serialize({
    requireAllSignatures: false,
    verifySignatures: false,
  });

  const signResult = await client.signTransaction({
    walletAddress,
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

function stringifyTypedData<T>(obj: T) {
  return JSON.stringify(obj, (_key, value) =>
    typeof value === "bigint" ? value.toString() : value,
  );
}

async function main() {
  const connection = new Connection(RPC_ENDPOINT, "confirmed");
  const usdcMint = new PublicKey(SOLANA_USDC);
  const minterProgramId = new PublicKey(SOLANA_GATEWAY_MINTER);
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
      recipientPubkey,
      recipientAta,
      recipientPubkey,
      usdcMint,
    ),
  );
  ataTx.recentBlockhash = ataBlockhash;
  ataTx.feePayer = recipientPubkey;

  const ataSig = await signAndBroadcast(ataTx, RECIPIENT_ADDRESS, "ATA creation");
  await connection.confirmTransaction(
    {
      signature: ataSig,
      blockhash: ataBlockhash,
      lastValidBlockHeight: ataBlockHeight,
    },
    "confirmed",
  );

  const burnIntent = createBurnIntent({
    depositorAddress: DEPOSITOR_ADDRESS,
    recipientAta: recipientAta.toBase58(),
  });

  const typedData = burnIntentTypedData(burnIntent);
  const sigResp = await client.signTypedData({
    walletAddress: DEPOSITOR_ADDRESS,
    blockchain: SOURCE_CHAIN,
    data: stringifyTypedData(typedData),
  });

  const burnIntentSignature = sigResp.data?.signature;
  if (!burnIntentSignature) {
    throw new Error("Failed to sign burn intent");
  }

  const response = await fetch("https://gateway-api-testnet.circle.com/v1/transfer", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: stringifyTypedData([
      { burnIntent: typedData.message, signature: burnIntentSignature },
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

  const { attestation, signature: mintSignature } = json;
  if (!attestation || !mintSignature) {
    throw new Error("Missing attestation or operator signature in Gateway API response");
  }

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
      destinationCaller: recipientPubkey,
      payer: recipientPubkey,
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
  mintTx.feePayer = recipientPubkey;

  const mintSig = await signAndBroadcast(mintTx, RECIPIENT_ADDRESS, "mint");
  await connection.confirmTransaction(
    { signature: mintSig, blockhash, lastValidBlockHeight },
    "confirmed",
  );

  console.log(`Minted ${TRANSFER_AMOUNT_USDC} USDC on Solana Devnet`);
  console.log(`Mint transaction hash: ${mintSig}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
```

