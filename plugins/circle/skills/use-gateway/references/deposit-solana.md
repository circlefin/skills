# Depositing USDC on Solana (Creating Unified Balance)

## Create Unified Balance
```tsx
import {
  AnchorProvider,
  Program,
  setProvider,
  utils,
} from "@coral-xyz/anchor";
import {
  getAssociatedTokenAddress,
  getAccount,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import {
  PublicKey,
  SystemProgram,
  type TransactionSignature,
} from "@solana/web3.js";
import BN from "bn.js";
import { useState } from "react";
import { parseUnits } from "viem";

import { gatewayWalletIdl, solanaContracts } from "./contract-addresses.js";

type DepositStep = "idle" | "depositing" | "success";
const SOLANA_NETWORK = "devnet" as
  | "mainnet"
  | "devnet";

function findPDAs(programId: PublicKey, usdcMint: PublicKey, owner: PublicKey) {
  return {
    wallet: PublicKey.findProgramAddressSync(
      [Buffer.from(utils.bytes.utf8.encode("gateway_wallet"))],
      programId
    )[0],
    custody: PublicKey.findProgramAddressSync(
      [Buffer.from(utils.bytes.utf8.encode("gateway_wallet_custody")), usdcMint.toBuffer()],
      programId
    )[0],
    deposit: PublicKey.findProgramAddressSync(
      [Buffer.from("gateway_deposit"), usdcMint.toBuffer(), owner.toBuffer()],
      programId
    )[0],
    denylist: PublicKey.findProgramAddressSync(
      [Buffer.from("denylist"), owner.toBuffer()],
      programId
    )[0],
  };
}

/**
 * React component demonstrating Gateway USDC deposit flow on Solana
 * using browser wallet hooks and Anchor.
 */
export default function DepositGatewayBalanceSolana() {
  const { connection } = useConnection();
  const wallet = useWallet();

  const [step, setStep] = useState<DepositStep>("idle");
  const [amount, setAmount] = useState("");
  const [txHash, setTxHash] = useState<TransactionSignature | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleDeposit = async (depositAmountUsdc: string) => {
    if (!wallet.publicKey) return;
    if (!wallet.signTransaction) return;
    if (!depositAmountUsdc) return;

    setError(null);

    try {
      setAmount(depositAmountUsdc);
      setStep("depositing");

      const depositAmountBaseUnits = parseUnits(depositAmountUsdc, 6);
      const depositAmountBN = new BN(depositAmountBaseUnits.toString());

      const chainConfig = solanaContracts[SOLANA_NETWORK];
      if (!chainConfig) {
        throw new Error(`Missing Solana config for network: ${SOLANA_NETWORK}`);
      }
      const programId = new PublicKey(chainConfig.GatewayWallet);
      const usdcMint = new PublicKey(chainConfig.USDCAddress);

      const userAta = await getAssociatedTokenAddress(usdcMint, wallet.publicKey);
      const ataInfo = await getAccount(connection, userAta);
      if (ataInfo.amount < depositAmountBaseUnits) {
        throw new Error("Insufficient USDC balance for deposit");
      }

      const pdas = findPDAs(programId, usdcMint, wallet.publicKey);

      const provider = new AnchorProvider(
        connection,
        wallet as any,
        AnchorProvider.defaultOptions(),
      );
      setProvider(provider);

      const program = new Program(gatewayWalletIdl as any, provider);
      const depositMethod = program.methods?.deposit;
      if (!depositMethod) {
        throw new Error("Gateway wallet IDL is missing the deposit method");
      }

      const signature = await depositMethod(depositAmountBN)
        .accountsPartial({
          payer: wallet.publicKey,
          owner: wallet.publicKey,
          gatewayWallet: pdas.wallet,
          ownerTokenAccount: userAta,
          custodyTokenAccount: pdas.custody,
          deposit: pdas.deposit,
          depositorDenylist: pdas.denylist,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      setTxHash(signature);
      setStep("success");
      setTimeout(() => {
        setStep("idle");
        setAmount("");
      }, 3000);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Deposit failed";
      setError(errorMessage);
      setStep("idle");
    }
  };

  // Placeholder UI - business logic is in hooks and handlers above.
  return <div />;
}
```
