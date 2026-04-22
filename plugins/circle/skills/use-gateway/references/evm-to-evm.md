# Transfer Unified USDC from EVM to EVM

This example burns from Arc Testnet and Avalanche Fuji, then mints on Sei Testnet. The same pattern applies to any supported EVM source and destination chains after substituting the correct chain config, contract addresses, and domain IDs.

Canonical runnable references:
- Transfer unified USDC balance: https://developers.circle.com/gateway/howtos/transfer-unified-usdc-balance.md
- Unified balance EVM quickstart: https://developers.circle.com/gateway/quickstarts/unified-balance-evm.md
- Arc crosschain USDC tutorial: https://docs.arc.network/arc/tutorials/access-usdc-crosschain.md

## What this does

This script:

1. Builds a Gateway burn intent for each selected source chain
2. Signs each burn intent as EIP-712 typed data
3. Submits the signed intents to the Gateway `/transfer` API
4. Calls `gatewayMint(bytes,bytes)` on the destination EVM chain
5. Waits for the mint transaction receipt

## Runnable example

```ts
import { randomBytes } from "node:crypto";
import {
  createPublicClient,
  createWalletClient,
  formatUnits,
  getContract,
  http,
  maxUint256,
  pad,
  zeroAddress,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { avalancheFuji, arcTestnet, seiTestnet } from "viem/chains";

const GATEWAY_WALLET_ADDRESS = "0x0077777d7EBA4688BDeF3E311b846F25870A19B9";
const GATEWAY_MINTER_ADDRESS = "0x0022222ABE238Cc2C7Bb1f21003F0a260052475B";
const GATEWAY_API_URL = "https://gateway-api-testnet.circle.com/v1/transfer";

const TRANSFER_VALUE = 5_000_000n; // 5 USDC (6 decimals)
const MAX_FEE = 2_010000n;

const sourceChains = [
  {
    name: "Arc Testnet",
    chain: arcTestnet,
    usdcAddress: "0x3600000000000000000000000000000000000000",
    domainId: 26,
  },
  {
    name: "Avalanche Fuji",
    chain: avalancheFuji,
    usdcAddress: "0x5425890298aed601595a70AB815c96711a31Bc65",
    domainId: 1,
  },
];

const destinationChain = {
  name: "Sei Testnet",
  chain: seiTestnet,
  usdcAddress: "0x4fCF1784B31630811181f670Aea7A7bEF803eaED",
  domainId: 16,
};

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

const typedData = {
  domain: { name: "GatewayWallet", version: "1" },
  types: {
    EIP712Domain: [
      { name: "name", type: "string" },
      { name: "version", type: "string" },
    ],
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
  },
  primaryType: "BurnIntent" as const,
};

if (!process.env.EVM_PRIVATE_KEY) {
  throw new Error("EVM_PRIVATE_KEY not set");
}

const account = privateKeyToAccount(
  process.env.EVM_PRIVATE_KEY as `0x${string}`,
);

function toBytes32(address: `0x${string}`) {
  return pad(address.toLowerCase(), { size: 32 });
}

async function main() {
  console.log(`Using account: ${account.address}`);
  console.log(`Burning from: ${sourceChains.map((chain) => chain.name).join(", ")}`);
  console.log(`Minting on: ${destinationChain.name}`);

  const requests = [];

  for (const sourceChain of sourceChains) {
    const burnIntent = {
      maxBlockHeight: maxUint256,
      maxFee: MAX_FEE,
      spec: {
        version: 1,
        sourceDomain: sourceChain.domainId,
        destinationDomain: destinationChain.domainId,
        sourceContract: toBytes32(GATEWAY_WALLET_ADDRESS),
        destinationContract: toBytes32(GATEWAY_MINTER_ADDRESS),
        sourceToken: toBytes32(sourceChain.usdcAddress as `0x${string}`),
        destinationToken: toBytes32(
          destinationChain.usdcAddress as `0x${string}`,
        ),
        sourceDepositor: toBytes32(account.address),
        destinationRecipient: toBytes32(account.address),
        sourceSigner: toBytes32(account.address),
        destinationCaller: toBytes32(zeroAddress),
        value: TRANSFER_VALUE,
        salt: `0x${randomBytes(32).toString("hex")}`,
        hookData: "0x",
      },
    };

    const signature = await account.signTypedData({
      ...typedData,
      message: burnIntent,
    });

    requests.push({ burnIntent, signature });
  }

  const apiResponse = await fetch(GATEWAY_API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(requests, (_key, value) =>
      typeof value === "bigint" ? value.toString() : value,
    ),
  });

  if (!apiResponse.ok) {
    throw new Error(
      `Gateway API request failed: ${apiResponse.status} ${await apiResponse.text()}`,
    );
  }

  const { attestation, signature } = (await apiResponse.json()) as {
    attestation: `0x${string}`;
    signature: `0x${string}`;
  };

  const publicClient = createPublicClient({
    chain: destinationChain.chain,
    transport: http(),
  });

  const walletClient = createWalletClient({
    account,
    chain: destinationChain.chain,
    transport: http(),
  });

  const gatewayMinter = getContract({
    address: GATEWAY_MINTER_ADDRESS,
    abi: gatewayMinterAbi,
    client: walletClient,
  });

  const mintTx = await gatewayMinter.write.gatewayMint([attestation, signature], {
    account,
  });
  await publicClient.waitForTransactionReceipt({ hash: mintTx });

  const totalMinted = BigInt(sourceChains.length) * TRANSFER_VALUE;
  console.log(`Minted ${formatUnits(totalMinted, 6)} USDC`);
  console.log(`Mint transaction hash: ${mintTx}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
```

