# Query Unified Gateway Balances

Canonical runnable references:
- Unified balance EVM quickstart: https://developers.circle.com/gateway/quickstarts/unified-balance-evm.md
- Unified balance Solana quickstart: https://developers.circle.com/gateway/quickstarts/unified-balance-solana.md

## What this does

This request:

1. Sends a `POST` request to the Gateway `/balances` API
2. Passes one or more `{ domain?, depositor }` sources
3. Returns each source's balance

## Critical notes

- `depositor` (required): the depositor address. For Solana, use the base58 public key.
- `domain` (optional): the Gateway domain ID of the source chain. Omit it to get the depositor's balance on every domain where the address is valid.
- `balance` is a decimal string in human-readable USDC units (6 decimals).
- Domains with zero balance may still be returned.

## Endpoint

- Testnet: `POST https://gateway-api-testnet.circle.com/v1/balances`
- Mainnet: `POST https://gateway-api.circle.com/v1/balances`

## Request body

```json
{
  "token": "USDC",
  "sources": [
    { "domain": 0, "depositor": "0xAbC123..." },
    { "domain": 5, "depositor": "5iv62nJJJHsV7pgJcA3sf9kp98uWaQcjyKtxFZ5dEbcW" }
  ]
}
```

## Response

```json
{
  "token": "USDC",
  "balances": [
    {
      "domain": 0,
      "depositor": "0xAbC123...",
      "balance": "4.892670"
    },
    {
      "domain": 5,
      "depositor": "5iv62nJJJHsV7pgJcA3sf9kp98uWaQcjyKtxFZ5dEbcW",
      "balance": "10.000000"
    }
  ]
}
```

