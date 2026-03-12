---
name: use-circle-wallets
description: "Choose and implement the right Circle wallet type for your application. Compares developer-controlled, user-controlled, and modular (passkey) wallets across custody model, key management, account types, blockchain support, and use cases. Use whenever blockchain wallet integrations are required for onchain application development. Triggers on: circle wallets, blockchain wallets, choose wallet, wallet comparison, which wallet, wallet types, EOA vs SCA vs MSCA, custody model, embedded wallet, smart account, programmable wallets, create wallet, onchain wallet."
---

## Overview

Circle offers three wallet types -- developer-controlled, user-controlled, and modular -- each with different custody models, account types, key management, and capabilities. This skill helps you pick the right one.

## Quick Comparison

| | Developer-Controlled | User-Controlled | Modular (Passkey) |
|-|---------------------|-----------------|-------------------|
| **Custody** | Developer | User | User |
| **Auth** | Entity secret (backend) | Social login / email OTP / PIN | Passkey (WebAuthn) |
| **Account types** | EOA, SCA | EOA, SCA | MSCA only |
| **Gas sponsorship** | SCA via Gas Station | SCA via Gas Station | Gas Station or third-party paymaster |
| **Custom modules** | No | No | Yes |
| **Architecture** | Backend SDK only | Backend + frontend SDKs | Frontend SDK only |

## Decision Guide

For the latest supported blockchains: https://developers.circle.com/wallets/account-types

**Step 1 -- Who controls the keys?**
- Developer controls (no user approval) -> Developer-controlled wallets -> Step 3
- End user controls -> Step 2

**Step 2 -- Auth method?**
- Passkey (WebAuthn biometric) with extensible modules -> Modular wallets -> Step 4
- Social login, email OTP, or PIN -> User-controlled wallets -> Step 3

**Step 3 -- Account type?**
- Solana, Aptos, or NEAR -> EOA (only option)
- Ethereum mainnet -> EOA (SCA gas costs prohibitive, MSCA not supported)
- L2 (Arbitrum, Base, Polygon, Optimism, etc.) -> SCA if gas sponsorship or batching needed; EOA if max TPS needed

**Step 4 -- Chain check (Modular wallets)**
- Supported: Arbitrum, Avalanche, Base, Monad, Optimism, Polygon, Unichain
- NOT supported: Ethereum, Solana, Aptos, NEAR. Fall back to user-controlled wallets with SCA.

### Example Scenarios

| Scenario | Decision | Skill |
|----------|----------|-------|
| Payment backend, programmatic payouts, high TPS | Developer-controlled + EOA | `use-developer-controlled-wallets` |
| Consumer app with Google/Apple login, gasless UX | User-controlled + SCA on L2 | `use-user-controlled-wallets` |
| DeFi app with biometric auth, custom modules | Modular on L2 | `use-modular-wallets` |
| NFT marketplace on Ethereum L1 | User-controlled + EOA | `use-user-controlled-wallets` |
| AI agent, autonomous multi-chain transactions | Developer-controlled + EOA | `use-developer-controlled-wallets` |

## Implementation Patterns

Once a wallet type has been determined, TRIGGER the corresponding skill:

- Developer-controlled -> `use-developer-controlled-wallets` skill
- User-controlled -> `use-user-controlled-wallets` skill
- Modular (Passkey) -> `use-modular-wallets` skill 

## Strict Rules

- ALWAYS select the wallet type before starting implementation using the comparison table and decision guide above.
- ALWAYS use EOA on Ethereum mainnet (SCA gas prohibitive, MSCA not supported) and on Solana, Aptos, NEAR (SCA/MSCA not available).
- ALWAYS prefer SCA or MSCA on L2 chains (Arbitrum, Base, Polygon, Optimism, etc.) when gas sponsorship or batch operations are needed.
- NEVER mix wallet types in a single user flow -- pick one and use its corresponding skill.
- ALWAYS delegate to the specific wallet skill (`use-developer-controlled-wallets`, `use-user-controlled-wallets`, or `use-modular-wallets`) for implementation.

## Reference Links

- [Account Types](https://developers.circle.com/wallets/account-types)
- [Choosing Your Wallet Type](https://developers.circle.com/wallets/infrastructure-models)
- [Key Management](https://developers.circle.com/wallets/key-management)
- [Circle Developer Docs](https://developers.circle.com/llms.txt) -- **Always read this first** when looking for relevant documentation from the source website.

---

DISCLAIMER: This skill is provided "as is" without warranties, is subject to the [Circle Developer Terms](https://console.circle.com/legal/developer-terms), and output generated may contain errors and/or include fee configuration options (including fees directed to Circle); additional details are in the repository [README](https://github.com/circlefin/skills/blob/master/README.md).
