# Circle Skills Plugin

Skills for building Circle onchain applications with USDC payments, crosschain transfers, and wallet infrastructure.

## Included

- `skills/`: Circle onchain development skills (see below)
- `mcp.json`: MCP server config for Circle documentation

## Skills

### use-usdc
Interact with USDC on EVM chains and Solana. Use to check balances, send transfers, approve spending, and verify transactions. Supports ERC-20 patterns, SPL token operations, and Associated Token Accounts (ATAs) on Solana.

### bridge-stablecoin
Build apps that bridge/transfer USDC between chains using Circle's CCTP (Crosschain Transfer Protocol). Includes UX patterns, progress tracking, destination chain linking, and Bridge Kit SDK implementation patterns for EVM and Solana chains.

### use-arc
Build on Arc, Circle's blockchain where USDC is the native gas token. Covers chain configuration, smart contract deployment (Foundry/Hardhat), frontend integration (viem/wagmi), and bridging USDC to Arc via CCTP.

### use-circle-wallets
Choose the right Circle wallet type for your application. Compares developer-controlled, user-controlled, and modular (passkey) wallets across custody model, key management, account types, and blockchain support with a step-by-step decision guide.

### use-developer-controlled-wallets
Developer-controlled wallets where developers manage wallet creation, storage, and key management. Use for custodial or operational flows like payouts, treasury movements, subscriptions, and automation. Includes secure setup, SDK workflows, and guides for wallet creation, balance checking, and token transfers.

### use-gateway
Implement Circle Gateway unified balance for crosschain USDC transfers. Supports instant transfers (<500ms) across EVM and Solana chains with deposit, balance query, and transfer workflows. Includes detailed reference files for EVM-only, Solana-only, and cross-ecosystem implementations.

### use-modular-wallets
Build smart contract wallets with passkey authentication, gasless transactions, and modular architecture. Supports ERC-4337 account abstraction and ERC-6900 modular framework for advanced onchain wallets requiring custom logic like passkeys, multisig, subscriptions, or batch transactions.

### use-smart-contract-platform
Deploy, import, interact with, and monitor smart contracts using Circle's Smart Contract Platform. Supports bytecode deployment, template contracts (ERC-20/721/1155), ABI-based read/write calls, and event monitoring.

### use-user-controlled-wallets
Build embedded crypto wallets where users control their own assets. Supports Web2-like login experiences (Google, Facebook, Apple, email OTP, PIN) without seed phrases. Full-stack implementation with backend API and frontend SDK integration.
