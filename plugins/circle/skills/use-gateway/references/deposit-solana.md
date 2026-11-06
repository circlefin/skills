# Deposit USDC on Solana into Gateway

This example uses Solana Devnet, but the same deposit pattern applies to other supported Solana Gateway environments after substituting the correct RPC endpoint, Gateway Wallet address, and USDC mint address.

Canonical runnable references:
- Create unified USDC balance: https://developers.circle.com/gateway/howtos/create-unified-usdc-balance.md
- Unified balance Solana quickstart: https://developers.circle.com/gateway/quickstarts/unified-balance-solana.md

## What this does

This script:

1. Connects to Solana and loads the depositor keypair
2. Checks the depositor's USDC Associated Token Account balance
3. Derives the Gateway deposit PDAs
4. Calls the Gateway `deposit` instruction
5. Waits for transaction confirmation

## Critical warning

Do **not** send USDC directly to the Gateway Wallet address or custody account with a standard SPL token transfer: that USDC is lost and is not credited to the unified balance. You must submit a Gateway `deposit` instruction.

## Runnable example

```ts
import {
  Wallet,
  AnchorProvider,
  Program,
  setProvider,
} from "@coral-xyz/anchor";
import { Connection, Keypair, PublicKey, SystemProgram } from "@solana/web3.js";
import {
  getAssociatedTokenAddressSync,
  getAccount,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import BN from "bn.js";

const RPC_ENDPOINT = "https://api.devnet.solana.com";
const GATEWAY_WALLET_ADDRESS = "GATEwdfmYNELfp5wDmmR6noSr2vHnAfBPMm2PvCzX5vu";
const USDC_ADDRESS = "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU";
const DEPOSIT_AMOUNT = new BN(5_000_000); // 5 USDC (6 decimals)

const gatewayWalletIdl = {
  address: GATEWAY_WALLET_ADDRESS,
  metadata: {
    name: "gatewayWallet",
    version: "0.1.0",
    spec: "0.1.0",
  },
  instructions: [
    {
      name: "deposit",
      discriminator: [22, 0],
      accounts: [
        { name: "payer", writable: true, signer: true },
        { name: "owner", signer: true },
        { name: "gatewayWallet" },
        { name: "ownerTokenAccount", writable: true },
        { name: "custodyTokenAccount", writable: true },
        { name: "deposit", writable: true },
        { name: "depositorDenylist" },
        { name: "tokenProgram" },
        { name: "systemProgram" },
        { name: "eventAuthority" },
        { name: "program" },
      ],
      args: [{ name: "amount", type: "u64" }],
    },
  ],
} as const;

function findDepositPDAs(
  programId: PublicKey,
  usdcMint: PublicKey,
  owner: PublicKey,
) {
  return {
    wallet: PublicKey.findProgramAddressSync(
      [Buffer.from("gateway_wallet")],
      programId,
    )[0],
    custody: PublicKey.findProgramAddressSync(
      [Buffer.from("gateway_wallet_custody"), usdcMint.toBuffer()],
      programId,
    )[0],
    deposit: PublicKey.findProgramAddressSync(
      [Buffer.from("gateway_deposit"), usdcMint.toBuffer(), owner.toBuffer()],
      programId,
    )[0],
    denylist: PublicKey.findProgramAddressSync(
      [Buffer.from("denylist"), owner.toBuffer()],
      programId,
    )[0],
  };
}

if (!process.env.SOLANA_PRIVATE_KEYPAIR) {
  throw new Error("SOLANA_PRIVATE_KEYPAIR not set");
}

const secretKey = Uint8Array.from(JSON.parse(process.env.SOLANA_PRIVATE_KEYPAIR));
const keypair = Keypair.fromSecretKey(secretKey);

async function main() {
  const connection = new Connection(RPC_ENDPOINT, "confirmed");
  const wallet = new Wallet(keypair);
  const owner = wallet.publicKey;
  const usdcMint = new PublicKey(USDC_ADDRESS);
  const programId = new PublicKey(GATEWAY_WALLET_ADDRESS);

  console.log(`Using account: ${owner.toBase58()}`);

  const ownerTokenAccount = getAssociatedTokenAddressSync(usdcMint, owner);
  const tokenAccountInfo = await getAccount(connection, ownerTokenAccount);

  if (tokenAccountInfo.amount < BigInt(DEPOSIT_AMOUNT.toString())) {
    throw new Error("Insufficient USDC balance for deposit");
  }

  const provider = new AnchorProvider(
    connection,
    wallet,
    AnchorProvider.defaultOptions(),
  );
  setProvider(provider);

  const program = new Program(gatewayWalletIdl, provider);
  const pdas = findDepositPDAs(programId, usdcMint, owner);

  const txSignature = await program.methods
    .deposit(DEPOSIT_AMOUNT)
    .accountsPartial({
      payer: owner,
      owner: owner,
      gatewayWallet: pdas.wallet,
      ownerTokenAccount,
      custodyTokenAccount: pdas.custody,
      deposit: pdas.deposit,
      depositorDenylist: pdas.denylist,
      tokenProgram: TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    })
    .rpc();

  console.log(`Deposit tx: ${txSignature}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
```


