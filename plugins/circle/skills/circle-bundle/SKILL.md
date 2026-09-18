---
name: circle-bundle
description: "Single-install entry point for the full Circle skills surface. Routes to the right Circle skill for USDC payments, Arc, CCTP bridges, Gateway, wallets, swaps, smart contracts, and agent-wallet flows. Use when the user wants Circle coverage without knowing which skill to load, or when installing Circle skills for Claude Desktop in one step. Triggers: Circle skills, install all Circle skills, which Circle skill, Circle Desktop, circle-bundle, Circle routing."
requirements:
  runtimes: []
  connectors: []
---

## Overview

`circle-bundle` is a lean router over the existing Circle skills. Read this file first, pick the matching skill from the table, then load only that skill's `SKILL.md` (or the linked file under `references/`) so context stays small.

This skill does not replace the specialized skills. It decides which one to open.

## Install

### Claude Code / Cursor marketplace

```
/plugin marketplace add circlefin/skills
/plugin install circle-skills@circle
```

### Vercel Skills CLI

```bash
npx skills add circlefin/skills
```

### Claude Desktop

Copy or link the whole `plugins/circle/skills/` tree into the local skills directory so `circle-bundle` and every sibling skill stay side by side. Installing only this folder without siblings leaves the references unresolved.

## Decision guide

Answer in order. Stop at the first match.

1. **Paying for or monetizing an HTTP agent call with USDC** → `accept-agent-payments` or `pay-via-agent-wallet`
2. **Circle CLI / agent wallet bootstrap, funding, limits, Eco recovery** → `use-circle-cli`, then the matching agent-wallet skill
3. **Cross-chain USDC move** → Gateway/`unify-balance` for instant unified balance; `bridge-stablecoin` for CCTP settlement
4. **Building on Arc** → `use-arc`
5. **Same-chain or cross-chain token swap** → `swap-tokens`
6. **USDC balance, transfer, approve, verify** → `use-usdc`
7. **Which Circle wallet type** → `use-circle-wallets`, then the matching wallet skill
8. **Deploy or call contracts via Circle SCP** → `use-smart-contract-platform`

## Skill catalog

| Need | Skill | Reference |
| --- | --- | --- |
| USDC transfers and approvals | `use-usdc` | `references/use-usdc.md` |
| Arc chain setup and gas-in-USDC | `use-arc` | `references/use-arc.md` |
| CCTP bridge flows | `bridge-stablecoin` | `references/bridge-stablecoin.md` |
| Gateway unified USDC | `use-gateway` | `references/use-gateway.md` |
| Unified Balance Kit | `unify-balance` | `references/unify-balance.md` |
| Token swaps | `swap-tokens` | `references/swap-tokens.md` |
| Wallet type choice | `use-circle-wallets` | `references/use-circle-wallets.md` |
| Developer-controlled wallets | `use-developer-controlled-wallets` | `references/use-developer-controlled-wallets.md` |
| User-controlled wallets | `use-user-controlled-wallets` | `references/use-user-controlled-wallets.md` |
| Modular / passkey wallets | `use-modular-wallets` | `references/use-modular-wallets.md` |
| Smart Contract Platform | `use-smart-contract-platform` | `references/use-smart-contract-platform.md` |
| Circle CLI front door | `use-circle-cli` | `references/use-circle-cli.md` |
| Agent wallet setup | `use-agent-wallet` | `references/use-agent-wallet.md` |
| Pay via agent wallet | `pay-via-agent-wallet` | `references/pay-via-agent-wallet.md` |
| Fund agent wallet | `fund-agent-wallet` | `references/fund-agent-wallet.md` |
| Recover Eco deposit funds | `recover-eco-funds` | `references/recover-eco-funds.md` |
| Agent wallet spending policy | `agent-wallet-policy` | `references/agent-wallet-policy.md` |
| Accept agent payments | `accept-agent-payments` | `references/accept-agent-payments.md` |

## How to load a skill

1. Choose the skill from the table.
2. Open `../<skill-name>/SKILL.md` next to this bundle, or the matching file under `references/` when that path is what the host resolved.
3. Follow that skill's prerequisites before writing code.
4. For SDK signatures, chain IDs, and contract addresses that change often, use Circle MCP alongside the skill: https://developers.circle.com/ai/mcp
