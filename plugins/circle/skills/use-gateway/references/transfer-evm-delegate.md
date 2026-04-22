# Transfer Unified USDC from an SCA Depositor via Delegate

This example burns from Arc Testnet and mints on Base Sepolia using Circle Developer-Controlled Wallets. The same pattern applies to other supported EVM chains after substituting the correct chain config, contract addresses, domain IDs, and wallet blockchain identifiers.

Canonical runnable references:
- Manage delegates: https://developers.circle.com/gateway/howtos/manage-delegates.md
- Unified balance EVM quickstart: https://developers.circle.com/gateway/quickstarts/unified-balance-evm.md

## What this does

This script:

1. Assumes the source depositor is an SCA that already holds a unified Gateway balance
2. Assumes an EOA delegate has already been added for the source chain
3. Builds a burn intent with the SCA as `sourceDepositor` and the EOA as `sourceSigner`
4. Signs the burn intent with the delegate wallet
5. Submits the signed burn intent to the Gateway `/transfer` API
6. Calls `gatewayMint(bytes,bytes)` on the destination chain

## Delegate requirement

For SCA depositors, Gateway outbound transfers require a delegate EOA because the burn intent must be signed with an ECDSA-capable signer.
Add the delegate on the source chain before using this pattern.
In the burn intent, set `sourceDepositor` to the SCA address and `sourceSigner` to the delegate EOA address.

## Runnable example

