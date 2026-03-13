# USDC on EVM - Complete Implementation Guide

## Private Key Handling (Write Operations Only)

**For read operations (balance, allowance, verify):** No private key needed.

**For write operations (transfer, approve):**

### Option 1: Environment Variable (Recommended)

```bash
export PRIVATE_KEY=0x...
```

```ts
import { privateKeyToAccount } from "viem/accounts";
const account = privateKeyToAccount(process.env.PRIVATE_KEY as `0x${string}`);
```

### Option 2: File Path (Acceptable)

```bash
# Store in ~/.ethereum/keys/testnet.key
echo "0x..." > ~/.ethereum/keys/testnet.key
chmod 600 ~/.ethereum/keys/testnet.key
```

```ts
import fs from "fs";
import { privateKeyToAccount } from "viem/accounts";

const privateKey = fs.readFileSync(
  path.join(process.env.HOME, ".ethereum/keys/testnet.key"),
  "utf-8"
).trim() as `0x${string}`;

const account = privateKeyToAccount(privateKey);
```

---

## Setup

```ts
import {
  createPublicClient,
  createWalletClient,
  http,
  erc20Abi,
  parseUnits,
  formatUnits,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { arcTestnet } from "viem/chains";

const chain = arcTestnet;

// For read operations only
const publicClient = createPublicClient({
  chain,
  transport: http(),
});

// For write operations (requires private key)
const account = privateKeyToAccount(process.env.PRIVATE_KEY as `0x${string}`);
const walletClient = createWalletClient({
  account,
  chain,
  transport: http(),
});

const USDC = "0x3600000000000000000000000000000000000000"; // Arc Testnet USDC address
```

---

## 1. Check USDC Balance (Read)

```ts
const balance = await publicClient.readContract({
  address: USDC,
  abi: erc20Abi,
  functionName: "balanceOf",
  args: ["0xYourAddress"],
});

// Format the balance for display
const formattedBalance = formatUnits(balance, 6);

// Display results to user
console.log(`USDC Balance: ${formattedBalance} USDC`);
console.log(`Address: 0xYourAddress`);
console.log(`Chain: Arc Testnet (5042002)`);
console.log(`Contract: ${USDC}`);
console.log(`Explorer: https://explorer.arc-testnet.io/address/0xYourAddress`);
```

**Expected output:**
```
USDC Balance: 10.50 USDC
Address: 0xYourAddress
Chain: Arc Testnet (5042002)
Contract: 0x3600000000000000000000000000000000000000
Explorer: https://explorer.arc-testnet.io/address/0xYourAddress
```

**Always format with 6 decimals — never 18.**

---

## 2. Check Allowance (Read)

```ts
const allowance = await publicClient.readContract({
  address: USDC,
  abi: erc20Abi,
  functionName: "allowance",
  args: ["0xOwnerAddress", "0xSpenderAddress"],
});

// Format and display the allowance
const formattedAllowance = formatUnits(allowance, 6);
console.log(`Allowance: ${formattedAllowance} USDC`);
```

---

## 3. Send USDC (Write)

### Step 1: Pre-flight Checks (Autonomous)

```ts
import { parseUnits, formatUnits } from "viem";

const amount = "10.00";
const recipient = "0xRecipientAddress";

// Check USDC balance
const usdcBalance = await publicClient.readContract({
  address: USDC,
  abi: erc20Abi,
  functionName: "balanceOf",
  args: [account.address],
});

if (usdcBalance < parseUnits(amount, 6)) {
  const have = formatUnits(usdcBalance, 6);
  throw new Error(
    `Insufficient USDC balance. Have: ${have} USDC, Need: ${amount} USDC`
  );
}

// Check gas balance
const gasBalance = await publicClient.getBalance({ address: account.address });
const gasEstimate = await publicClient.estimateContractGas({
  address: USDC,
  abi: erc20Abi,
  functionName: "transfer",
  args: [recipient, parseUnits(amount, 6)],
  account,
});
const feeData = await publicClient.estimateFeesPerGas();
const gasCost = gasEstimate * (feeData.maxFeePerGas ?? feeData.gasPrice ?? 0n);

if (gasBalance < gasCost) {
  const have = formatUnits(gasBalance, 18);
  const need = formatUnits(gasCost, 18);
  throw new Error(
    `Insufficient gas. Have: ${have} ETH, Need: ~${need} ETH`
  );
}
```

### Step 2: Present Preview

```
From:         0xYourAddress
To:           0xRecipientAddress
Amount:       10.00 USDC

Chain:        Arc Testnet (5042002)
USDC Address: 0x3600000000000000000000000000000000000000

Estimated Gas: 0.00012 USDC

Current Balance:  50.00 USDC
Balance After:    40.00 USDC

