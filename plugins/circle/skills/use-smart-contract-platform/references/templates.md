# Contracts Templates

Smart contract templates are audited contracts that you can deploy using the
Contracts API. Each template uses a standard token format and has built-in
access control. You can deploy contracts in minutes without writing Solidity
code.

## Available templates

The table below lists all templates. Select a template to view its settings and
functions.

| Template                                       | Standard | Template ID                            | Use cases                                               |
| ---------------------------------------------- | -------- | -------------------------------------- | ------------------------------------------------------- |
| [Token](/contracts/erc-20-token)               | ERC-20   | `a1b74add-23e0-4712-88d1-6b3009e85a86` | Fungible tokens, loyalty points, governance tokens      |
| [NFT](/contracts/erc-721-nft)                  | ERC-721  | `76b83278-50e2-4006-8b63-5b1a2a814533` | Digital collectibles, gaming assets, tokenized assets   |
| [Multi-Token](/contracts/erc-1155-multi-token) | ERC-1155 | `aea21da6-0aa2-4971-9a1a-5098842b1248` | Mixed fungible and non-fungible tokens, batch transfers |
| [Airdrop](/contracts/airdrop)                  | N/A      | `13e322f2-18dc-4f57-8eed-4bddfc50f85e` | Bulk token distribution to multiple recipients          |

## Benefits of templates

Using templates instead of custom contracts has several benefits:

* **Security**: Third-party firms audit each template. This lowers the risk of
  common exploits.

* **Lower gas costs**: Templates use patterns that reduce transaction fees for
  you and your users.

* **Standard compliance**: Templates follow ERC standards. This ensures they
  work with wallets, marketplaces, and other blockchain tools.

* **Faster deployment**: Deploy contracts in minutes.

## Deploy a template

To deploy a template, send a `POST` request to the
[`/templates/{id}/deploy`](/api-reference/contracts/smart-contract-platform/deploy-contract-template)
endpoint with the template ID and your settings. For a full guide, see
[Deploy a smart contract](/contracts/scp-deploy-smart-contract).
