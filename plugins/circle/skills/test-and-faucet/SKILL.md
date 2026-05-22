
| name | description |
| --- | --- |
| test-and-faucet | Configure testnets and obtain testnet tokens (USDC and native gas) for development and testing with Circle APIs and SDKs. Covers supported testnet chains, public RPC endpoints, USDC faucet usage, native gas faucets, and common gotchas. Use at the start of any Circle integration to set up a working testnet environment before writing code. Triggers on: testnet, faucet, test USDC, get USDC, testnet setup, sandbox, devnet, Sepolia, Fuji, Amoy, Solana devnet, testnet config, RPC endpoint, chain config, test tokens, gas tokens, testnet wallet, faucet.circle.com, testnet CCTP, testnet Gateway. |

## Overview

Before building with Circle APIs, you need two things on every testnet chain: **native gas tokens** (to pay transaction fees) and **testnet USDC** (to test payment, transfer, and wallet flows). This skill covers how to get both, which RPC endpoints to use, and the common failure modes that slow developers down.

Always default to testnet. Never use real funds during development.

## Step 1 — Get Native Gas Tokens

Each chain requires its own native gas token. Obtain gas tokens **before** requesting testnet USDC — you need gas to approve and receive USDC.

| Chain | Token | Faucet |
| --- | --- | --- |
| Ethereum Sepolia | ETH | https://www.alchemy.com/faucets/ethereum-sepolia |
| Base Sepolia | ETH | https://www.alchemy.com/faucets/base-sepolia |
| Arbitrum Sepolia | ETH | https://www.alchemy.com/faucets/arbitrum-sepolia |
| OP Sepolia | ETH | https://www.alchemy.com/faucets/optimism-sepolia |
| Polygon Amoy | POL | https://faucet.polygon.technology |
| Avalanche Fuji | AVAX | https://faucet.avax.network |
| Unichain Sepolia | ETH | https://www.alchemy.com/faucets/unichain-sepolia |
| Solana Devnet | SOL | https://faucet.solana.com |
| Arc Testnet | USDC (native) | No gas faucet needed — USDC is the native gas token on Arc |

> **Note:** Sonic Testnet, World Chain Sepolia, Sei Atlantic, and HyperEVM Testnet have chain-specific faucets. Check the respective project's developer docs for current faucet URLs, as these change frequently.

### Gas Faucet Gotchas

* Most Ethereum testnet faucets (Sepolia, Base Sepolia, etc.) require either a mainnet ETH balance or social verification (GitHub, X/Twitter, Alchemy account) to prevent abuse. Have credentials ready.
* Polygon Amoy faucets dispense small amounts (0.5 POL). If a transaction fails with "out of gas," request from the faucet again.
* Solana Devnet airdrop via CLI (`solana airdrop 2`) is rate-limited to 2 SOL per request. If you hit the limit, wait ~60 seconds or use the web faucet instead.

## Step 2 — Get Testnet USDC

Circle provides a single faucet for testnet USDC across all supported chains:

**https://faucet.circle.com**

1. Connect your wallet (MetaMask for EVM chains, Phantom/Solflare for Solana)
2. Select the target chain from the dropdown
3. Request USDC — amounts are limited per request (typically 10 USDC)
4. Confirm the transaction in your wallet

> **Arc Testnet:** Arc is not yet listed on faucet.circle.com. Bridge testnet USDC from another testnet chain to Arc via CCTP (see `bridge-stablecoin` skill) or use the Circle developer console if available.

### USDC Faucet Gotchas

* The faucet UI defaults to Ethereum Sepolia. Double-check the chain selector before requesting — USDC sent to the wrong chain cannot be recovered without a bridge.
* If the faucet transaction fails, ensure you have gas tokens on that chain first (Step 1).
* Testnet USDC has no monetary value. Do not bridge it to mainnet.

## Step 3 — Configure RPC Endpoints

Use these public RPC endpoints for development. For production or high-volume testing, replace with a private endpoint from Alchemy, Infura, or QuickNode.

### EVM Testnets

