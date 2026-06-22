# Crypto transfer — alternatives to the browser QR

## Save the QR as a PNG file

```bash
circle wallet fund --address <addr> --chain BASE --amount 10 --token usdc --method crypto --export ~/Downloads
```

## Manual transfer (no QR)

Provide the user the raw transfer details:

- Destination: the wallet address from `circle wallet list`
- Token: USDC
- Network: BASE (chain ID 8453)
- USDC contract on BASE: `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`

For other chains, look up the USDC contract address at https://developers.circle.com/stablecoins/usdc-contract-addresses.

## Verify after transfer

```bash
circle wallet balance --address <addr> --chain BASE --output json
```
