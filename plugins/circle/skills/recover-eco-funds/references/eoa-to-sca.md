# Recover USDC from a backing EOA to its linked SCA

This reference is only for legacy Eco deposits that refunded USDC to the `eoaOwnerAddress` associated with a Circle smart contract account (SCA). Current Gateway v2/Circle CLI deposits set the refund recipient to the SCA and do not need this sweep.

## Why a normal transfer does not work

The backing EOA is exposed as `eoaOwnerAddress` on the Circle wallet detail object, but it is not returned as a separate wallet by normal wallet-list results. As a result, `circle wallet balance` can return `NOT_FOUND` and `circle wallet transfer` cannot select it as a source wallet.

Funding the backing EOA with native gas is unnecessary. Native USDC supports ERC-3009: the EOA signs a one-time authorization, while another account relays the USDC contract call and pays gas. Use the linked SCA as relayer and destination.

## Required identity checks

1. Resolve the selected SCA through `circle wallet list --chain <CHAIN> --type agent --output json`.
2. Fetch that wallet by wallet ID through the Circle wallet API.
3. Read `eoaOwnerAddress` from the returned SCA wallet object.
4. Require the value to be a valid EVM address.
5. If the user supplied an expected EOA, require an exact case-insensitive match.
6. Read the USDC balance directly with `balanceOf(eoaOwnerAddress)` on the refund chain.

Never infer the owner from transaction history, an Eco API response, a different chain's wallet, or a user-pasted address alone. Circle agent wallets can have different SCA instances across chains.

## ERC-3009 authorization

Use USDC's standard structure:

```solidity
TransferWithAuthorization(
    address from,
    address to,
    uint256 value,
    uint256 validAfter,
    uint256 validBefore,
    bytes32 nonce
)
```

Build EIP-712 typed data with an explicit domain type:

```json
{
  "types": {
    "EIP712Domain": [
      {"name":"name","type":"string"},
      {"name":"version","type":"string"},
      {"name":"chainId","type":"uint256"},
      {"name":"verifyingContract","type":"address"}
    ],
    "TransferWithAuthorization": [
      {"name":"from","type":"address"},
      {"name":"to","type":"address"},
      {"name":"value","type":"uint256"},
      {"name":"validAfter","type":"uint256"},
      {"name":"validBefore","type":"uint256"},
      {"name":"nonce","type":"bytes32"}
    ]
  },
  "primaryType": "TransferWithAuthorization",
  "domain": {
    "name": "<USDC name() on this network>",
    "version": "<USDC version(), normally 2>",
    "chainId": "<refund-chain EVM ID>",
    "verifyingContract": "<USDC contract>"
  },
  "message": {
    "from": "<verified backing EOA>",
    "to": "<linked SCA>",
    "value": "<exact atomic amount>",
    "validAfter": "0",
    "validBefore": "<current time plus a short window>",
    "nonce": "<fresh random bytes32>"
  }
}
```

Read `name()`, `version()`, and `decimals()` from the selected USDC contract when available. USDC's display/domain name differs across some mainnet and testnet deployments (`USD Coin` versus `USDC`), so do not hardcode the name. Require 6 decimals for native USDC unless authoritative chain metadata explains otherwise.

Use a cryptographically random 32-byte nonce and a short validity window, normally one hour. Never reuse a nonce.

## Sign with the backing EOA, not the SCA

Request Circle typed-data signing using:

```json
{
  "walletAddress": "<verified backing EOA>",
  "blockchain": "<Circle chain code>",
  "data": "<serialized EIP-712 JSON>"
}
```

Do not request signing with the SCA wallet ID. The SCA path can wrap ordinary typed data as an EIP-1271 replay-safe SCA signature. USDC's ERC-3009 implementation expects a raw ECDSA signature from `from`, so that wrapper does not verify.

After Circle returns the signature:

1. Recover the EIP-712 signer locally.
2. Require it to equal the verified backing EOA.
3. Parse `v`, `r`, and `s`.
4. Hash the signature for evidence, then keep the raw value out of logs and chat.

Signing authorizes movement. Ask for explicit user approval before requesting the signature, not only before broadcast.

## Estimate gas before signing

The exact contract-execution calldata contains the backing EOA signature, so it does not exist before approval. Estimate first with a structurally equivalent, zero-value ERC-3009 authorization signed by a fresh ephemeral local account. Simulate that probe, submit it only to Circle's fee-estimation endpoint, and discard its private key and raw signature without logging either. Because the probe value is zero and its signer is unrelated to the user, it cannot authorize movement of user funds.

Show the probe estimate before requesting approval. Bind approval to a maximum decimal network fee in the chain's native token. Before requesting the real backing EOA signature, repeat the probe and require it to remain within that maximum. After producing the real calldata, estimate it exactly and require that estimate to remain within the same maximum before broadcast.

## Simulate and submit

Encode:

```text
transferWithAuthorization(
  address,address,uint256,uint256,uint256,bytes32,uint8,bytes32,bytes32
)
```

with:

```text
from        = verified backing EOA
to          = linked SCA
value       = approved atomic amount
validAfter  = signed validAfter
validBefore = signed validBefore
nonce       = signed nonce
v/r/s       = parsed raw EOA signature
```

Before submission:

1. Call `authorizationState(backing EOA, nonce)` and require `false`.
2. Run the exact `transferWithAuthorization` calldata through `eth_call` with `from=<SCA>` and `to=<USDC>`.
3. Estimate the same raw calldata through Circle contract execution and require the fee to be within the pre-approved maximum.
4. Re-check the EOA balance is at least the approved value.

Submit through the linked SCA. The USDC authorization debits the EOA; the SCA only relays the call and pays network gas.

## Approval summary

Immediately before signing and submission, show:

```text
Operation: backing EOA USDC recovery
Chain: <name/id>
Token: <USDC address, name, version, decimals>
From: <verified eoaOwnerAddress>
To: <linked SCA>
Amount: <atomic and decimal>
Authorization expiry: <unix and ISO time>
Relayer / gas payer: <linked SCA>
Estimated network fee: <value, if available before signing>
Maximum approved network fee: <decimal native-token amount>
```

Bind approval to `<EOA>:<SCA>:<atomic amount>`.

## Reconciliation and replay safety

After submission, verify all three independent signals:

- `authorizationState(backing EOA, nonce) == true`;
- backing EOA balance decreased by the exact amount;
- linked SCA balance increased by the exact amount.

Also record the Circle transaction ID, idempotency key, onchain transaction hash, receipt status, network fee, and USDC `Transfer` log.

If the client response is ambiguous, do not sign a new authorization. Query authorization state, balances, and transaction history first. A consumed nonce proves the original authorization executed.

## Verified behavior

Circle verified this exact pattern on Base Sepolia with 0.5 USDC: the backing EOA decreased by 0.5, the linked SCA increased by 0.5, and the ERC-3009 authorization nonce became consumed. The backing EOA held no native gas; the SCA relayed the call.

## Sources

- EIP-3009: https://eips.ethereum.org/EIPS/eip-3009
- Circle USDC contracts: https://developers.circle.com/stablecoins/usdc-contract-addresses
