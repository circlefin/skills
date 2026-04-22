# Wallet Management for User-Controlled Wallets

## Overview

Wallet management operations for user-controlled wallets.

## Backend SDK Methods

### Update wallet metadata

Updates the display name or reference ID of an existing wallet. No on-chain transaction or challenge required.

```ts
const response = await circleClient.updateWallet({
  userToken,
  id: walletId,
  name: "Updated Wallet Name",
  refId: "new-ref-id",
});
// response.data: { wallet }
```

## Reference Links

- [Update Wallet API](https://developers.circle.com/api-reference/wallets/user-controlled-wallets/update-wallet)
