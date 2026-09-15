# Slippage, stop limit, and custom fees

## Slippage & Stop Limit

**Slippage tolerance** (relative, in basis points):

```ts
const result = await kit.swap({
  from: { adapter, chain: "Ethereum" },
  tokenIn: "USDT",
  tokenOut: "USDC",
  amountIn: "100.00",
  config: {
    slippageBps: 100, // 1% slippage tolerance
  },
});
```

**Stop limit** (absolute minimum output):

```ts
const result = await kit.swap({
  from: { adapter, chain: "Ethereum" },
  tokenIn: "USDT",
  tokenOut: "USDC",
  amountIn: "100.00",
  config: {
    stopLimit: "99.50", // Reject if output < 99.50 USDC
  },
});
```

## Custom Fees

```ts
const result = await kit.swap({
  from: { adapter, chain: "Ethereum" },
  tokenIn: "USDT",
  tokenOut: "USDC",
  amountIn: "100.00",
  config: {
    customFee: {
      percentageBps: 100, // 1% developer fee
      recipientAddress: "0xYourFeeRecipientAddress",
    },
  },
});
```
