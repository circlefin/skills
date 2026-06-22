# Circle Skills Plugin

Skills for building Circle onchain applications with USDC payments, crosschain transfers, and wallet infrastructure.

## Included

- `skills/`: Circle onchain development skills (see below)
- `mcp.json`: MCP server config for Circle documentation

## Skills

### accept-agent-payments
Monetize an HTTP endpoint for agents with USDC pay-per-call payments. Defaults to Gateway Nanopayments, covers x402 seller integration, paid-call verification, and Agent Marketplace listing prep.

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

### use-circle-cli
The holistic stablecoin CLI (`@circle-fin/cli`, command `circle`) for AI agents. Acts as the front door to Circle's full agent stack (wallet management, crosschain transfers, paid services, Gateway/Nanopayments, smart contracts, and spending policy) and routes to the specialized skills below for deep flows.

### use-agent-wallet
Bootstrap a non-custodial USDC agent wallet with the Circle CLI. Covers install check, terms acceptance, login, wallet creation, and status inspection, then hands off to the dedicated payment, funding, and policy skills.

### fund-agent-wallet
Fund a Circle agent wallet with USDC. Covers the fiat on-ramp (buy USDC with USD/card) and crypto transfer, plus Gateway/Nanopayments deposits used to pay for services. Payments are gas-abstracted (USDC only, no ETH required).

### pay-via-agent-wallet
Pay for x402 services on Circle's marketplace. Search paid HTTP endpoints by keyword, inspect price and schema, then settle per call in USDC with `circle services pay`. No API keys, accounts, or prefunded billing required.

### agent-wallet-policy
Set spending limits and controls for an agent wallet via the Circle CLI. The narrower spending-policy flow within the broader CLI capability set.

### swap-tokens
Swap tokens with Circle's App Kit (`@circle-fin/app-kit`) or the lighter standalone Swap Kit (`@circle-fin/swap-kit`). Both are server-side SDKs that require a kit key; App Kit also bundles bridge and send in one package.

### unify-balance
Manage a unified USDC balance across chains with Circle's Unified Balance Kit. Exposes simple `deposit()`, `spend()`, and `getBalances()` calls while handling all crosschain orchestration internally.
