# Monitor Smart Contract Events

## Import the contract first

```ts
import crypto from 'node:crypto';

const importRes = await scpClient.importContract({
  address: "0xYourContractAddress",
  blockchain: "ARC-TESTNET",
  idempotencyKey: crypto.randomUUID(),
  name: "MyToken",
  description: "Imported contract for event monitoring",
});

console.log(importRes.data?.contract);
```

## Create event monitor

```ts
const monitorRes = await scpClient.createEventMonitor({
  blockchain: "ARC-TESTNET",
  contractAddress: "0xYourContractAddress",
  eventSignature: "Transfer(address,address,uint256)",
  idempotencyKey: crypto.randomUUID(),
});

console.log(monitorRes.data?.eventMonitor);
```

## Fetch event history

```ts
const historyRes = await scpClient.listEventLogs({
  contractAddress: "0xYourContractAddress",
  blockchain: "ARC-TESTNET",
});

const transferLogs = (historyRes.data?.eventLogs ?? []).filter(
  (log) => log.eventSignature === "Transfer(address,address,uint256)",
);
```

## Webhook payload shape (example)

```json
{
  "notificationType": "contracts.eventLog",
  "notification": {
    "contractAddress": "0xYourContractAddress",
    "blockchain": "ARC-TESTNET",
    "txHash": "0x...",
    "eventName": "Transfer(address,address,uint256)",
    "topics": ["0xddf252ad..."],
    "data": "0x..."
  },
  "timestamp": "2026-01-01T00:00:00.000Z",
  "version": 2
}
```

Decode indexed fields from `notification.topics` and non-indexed fields from `notification.data`.

## Reference Links

- [Event Monitoring for Smart Contracts Guide](https://developers.circle.com/contracts/scp-event-monitoring.md)
