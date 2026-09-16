# Deploying on Arc

Runnable setup patterns for Arc (mainnet and testnet). See the skill's Quick Reference for network details, token addresses, and the USDC-as-gas duality rules.

## Frontend app (React + wagmi)

Arc's chains are built into viem — no custom chain definition is needed: `arcTestnet` for testnet, `arc` for mainnet.

```typescript
import { createConfig, http } from 'wagmi'
import { arc, arcTestnet } from 'viem/chains'

const config = createConfig({
  chains: [arcTestnet, arc],
  transports: { [arcTestnet.id]: http(), [arc.id]: http() },
})
```

## Smart contracts (Foundry)

```bash
# Install Foundry
curl -L https://foundry.paradigm.xyz | bash && foundryup

# Deploy (local testing only — never pass private keys as CLI flags in deployed environments)
# Swap $ARC_TESTNET_RPC_URL for $ARC_MAINNET_RPC_URL to target mainnet.
forge create src/MyContract.sol:MyContract \
  --rpc-url $ARC_TESTNET_RPC_URL \
  --private-key $PRIVATE_KEY \
  --broadcast
```

## Circle contracts (pre-audited templates)

Deploy via Circle's Smart Contract Platform API:

| Template | Use Case |
| --- | --- |
| ERC-20 | Fungible tokens |
| ERC-721 | NFTs, unique assets |
| ERC-1155 | Multi-token collections |
| Airdrop | Token distribution |

See: https://developers.circle.com/contracts

## Bridge USDC to Arc

Use CCTP to bridge USDC from other chains. Arc's CCTP domain is `26`. See the `bridge-stablecoin` skill for the complete bridging workflow.
