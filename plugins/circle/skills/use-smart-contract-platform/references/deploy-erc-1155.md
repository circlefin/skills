# Deploy ERC-1155 Template

## Prerequisites

- Dev-controlled wallet on `ARC-TESTNET`

## Constants

```ts
const ERC1155_TEMPLATE_ID = "aea21da6-0aa2-4971-9a1a-5098842b1248";
```

## 1) Deploy ERC-1155 template

```ts
const walletId = "YOUR_WALLET_ID";
const walletAddress = "YOUR_WALLET_ADDRESS";

const deployRes = await scpClient.deployContractTemplate({
  id: ERC1155_TEMPLATE_ID,
  blockchain: "ARC-TESTNET",
  name: "MyERC1155Contract",
  walletId,
  templateParameters: {
    name: "MyERC1155Contract",
    defaultAdmin: walletAddress,
    primarySaleRecipient: walletAddress,
    royaltyRecipient: walletAddress,
    royaltyPercent: 0,
  },
  fee: {
    type: "level",
    config: { feeLevel: "MEDIUM" },
  },
});

const contractId = deployRes.data?.contractIds?.[0];
const deploymentTxId = deployRes.data?.transactionId;
console.log({ contractId, deploymentTxId });
```

## 2) Check deployment transaction state

```ts
const txRes = await walletClient.getTransaction({ id: deploymentTxId! });
console.log(txRes.data?.transaction?.state); // COMPLETE when finished
```

## 3) Mint token with `mintTo`

```ts
const contractAddress = "DEPLOYED_ERC1155_CONTRACT_ADDRESS";

const mintRes = await walletClient.createContractExecutionTransaction({
  walletId,
  contractAddress,
  abiFunctionSignature: "mintTo(address,uint256,string,uint256)",
  abiParameters: [
    walletAddress,
    "115792089237316195423570985008687907853269984665640564039457584007913129639935", // creates tokenId 0 in this template pattern
    "ipfs://YOUR_METADATA_URI",
    "1",
  ],
  fee: {
    type: "level",
    config: { feeLevel: "MEDIUM" },
  },
});

console.log(mintRes.data);
```

## Notes

- Deploy response means deployment started; always verify transaction status.
- `mintTo` caller must have minter permissions for the contract.
