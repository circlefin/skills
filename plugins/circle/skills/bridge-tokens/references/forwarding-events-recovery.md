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

Forwarding fees vary by route; the SDK fetches them from the IRIS API at runtime. Forwarding fees to Solana also cover creating the recipient's USDC token account: an amount that does not exceed the fee fails with `INPUT_INVALID_AMOUNT`, and a `config.maxFee` you set yourself must cover it, so leave `maxFee` unset or use the `forwarder` fee from `estimate()`. Fee schedule: [Forwarding Service](https://developers.circle.com/cctp/concepts/forwarding-service).

## Event Handling

Subscribe to individual steps or to `"*"`; multiple callbacks per event are allowed. `payload.values` is typed from the event key, but `bridge.approve` and `bridge.fetchAttestation` are shared with CCTPx (different `values` shape) -- narrow on `payload.protocol` first.

```ts
kit.on("bridge.approve", (payload) => {
  const txHash =
    payload.protocol === "cctp"
      ? payload.values.txHash
      : payload.values.transactionHash;
  console.log("Approval completed:", txHash);
});

kit.on("bridge.burn", (payload) => {
  console.log("Burn completed:", payload.values.txHash);
});

kit.on("bridge.fetchAttestation", (payload) => {
  if (payload.protocol === "cctp" && payload.values.state === "success") {
    console.log("Attestation:", payload.values.data.attestation);
  }
});

kit.on("bridge.mint", (payload) => {
  console.log("Mint completed:", payload.values.txHash);
});

// App Kit's wildcard also receives non-bridge events, some without `method`.
kit.on("*", (payload) => {
  console.log("Event:", "method" in payload ? payload.method : payload.protocol, payload);
});
```

**CCTPx tokens** (wETH, cirBTC, EURC, token IDs) emit `bridge.transfer` and `bridge.forward` instead of `bridge.burn` and `bridge.mint`; see `non-usdc-cctpx.md`.

**Bridge Kit:** events have no `bridge.` prefix -- `"approve"`, `"burn"`, `"fetchAttestation"`, `"mint"`. Only App Kit namespaces them, because its `kit.on()` also carries other namespaces (e.g. `unifiedBalance.*`).

## Analyzing Failed Transfers

Find the failed step in `result.steps`:

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

`kit.retryBridge()` (App Kit) or `kit.retry()` (Bridge Kit, same arguments) resumes from the failed step and skips the ones that succeeded -- a timeout after `approve`/`burn` re-runs only the attestation fetch and mint.

```ts
const result = await kit.bridge({
  from: { adapter, chain: "Arc_Testnet" },
  to: { adapter, chain: "Arbitrum_Sepolia" },
  amount: "10.00",
});

if (result.state === "error") {
  const retryResult = await kit.retryBridge(result, {
    from: adapter,
    to: adapter,
  });
  console.log("Retry result:", retryResult.state);
}
```
