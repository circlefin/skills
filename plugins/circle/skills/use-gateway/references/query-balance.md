# Querying Unified Balance

POST an array of `{ domain, depositor }` source tuples to the Gateway balances endpoint. Each source identifies a chain (by domain ID) and a depositor address. For Solana depositors, use the base58 public key.

**Endpoint**:
- Testnet: `POST https://gateway-api-testnet.circle.com/v1/balances`
- Mainnet: `POST https://gateway-api.circle.com/v1/balances`

**Request body**:
```json
{
  "token": "USDC",
  "sources": [
    { "domain": 0, "depositor": "0xAbC123..." },
    { "domain": 5, "depositor": "5iv62nJJJHsV7pgJcA3sf9kp98uWaQcjyKtxFZ5dEbcW" }
  ]
}
```

**Response**:
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

`balance` is a decimal string in human-readable units (6 decimals for USDC). Domains with zero balance are still returned.
