# Gateway Solana-to-EVM Transfers

Browser-wallet Solana -> EVM transfer flow:
1. Sign Solana burn intent with wallet.signMessage
2. Submit to Gateway API
3. Switch to destination EVM chain
4. Call gatewayMint on destination chain

**NOTE:** Some browser wallets such as Phantom reject payloads that are not strictly Solana transactions. This workflow has been found to work with Solflare.

```tsx
import { Layout, blob, offset, struct, u32be } from "@solana/buffer-layout";
import { useWallet } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import { useState } from "react";
import { parseUnits, pad, type Hex } from "viem";
import {
  useConnection,
  useChainId,
  useSwitchChain,
  useWriteContract,
  useWaitForTransactionReceipt,
} from "wagmi";

import {
  type ChainConfig,
  GATEWAY_CONFIG,
  arcContracts,
  solanaContracts,
} from "./contract-addresses.js";

// Gateway Minter ABI - only the gatewayMint function we need
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

const TRANSFER_SPEC_MAGIC = 0xca85def7;
const BURN_INTENT_MAGIC = 0x070afbc2;
const MAX_UINT64 = 2n ** 64n - 1n;
const MAX_FEE = 2_010000n;

type TransferStep = "idle" | "signing" | "switching" | "minting" | "success";
type NetworkType = "mainnet" | "testnet";
const NETWORK = "testnet" as NetworkType;
const DEFAULT_TRANSFER_AMOUNT_USDC = "1";

interface SolBurnIntentInput {
  destinationChainConfig: ChainConfig;
  transferAmountUsdc: string;
  recipientAddress?: Hex;
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

function evmAddressToBytes32(address: Hex): Hex {
  return pad(address.toLowerCase() as Hex, { size: 32 });
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

/**
 * NOTE: Some browser wallets such as Phantom reject payloads
 * that are not strictly Solana transactions. This workflow has
 * been found to work with Solflare.
 * See https://solana.stackexchange.com/questions/10050/i-am-using-phantom-wallet-and-trying-to-sign-typed-data
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
    console.warn(`
      This wallet does not support signing transactions that aren't strictly Solana t
      ransactions. Try another wallet such as Solflare.`
      , error);
    throw error;
  }
}

/**
 * Browser-wallet Solana -> EVM transfer:
 * 1) Sign Solana burn intent with wallet.signMessage
 * 2) Submit to Gateway API
 * 3) Switch to destination EVM chain
 * 4) Call gatewayMint on destination chain
 */
export default function TransferGatewayBalanceSolEvm() {
  const { address: evmAddress } = useConnection();
  const chainId = useChainId();
  const { mutateAsync: switchChain } = useSwitchChain();
  const { publicKey: solanaPublicKey, signMessage } = useWallet();

  const [step, setStep] = useState<TransferStep>("idle");
  const [error, setError] = useState<string | null>(null);

  const { mutate: mint, data: mintHash } = useWriteContract();
  const { isLoading: isMinting, isSuccess: mintSuccess } = useWaitForTransactionReceipt({
    hash: mintHash,
  });

  const handleTransfer = async (
    input: SolBurnIntentInput,
    network: NetworkType = NETWORK
  ) => {
    if (!solanaPublicKey || !signMessage || !evmAddress) return;
    const destChain = input.destinationChainConfig[network];
    if (!destChain) return;

    try {
      setError(null);
      setStep("signing");

      const recipient = (input.recipientAddress ?? evmAddress) as Hex;
      const transferAmount = parseUnits(input.transferAmountUsdc, 6);

      const burnIntent = {
        maxBlockHeight: MAX_UINT64,
        maxFee: MAX_FEE,
        spec: {
          version: 1,
          sourceDomain: solanaContracts.domain,
          destinationDomain: input.destinationChainConfig.domain,
          sourceContract: solanaAddressToBytes32(solanaContracts.devnet!.GatewayWallet),
          destinationContract: evmAddressToBytes32(destChain.GatewayMinter as Hex),
          sourceToken: solanaAddressToBytes32(solanaContracts.devnet!.USDCAddress),
          destinationToken: evmAddressToBytes32(destChain.USDCAddress as Hex),
          sourceDepositor: solanaAddressToBytes32(solanaPublicKey.toBase58()),
          destinationRecipient: evmAddressToBytes32(recipient),
          sourceSigner: solanaAddressToBytes32(solanaPublicKey.toBase58()),
          destinationCaller: evmAddressToBytes32(("0x0000000000000000000000000000000000000000") as Hex),
          value: transferAmount,
          salt: randomHex32(),
          hookData: "0x" as Hex,
        },
      };

      const encoded = encodeSolanaBurnIntent(burnIntent);
      const burnSignature = await signSolanaBurnIntentWithWallet(signMessage, encoded);

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

      const { attestation, signature: apiSignature } = await response.json();

      if (chainId !== destChain.ViemChain.id) {
        setStep("switching");
        await switchChain({ chainId: destChain.ViemChain.id });
      }

      setStep("minting");
      mint({
        address: destChain.GatewayMinter as Hex,
        abi: gatewayMinterAbi,
        functionName: "gatewayMint",
        args: [attestation as Hex, apiSignature as Hex],
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Transfer failed");
      setStep("idle");
    }
  };

  if (step === "minting" && mintSuccess && !isMinting && mintHash) {
    setStep("success");
    setTimeout(() => {
      setStep("idle");
    }, 3000);
  }

  // Example input kept as a reusable config block instead of hardcoded inline UI.
  const defaultTransferInput: SolBurnIntentInput = {
    destinationChainConfig: arcContracts,
    transferAmountUsdc: DEFAULT_TRANSFER_AMOUNT_USDC,
    recipientAddress: evmAddress as Hex,
  };

  // Placeholder UI - business logic is in hooks and handlers above.
  return <div />;
}
```
