# Deploying on Arc

Runnable setup patterns for Arc (mainnet and testnet). See the skill's Quick Reference for network details, token addresses, and the USDC-as-gas duality rules.

## Frontend app (React + wagmi)

Pass the RPC URL to `http()` explicitly; this works on any viem version. Bare `http()` uses the chain's default RPC: `arc` has none before viem `2.56.6`, and `arcTestnet` points at the retired `rpc.testnet.arc.network` before `2.57.5`.

```typescript
import { createConfig, http } from 'wagmi'
import { arc, arcTestnet } from 'viem/chains'

const config = createConfig({
  chains: [arcTestnet, arc],
  transports: {
    [arcTestnet.id]: http('https://rpc.testnet.arc.io'),
    [arc.id]: http('https://rpc.mainnet.arc.io'),
  },
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

Use CCTP to bridge USDC from other chains. Arc's CCTP domain is `26`. See the `bridge-tokens` skill for the complete bridging workflow.
