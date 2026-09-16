# Wallet-type example scenarios

Common scenarios mapped to a wallet-type decision and the skill to implement it.

| Scenario | Decision | Skill |
| --- | --- | --- |
| Payment backend, programmatic payouts, high TPS | Developer-controlled + EOA | `use-developer-controlled-wallets` |
| Consumer app with Google/Apple login, gasless UX | User-controlled + SCA on L2 | `use-user-controlled-wallets` |
| DeFi app with biometric auth, custom modules | Modular Wallet on L2 | `use-modular-wallets` |
| NFT marketplace on Ethereum L1 | User-controlled + EOA | `use-user-controlled-wallets` |
| AI agent, autonomous multi-chain transactions | Developer-controlled + EOA | `use-developer-controlled-wallets` |
