# Gateway Solana-to-Solana Transfer

Browser-wallet Solana -> Solana transfer flow:
1. Prepare destination ATA (idempotent)
2. Sign Solana burn intent with wallet.signMessage
3. Submit to Gateway API for attestation
4. Call gatewayMint on Solana

**NOTE:** Some browser wallets such as Phantom reject payloads that are not strictly Solana transactions. This workflow has been found to work with Solflare.

```typescript
import { Buffer } from "buffer";

import {
  AnchorProvider,
  Program,
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
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import {
  PublicKey,
  SystemProgram,
  Transaction,
} from "@solana/web3.js";
import { useState } from "react";
import { parseUnits, type Hex } from "viem";

import {
  GATEWAY_CONFIG,
  SOLANA_ZERO_ADDRESS,
  gatewayMinterIdl,
  solanaContracts,
} from "./contract-addresses.js";

const TRANSFER_SPEC_MAGIC = 0xca85def7;
const BURN_INTENT_MAGIC = 0x070afbc2;
const MAX_UINT64 = 2n ** 64n - 1n;
const MAX_FEE = 2_010000n;

type TransferStep = "idle" | "preparing" | "signing" | "attesting" | "minting" | "success";
type NetworkType = "mainnet" | "testnet";

const NETWORK = "testnet" as NetworkType;
const DEFAULT_TRANSFER_AMOUNT_USDC = "1";

interface SolSolTransferInput {
  transferAmountUsdc: string;
  recipientAddress?: string;
}

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
    ] as any,
    "spec"
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

function randomHex32(): Hex {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return (`0x${Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")}`) as Hex;
}

function solanaAddressToBytes32(address: string): Hex {
  return (`0x${new PublicKey(address).toBuffer().toString("hex")}`) as Hex;
}

function hexToPublicKey(address: Hex): PublicKey {
  return new PublicKey(Buffer.from(address.slice(2), "hex"));
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
      sourceContract: hexToPublicKey(burnIntent.spec.sourceContract),
      destinationContract: hexToPublicKey(burnIntent.spec.destinationContract),
      sourceToken: hexToPublicKey(burnIntent.spec.sourceToken),
      destinationToken: hexToPublicKey(burnIntent.spec.destinationToken),
      sourceDepositor: hexToPublicKey(burnIntent.spec.sourceDepositor),
      destinationRecipient: hexToPublicKey(burnIntent.spec.destinationRecipient),
      sourceSigner: hexToPublicKey(burnIntent.spec.sourceSigner),
      destinationCaller: hexToPublicKey(burnIntent.spec.destinationCaller),
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

function decodeAttestationSet(attestation: Hex) {
  return MintAttestationSetLayout.decode(
    Buffer.from(attestation.slice(2), "hex")
  ) as {
    attestations: Array<{
      destinationToken: PublicKey;
      destinationRecipient: PublicKey;
      transferSpecHash: Uint8Array;
    }>;
  };
}

function findCustodyPda(
  mint: PublicKey,
  minterProgramId: PublicKey
): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("gateway_minter_custody"), mint.toBuffer()],
    minterProgramId
  )[0];
}

function findTransferSpecHashPda(
  transferSpecHash: Uint8Array | Buffer,
  minterProgramId: PublicKey
): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("used_transfer_spec_hash"), Buffer.from(transferSpecHash)],
    minterProgramId
  )[0];
}

/**
 * NOTE: Some browser wallets such as Phantom reject payloads
 * that are not strictly Solana transactions. This workflow has
 * been found to work with Solflare.
 */
async function signSolanaBurnIntentWithWallet(
  signMessage: (message: Uint8Array) => Promise<Uint8Array>,
  encodedBurnIntent: Uint8Array
): Promise<Hex> {
  const prefixed = new Uint8Array(16 + encodedBurnIntent.length);
  prefixed.set([0xff], 0);
  prefixed.set(encodedBurnIntent, 16);

  try {
    const signature = await signMessage(prefixed);
    return (`0x${Array.from(signature)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("")}`) as Hex;
  } catch (error) {
    console.warn(
      "This wallet does not support signing transactions that aren't strictly Solana transactions. Try another wallet such as Solflare.",
      error
    );
    throw error;
  }
}

/**
 * Browser-wallet Solana -> Solana transfer:
 * 1) Prepare destination ATA (idempotent)
 * 2) Sign Solana burn intent with wallet.signMessage
 * 3) Submit to Gateway API
 * 4) Call gatewayMint on destination Solana
 */