```ts
import { randomBytes } from "node:crypto";
import { initiateDeveloperControlledWalletsClient } from "@circle-fin/developer-controlled-wallets";

const GATEWAY_WALLET_ADDRESS = "0x0077777d7EBA4688BDeF3E311b846F25870A19B9";
const GATEWAY_MINTER_ADDRESS = "0x0022222ABE238Cc2C7Bb1f21003F0a260052475B";
const GATEWAY_API_URL = "https://gateway-api-testnet.circle.com/v1/transfer";

const SOURCE_CHAIN = {
  walletChain: "ARC-TESTNET",
  domain: 26,
  usdc: "0x3600000000000000000000000000000000000000",
};

const DESTINATION_CHAIN = {
  walletChain: "BASE-SEPOLIA",
  domain: 6,
  usdc: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
};

const TRANSFER_AMOUNT_USDC = "5";
// Confirm the appropriate maxFee for the selected chains and environment in the canonical Gateway docs.
const MAX_FEE = 2_010000n;
const MAX_UINT256_DEC = ((1n << 256n) - 1n).toString();

const API_KEY = process.env.CIRCLE_API_KEY!;
const ENTITY_SECRET = process.env.CIRCLE_ENTITY_SECRET!;
const DEPOSITOR_ADDRESS = process.env.DEPOSITOR_ADDRESS!; // SCA
const DELEGATE_WALLET_ADDRESS = process.env.DELEGATE_WALLET_ADDRESS!; // EOA
const RECIPIENT_ADDRESS = process.env.RECIPIENT_ADDRESS ?? DEPOSITOR_ADDRESS;

if (!API_KEY || !ENTITY_SECRET || !DEPOSITOR_ADDRESS || !DELEGATE_WALLET_ADDRESS) {
  throw new Error(
    "Missing required env vars: CIRCLE_API_KEY, CIRCLE_ENTITY_SECRET, DEPOSITOR_ADDRESS, DELEGATE_WALLET_ADDRESS",
  );
}

const client = initiateDeveloperControlledWalletsClient({
  apiKey: API_KEY,
  entitySecret: ENTITY_SECRET,
});

const typedDataDomain = { name: "GatewayWallet", version: "1" } as const;

const EIP712_TYPES = {
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
} as const;

function parseBalance(value: string): string {
  const [whole, decimal = ""] = value.split(".");
  return (whole || "0") + (decimal + "000000").slice(0, 6);
}

function addressToBytes32(address: string): string {
  return "0x" + address.toLowerCase().replace(/^0x/, "").padStart(64, "0");
}

function stringifyTypedData<T>(obj: T) {
  return JSON.stringify(obj, (_key, value) =>
    typeof value === "bigint" ? value.toString() : value,
  );
}

async function waitForTxCompletion(txId: string, label: string) {
  const terminalStates = new Set([
    "COMPLETE",
    "CONFIRMED",
    "FAILED",
    "DENIED",
    "CANCELLED",
  ]);

  while (true) {
    const { data } = await client.getTransaction({ id: txId });
    const state = data?.transaction?.state;

    if (state && terminalStates.has(state)) {
      if (state !== "COMPLETE" && state !== "CONFIRMED") {
        throw new Error(`${label} did not complete successfully (state=${state})`);
      }
      return data.transaction;
    }

    await new Promise((resolve) => setTimeout(resolve, 3000));
  }
}

async function main() {
  console.log(`Depositor (SCA): ${DEPOSITOR_ADDRESS}`);
  console.log(`Delegate (EOA): ${DELEGATE_WALLET_ADDRESS}`);

  const burnIntent = {
    maxBlockHeight: MAX_UINT256_DEC,
    maxFee: MAX_FEE,
    spec: {
      version: 1,
      sourceDomain: SOURCE_CHAIN.domain,
      destinationDomain: DESTINATION_CHAIN.domain,
      sourceContract: addressToBytes32(GATEWAY_WALLET_ADDRESS),
      destinationContract: addressToBytes32(GATEWAY_MINTER_ADDRESS),
      sourceToken: addressToBytes32(SOURCE_CHAIN.usdc),
      destinationToken: addressToBytes32(DESTINATION_CHAIN.usdc),
      sourceDepositor: addressToBytes32(DEPOSITOR_ADDRESS),
      destinationRecipient: addressToBytes32(RECIPIENT_ADDRESS),
      sourceSigner: addressToBytes32(DELEGATE_WALLET_ADDRESS),
      destinationCaller: addressToBytes32("0x0000000000000000000000000000000000000000"),
      value: parseBalance(TRANSFER_AMOUNT_USDC),
      salt: "0x" + randomBytes(32).toString("hex"),
      hookData: "0x",
    },
  };

  const typedData = {
    types: EIP712_TYPES,
    domain: typedDataDomain,
    primaryType: "BurnIntent",
    message: burnIntent,
  };

  const signResponse = await client.signTypedData({
    walletAddress: DELEGATE_WALLET_ADDRESS,
    blockchain: SOURCE_CHAIN.walletChain,
    data: stringifyTypedData(typedData),
  });

  const burnSignature = signResponse.data?.signature;
  if (!burnSignature) {
    throw new Error("Failed to sign burn intent with delegate wallet");
  }

  const transferResponse = await fetch(GATEWAY_API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: stringifyTypedData([
      {
        burnIntent: typedData.message,
        signature: burnSignature,
      },
    ]),
  });

  if (!transferResponse.ok) {
    throw new Error(
      `Gateway API request failed: ${transferResponse.status} ${await transferResponse.text()}`,
    );
  }

  const { attestation, signature } = (await transferResponse.json()) as {
    attestation: string;
    signature: string;
  };

  if (!attestation || !signature) {
    throw new Error("Missing attestation or operator signature in Gateway response");
  }

  const mintTx = await client.createContractExecutionTransaction({
    walletAddress: DEPOSITOR_ADDRESS,
    blockchain: DESTINATION_CHAIN.walletChain,
    contractAddress: GATEWAY_MINTER_ADDRESS,
    abiFunctionSignature: "gatewayMint(bytes,bytes)",
    abiParameters: [attestation, signature],
    fee: { type: "level", config: { feeLevel: "MEDIUM" } },
  });

  const mintTxId = mintTx.data?.id;
  if (!mintTxId) {
    throw new Error("Failed to submit mint transaction");
  }

  await waitForTxCompletion(mintTxId, "USDC mint");
  console.log(`Minted ${TRANSFER_AMOUNT_USDC} USDC on ${DESTINATION_CHAIN.walletChain}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
```

