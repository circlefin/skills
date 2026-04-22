# Deposit USDC on Solana into Gateway via Circle Wallets

This example uses Solana Devnet, but the same deposit pattern applies to other supported Solana Gateway environments after substituting the correct RPC endpoint, Gateway Wallet address, and USDC mint address.

Canonical runnable references:
- Unified balance Solana quickstart: https://developers.circle.com/gateway/quickstarts/unified-balance-solana.md
- Create unified USDC balance: https://developers.circle.com/gateway/howtos/create-unified-usdc-balance.md

## What this does

This script:

1. Uses a Circle Developer-Controlled Solana wallet as the depositor
2. Checks the depositor's USDC ATA balance
3. Derives the Gateway deposit PDAs
4. Builds the Solana Gateway deposit instruction with Anchor
5. Signs the transaction through Circle Wallets
6. Broadcasts and confirms the deposit transaction

## Critical warning

Do **not** send USDC directly to the Gateway Wallet address or custody account. The funds will not be credited to the unified balance. You must submit a Gateway `deposit` instruction.

## Runnable example

```ts
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
  getAssociatedTokenAddressSync,
  getAccount,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import BN from "bn.js";

const GATEWAY_WALLET_ADDRESS = "GATEwdfmYNELfp5wDmmR6noSr2vHnAfBPMm2PvCzX5vu";
const USDC_ADDRESS = "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU";
const RPC_ENDPOINT = "https://api.devnet.solana.com";
const DEPOSIT_AMOUNT = new BN(5_000_000); // 5 USDC (6 decimals)

const API_KEY = process.env.CIRCLE_API_KEY!;
const ENTITY_SECRET = process.env.CIRCLE_ENTITY_SECRET!;
const DEPOSITOR_ADDRESS = process.env.DEPOSITOR_ADDRESS!;

if (!API_KEY || !ENTITY_SECRET || !DEPOSITOR_ADDRESS) {
  throw new Error(
    "Missing required env vars: CIRCLE_API_KEY, CIRCLE_ENTITY_SECRET, DEPOSITOR_ADDRESS",
  );
}

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

const client = initiateDeveloperControlledWalletsClient({
  apiKey: API_KEY,
  entitySecret: ENTITY_SECRET,
});

function findDepositPDAs(
  programId: PublicKey,
  usdcMint: PublicKey,
  owner: PublicKey,
) {
  return {
    wallet: PublicKey.findProgramAddressSync(
      [Buffer.from(utils.bytes.utf8.encode("gateway_wallet"))],
      programId,
    )[0],
    custody: PublicKey.findProgramAddressSync(
      [
        Buffer.from(utils.bytes.utf8.encode("gateway_wallet_custody")),
        usdcMint.toBuffer(),
      ],
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

async function main() {
  const connection = new Connection(RPC_ENDPOINT, "confirmed");
  const usdcMint = new PublicKey(USDC_ADDRESS);
  const programId = new PublicKey(GATEWAY_WALLET_ADDRESS);
  const owner = new PublicKey(DEPOSITOR_ADDRESS);

  const dummyWallet = new Wallet(Keypair.generate());
  const provider = new AnchorProvider(
    connection,
    dummyWallet,
    AnchorProvider.defaultOptions(),
  );
  setProvider(provider);
  const program = new Program(gatewayWalletIdl, provider);

  const pdas = findDepositPDAs(programId, usdcMint, owner);
  const ownerTokenAccount = getAssociatedTokenAddressSync(usdcMint, owner);
  const tokenAccountInfo = await getAccount(connection, ownerTokenAccount);

  if (tokenAccountInfo.amount < BigInt(DEPOSIT_AMOUNT.toString())) {
    throw new Error("Insufficient USDC balance for deposit");
  }

  const depositIx = await program.methods
    .deposit(DEPOSIT_AMOUNT)
    .accountsPartial({
      payer: owner,
      owner,
      gatewayWallet: pdas.wallet,
      ownerTokenAccount,
      custodyTokenAccount: pdas.custody,
      deposit: pdas.deposit,
      depositorDenylist: pdas.denylist,
      tokenProgram: TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    })
    .instruction();

  const { blockhash, lastValidBlockHeight } =
    await connection.getLatestBlockhash();
  const transaction = new Transaction();
  transaction.add(depositIx);
  transaction.recentBlockhash = blockhash;
  transaction.feePayer = owner;

  const serializedTx = transaction.serialize({
    requireAllSignatures: false,
    verifySignatures: false,
  });

  const signResult = await client.signTransaction({
    walletAddress: DEPOSITOR_ADDRESS,
    blockchain: "SOL-DEVNET",
    rawTransaction: serializedTx.toString("base64"),
  });

  const signedTxBase64 = signResult.data?.signedTransaction;
  if (!signedTxBase64) {
    throw new Error("Failed to sign transaction");
  }

  const signedTxBytes = Buffer.from(signedTxBase64, "base64");
  const txSignature = await connection.sendRawTransaction(signedTxBytes);

  await connection.confirmTransaction(
    { signature: txSignature, blockhash, lastValidBlockHeight },
    "confirmed",
  );

  console.log(`Done on Solana Devnet. Deposit tx: ${txSignature}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
```


