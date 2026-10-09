# Bridging CCTPx tokens

CCTPx tokens bridge through the **same Bridge Kit surface** as USDC. Pass a registry alias (`"wETH"`, `"cirBTC"`, or `"EURC"`) or a registry-listed token ID directly as `token` in `kit.estimate()` / `kit.bridge()` (App Kit: `kit.estimateBridge()` / `kit.bridge()`); do not wrap it in a provider-selector object.

CCTPx requires App Kit or Bridge Kit `>=1.15.0`. Browser apps need App Kit `>=1.15.2` or Bridge Kit `>=1.15.1`, which fix CORS failures on CCTPx fee quotes.

CCTPx is EVM-only. Its enabled chains are Ethereum, Arc, Base, Arbitrum, Optimism, Polygon, and Avalanche (mainnet and testnet), but each token has its own routes. The SDK fetches the CCTPx token registry from Circle at runtime, and a transfer is supported only when that registry lists the selected alias or token ID on both endpoint domains. On mainnet, EURC bridges among Ethereum, Base, and Arc, and wETH and cirBTC bridge between Ethereum and Arc; wETH, cirBTC, and EURC are also available on eligible testnet routes. Do not hardcode a route list -- let the SDK check the route (see "Unsupported routes" below). Only USDC over CCTP can bridge to or from Solana.

Aliases are case-sensitive: use exactly `"wETH"`, `"cirBTC"`, or `"EURC"` (`"WETH"` is rejected). Amounts are human-readable strings (`"0.001"` wETH); the SDK scales them by the token's registry decimals.

The source wallet must hold the selected token plus the source chain's native token. The CCTPx fee is paid in the native token (sent with the transfer), on top of gas.

## Setup

```ts
import {
  BridgeKit,
  type BridgeEstimateResult,
  type BridgeParams,
} from "@circle-fin/bridge-kit";
import { createViemAdapterFromPrivateKey } from "@circle-fin/adapter-viem-v2";

const kit = new BridgeKit();
const adapter = createViemAdapterFromPrivateKey({
  privateKey: process.env.PRIVATE_KEY as `0x${string}`,
});
```

## Quote, then bridge on confirmation

Every CCTPx transfer pays a relayer fee for the destination mint. `FAST` (the default) adds a pre-finality fee on top; `SLOW` waits for source-chain finality and skips that extra fee. Settle the speed with the user first.

Keep quoting and bridging in separate functions. `quoteBridge()` only reads a fee and never moves funds. `executeBridge()` moves funds, so call it only from the user's explicit confirm action, such as the **Bridge** button handler or, in a script, an interactive confirmation (see "Runnable script" below) -- never directly after `quoteBridge()`, from an effect, or at module startup. With App Kit, call `kit.estimateBridge()` and `kit.bridge()` with the same params.

```ts
// Quote only. Show estimate.fees to the user; this never moves funds.
export async function quoteBridge(
  params: BridgeParams,
): Promise<BridgeEstimateResult> {
  return kit.estimate(params);
}

// Moves funds. Call only from the user's explicit confirm action, with the
// same params that produced the estimate the user reviewed.
export async function executeBridge(
  params: BridgeParams,
  estimate: BridgeEstimateResult,
) {
  const result = await kit.bridge({ ...params, quote: estimate.quote });
  for (const warning of result.warnings ?? []) {
    // QUOTE_NOT_REUSED: the fee paid differs from the reviewed quote.
    // SPEED_DOWNGRADED: FAST was re-priced and settled as SLOW.
    console.warn(warning.code, warning.message);
  }
  return result;
}

export const wethParams: BridgeParams = {
  from: { adapter, chain: "Ethereum_Sepolia" },
  to: { adapter, chain: "Arc_Testnet" }, // Circle's relayer mints on the destination
  amount: "0.001",
  token: "wETH", // registry alias auto-routes to CCTPx
  config: { transferSpeed: "FAST" }, // or "SLOW" -- ask the user
};
```

Quote reuse is best-effort, not a fee guarantee. `executeBridge()` passes `estimate.quote` so the SDK can reuse the reviewed fee. If the quote has gone stale or no longer matches the requested speed, `kit.bridge()` fetches a fresh one and reports `QUOTE_NOT_REUSED` on the result, so the fee paid can differ from the fee shown. If the fast-transfer allowance cannot cover the amount, `FAST` is re-priced as `SLOW` with a `SPEED_DOWNGRADED` warning. To keep the reviewed fee current, re-run `quoteBridge()` when the user has waited before confirming, and surface both warnings after the transfer. Estimate and bridge with the same token: a CCTPx quote passed to a plain USDC bridge is ignored silently, and the fee comes from CCTP instead.

