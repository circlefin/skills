# CCTPx cross-chain transfer

Runnable Bridge Kit patterns for the CCTPx transfer lifecycle: discover -> estimate -> execute -> track -> retry. The live testnet route is `Ethereum_Sepolia -> Arc_Testnet`.

## Setup

```ts
import { inspect } from "node:util";
import { BridgeKit, type ActionHandler } from "@circle-fin/bridge-kit";
import { createViemAdapterFromPrivateKey } from "@circle-fin/adapter-viem-v2";

const kit = new BridgeKit();
const adapter = createViemAdapterFromPrivateKey({
  privateKey: process.env.PRIVATE_KEY as `0x${string}`,
});
```

## 1. Discover supported chains/tokens and check a route

This discovery/verification step is **optional for a known route** -- `kit.bridge({ token: "wETH", ... })` auto-routes to the CCTPx provider on its own (you do not need to construct the provider for a transfer). Use it to validate a dynamic or user-supplied route before bridging: a CCTPx burn can succeed on the source while the destination mint cannot, so verify the token is registered on both domains first (it is a Security Rule for that reason).

`supportsRoute` is async and reads Circle's IRIS token registry (cached, stale-while-revalidate). The published chain definitions are re-exported from `@circle-fin/bridge-kit`.

```ts
import { CCTPXBridgingProvider } from "@circle-fin/provider-cctpx";
import { EthereumSepolia, ArcTestnet } from "@circle-fin/bridge-kit";

const provider = new CCTPXBridgingProvider();

const canRoute = await provider.supportsRoute(EthereumSepolia, ArcTestnet, "wETH");
const chains = provider.getSupportedChains(); // chains carrying a cctpx.serviceAddress

// Force a fresh registry read on a long-lived instance:
await provider.refreshTokenRegistry();
```

## 2. Estimate (quote) a transfer

