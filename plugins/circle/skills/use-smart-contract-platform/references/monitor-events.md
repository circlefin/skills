# Monitor Smart Contract Events

Use these TypeScript snippets to receive webhook notifications when a contract emits specific events, and to fetch historical event logs.

## Import contract (required before creating monitor)

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
const historyRes = await scpClient.getEventHistory({
  contractAddress: "0xYourContractAddress",
  blockchain: "ARC-TESTNET",
  eventSignature: "Transfer(address,address,uint256)",
});

console.log(historyRes.data?.eventLogs ?? []);
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

Use `notification.topics` and `notification.data` to decode indexed/non-indexed fields.

## Reference Links

- [Event Monitoring for Smart Contracts Guide](https://developers.circle.com/contracts/scp-event-monitoring.md)
