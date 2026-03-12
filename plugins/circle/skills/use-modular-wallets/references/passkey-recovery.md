# Passkey Recovery for Circle Smart Accounts

Reference implementation for setting up and executing wallet recovery using a BIP-39 mnemonic phrase to register a new passkey when the original is lost.

**Source**: [passkey-recovery example](https://github.com/circlefin/modularwallets-web-sdk/blob/master/examples/passkey-recovery/index.tsx)

## Environment Variables

```
VITE_CLIENT_KEY=<your-circle-client-key>
VITE_CLIENT_URL=<your-circle-client-url>
```

## Setup

```typescript
import { createPublicClient, type Hex } from 'viem'
import { polygonAmoy } from 'viem/chains'
import { english, generateMnemonic, mnemonicToAccount } from 'viem/accounts'
import {
  type P256Credential,
  type SmartAccount,
  type WebAuthnAccount,
  createBundlerClient,
  toWebAuthnAccount,
} from 'viem/account-abstraction'
import {
  recoveryActions,
  toCircleSmartAccount,
  toModularTransport,
  toPasskeyTransport,
  toWebAuthnCredential,
  WebAuthnMode,
} from '@circle-fin/modular-wallets-core'
import { validateMnemonic } from 'bip39'

const clientKey = import.meta.env.VITE_CLIENT_KEY as string
const clientUrl = import.meta.env.VITE_CLIENT_URL as string

const passkeyTransport = toPasskeyTransport(clientUrl, clientKey)
const modularTransport = toModularTransport(`${clientUrl}/polygonAmoy`, clientKey)

const client = createPublicClient({
  chain: polygonAmoy,
  transport: modularTransport,
})

// Extend bundler client with recovery actions for managing account recovery
const bundlerClient = createBundlerClient({
  chain: polygonAmoy,
  transport: modularTransport,
}).extend(recoveryActions)
```

## Recovery Setup (while user has access)

### Step 1: Generate Recovery Key

Generate a BIP-39 mnemonic and derive the recovery EOA address. The user must save this phrase securely -- it is the only way to recover the account if the passkey is lost.

```typescript
const mnemonic = generateMnemonic(english)
const recoveryEoa = mnemonicToAccount(mnemonic)
const recoveryAddress: Hex = recoveryEoa.address

// Display mnemonic to user and instruct them to save it securely
```

### Step 2: Register Recovery Address On-Chain

Register the recovery EOA address with the smart account. This is an on-chain transaction that links the recovery address to the account.

```typescript
await bundlerClient.registerRecoveryAddress({
  account,           // the user's existing Circle Smart Account
  recoveryAddress,   // EOA address derived from the mnemonic
  paymaster: true,
})
```

## Recovery Execution (when passkey is lost)

### Step 3: Validate Mnemonic and Create New Passkey

Prompt the user for their saved mnemonic, validate it, and register a new passkey credential.

```typescript
if (!validateMnemonic(userEnteredMnemonic.trim())) {
  throw new Error('Invalid recovery phrase')
}

const newCredential = await toWebAuthnCredential({
  transport: passkeyTransport,
  mode: WebAuthnMode.Register,
  username: `${originalUsername}-recovered-${Date.now()}`,
})
```

### Step 4: Execute Recovery

Use the mnemonic EOA to authorize replacing the lost passkey with the new one.

```typescript
const localAccount = mnemonicToAccount(userEnteredMnemonic.trim())

// Create a temporary smart account using the recovery EOA as owner
const tempAccount = await toCircleSmartAccount({
  client,
  owner: localAccount,
})

// Execute recovery -- replaces the lost passkey owner with the new credential
await bundlerClient.executeRecovery({
  account: tempAccount,
  credential: newCredential,
  paymaster: true,
})

// Persist the new credential for future sessions
localStorage.setItem('credential', JSON.stringify(newCredential))
```

## Expected Flow Summary

1. **Setup**: User registers passkey -> generates mnemonic -> registers recovery address on-chain
2. **Loss**: Original passkey becomes inaccessible (lost device, deleted credential)
3. **Recovery**: User enters mnemonic -> creates new passkey -> `executeRecovery` swaps the owner on-chain
4. **Result**: Smart account is now controlled by the new passkey; the old passkey is revoked
