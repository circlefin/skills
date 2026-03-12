# Gateway EVM-to-Solana Transfer Reference

Browser-wallet EVM -> Solana transfer flow:
1. Sign EIP-712 burn intent with EVM wallet
2. Submit to Gateway API for attestation
3. Mint USDC on Solana using Anchor

```tsx
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
import { useConnection as useSolConnection, useWallet } from "@solana/wallet-adapter-react";
import {
  PublicKey,
  SystemProgram,
  Transaction,
} from "@solana/web3.js";
import { useState } from "react";
import { parseUnits, pad, maxUint64, type Hex } from "viem";
import { useConnection as useEvmConnection, useSignTypedData } from "wagmi";

import {
  type ChainConfig,
  GATEWAY_CONFIG,
  SOLANA_ZERO_ADDRESS,
  arcContracts,
  gatewayMinterIdl,
  solanaContracts,
} from "./contract-addresses.js";

const eip712Domain = {
  name: "GatewayWallet",
  version: "1",
};

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
};

type TransferStep = "idle" | "preparing" | "signing" | "attesting" | "minting" | "success";
type NetworkType = "mainnet" | "testnet";

interface BurnIntentInput {
  sourceChainConfig: ChainConfig;
  transferAmountUsdc: string;
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

const NETWORK = "testnet" as NetworkType;
const DEFAULT_TRANSFER_AMOUNT_USDC = "1";

function randomHex32(): Hex {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return (
    "0x" + Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("")
  ) as Hex;
}

function addressToBytes32(address: Hex): Hex {
  return pad(address.toLowerCase() as Hex, { size: 32 });
}

function solanaAddressToBytes32(address: string): Hex {
  return `0x${new PublicKey(address).toBuffer().toString("hex")}` as Hex;
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

export default function TransferGatewayBalanceEvmSol() {
  const { address: evmAddress } = useEvmConnection();
  const { mutateAsync } = useSignTypedData();
  const { connection } = useSolConnection();
  const solWallet = useWallet();

  const [step, setStep] = useState<TransferStep>("idle");
  const [error, setError] = useState<string | null>(null);
  const [mintTxHash, setMintTxHash] = useState<string | null>(null);

  const handleTransfer = async (
    burnIntentInputs: BurnIntentInput[],
    network: NetworkType = NETWORK
  ) => {
    if (!evmAddress || !solWallet.publicKey || !burnIntentInputs.length) return;

    try {
      setError(null);
      setStep("preparing");

      const destinationConfig = solanaContracts[network === "mainnet" ? "mainnet" : "devnet"];
      if (!destinationConfig) throw new Error("Missing Solana destination config");

      const destinationMint = new PublicKey(destinationConfig.USDCAddress);
      const recipientAta = getAssociatedTokenAddressSync(
        destinationMint,
        solWallet.publicKey
      );

      // Ensure recipient ATA exists before mint (idempotent).
      const createAtaIx = createAssociatedTokenAccountIdempotentInstruction(
        solWallet.publicKey,
        recipientAta,
        solWallet.publicKey,
        destinationMint
      );
      const createAtaTx = new Transaction().add(createAtaIx);
      const ataSig = await solWallet.sendTransaction(createAtaTx, connection);
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
      const signedRequests = await Promise.all(
        burnIntentInputs.map(async (input) => {
          const sourceChain = input.sourceChainConfig[network];
          if (!sourceChain) throw new Error(`Source chain missing ${network} config`);

          const transferAmount = parseUnits(input.transferAmountUsdc, 6);
          const burnIntent = {
            maxBlockHeight: maxUint64,
            maxFee: 2_010000n,
            spec: {
              version: 1,
              sourceDomain: input.sourceChainConfig.domain,
              destinationDomain: solanaContracts.domain,
              sourceContract: sourceChain.GatewayWallet as Hex,
              destinationContract: solanaAddressToBytes32(destinationConfig.GatewayMinter),
              sourceToken: sourceChain.USDCAddress as Hex,
              destinationToken: solanaAddressToBytes32(destinationConfig.USDCAddress),
              sourceDepositor: evmAddress as Hex,
              destinationRecipient: solanaAddressToBytes32(recipientAta.toBase58()),
              sourceSigner: evmAddress as Hex,
              destinationCaller: solanaAddressToBytes32(SOLANA_ZERO_ADDRESS),
              value: transferAmount,
              salt: randomHex32(),
              hookData: "0x" as Hex,
            },
          };

          const messageForSigning = {
            maxBlockHeight: burnIntent.maxBlockHeight.toString(),
            maxFee: burnIntent.maxFee.toString(),
            spec: {
              version: burnIntent.spec.version,
              sourceDomain: burnIntent.spec.sourceDomain,
              destinationDomain: burnIntent.spec.destinationDomain,
              sourceContract: addressToBytes32(burnIntent.spec.sourceContract),
              destinationContract: burnIntent.spec.destinationContract,
              sourceToken: addressToBytes32(burnIntent.spec.sourceToken),
              destinationToken: burnIntent.spec.destinationToken,
              sourceDepositor: addressToBytes32(burnIntent.spec.sourceDepositor),
              destinationRecipient: burnIntent.spec.destinationRecipient,
              sourceSigner: addressToBytes32(burnIntent.spec.sourceSigner),
              destinationCaller: burnIntent.spec.destinationCaller,
              value: burnIntent.spec.value.toString(),
              salt: burnIntent.spec.salt,
              hookData: burnIntent.spec.hookData,
            },
          };

          const signature = await mutateAsync({
            types: eip712Types,
            domain: eip712Domain,
            primaryType: "BurnIntent",
            message: messageForSigning,
          });

          return { burnIntent: messageForSigning, signature };
        })
      );

      setStep("attesting");
      const gatewayUrl =
        network === "mainnet" ? GATEWAY_CONFIG.MAINNET_URL : GATEWAY_CONFIG.TESTNET_URL;
      const response = await fetch(`${gatewayUrl}/transfer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(signedRequests),
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
        AnchorProvider.defaultOptions(),
      );
      setProvider(provider);
      const minterProgramId = new PublicKey(destinationConfig.GatewayMinter);
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
          destinationCaller: solWallet.publicKey,
          payer: solWallet.publicKey,
          systemProgram: SystemProgram.programId,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .remainingAccounts(remainingAccounts)
        .rpc();

      setMintTxHash(mintTx);
      setStep("success");
    } catch (transferError) {
      setError(transferError instanceof Error ? transferError.message : "Transfer failed");
      setStep("idle");
    }
  };

  // Example input kept as a reusable config block instead of hardcoded inline UI.
  const defaultBurnIntents: BurnIntentInput[] = [
    {
      sourceChainConfig: arcContracts,
      transferAmountUsdc: DEFAULT_TRANSFER_AMOUNT_USDC,
    },
  ];

  // Placeholder UI - business logic is in hooks and handlers above.
  return <div />;
}
```
