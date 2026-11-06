# Deploy Smart Contract with Bytecode

## Compile your Solidity contract

Compile in Remix or your own build tool, then copy the ABI JSON and the raw bytecode (prefix it with `0x`).

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

Poll until `contract.status` is `COMPLETE` or `FAILED` (see Deployment Status in `SKILL.md`).

## Reference Links

- [Deploy a Smart Contract Guide](https://developers.circle.com/contracts/scp-deploy-smart-contract.md)
