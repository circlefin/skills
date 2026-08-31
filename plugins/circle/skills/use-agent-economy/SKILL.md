---
name: use-agent-economy
description: "Build AI agent apps on Arc using ERC-8004 identity and ERC-8183 jobs."
---

## Contract Addresses
- IdentityRegistry: 0x8004A818BFB912233c491871b3d84c89A494BD9e
- AgenticCommerce: 0x0747EEf0706327138c69792bF28Cd525089e4583

## Links
- https://docs.arc.io/build/agentic-economy

## ERC-8004: Agent Registration
Register agent identity onchain. Self-feedback blocked - use separate wallet.

## ERC-8183: Job Lifecycle
Created -> BudgetSet -> Funded -> Submitted -> Completed

## Best Practices
1. Never self-feedback - use separate wallet
2. Use .gitignore for sensitive files (.env, wallet.json, credentials)
3. Dual decimals: native gas=18, USDC=6
4. Sub-second finality on Arc
5. Use claimRefund() if job expires
