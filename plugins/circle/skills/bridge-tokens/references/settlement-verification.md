# Destination settlement verification

A successful CCTP mint transaction means the destination `receiveMessage` (or equivalent) call succeeded. It does **not** by itself prove that the expected economic settlement occurred.

Use this pattern after `kit.bridge()` returns when the application must mark a payment as settled — for example a merchant, PayLink, or escrow that credits a user only after destination-chain evidence is unambiguous.

This covers **standard destination-adapter mint flows** (the mint step has a transaction hash the destination adapter submitted). It does not define Forwarder/Orbit-specific settlement semantics.

## When to run this check

Run it when **all** of the following are true:

- `result.state === "success"`
- The `mint` step exists and `mint.state === "success"`
- `mint.txHash` is present
- The destination is an EVM chain you can query with a public client

Do **not** treat `result.state === "success"` alone as settlement. Soft errors, partial step data, and unrelated logs on the mint receipt can all look like success at the SDK layer.

## Inputs

From the Bridge Kit / App Kit result:

| Field | Source |
| --- | --- |
| Mint transaction hash | `result.steps.find((s) => s.name === "mint")?.txHash` |
| Expected recipient | `result.destination.address` |
| Expected amount (human) | `result.amount` (USDC, 6 decimals) |
| Destination chain | `result.destination.chain` |

Chain-specific USDC contract (must match the destination, not the source). Arc Testnet:

- Chain ID: `5042002`
- USDC: `0x3600000000000000000000000000000000000000`

Look up other chains from the [Circle USDC contract addresses](https://developers.circle.com/stablecoins/usdc-contract-addresses) list. Never hardcode a source-chain USDC address when verifying a destination mint.

## Verification policy

A mint receipt is settled only when **every** check passes:

1. Destination receipt `status` is `"success"` (not reverted, not missing).
2. `receipt.chainId` matches the expected destination chain ID.
3. Exactly **one** ERC-20 `Transfer` log from the **expected USDC contract** to the **exact recipient** for the **exact base-unit amount**.
4. Unrelated logs (other tokens, other recipients, other amounts) are ignored.
5. Zero matching logs → not settled.
6. Two or more logs that each match recipient + amount + USDC contract → not settled (ambiguous).

Reverted or indeterminate receipts are failure. Do not retry `kit.bridge()`; recover with `kit.retry()` only for soft transfer errors (see `forwarding-events-recovery.md`).

## Example (Viem)

```ts
import { createPublicClient, decodeEventLog, erc20Abi, parseUnits } from "viem";

const TRANSFER_TOPIC =
  "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

type Settlement =
  | { status: "verified"; txHash: `0x${string}`; logIndex: number }
  | { status: "unverified"; reason: string };

export async function verifyBridgeSettlement(args: {
  publicClient: ReturnType<typeof createPublicClient>;
  mintTxHash: `0x${string}`;
  expectedChainId: number;
  usdc: `0x${string}`;
  recipient: `0x${string}`;
  amountHuman: string; // e.g. result.amount, "1"
}): Promise<Settlement> {
  const expectedAmount = parseUnits(args.amountHuman, 6);
  const receipt = await args.publicClient.getTransactionReceipt({
    hash: args.mintTxHash,
  });

  if (receipt.status !== "success") {
    return { status: "unverified", reason: "destination mint receipt is not successful" };
  }

  const chainId = await args.publicClient.getChainId();
  if (chainId !== args.expectedChainId) {
    return { status: "unverified", reason: "public client is not on the destination chain" };
  }

  const matches: number[] = [];
  for (const log of receipt.logs) {
    if (log.address.toLowerCase() !== args.usdc.toLowerCase()) continue;
    if (log.topics[0] !== TRANSFER_TOPIC) continue;
    const decoded = decodeEventLog({
      abi: erc20Abi,
      data: log.data,
      topics: log.topics,
    });
    if (decoded.eventName !== "Transfer") continue;
    const { to, value } = decoded.args;
    if (to.toLowerCase() !== args.recipient.toLowerCase()) continue;
    if (value !== expectedAmount) continue;
    matches.push(log.logIndex);
  }

  if (matches.length === 0) {
    return { status: "unverified", reason: "no matching USDC Transfer log" };
  }
  if (matches.length > 1) {
    return { status: "unverified", reason: "ambiguous: multiple matching USDC Transfer logs" };
  }

  return { status: "verified", txHash: args.mintTxHash, logIndex: matches[0] };
}

// After kit.bridge():
// const mint = result.steps.find((s) => s.name === "mint");
// await verifyBridgeSettlement({
//   publicClient,
//   mintTxHash: mint.txHash,
//   expectedChainId: 5042002,
//   usdc: "0x3600000000000000000000000000000000000000",
//   recipient: result.destination.address,
//   amountHuman: result.amount,
// });
```

## Arc Testnet smoke check

A Base Sepolia → Arc Testnet CCTP V2 transfer of `1 USDC` (`1000000` base units) to `0x94705A9d675daa924F9190Eca4c05ED6B12d5345` produced destination `receiveMessage`:

`0x02cc00bd06e3e87b8bf9a042bdad7d7c6b566a84b7bd3f14a4afdff85c404741`

The Arc Testnet receipt was successful and contained one matching Transfer from the Arc Testnet USDC contract for exactly `1000000` units. [ArcScan](https://testnet.arcscan.app/tx/0x02cc00bd06e3e87b8bf9a042bdad7d7c6b566a84b7bd3f14a4afdff85c404741).

## Related

- `use-usdc` skill `references/evm.md` section 5 verifies incoming transfers by querying `Transfer` events. This reference is the bridge-specific version: it starts from `BridgeResult` mint metadata and requires a **single exact match** on one receipt rather than a block-range scan.