Settle the **transfer speed** with the user **before** quoting, because it changes the quote: `FAST` settles pre-finality and carries a transfer fee; `SLOW` waits for hard finality with no pre-finality fee. Pass the chosen speed to `estimate` so the quoted fee matches what `bridge` will charge. (The destination mint is handled by Circle's relayer automatically -- there is no `useForwarder` choice to make; see "Destination recipient" below.)

`estimate` returns a server-signed `quote` envelope plus a single-entry `fees[]`. Surface the quoted fee before executing.

```ts
const transferSpeed = "FAST"; // ask the user: "FAST" or "SLOW"

const estimate = await kit.estimate({
  from: { adapter, chain: "Ethereum_Sepolia" },
  to: { adapter, chain: "Arc_Testnet" },
  amount: "0.001",
  token: "wETH", // or a selector: { provider: "CCTPXBridgingProvider", id: "wETH" | "<bytes32 tokenId>" }
  config: { transferSpeed },
});

console.log(estimate.quote?.totalAmount, estimate.fees[0]?.token);
```

### FAST is best-effort -- it may degrade to SLOW

FAST draws on Circle's fast-burn allowance, a **shared, global pool**. You do not manage this yourself -- **let the quote API handle it**. When a FAST (pre-finality) quote is requested, the quote API checks the allowance and **fails the quote rather than quietly substituting a SLOW one** if the pool can't currently back the burn -- it won't hand back a FAST quote it can't honor. But the value it checks is a **persisted allowance snapshot** (published by Circle's attestation service, already volatility-adjusted), not a live pool read, and the pool is shared -- so a successful FAST quote is a strong signal, **not a guarantee**: the pool can still be drawn down between the quote and the burn. As a safety net, `bridge()` re-checks just before the burn and **auto-degrades to SLOW** (rather than risk an on-chain revert) if the pool can no longer back it. FAST also has no effect when the **source chain already has fast finality** (e.g. Arc): with no pre-finality window, the transfer runs as SLOW regardless of allowance.

**Whether a degrade is free depends on *where* it happens.** A degrade at the BridgeKit level (the pre-burn re-check above, before the burn is signed) costs nothing -- no pre-finality fee is collected. But if the burn already went out as FAST and Circle's attestation service (Retina) later settles it at hard finality, the **pre-finality fee was already collected** and is not refunded. So a FAST request that ends up settling slow is not guaranteed to be free; only an explicit `SLOW` request reliably avoids the pre-finality fee.

So treat FAST as best-effort: tell the user a FAST request may settle as SLOW, and detect the actual outcome from the bridge events (`kit.on('*')`) or the returned `result` -- a degrade surfaces as `cctpx.fastburn.unavailable`, or `cctpx.allowance.degraded` / `cctpx.allowance.failed` (see `references/observability.md`). If a no-fee, deterministic settlement is required, choose `SLOW` explicitly. Don't add your own allowance pre-check -- it adds complexity and still can't guarantee FAST settles, since the pool is shared and can move between any check and the burn.

## 3. Execute a cross-chain transfer

Source = destination wallet here (same adapter). The source wallet must hold the token being bridged plus native gas (ETH on Sepolia) for the fee and gas.

### Live progress via the catch-all event handler

```ts
const actionHandler: ActionHandler<typeof kit> = (data): void => {
  console.log("provider:", data.protocol, "| step:", data.method, "| payload:", data.values);
};
kit.on("*", actionHandler);
```

### FAST (pre-finality; auto-degrades to SLOW if the fast-burn allowance is exhausted)

Confirm the speed with the user before running this, and remember FAST is best-effort -- the quote API gates FAST on the fast-burn allowance snapshot, and `bridge()` re-checks the allowance just before the burn and degrades to SLOW if the shared pool can't back it (see "FAST is best-effort" above).

```ts
const result = await kit.bridge({
  from: { adapter, chain: "Ethereum_Sepolia" },
  to: { adapter, chain: "Arc_Testnet" }, // Circle's relayer mints on the destination automatically
  amount: "0.001",
  token: "wETH", // bare symbol auto-routes to the CCTPx provider
  config: { transferSpeed: "FAST" }, // use the same speed you quoted in step 2
});

console.log("RESULT:", inspect(result, false, null, true));
kit.off("*", actionHandler);
```

### SLOW (waits for hard finality; no pre-finality fee)

```ts
const result = await kit.bridge({
  from: { adapter, chain: "Ethereum_Sepolia" },
  to: { adapter, chain: "Arc_Testnet" },
  amount: "0.001",
  token: "wETH",
  config: { transferSpeed: "SLOW" },
});
```

### Destination recipient

Circle's relayer performs the destination mint automatically on every CCTPx transfer (the `forward` step) -- no destination-side transaction, wallet, or gas is required from you, and the `useForwarder` flag is a no-op for CCTPx. By default the mint goes to the destination adapter's address; pass `recipientAddress` on `to` to send it elsewhere.

```ts
// Default -- mint to the destination adapter's address:
to: { adapter, chain: "Arc_Testnet" }

// Mint to a specific recipient (e.g. server-side / custodial):
to: { recipientAddress: "0x<recipient>", chain: "Arc_Testnet" }
```

### Selecting a token by provider-native id

Use the explicit selector to bridge cirBTC, or any registry-listed token by its raw `bytes32` token id. The `id` is **not** limited to symbols BridgeKit knows -- a raw token id bridges any token the IRIS/CCTPx registry lists, even one the kit has no symbol for. Routability is decided by the registry, not a hardcoded symbol list.

```ts
token: { provider: "CCTPXBridgingProvider", id: "cirBTC" } // known symbol

// or a raw bytes32 token id from the IRIS registry (works for tokens the kit has no symbol for):
token: { provider: "CCTPXBridgingProvider", id: tokenId } // e.g. "0x<bytes32 token id>"
```

## 4. Sample RESULT (representative shape)

```json
{
  "amount": "0.001",
  "token": "wETH",
  "state": "success",
  "provider": "CCTPXBridgingProvider",
  "config": { "transferSpeed": "FAST" },
  "source": {
    "address": "0x742d35Cc6634C0532925a3b844Bc454e4438f44e",
    "chain": { "type": "evm", "chain": "Ethereum_Sepolia", "name": "Ethereum Sepolia" }
  },
  "destination": {
    "address": "0x742d35Cc6634C0532925a3b844Bc454e4438f44e",
    "chain": { "type": "evm", "chain": "Arc_Testnet", "name": "Arc Testnet" }
  },
  "steps": [
    { "name": "approve", "state": "success", "txHash": "0x1234...", "explorerUrl": "https://sepolia.etherscan.io/tx/0x1234..." },
    { "name": "transfer", "state": "success", "txHash": "0xabcd...", "explorerUrl": "https://sepolia.etherscan.io/tx/0xabcd..." },
    { "name": "fetchAttestation", "state": "success", "data": { "eventNonce": "0x9876..." } },
    { "name": "forward", "state": "success", "txHash": "0xfeed...", "explorerUrl": "https://testnet.arcscan.app/tx/0xfeed...", "data": { "forwardState": "COMPLETE" } }
  ]
}
```

## 5. Track status

```ts
if (result.state === "success") {
  console.log(result.steps.map((step) => step.name)); // [approve, transfer, fetchAttestation, forward]
}
// The destination leg is done when the forward step reports forwardState === "COMPLETE".
// forwardState vocabulary: PENDING | SENT | CONFIRMED | COMPLETE | FAILED (terminal: COMPLETE | FAILED)
```

## 6. Recovery -- resume from the failed step

A soft failure returns a result with `state: "error"` (it does not throw), carrying the steps that completed (the failed step has its own `state: "error"`). Resume from the failed step with `kit.retry` -- NEVER re-run `kit.bridge()` from scratch, which risks a double burn. `retry` is a BridgeKit method and is provider-agnostic, so the same call resumes a CCTPx transfer; pass the adapters directly as `from` / `to`.

An error-shaped result -- the object you pass to `retry` (here the burn succeeded but the attestation step failed):

```json
{
  "amount": "0.001",
  "token": "wETH",
  "state": "error",
  "provider": "CCTPXBridgingProvider",
  "config": { "transferSpeed": "FAST" },
  "steps": [
    { "name": "approve", "state": "success", "txHash": "0x1234..." },
    { "name": "transfer", "state": "success", "txHash": "0xabcd..." },
    { "name": "fetchAttestation", "state": "error", "error": { "message": "attestation timed out" } }
  ]
}
```

```ts
try {
  const result = await kit.bridge(/* ... */);

  if (result.state === "error") {
    // Resume with corrected adapters (e.g. a destination wallet that now has gas).
    // `retry` is BridgeKit's provider-agnostic recovery method; confirm the exact
    // argument shape against your installed @circle-fin/bridge-kit version.
    const retryResult = await kit.retry(result, { from: adapter, to: adapter });
    console.log("RETRY RESULT:", inspect(retryResult, false, null, true));
  }
} catch (error) {
  // Hard errors (validation / config / auth) throw -- handle them here.
  console.error(error);
}
```
