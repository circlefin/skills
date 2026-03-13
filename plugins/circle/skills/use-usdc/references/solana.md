# USDC on Solana - Complete Implementation Guide

## Private Key Handling (Write Operations Only)

**For read operations (balance, verify):** No private key needed.

**For write operations (transfer):**

### Option 1: Environment Variable (Recommended)

Private key is a JSON byte array (64 bytes). Export from most Solana wallets.

```bash
export SOLANA_PRIVATE_KEY='[1,2,3,...,64]'  # JSON byte array
```

```ts
import { createKeyPairSignerFromBytes } from "@solana/kit";

const senderKeypair = await createKeyPairSignerFromBytes(
  Uint8Array.from(JSON.parse(process.env.SOLANA_PRIVATE_KEY!))
);
```

### Option 2: Convert Base58 Key

If you have a Base58-encoded key (from Phantom export, etc.):

```ts
import bs58 from "bs58";
import { createKeyPairSignerFromBytes } from "@solana/kit";

const base58Key = "YOUR_BASE58_PRIVATE_KEY";
const bytes = bs58.decode(base58Key);
const senderKeypair = await createKeyPairSignerFromBytes(Uint8Array.from(bytes));
```

### Option 3: File Path (Acceptable)

```bash
# Store as JSON array
echo '[1,2,3,...,64]' > ~/.solana/keys/devnet.json
chmod 600 ~/.solana/keys/devnet.json
```

```ts
import fs from "fs";
import path from "path";
import { createKeyPairSignerFromBytes } from "@solana/kit";

const keyData = JSON.parse(
  fs.readFileSync(
    path.join(process.env.HOME!, ".solana/keys/devnet.json"),
    "utf-8"
  )
);

const senderKeypair = await createKeyPairSignerFromBytes(Uint8Array.from(keyData));
```

---

## Setup

```ts
import {
  address,
  createSolanaRpc,
  createSolanaRpcSubscriptions,
  createTransactionMessage,
  pipe,
  sendAndConfirmTransactionFactory,
  setTransactionMessageFeePayerSigner,
  setTransactionMessageLifetimeUsingBlockhash,
  appendTransactionMessageInstruction,
  signTransactionMessageWithSigners,
  createKeyPairSignerFromBytes,
  getSignatureFromTransaction,
} from "@solana/kit";
import {
  TOKEN_PROGRAM_ADDRESS,
  getTransferInstruction,
  findAssociatedTokenPda,
} from "@solana-program/token";
import dotenv from "dotenv";

dotenv.config();

const rpc = createSolanaRpc("https://api.devnet.solana.com");
const rpcSubscriptions = createSolanaRpcSubscriptions("wss://api.devnet.solana.com");

const USDC_MINT = address("4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU"); // Devnet
// Mainnet: EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v

const senderKeypair = await createKeyPairSignerFromBytes(
  Uint8Array.from(JSON.parse(process.env.SOLANA_PRIVATE_KEY!))
);

// Create once, reuse for all transactions
const sendAndConfirmTransaction = sendAndConfirmTransactionFactory({
  rpc,
  rpcSubscriptions,
});
```

---

## 1. Check USDC Balance (Read)

**Key difference from EVM**: USDC balances live in an **Associated Token Account (ATA)**, not the wallet address directly. You must derive the ATA first.

```ts
const [senderATA] = await findAssociatedTokenPda({
  mint: USDC_MINT,
  owner: senderKeypair.address,
  tokenProgram: TOKEN_PROGRAM_ADDRESS,
});

const accountInfo = await rpc.getTokenAccountBalance(senderATA).send();
const uiAmount = accountInfo.value.uiAmount ?? 0;

// Display results to user
console.log(`USDC Balance: ${uiAmount} USDC`);
console.log(`Address: ${senderKeypair.address}`);
console.log(`Network: Solana Devnet`);
console.log(`USDC Mint: ${USDC_MINT}`);
console.log(`Explorer: https://explorer.solana.com/address/${senderKeypair.address}?cluster=devnet`);
```

**Expected output:**
```
USDC Balance: 10.50 USDC
Address: YourSolanaAddress
Network: Solana Devnet
USDC Mint: 4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU
Explorer: https://explorer.solana.com/address/YourSolanaAddress?cluster=devnet
```

---

## 2. Send USDC (Write)

**Critical difference from EVM**: The recipient's ATA must exist before transferring. If it doesn't exist, the transaction will fail.

### Step 1: Pre-flight Checks (Autonomous)

```ts
const recipientAddress = address("RecipientSolanaAddress");
const uiAmount = 10.0; // USDC to send
const AMOUNT = BigInt(Math.floor(uiAmount * 1_000_000)); // Convert to 6 decimals

// Check sender USDC balance
const [senderATA] = await findAssociatedTokenPda({
  mint: USDC_MINT,
  owner: senderKeypair.address,
  tokenProgram: TOKEN_PROGRAM_ADDRESS,
});

const accountInfo = await rpc.getTokenAccountBalance(senderATA).send();
const balanceRaw = BigInt(accountInfo.value.amount);