| Chain | RPC Endpoint | Chain ID |
| --- | --- | --- |
| Ethereum Sepolia | `https://rpc.sepolia.org` | 11155111 |
| Base Sepolia | `https://sepolia.base.org` | 84532 |
| Arbitrum Sepolia | `https://sepolia-rollup.arbitrum.io/rpc` | 421614 |
| OP Sepolia | `https://sepolia.optimism.io` | 11155420 |
| Polygon Amoy | `https://rpc-amoy.polygon.technology` | 80002 |
| Avalanche Fuji | `https://api.avax-test.network/ext/bc/C/rpc` | 43113 |
| Unichain Sepolia | `https://sepolia.unichain.org` | 1301 |

### Solana

| Network | RPC Endpoint |
| --- | --- |
| Devnet | `https://api.devnet.solana.com` |

### Testnet USDC Contract Addresses

USDC is deployed at different addresses on testnet vs. mainnet. **Always use testnet addresses during development.**

| Chain | Testnet USDC Address |
| --- | --- |
| Ethereum Sepolia | `0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238` |
| Base Sepolia | `0x036CbD53842c5426634e7929541eC2318f3dCF7e` |
| Arbitrum Sepolia | `0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d` |
| OP Sepolia | `0x5fd84259d66Cd46123540766Be93DFE6D43130D7` |
| Polygon Amoy | `0x41E94Eb019C0762f9Bfcf9Fb1E58725BfB0e7582` |
| Avalanche Fuji | `0x5425890298aed601595a70AB815c96711a31Bc65` |
| Solana Devnet | `4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU` |

> For the complete and always-current list, refer to: https://developers.circle.com/stablecoins/usdc-contract-addresses

## Step 4 — Verify Your Setup

Before writing integration code, confirm your environment works end-to-end:

1. **Check gas balance** — query your wallet balance on the target chain; it should be non-zero.
2. **Check USDC balance** — query the testnet USDC contract for your address; it should reflect what the faucet dispensed.
3. **Send a test transfer** — transfer a small amount of testnet USDC to a second wallet you control. If this succeeds, your RPC and contract config are correct.
4. **Check the Circle API** — if using Circle Wallets or CCTP, make sure your API key is scoped to the testnet environment (sandbox), not production.

## Circle API Sandbox

Circle's REST APIs have separate sandbox and production environments. The sandbox uses testnet chains.

* **Sandbox base URL:** `https://api-sandbox.circle.com`
* **Production base URL:** `https://api.circle.com`

Obtain a sandbox API key from the [Circle Developer Console](https://console.circle.com). Sandbox keys do not work against production endpoints and vice versa.

## Rules

### Security Rules

* NEVER use mainnet funds, mainnet API keys, or production contract addresses during development. If you are unsure whether an address or key is for testnet, stop and verify before proceeding.
* NEVER commit API keys or private keys to source control. Store them in environment variables. Add `.env*` to `.gitignore` immediately when scaffolding a project.

### Best Practices

* ALWAYS obtain gas tokens before requesting testnet USDC — faucet transactions require gas.
* ALWAYS verify you are targeting the correct chain before sending transactions. A mismatch between wallet chain and contract chain is the most common testnet setup error.
* ALWAYS use testnet USDC contract addresses (listed above), not mainnet addresses.
* ALWAYS use the Circle API sandbox base URL (`api-sandbox.circle.com`) during development, not the production URL.
* PREFER public RPC endpoints for early development; switch to a dedicated provider (Alchemy, Infura, QuickNode) before load or integration testing to avoid rate limits.
* ALWAYS use 6 decimals for USDC amounts (`parseUnits(amount, 6)` in ethers/viem). Never use 18.

## Reference Links

* [Circle USDC Testnet Faucet](https://faucet.circle.com)
* [USDC Contract Addresses](https://developers.circle.com/stablecoins/usdc-contract-addresses)
* [Circle Developer Console (sandbox API keys)](https://console.circle.com)
* [Circle Developer Docs](https://developers.circle.com/llms.txt) — **Always read this first** when looking for relevant documentation from the source website.

---

DISCLAIMER: This skill is provided "as is" without warranties, is subject to the [Circle Developer Terms](https://console.circle.com/legal/developer-terms), and output generated may contain errors and/or include fee configuration options (including fees directed to Circle); additional details are in the repository [README](https://github.com/circlefin/skills/blob/master/README.md).
