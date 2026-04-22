# Transfer Unified USDC from EVM to Solana

This example burns from Arc Testnet and mints on Solana Devnet. The same pattern applies to other supported EVM source chains and Solana Gateway environments after substituting the correct chain config, contract addresses, domain IDs, and Solana addresses.

Canonical runnable references:
- Transfer unified USDC balance: https://developers.circle.com/gateway/howtos/transfer-unified-usdc-balance.md
- Unified balance Solana quickstart: https://developers.circle.com/gateway/quickstarts/unified-balance-solana.md
- Arc crosschain USDC tutorial: https://docs.arc.network/arc/tutorials/access-usdc-crosschain.md

## What this does

This script:

1. Builds a Gateway burn intent for an EVM source chain
2. Signs the burn intent as EIP-712 typed data
3. Submits the signed burn intent to the Gateway `/transfer` API
4. Prepares the recipient Solana USDC ATA
5. Calls `gatewayMint` on Solana via Anchor
6. Waits for the mint transaction to confirm

## Runnable example

```ts
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
import { maxUint64, pad, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";

const GATEWAY_API_URL = "https://gateway-api-testnet.circle.com/v1/transfer";

const SOURCE_CHAIN = {
  domain: 26,
  gatewayWallet: "0x0077777d7EBA4688BDeF3E311b846F25870A19B9",
  usdc: "0x3600000000000000000000000000000000000000",
};

const SOLANA_CONFIG = {
  rpcEndpoint: "https://api.devnet.solana.com",
  domain: 5,
  gatewayMinter: "GATEmKK2ECL1brEngQZWCgMWPbvrEYqsV6u29dAaHavr",
  usdc: "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU",
  zeroAddress: "11111111111111111111111111111111",
};

const TRANSFER_AMOUNT = 5_000_000n; // 5 USDC (6 decimals)
// Confirm the appropriate maxFee for the selected chains and environment in the canonical Gateway docs.
const MAX_FEE = 2_010000n;

const eip712Domain = {
  name: "GatewayWallet",
  version: "1",
} as const;

const eip712Types = {
  TransferSpec: [
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
  ],
  BurnIntent: [
    { name: "maxBlockHeight", type: "uint256" },
    { name: "maxFee", type: "uint256" },
    { name: "spec", type: "TransferSpec" },
  ],
} as const;

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

class PublicKeyLayout extends Layout<PublicKey> {
  constructor(property: string) {
    super(32, property);
  }

  decode(buffer: Buffer, byteOffset = 0): PublicKey {
    return new PublicKey(buffer.subarray(byteOffset, byteOffset + 32));
  }

  encode(source: PublicKey, buffer: Buffer, byteOffset = 0): number {
    source.toBuffer().copy(buffer, byteOffset);
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

if (!process.env.EVM_PRIVATE_KEY) {
  throw new Error("EVM_PRIVATE_KEY not set");
}

if (!process.env.SOLANA_PRIVATE_KEYPAIR) {
  throw new Error("SOLANA_PRIVATE_KEYPAIR not set");
}

const evmAccount = privateKeyToAccount(
  process.env.EVM_PRIVATE_KEY as `0x${string}`,
);

const solanaSecretKey = Uint8Array.from(
  JSON.parse(process.env.SOLANA_PRIVATE_KEYPAIR),
);
const solanaKeypair = Keypair.fromSecretKey(solanaSecretKey);

function randomHex32(): Hex {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return `0x${Buffer.from(bytes).toString("hex")}` as Hex;
}

function evmAddressToBytes32(address: Hex): Hex {
  return pad(address.toLowerCase(), { size: 32 });
}

function solanaAddressToBytes32(address: string): Hex {
  return `0x${new PublicKey(address).toBuffer().toString("hex")}` as Hex;
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
      destinationToken: PublicKey;
      destinationRecipient: PublicKey;
      transferSpecHash: Uint8Array;
    }>;
  };
}

async function main() {
  const connection = new Connection(SOLANA_CONFIG.rpcEndpoint, "confirmed");
  const solanaWallet = new Wallet(solanaKeypair);

  const destinationMint = new PublicKey(SOLANA_CONFIG.usdc);
  const recipientAta = getAssociatedTokenAddressSync(
    destinationMint,
    solanaWallet.publicKey,
  );

  const burnIntent = {
    maxBlockHeight: maxUint64,
    maxFee: MAX_FEE,
    spec: {
      version: 1,
      sourceDomain: SOURCE_CHAIN.domain,
      destinationDomain: SOLANA_CONFIG.domain,
      sourceContract: evmAddressToBytes32(
        SOURCE_CHAIN.gatewayWallet as `0x${string}`,
      ),
      destinationContract: solanaAddressToBytes32(SOLANA_CONFIG.gatewayMinter),
      sourceToken: evmAddressToBytes32(SOURCE_CHAIN.usdc as `0x${string}`),
      destinationToken: solanaAddressToBytes32(SOLANA_CONFIG.usdc),
      sourceDepositor: evmAddressToBytes32(evmAccount.address),
      destinationRecipient: solanaAddressToBytes32(recipientAta.toBase58()),
      sourceSigner: evmAddressToBytes32(evmAccount.address),
      destinationCaller: solanaAddressToBytes32(SOLANA_CONFIG.zeroAddress),
      value: TRANSFER_AMOUNT,
      salt: randomHex32(),
      hookData: "0x" as Hex,
    },
  };

  const burnSignature = await evmAccount.signTypedData({
    domain: eip712Domain,
    types: eip712Types,
    primaryType: "BurnIntent",
    message: {
      ...burnIntent,
      maxBlockHeight: burnIntent.maxBlockHeight.toString(),
      maxFee: burnIntent.maxFee.toString(),
      spec: {
        ...burnIntent.spec,
        value: burnIntent.spec.value.toString(),
      },
    },
  });

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
    solanaWallet.publicKey,
    recipientAta,
    solanaWallet.publicKey,
    destinationMint,
  );

  const provider = new AnchorProvider(
    connection,
    solanaWallet,
    AnchorProvider.defaultOptions(),
  );
  setProvider(provider);

  const minterProgram = new Program(gatewayMinterIdl, provider);
  const minterProgramId = new PublicKey(SOLANA_CONFIG.gatewayMinter);
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
    {
      pubkey: entry.destinationRecipient,
      isWritable: true,
      isSigner: false,
    },
    {
      pubkey: findTransferSpecHashPda(entry.transferSpecHash, minterProgramId),
      isWritable: true,
      isSigner: false,
    },
  ]);

  const transaction = new Transaction().add(createAtaIx);
  const { blockhash, lastValidBlockHeight } =
    await connection.getLatestBlockhash();
  transaction.recentBlockhash = blockhash;
  transaction.feePayer = solanaWallet.publicKey;

  const ataSignature = await connection.sendTransaction(transaction, [solanaKeypair]);
  await connection.confirmTransaction(
    { signature: ataSignature, blockhash, lastValidBlockHeight },
    "confirmed",
  );

  const mintSignature = await minterProgram.methods
    .gatewayMint({
      attestation: Buffer.from(attestation.slice(2), "hex"),
      signature: Buffer.from(signature.slice(2), "hex"),
    })
    .accountsPartial({
      gatewayMinter: minterPda,
      destinationCaller: solanaWallet.publicKey,
      payer: solanaWallet.publicKey,
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

