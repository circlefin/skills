# Circle Smart Account with Passkey Authentication

Reference implementation for creating a Circle Smart Account using passkeys and sending gasless USDC transfers via user operations.

**Source**: [circle-smart-account example](https://github.com/circlefin/modularwallets-web-sdk/blob/master/examples/circle-smart-account/index.tsx)

## Environment Variables

```
VITE_CLIENT_KEY=<your-circle-client-key>
VITE_CLIENT_URL=<your-circle-client-url>
```

## Setup

```typescript
import { createPublicClient, parseUnits, type Hex } from 'viem'
import { arcTestnet } from 'viem/chains'
import {
  type P256Credential,
  type SmartAccount,
  type WebAuthnAccount,
  createBundlerClient,
  toWebAuthnAccount,
} from 'viem/account-abstraction'
import {
  WebAuthnMode,
  toCircleSmartAccount,
  toModularTransport,
  toPasskeyTransport,
  toWebAuthnCredential,
  encodeTransfer,
  ContractAddress,
} from '@circle-fin/modular-wallets-core'

const clientKey = import.meta.env.VITE_CLIENT_KEY as string
const clientUrl = import.meta.env.VITE_CLIENT_URL as string
const USDC_DECIMALS = 6

const passkeyTransport = toPasskeyTransport(clientUrl, clientKey)
const modularTransport = toModularTransport(`${clientUrl}/arcTestnet`, clientKey)

const client = createPublicClient({
  chain: arcTestnet,
  transport: modularTransport,
})

const bundlerClient = createBundlerClient({
  chain: arcTestnet,
  transport: modularTransport,
})
```

## Register a Passkey

```typescript
const credential = await toWebAuthnCredential({
  transport: passkeyTransport,
  mode: WebAuthnMode.Register,
  username: 'alice',
})

// Persist credential so the user stays logged in across reloads
localStorage.setItem('credential', JSON.stringify(credential))
```

## Login with Existing Passkey

```typescript
const credential = await toWebAuthnCredential({
  transport: passkeyTransport,
  mode: WebAuthnMode.Login,
})

localStorage.setItem('credential', JSON.stringify(credential))
```

## Create Smart Account from Credential

```typescript
const account = await toCircleSmartAccount({
  client,
  owner: toWebAuthnAccount({ credential }) as WebAuthnAccount,
  name: 'alice', // optional human-readable name
})

console.log('Smart account address:', account.address)
```

## Send Gasless USDC Transfer

```typescript
const to = '0xRecipientAddress' as Hex
const amount = parseUnits('10', USDC_DECIMALS)

// Encode an ERC-20 transfer call for USDC on Arc Testnet
const callData = encodeTransfer(to, ContractAddress.ArcTestnet_USDC, amount)

// paymaster: true means gas is sponsored by the developer via Circle Gas Station
const userOpHash = await bundlerClient.sendUserOperation({
  account,
  calls: [callData],
  paymaster: true,
})

// Wait for the user operation to be included on-chain
const { receipt } = await bundlerClient.waitForUserOperationReceipt({ hash: userOpHash })
console.log('Transaction hash:', receipt.transactionHash)
```

## Batch Multiple Calls

Pass an array of encoded calls to execute them atomically in a single user operation:

```typescript
const calls = [
  encodeTransfer(recipient1, ContractAddress.ArcTestnet_USDC, parseUnits('5', USDC_DECIMALS)),
  encodeTransfer(recipient2, ContractAddress.ArcTestnet_USDC, parseUnits('10', USDC_DECIMALS)),
]

const hash = await bundlerClient.sendUserOperation({
  account,
  calls,
  paymaster: true,
})
```
