# Deploy Smart Contract with Bytecode

Use these TypeScript snippets to deploy a contract from compiled ABI + bytecode.

## Compile your Solidity contract

Compile in Remix (or your own build tool), then copy:
- ABI JSON
- Raw bytecode (prefix with `0x` before deployment)

## Deploy contract from ABI + bytecode

```ts
const abiJson = [
  // Paste full ABI JSON here
];

const bytecode = "0xPASTE_COMPILED_BYTECODE_HERE";

const deployRes = await scpClient.deployContract({
  name: "MyContract",
  description: "Contract description",
  blockchain: "ARC-TESTNET",
  walletId,
  abiJson: JSON.stringify(abiJson),
  bytecode,
  constructorParameters: [
    walletAddress,
    "0x3600000000000000000000000000000000000000", // Arc Testnet USDC
  ],
  fee: {
    type: "level",
    config: { feeLevel: "MEDIUM" },
  },
});

const contractId = deployRes.data?.contractId;
console.log({ contractId, tx: deployRes.data?.transactionId });
```

## Check deployment status

```ts
const contractRes = await scpClient.getContract({ id: contractId! });
console.log(contractRes.data?.contract);
```

Deployment is complete when `deploymentStatus` is `COMPLETE`.

## Reference Links

- [Deploy a Smart Contract Guide](https://developers.circle.com/contracts/scp-deploy-smart-contract.md)
