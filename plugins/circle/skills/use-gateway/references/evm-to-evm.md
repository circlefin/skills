# Gateway EVM-to-EVM Transfers

Browser-wallet EVM -> EVM transfer flow:
1. Sign EIP-712 burn intent with source EVM wallet
2. Submit to Gateway API
3. Switch to destination EVM chain
4. Call gatewayMint on destination chain

```tsx
import { useState } from "react";
import { maxUint64, parseUnits, pad, type Hex, zeroAddress } from "viem";
import {
  useAccount,
  useChainId,
  useSignTypedData,
  useSwitchChain,
  useWriteContract,
  useWaitForTransactionReceipt,
} from "wagmi";

import {
  type ChainConfig,
  GATEWAY_CONFIG,
  arcContracts,
  baseContracts,
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

const EIP712_DOMAIN = {
  name: "GatewayWallet",
  version: "1",
} as const;

const EIP712_TYPES = {
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

const MAX_FEE = 2_010000n;

type TransferStep = "idle" | "signing" | "attesting" | "switching" | "minting" | "success";
type NetworkType = "mainnet" | "testnet";

interface EvmBurnIntentInput {
  sourceChainConfig: ChainConfig;
  destinationChainConfig: ChainConfig;
  transferAmountUsdc: string;
  recipientAddress?: Hex;
}

function randomHex32(): Hex {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return (`0x${Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")}`) as Hex;
}

function evmAddressToBytes32(address: Hex): Hex {
  return pad(address.toLowerCase() as Hex, { size: 32 });
}

/**
 * Browser-wallet EVM -> EVM transfer:
 * 1) Sign EIP-712 burn intent with source EVM wallet
 * 2) Submit to Gateway API
 * 3) Switch to destination EVM chain
 * 4) Call gatewayMint on destination chain
 */
export default function TransferGatewayBalanceEvmEvm() {
  const { address: evmAddress } = useAccount();
  const chainId = useChainId();
  const { mutateAsync: signTypedData } = useSignTypedData();
  const { switchChainAsync } = useSwitchChain();

  const [step, setStep] = useState<TransferStep>("idle");
  const [error, setError] = useState<string | null>(null);

  const { mutate: mint, data: mintHash } = useWriteContract();
  const { isLoading: isMinting, isSuccess: mintSuccess } = useWaitForTransactionReceipt({
    hash: mintHash,
  });

  const handleTransfer = async (input: EvmBurnIntentInput, network: NetworkType = "testnet") => {
    if (!evmAddress) return;
    const sourceChain = input.sourceChainConfig[network];
    const destChain = input.destinationChainConfig[network];
    if (!sourceChain || !destChain) return;

    try {
      setError(null);
      setStep("signing");

      const recipient = (input.recipientAddress ?? evmAddress) as Hex;
      const transferAmount = parseUnits(input.transferAmountUsdc, 6);

      const burnIntent = {
        maxBlockHeight: maxUint64.toString(),
        maxFee: MAX_FEE.toString(),
        spec: {
          version: 1,
          sourceDomain: input.sourceChainConfig.domain,
          destinationDomain: input.destinationChainConfig.domain,
          sourceContract: evmAddressToBytes32(sourceChain.GatewayWallet as Hex),
          destinationContract: evmAddressToBytes32(destChain.GatewayMinter as Hex),
          sourceToken: evmAddressToBytes32(sourceChain.USDCAddress as Hex),
          destinationToken: evmAddressToBytes32(destChain.USDCAddress as Hex),
          sourceDepositor: evmAddressToBytes32(evmAddress),
          destinationRecipient: evmAddressToBytes32(recipient),
          sourceSigner: evmAddressToBytes32(evmAddress),
          destinationCaller: evmAddressToBytes32(zeroAddress),
          value: transferAmount.toString(),
          salt: randomHex32(),
          hookData: "0x" as Hex,
        },
      };

      const burnSignature = await signTypedData({
        domain: EIP712_DOMAIN,
        primaryType: "BurnIntent",
        types: EIP712_TYPES,
        message: burnIntent,
      });

      const gatewayUrl =
        network === "mainnet" ? GATEWAY_CONFIG.MAINNET_URL : GATEWAY_CONFIG.TESTNET_URL;
      setStep("attesting");
      const response = await fetch(`${gatewayUrl}/transfer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify([{ burnIntent, signature: burnSignature }]),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Gateway API request failed: ${response.status} ${errorText}`);
      }

      const { attestation, signature: apiSignature } = await response.json();

      if (chainId !== destChain.ViemChain.id) {
        setStep("switching");
        await switchChainAsync({ chainId: destChain.ViemChain.id });
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
  const defaultTransferInput: EvmBurnIntentInput = {
    sourceChainConfig: arcContracts,
    destinationChainConfig: baseContracts,
    transferAmountUsdc: "1",
    recipientAddress: evmAddress as Hex,
  };

  // Placeholder UI - business logic is in hooks and handlers above.
  return <div />;
}
```
