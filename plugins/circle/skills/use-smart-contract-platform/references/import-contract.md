# Import an Existing Contract

Use these TypeScript snippets to import an already-deployed contract into Circle Smart Contract Platform for interaction and event monitoring.

## Import contract

```ts
import crypto from 'node:crypto';

const response = await scpClient.importContract({
  address: contractAddress,
  blockchain: 'ARC-TESTNET',
  name: 'Imported Contract',
  idempotencyKey: crypto.randomUUID(),
});

const contractId = response.data?.contractId;
```

## Get contract details

```ts
const contractDetails = await scpClient.getContract({ id: contractId });
console.log(contractDetails.data?.contract?.functions);
```

## Handle duplicate import

If `importContract()` returns a duplicate/already-exists error, fall back to listing and matching by address:

```ts
const listRes = await scpClient.listContracts({ blockchain: 'ARC-TESTNET' });
const existing = listRes.data?.contracts?.find(c =>
  c.contractAddress.toLowerCase() === contractAddress.toLowerCase()
);
const contractId = existing?.id;
```