WARNING: This transaction will be submitted to the blockchain.
         Once confirmed, it CANNOT be reversed.

Confirm transaction? (yes/no)
```

### Step 3: Execute (After Confirmation)

```ts
// Submit the transaction
const hash = await walletClient.writeContract({
  address: USDC,
  abi: erc20Abi,
  functionName: "transfer",
  args: [recipient, parseUnits(amount, 6)],
});

console.log(`Transaction submitted: ${hash}`);
console.log(`Explorer: https://explorer.arc-testnet.io/tx/${hash}`);

// Wait for confirmation
const receipt = await publicClient.waitForTransactionReceipt({ hash });

if (receipt.status === "success") {
  console.log(`Transaction confirmed in block ${receipt.blockNumber}`);
  console.log(`Transferred ${amount} USDC to ${recipient}`);
} else {
  throw new Error(`Transaction failed`);
}
```

---

## 4. Approve Contract to Spend USDC (Write)

Any protocol that moves USDC on your behalf needs approval first. Always check current allowance before granting — skipping this causes silent reverts that waste gas.

### Step 1: Check Current Allowance (Autonomous)

```ts
const SPENDER = "0xProtocolContractAddress";
const required = parseUnits("100.00", 6);

const currentAllowance = await publicClient.readContract({
  address: USDC,
  abi: erc20Abi,
  functionName: "allowance",
  args: [account.address, SPENDER],
});

const formattedAllowance = formatUnits(currentAllowance, 6);
console.log(`Current Allowance: ${formattedAllowance} USDC`);
```

### Step 2: Present Preview + Confirm

```
Owner:             0xYourAddress
Spender:           0xProtocolContract
Current Allowance: 0.00 USDC
New Allowance:     100.00 USDC

WARNING: This allows the spender to move USDC on your behalf.
         Only approve trusted contracts.

Confirm approval? (yes/no)
```

### Step 3: Execute (After Confirmation)

```ts
if (currentAllowance < required) {
  // Submit approval transaction
  const hash = await walletClient.writeContract({
    address: USDC,
    abi: erc20Abi,
    functionName: "approve",
    args: [SPENDER, required],
  });

  console.log(`Approval submitted: ${hash}`);

  // Wait for confirmation
  const receipt = await publicClient.waitForTransactionReceipt({ hash });

  if (receipt.status === "success") {
    const formattedAmount = formatUnits(required, 6);
    console.log(`Approval confirmed. Spender can now move up to ${formattedAmount} USDC`);
  } else {
    throw new Error(`Approval failed`);
  }
}

// Now call the protocol's deposit/swap/etc. method
```

**Never use `transfer()` to deposit into protocols — it will revert. Use `approve()` then the protocol's deposit method.**

---

## 5. Verify Incoming Transfer (Read)

```ts
const logs = await publicClient.getContractEvents({
  address: USDC,
  abi: erc20Abi,
  eventName: "Transfer",
  args: { to: "0xRecipientAddress" },
  fromBlock: 1000000n,
  toBlock: "latest",
});

// Process and display the transfers
for (const log of logs) {
  const { from, value } = log.args;
  const amount = formatUnits(value, 6);
  console.log(`Received ${amount} USDC from ${from}`);
  console.log(`  Block: ${log.blockNumber}`);
  console.log(`  Tx: ${log.transactionHash}`);
  console.log(`  Explorer: https://explorer.arc-testnet.io/tx/${log.transactionHash}`);
}
```

Narrow `fromBlock` to reduce RPC load. Check block explorers for recent block numbers.

---

## ERC-20 Method Reference

| Method | Type | Signature | Notes |
|--------|------|-----------|-------|
| `balanceOf` | Read | `(owner) → uint256` | Raw 6-decimal bigint |
| `allowance` | Read | `(owner, spender) → uint256` | Check before protocol interactions |
| `totalSupply` | Read | `() → uint256` | Total USDC on this chain |
| `transfer` | Write | `(to, amount) → bool` | Direct send |
| `approve` | Write | `(spender, amount) → bool` | Grant spending permission |
| `transferFrom` | Write | `(from, to, amount) → bool` | Spend on behalf of owner (requires prior approve) |

---

## Common Issues

### "Insufficient USDC balance"
- Run balance check first
- Get testnet USDC from https://faucet.circle.com

### "Insufficient gas"
- Need native token (ETH, MATIC, etc.) for gas
- Get testnet gas from chain-specific faucets

### "Wrong decimal places" / "Amount too large"
- Use `parseUnits(amount, 6)` — never 18 decimals

### "Transaction reverted" on protocol interactions
- Did you approve the protocol first? Call `approve()` before deposit/swap

### "Address not found" / wrong chain
- Verify chain ID and USDC address match (see main SKILL.md Quick Reference)
