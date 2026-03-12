# Depositing USDC on EVM (Creating Unified Balance)

## Create Unified Balance
```tsx
import { useState } from "react";
import { parseUnits, erc20Abi, type Hex } from "viem";
import {
  useConnection,
  useWriteContract,
  useWaitForTransactionReceipt,
  useSwitchChain,
} from "wagmi";

import { arcContracts } from "./contract-addresses.js";

// Gateway Wallet ABI - only the deposit function we need
const gatewayWalletAbi = [
  {
    type: "function",
    name: "deposit",
    inputs: [
      { name: "token", type: "address" },
      { name: "value", type: "uint256" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
] as const;

// Deposit flow states
type DepositStep = "idle" | "approving" | "depositing" | "success";

// Keep gas caps explicit to avoid wallet/provider overestimating and hitting max tx gas limit.
const APPROVE_GAS_LIMIT = 120_000n;
const DEPOSIT_GAS_LIMIT = 350_000n;
const NETWORK = "testnet" as "mainnet" | "testnet";

/**
 * React component demonstrating Gateway USDC deposit flow using wagmi hooks.
 *
 * The deposit process involves two sequential blockchain transactions:
 * 1. Approve: Grant the Gateway Wallet contract permission to spend USDC
 * 2. Deposit: Transfer USDC from user's wallet to the Gateway Wallet
 *
 * This component uses wagmi's declarative pattern where state changes
 * trigger the next step in the flow.
 */
export default function DepositGatewayBalance() {
  const { address, chainId } = useConnection();
  const { mutate: switchChain } = useSwitchChain();

  // Track the current step in the deposit flow
  const [step, setStep] = useState<DepositStep>("idle");

  // Store the amount to deposit (in human-readable format, e.g., "10.5")
  const [amount, setAmount] = useState("");

  // Choose the network at runtime to avoid hardcoding testnet/mainnet in snippet logic.
  const chainConfig = arcContracts[NETWORK];
  if (!chainConfig) {
    return <div />;
  }

  const gatewayWalletAddress = chainConfig.GatewayWallet as Hex;
  const usdcAddress = chainConfig.USDCAddress as Hex;

  // Set up wagmi hooks for contract writes
  // We need two separate hooks because we make two sequential transactions
  const { mutate: approve, data: approveHash } = useWriteContract();
  const { mutate: deposit, data: depositHash } = useWriteContract();

  // Track transaction confirmations
  const { isLoading: isApproving, isSuccess: approveSuccess } = useWaitForTransactionReceipt({
    hash: approveHash,
  });
  const { isLoading: isDepositing, isSuccess: depositSuccess } = useWaitForTransactionReceipt({
    hash: depositHash,
  });

  // Check if user needs to switch to the correct chain
  const needsChainSwitch = chainId !== chainConfig.ViemChain.id;

  /**
   * Initiates the deposit flow by first requesting USDC approval.
   *
   * @param depositAmountUsdc - Amount to deposit in human-readable format (e.g., "10.5")
   */
  const handleDeposit = async (depositAmountUsdc: string) => {
    if (!address || !depositAmountUsdc) return;

    try {
      // Convert human-readable amount to base units (USDC has 6 decimals)
      const depositAmountBaseUnits = parseUnits(depositAmountUsdc, 6);
      setAmount(depositAmountUsdc);

      // Step 1: Approve the Gateway Wallet to spend our USDC
      // This is required before we can deposit - standard ERC-20 pattern
      setStep("approving");
      approve({
        address: usdcAddress,
        abi: erc20Abi,
        functionName: "approve",
        args: [gatewayWalletAddress, depositAmountBaseUnits],
        gas: APPROVE_GAS_LIMIT,
      });
    } catch (error) {
      setStep("idle");
    }
  };

  /**
   * Switch to the required chain for deposits.
   * Must be on the correct chain to interact with the Gateway contracts.
   */
  const handleSwitchChain = () => {
    switchChain({ chainId: chainConfig.ViemChain.id });
  };

  // Reactive flow: When approval completes, automatically trigger the deposit
  // This is wagmi's declarative pattern - we react to state changes rather than using await
  if (step === "approving" && approveSuccess && !isApproving && approveHash) {
    setStep("depositing");
    const depositAmountBaseUnits = parseUnits(amount, 6);

    // Step 2: Call the Gateway Wallet's deposit function
    // This transfers USDC from the user's wallet to the Gateway
    deposit({
      address: gatewayWalletAddress,
      abi: gatewayWalletAbi,
      functionName: "deposit",
      args: [usdcAddress, depositAmountBaseUnits],
      gas: DEPOSIT_GAS_LIMIT,
    });
  }

  // When deposit completes, update to success state
  if (step === "depositing" && depositSuccess && !isDepositing && depositHash) {
    setStep("success");
    // Reset after a delay
    setTimeout(() => {
      setStep("idle");
      setAmount("");
    }, 3000);
  }

  // Placeholder UI - business logic is in hooks and handlers above.
  return <div />;
}
```
