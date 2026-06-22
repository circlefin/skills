# Forwarding Service, event handling, and failed-transfer recovery

## Forwarding Service

With adapters on both chains:

```ts
const result = await kit.bridge({
  from: { adapter, chain: "Ethereum_Sepolia" },
  to: {
    adapter,
    chain: "Arc_Testnet",
    useForwarder: true,
  },
  amount: "1",
});
```

Without a destination adapter (server-side or custodial transfers):

```ts
const result = await kit.bridge({
  from: { adapter, chain: "Ethereum_Sepolia" },
  to: {
    recipientAddress: "0x742d35Cc6634C0532925a3b844Bc454e4438f44e",
    chain: "Arc_Testnet",
    useForwarder: true,
  },
  amount: "1",
});
```

Forwarding Service fees are dynamic and fetched from the IRIS API at runtime. The SDK handles this automatically. Fees vary by route -- check the [Forwarding Service](https://developers.circle.com/cctp/concepts/forwarding-service) for the latest fee schedule.

## Event Handling

Subscribe to individual CCTP steps or all events at once. Multiple callbacks per event are supported. `payload.values` is inferred precisely from the event key, so no type assertions are needed.

```ts
kit.on("bridge.approve", (payload) => {
  console.log("Approval completed:", payload.values.txHash);
});

kit.on("bridge.burn", (payload) => {
  console.log("Burn completed:", payload.values.txHash);
});

kit.on("bridge.fetchAttestation", (payload) => {
  if (payload.values.state === "success") {
    console.log("Attestation:", payload.values.data.attestation);
  }
});

kit.on("bridge.mint", (payload) => {
  console.log("Mint completed:", payload.values.txHash);
});

kit.on("*", (payload) => {
  console.log("Event:", payload.action, payload);
});
```

**Bridge Kit only:** drop the `bridge.` prefix — the events are `"approve"`, `"burn"`, `"fetchAttestation"`, `"mint"`. The App Kit `bridge.*` namespacing only applies because App Kit's `kit.on()` also dispatches other namespaces (e.g. `unifiedBalance.*`) and filters bridge events by the `bridge.` prefix.

## Analyzing Failed Transfers

Check `result.state` and `result.steps` to identify which step failed:

```ts
const result = await kit.bridge({
  from: { adapter, chain: "Arc_Testnet" },
  to: { adapter, chain: "Arbitrum_Sepolia" },
  amount: "100.00",
});

if (result.state === "error") {
  const failedStep = result.steps.find((step) => step.state === "error");
  console.log(`Failed at: ${failedStep?.name}`);
  console.log(`Error: ${failedStep?.error}`);

  const completedSteps = result.steps.filter(
    (step) => step.state === "success",
  );
  completedSteps.forEach((step) => {
    console.log(`${step.name}: ${step.txHash}`);
  });
}
```

## Retrying Failed Transfers

`kit.retry()` resumes from the failed step, skipping the steps that already succeeded — so a timeout after `approve`/`burn` re-runs only the attestation fetch and mint.

```ts
const result = await kit.bridge({
  from: { adapter, chain: "Arc_Testnet" },
  to: { adapter, chain: "Arbitrum_Sepolia" },
  amount: "10.00",
});

if (result.state === "error") {
  const retryResult = await kit.retry(result, {
    from: adapter,
    to: adapter,
  });
  console.log("Retry result:", retryResult.state);
}
```
