# Deploy from Contract Templates

Use these TypeScript snippets to deploy audited template contracts without writing Solidity code. See the Contract Templates table in SKILL.md for available template IDs.

## Deploy template

```ts
const TEMPLATE_ID = "aea21da6-0aa2-4971-9a1a-5098842b1248"; // ERC-1155

const deployRes = await scpClient.deployContractTemplate({
  id: TEMPLATE_ID,
  blockchain: "ARC-TESTNET",
  name: "MyContract",
  walletId,
  templateParameters: {
    name: "MyContract",
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

## Check deployment transaction state

```ts
const txRes = await walletsClient.getTransaction({ id: deploymentTxId! });
console.log(txRes.data?.transaction?.state); // COMPLETE when finished
```

## Mint tokens (ERC-1155 example)

```ts
const contractAddress = "DEPLOYED_CONTRACT_ADDRESS";

const mintRes = await walletsClient.createContractExecutionTransaction({
  walletId,
  contractAddress,
  abiFunctionSignature: "mintTo(address,uint256,string,uint256)",
  abiParameters: [
    walletAddress,
    "115792089237316195423570985008687907853269984665640564039457584007913129639935",
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

Deploy response means deployment started; always verify transaction status. `mintTo` caller must have minter permissions for the contract. Each template has different `templateParameters` -- see the template links in the table above for required fields.

## Reference Links

- [Deploy an ERC-1155 Contract Template Guide](https://developers.circle.com/contracts/deploy-smart-contract-template.md)
- [ERC-20 Token Template](https://developers.circle.com/contracts/erc-20-token.md)
- [ERC-721 NFT Template](https://developers.circle.com/contracts/erc-721-nft.md)
- [ERC-1155 Multi-Token Template](https://developers.circle.com/contracts/erc-1155-multi-token.md)
- [Airdrop Template](https://developers.circle.com/contracts/airdrop.md)
