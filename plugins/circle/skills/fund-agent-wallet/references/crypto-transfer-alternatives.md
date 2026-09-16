# Crypto transfer — alternatives to the browser QR

## Save the QR as a PNG file

```bash
circle wallet fund --address <addr> --chain ARC --amount 10 --token usdc --method crypto --export ~/Downloads
```

## Manual transfer (no QR)

Provide the user the raw transfer details:

- Destination: the wallet address from `circle wallet list`
- Token: USDC
- Network: Arc (chain ID 5042)
- USDC contract on Arc: `0x3600000000000000000000000000000000000000`

For other chains, look up the USDC contract address at https://developers.circle.com/stablecoins/usdc-contract-addresses.

## Verify after transfer

```bash
circle wallet balance --address <addr> --chain ARC --output json
```