export default function TransferGatewayBalanceSolSol() {
  const { connection } = useConnection();
  const solWallet = useWallet();
  const { publicKey: solanaPublicKey, signMessage, sendTransaction } = solWallet;

  const [step, setStep] = useState<TransferStep>("idle");
  const [error, setError] = useState<string | null>(null);
  const [mintTxHash, setMintTxHash] = useState<string | null>(null);

  const handleTransfer = async (
    input: SolSolTransferInput,
    network: NetworkType = NETWORK
  ) => {
    if (!solanaPublicKey || !signMessage || !sendTransaction) return;

    const destConfig =
      solanaContracts[network === "mainnet" ? "mainnet" : "devnet"];
    if (!destConfig) throw new Error("Missing Solana destination config");

    try {
      setError(null);
      setStep("preparing");

      const recipient = input.recipientAddress ?? solanaPublicKey.toBase58();
      const destinationMint = new PublicKey(destConfig.USDCAddress);
      const recipientAta = getAssociatedTokenAddressSync(
        destinationMint,
        new PublicKey(recipient)
      );

      const createAtaIx = createAssociatedTokenAccountIdempotentInstruction(
        solanaPublicKey,
        recipientAta,
        new PublicKey(recipient),
        destinationMint
      );
      const createAtaTx = new Transaction().add(createAtaIx);
      const ataSig = await sendTransaction(createAtaTx, connection);
      const latestBlockhash = await connection.getLatestBlockhash();
      await connection.confirmTransaction(
        {
          signature: ataSig,
          blockhash: latestBlockhash.blockhash,
          lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
        },
        "confirmed"
      );

      setStep("signing");
      const transferAmount = parseUnits(input.transferAmountUsdc, 6);
      const burnIntent = {
        maxBlockHeight: MAX_UINT64,
        maxFee: MAX_FEE,
        spec: {
          version: 1,
          sourceDomain: solanaContracts.domain,
          destinationDomain: solanaContracts.domain,
          sourceContract: solanaAddressToBytes32(destConfig.GatewayWallet),
          destinationContract: solanaAddressToBytes32(destConfig.GatewayMinter),
          sourceToken: solanaAddressToBytes32(destConfig.USDCAddress),
          destinationToken: solanaAddressToBytes32(destConfig.USDCAddress),
          sourceDepositor: solanaAddressToBytes32(solanaPublicKey.toBase58()),
          destinationRecipient: solanaAddressToBytes32(recipientAta.toBase58()),
          sourceSigner: solanaAddressToBytes32(solanaPublicKey.toBase58()),
          destinationCaller: solanaAddressToBytes32(SOLANA_ZERO_ADDRESS),
          value: transferAmount,
          salt: randomHex32(),
          hookData: "0x" as Hex,
        },
      };

      const encoded = encodeSolanaBurnIntent(burnIntent);
      const burnSignature = await signSolanaBurnIntentWithWallet(
        signMessage,
        encoded
      );

      setStep("attesting");
      const gatewayUrl =
        network === "mainnet" ? GATEWAY_CONFIG.MAINNET_URL : GATEWAY_CONFIG.TESTNET_URL;
      const response = await fetch(`${gatewayUrl}/transfer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          [{ burnIntent, signature: burnSignature }],
          (_key, value) => (typeof value === "bigint" ? value.toString() : value)
        ),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Gateway API request failed: ${response.status} ${errorText}`);
      }

      const { attestation, signature: apiSignature } = (await response.json()) as {
        attestation: Hex;
        signature: Hex;
      };

      setStep("minting");
      const provider = new AnchorProvider(
        connection,
        solWallet as any,
        AnchorProvider.defaultOptions()
      );
      setProvider(provider);
      const minterProgramId = new PublicKey(destConfig.GatewayMinter);
      const minterProgram = new Program(gatewayMinterIdl as any, provider);
      const [minterPda] = PublicKey.findProgramAddressSync(
        [Buffer.from(utils.bytes.utf8.encode("gateway_minter"))],
        minterProgramId
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

      const gatewayMintMethod = minterProgram.methods?.gatewayMint;
      if (!gatewayMintMethod) {
        throw new Error("Gateway minter IDL is missing the gatewayMint method");
      }

      const mintTx = await gatewayMintMethod({
        attestation: Buffer.from(attestation.slice(2), "hex"),
        signature: Buffer.from(apiSignature.slice(2), "hex"),
      })
        .accountsPartial({
          gatewayMinter: minterPda,
          destinationCaller: solanaPublicKey,
          payer: solanaPublicKey,
          systemProgram: SystemProgram.programId,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .remainingAccounts(remainingAccounts)
        .rpc();

      setMintTxHash(mintTx);
      setStep("success");
    } catch (transferError) {
      setError(
        transferError instanceof Error ? transferError.message : "Transfer failed"
      );
      setStep("idle");
    }
  };

  // Example input kept as a reusable config block instead of hardcoded inline UI.
  const defaultTransferInput: SolSolTransferInput = {
    transferAmountUsdc: DEFAULT_TRANSFER_AMOUNT_USDC,
    recipientAddress: solanaPublicKey?.toBase58() ?? "",
  };

  // Placeholder UI - business logic is in hooks and handlers above.
  return <div />;
}
```