### Runnable script

When the user wants a script they can run, keep the same two functions and put an interactive confirmation between them. At startup the script only quotes; `executeBridge()` runs only after the user answers `y`.

```ts
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

async function main() {
  const estimate = await quoteBridge(wethParams);
  for (const fee of estimate.fees) {
    console.log(`${fee.type} fee: ${fee.amount} ${fee.token}`);
  }

  const rl = createInterface({ input, output });
  const answer = await rl.question(
    "Bridge 0.001 wETH Ethereum_Sepolia -> Arc_Testnet? (y/N) ",
  );
  rl.close();
  if (answer.trim().toLowerCase() !== "y") {
    console.log("Cancelled; nothing was sent.");
    return;
  }

  const result = await executeBridge(wethParams, estimate);
  console.log(result.state);
}

void main();
```

## Bridging another registry alias

Swap the alias and use one of that token's registry-supported routes, then pass the params through the same `quoteBridge()` / `executeBridge()` flow. For cirBTC:

```ts
export const cirBtcParams: BridgeParams = {
  from: { adapter, chain: "Ethereum_Sepolia" },
  to: { adapter, chain: "Arc_Testnet" },
  amount: "0.001",
  token: "cirBTC",
  config: { transferSpeed: "SLOW" },
};
```

For EURC between Ethereum Sepolia and Base Sepolia:

```ts
export const eurcParams: BridgeParams = {
  from: { adapter, chain: "Ethereum_Sepolia" },
  to: { adapter, chain: "Base_Sepolia" },
  amount: "10",
  token: "EURC",
  config: { transferSpeed: "SLOW" },
};
```

## Bridging by token ID

Any token listed in the CCTPx registry can be selected by its bytes32 token ID (`0x` followed by 64 hex characters), including registered user-issued tokens. Pass the ID directly as `token`; the registry must list deployments for both selected endpoint domains. An alias always maps to its canonical registry entry, so select any other registration of the same asset by its token ID.

```ts
const tokenId = process.env.CCTPX_TOKEN_ID as `0x${string}`;

export const tokenIdParams: BridgeParams = {
  from: { adapter, chain: "Ethereum_Sepolia" },
  to: { adapter, chain: "Arc_Testnet" },
  amount: "1",
  token: tokenId,
  config: { transferSpeed: "FAST" },
};

// const estimate = await quoteBridge(tokenIdParams)  -> show estimate.fees
// On the user's confirm action: await executeBridge(tokenIdParams, estimate)
```

## Unsupported routes and options

When the registry does not list the token on both chains, `kit.estimate()` (App Kit: `kit.estimateBridge()`) and `kit.bridge()` throw a `KitError` with code `INPUT_UNSUPPORTED_ROUTE` (1003). If the registry cannot be reached, they throw a retryable `SERVICE_ROUTE_CHECK_UNAVAILABLE` instead. Do not redirect an unsupported request to a different CCTPx chain pair; ask the user to choose a supported route, or use the `swap-tokens` skill when a cross-chain swap can reach the requested token and chain.

CCTPx routes reject custom fees, `feePayment: "destination"`, and `useForwarder: false` with `INPUT_VALIDATION_FAILED`. Omit these options.

## Result shape and recovery

CCTPx transfers run `approve -> transfer -> fetchAttestation -> forward`, plus an `approveFee` step before `transfer` only when the fee token is an ERC-20. Circle's relayer performs the destination mint -- no destination gas or `useForwarder` toggle required. The transfer is complete when `result.state === "success"`; do not check `forwardState` for a single value, because the relayer reports either `"CONFIRMED"` or `"COMPLETE"`.

Progress events follow these step names, not the USDC `burn` / `mint` events in `forwarding-events-recovery.md`: subscribe to `bridge.transfer` and `bridge.forward` on App Kit (`transfer` and `forward` on Bridge Kit).

`result.token` is the resolved bytes32 token ID, not the alias you passed.

To send the minted tokens to a different address, add `recipientAddress` to `to`:

```ts
to: { adapter, chain: "Arc_Testnet", recipientAddress: "0x<recipient>" }
```

Recovery from a mid-transfer failure uses the same pattern as USDC -- `kit.retry(result, ...)` on Bridge Kit, `kit.retryBridge(result, ...)` on App Kit -- and never re-runs `kit.bridge()` from scratch. A CCTPx retry is possible only after the `transfer` step was submitted; it resumes the attestation and relayer forward. A failure before `transfer` leaves no funds in flight, so fix the cause and call `kit.bridge()` again. See `forwarding-events-recovery.md`.
