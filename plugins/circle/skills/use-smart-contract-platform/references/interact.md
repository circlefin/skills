# Interact with a Deployed Contract

Use these TypeScript snippets to read contract metadata, query read-only methods, and execute write methods.

## Get contract details and ABI functions

```ts
const contractId = "YOUR_CONTRACT_ID";
const contractRes = await scpClient.getContract({ id: contractId });

console.log(contractRes.data?.contract?.contractAddress);
console.log(contractRes.data?.contract?.functions ?? []);
```

## Query a read function

`abiFunctionSignature` format is `functionName(type1,type2,...)`.

```ts
const queryRes = await scpClient.queryContract({
  address: "YOUR_CONTRACT_ADDRESS",
  blockchain: "ARC-TESTNET",
  abiFunctionSignature: "owner()",
  abiJson: JSON.stringify([
    {
      name: "owner",
      type: "function",
      stateMutability: "view",
      inputs: [],
      outputs: [{ type: "address", name: "" }],
    },
  ]),
});

console.log(queryRes.data?.outputValues);
```

## Execute a write function

Write calls require `walletId` and gas fee settings.

```ts
const executeRes = await walletsClient.createContractExecutionTransaction({
  walletId: "YOUR_WALLET_ID",
  contractAddress: "YOUR_CONTRACT_ADDRESS",
  abiFunctionSignature: "safeMint(address,uint256)",
  abiParameters: ["0xRecipientAddress", "1"],
  fee: {
    type: "level",
    config: { feeLevel: "MEDIUM" },
  },
});

const txId = executeRes.data?.transactionId;
console.log({ txId });
```

## Poll write transaction status

```ts
const txRes = await walletsClient.getTransaction({ id: txId! });
console.log(txRes.data?.transaction?.state);
```

## Reference Links

- [Interact with a Smart Contract Guide](https://developers.circle.com/contracts/scp-interact-smart-contract.md)