if (balanceRaw < AMOUNT) {
  const have = accountInfo.value.uiAmount ?? 0;
  throw new Error(
    `Insufficient USDC balance. Have: ${have} USDC, Need: ${uiAmount} USDC`
  );
}

// Check SOL balance for fees
const solBalance = await rpc.getBalance(senderKeypair.address).send();
if (solBalance.value < 10_000n) {  // ~0.00001 SOL minimum
  throw new Error(
    `Insufficient SOL for transaction fees. Need at least 0.00001 SOL.`
  );
}

// Check if recipient ATA exists
const [recipientATA] = await findAssociatedTokenPda({
  mint: USDC_MINT,
  owner: recipientAddress,
  tokenProgram: TOKEN_PROGRAM_ADDRESS,
});

const recipientATAInfo = await rpc.getAccountInfo(recipientATA).send();
const recipientATAExists = recipientATAInfo.value !== null;

// Calculate ATA creation cost if needed
const ataCreationCost = recipientATAExists ? 0 : 0.002; // ~0.002 SOL
```

### Step 2: Present Preview

```
From:         YourSolanaAddress
To:           RecipientAddress
Amount:       10.00 USDC

Network:      Solana Devnet
USDC Mint:    4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU

Tx Fee:       ~0.000005 SOL
ATA Creation: ~0.002 SOL (recipient has no USDC account yet)

Current Balance:  50.00 USDC
Balance After:    40.00 USDC

WARNING: This transaction will be submitted to Solana.
         Once confirmed, it CANNOT be reversed.

Confirm transaction? (yes/no)
```

**Only show "ATA Creation" line if recipient ATA doesn't exist.**

### Step 3: Execute (After Confirmation)

```ts
const transferInstruction = getTransferInstruction({
  source: senderATA,
  destination: recipientATA, // Must exist — use getOrCreateAssociatedTokenAccount if unsure
  authority: senderKeypair,
  amount: AMOUNT,
});

const { value: latestBlockhash } = await rpc.getLatestBlockhash().send();

const transactionMessage = pipe(
  createTransactionMessage({ version: 0 }),
  (tx) => setTransactionMessageFeePayerSigner(senderKeypair, tx),
  (tx) => setTransactionMessageLifetimeUsingBlockhash(latestBlockhash, tx),
  (tx) => appendTransactionMessageInstruction(transferInstruction, tx)
);

const signedTransaction = await signTransactionMessageWithSigners(transactionMessage);

await sendAndConfirmTransaction(signedTransaction, { commitment: "confirmed" });

const signature = getSignatureFromTransaction(signedTransaction);
console.log(`Transaction confirmed!`);
console.log(`Signature: ${signature}`);
console.log(`Explorer: https://explorer.solana.com/tx/${signature}?cluster=devnet`);
```

---

## 3. Verify Incoming Transfer (Read)

```ts
const recipientAddress = address("RecipientSolanaAddress");

const [recipientATA] = await findAssociatedTokenPda({
  mint: USDC_MINT,
  owner: recipientAddress,
  tokenProgram: TOKEN_PROGRAM_ADDRESS,
});

// Check current balance
const accountInfo = await rpc.getTokenAccountBalance(recipientATA).send();
const balance = accountInfo.value.uiAmount ?? 0;
console.log(`Current balance: ${balance} USDC`);

// Get recent transactions
const signatures = await rpc
  .getSignaturesForAddress(recipientATA, { limit: 10 })
  .send();

for (const sig of signatures) {
  console.log(`Tx: ${sig.signature}`);
  console.log(`  Explorer: https://explorer.solana.com/tx/${sig.signature}?cluster=devnet`);
}
```

---

## SPL Token Method Reference

| Method | Package | Purpose |
|--------|---------| --------|
| `findAssociatedTokenPda({ mint, owner, tokenProgram })` | `@solana-program/token` | Derive ATA address |
| `getTransferInstruction({ source, destination, authority, amount })` | `@solana-program/token` | Build transfer instruction |
| `getOrCreateAssociatedTokenAccount(...)` | `@solana-program/token` | Get or create ATA (sends tx if needed) |
| `createSolanaRpc(url)` | `@solana/kit` | Create RPC client |
| `sendAndConfirmTransactionFactory({ rpc, rpcSubscriptions })` | `@solana/kit` | Build send+confirm helper |
| `getSignatureFromTransaction(tx)` | `@solana/kit` | Extract signature from signed tx |

---

## Common Issues

### "Insufficient USDC balance"
- Run balance check first
- Get testnet USDC from https://faucet.circle.com

### "Insufficient SOL for fees"
- Need SOL for tx fees (~0.000005 SOL) and ATA creation (~0.002 SOL)
- Get testnet SOL from https://faucet.solana.com

### "Recipient ATA doesn't exist"
- Check if recipient ATA exists with `getAccountInfo`
- If doesn't exist, surface ~0.002 SOL creation cost in preview
- Use `getOrCreateAssociatedTokenAccount` to create it automatically

### "Wrong decimal places" / "Amount too large"
- Use `Math.floor(amount * 1_000_000)` — Solana USDC is 6 decimals, not 9

### "Address not found" / wrong network
- Verify you're using the correct USDC mint for the network:
  - Devnet: `4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU`
  - Mainnet: `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v`
