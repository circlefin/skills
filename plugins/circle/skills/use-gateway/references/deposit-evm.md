# Deposit USDC on EVM into Gateway

This example uses Arc Testnet, but the same deposit pattern applies to any supported EVM chain after substituting the correct chain config, Gateway Wallet address, and USDC address.

Canonical runnable references:
- Create unified USDC balance: https://developers.circle.com/gateway/howtos/create-unified-usdc-balance.md
- Unified balance EVM quickstart: https://developers.circle.com/gateway/quickstarts/unified-balance-evm.md
- Arc crosschain USDC tutorial: https://docs.arc.network/arc/tutorials/access-usdc-crosschain.md

## What this does

This script:

1. Approves the Gateway Wallet contract to spend USDC
2. Calls `deposit(address,uint256)` on the Gateway Wallet contract
3. Waits for both transactions to confirm

## Critical warning

Do **not** send USDC directly to the Gateway Wallet contract with a normal ERC-20 transfer. The funds will not be credited to the unified balance. You must call the Gateway `deposit()` method.

## Runnable example

```ts
import {
  createPublicClient,
  createWalletClient,
  erc20Abi,
  formatUnits,
  getContract,
  http,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { arcTestnet } from "viem/chains";

const GATEWAY_WALLET_ADDRESS = "0x0077777d7EBA4688BDeF3E311b846F25870A19B9";
const USDC_ADDRESS = "0x3600000000000000000000000000000000000000";
const DEPOSIT_AMOUNT = 5_000_000n; // 5 USDC (6 decimals)

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

if (!process.env.EVM_PRIVATE_KEY) {
  throw new Error("EVM_PRIVATE_KEY not set");
}

const account = privateKeyToAccount(
  process.env.EVM_PRIVATE_KEY as `0x${string}`,
);

const publicClient = createPublicClient({
  chain: arcTestnet,
  transport: http(),
});

const walletClient = createWalletClient({
  account,
  chain: arcTestnet,
  transport: http(),
});

const usdc = getContract({
  address: USDC_ADDRESS,
  abi: erc20Abi,
  client: walletClient,
});

const gatewayWallet = getContract({
  address: GATEWAY_WALLET_ADDRESS,
  abi: gatewayWalletAbi,
  client: walletClient,
});

async function main() {
  console.log(`Approving ${formatUnits(DEPOSIT_AMOUNT, 6)} USDC...`);

  const approvalTx = await usdc.write.approve(
    [gatewayWallet.address, DEPOSIT_AMOUNT],
    { account },
  );
  await publicClient.waitForTransactionReceipt({ hash: approvalTx });
  console.log(`Approved: ${approvalTx}`);

  console.log(
    `Depositing ${formatUnits(DEPOSIT_AMOUNT, 6)} USDC to Gateway Wallet...`,
  );

  const depositTx = await gatewayWallet.write.deposit(
    [usdc.address, DEPOSIT_AMOUNT],
    { account },
  );
  await publicClient.waitForTransactionReceipt({ hash: depositTx });
  console.log(`Deposit tx: ${depositTx}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
```


