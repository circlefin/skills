# Import an Existing Contract

## Import contract

```ts
import crypto from 'node:crypto';

const response = await scpClient.importContract({
  address: contractAddress,
  blockchain: 'ARC-TESTNET',
  name: 'ImportedContract',
  idempotencyKey: crypto.randomUUID(),
});

const contractId = response.data?.contract.id;
```

## Get contract details

```ts
const contractDetails = await scpClient.getContract({ id: contractId! });
console.log(contractDetails.data?.contract?.functions);
```

## Handle duplicate import

On a duplicate-contract error (175004), find the existing contract by address:

```ts
const listRes = await scpClient.listContracts({ blockchain: 'ARC-TESTNET' });
const existing = listRes.data?.contracts?.find(c =>
  c.contractAddress?.toLowerCase() === contractAddress.toLowerCase()
);
const contractId = existing?.id;
```
