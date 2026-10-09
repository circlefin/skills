# Recover USDC from a backing EOA to its linked SCA

Use this reference when USDC sits at the `eoaOwnerAddress` (backing EOA) of a Circle Agent Wallet smart contract account (SCA). Two cases lead here:

- A legacy Eco deposit refunded USDC to the backing EOA. Current Gateway v2/Circle CLI deposits set the refund recipient to the SCA and do not need this sweep.
- Someone sent USDC directly to the backing EOA address, for example after seeing it as the SCA's owner on a block explorer.

It needs only Node.js 20.18.2+ and the public `@circle-fin/cli` (1.1.4 or newer). No Circle CLI source checkout is required.

## Why a normal transfer does not work

The backing EOA is exposed as `eoaOwnerAddress` on the Circle wallet detail object, but it is not returned as a separate wallet by normal wallet-list results. As a result, `circle wallet balance` and `circle wallet transfer` report "Wallet not found" for that address.

Funding the backing EOA with native gas is unnecessary. Native USDC supports ERC-3009: the backing EOA signs a one-time `transferWithAuthorization`, and the linked SCA submits it with `circle wallet execute` and pays gas. The authorization can only move USDC from the backing EOA to the linked SCA, can be used once, and expires after one hour.

## Requirements

- Node.js 20.18.2 or newer.
- Circle CLI 1.1.4 or newer: `npm install -g @circle-fin/cli@latest`.
- An active login to the account that owns the SCA: `circle wallet login <email>` (add `--testnet` for testnet chains).

`scripts/sign-eoa-authorization.mjs` reads the session the Circle CLI saved locally and never prints or saves session secrets. It loads `viem` from a local install or from the copy bundled with `@circle-fin/cli`.

## Collect the inputs

| Flag | Source |
|---|---|
| `--chain` | Circle chain code, for example `ARC`, `BASE`, `BASE-SEPOLIA` |
| `--sca` | The linked SCA: `circle wallet list --chain <CHAIN> --type agent --output json` |
| `--eoa` | The backing EOA holding the USDC |
| `--usdc` | `circle contract address usdc --chain <CHAIN>` |
| `--amount-atomic` | USDC amount × 1,000,000 (USDC has 6 decimals) |

Confirm the backing EOA's USDC balance first:

```bash
circle contract query "balanceOf(address)" <EOA> --contract <USDC> --chain <CHAIN>
```

## Sign the authorization

Signing authorizes movement. Show the chain, USDC contract, from (backing EOA), to (SCA), and raw and decimal amount, and get explicit user approval before running:

```bash
node <SKILL_DIR>/scripts/sign-eoa-authorization.mjs \
  --chain <CHAIN> \
  --sca <SCA> \
  --eoa <EOA> \
  --usdc <USDC> \
  --amount-atomic <RAW_USDC_AMOUNT>
```

The script:

1. Requires `--sca` to be one of the logged-in account's Agent Wallets on `--chain`.
2. Fetches that wallet by ID and requires its `eoaOwnerAddress` to equal `--eoa`. A mismatch stops the flow.
3. Reads USDC `name()` and `version()` for the EIP-712 domain, because the name differs across deployments (`USD Coin` versus `USDC`).
4. Builds `TransferWithAuthorization` with `from=<EOA>`, `to=<SCA>`, the exact raw amount, `validAfter=0`, `validBefore=now+1h`, and a fresh random 32-byte nonce.
5. Requests typed-data signing with `walletAddress=<EOA>`. Signing with the SCA wallet ID is incorrect: it can return an EIP-1271 replay-safe SCA wrapper instead of the raw EOA signature that USDC expects.
6. Recovers the signer locally and refuses unless it equals the backing EOA.
7. Prints four numbered commands with every value filled in. Nothing is submitted.

The script talks only to Circle production (`https://agentic-wallet.circle.com`). If `CIRCLE_PROXY_URL` is set, it refuses to run. Unset the variable, run `circle wallet login` again, and run the printed commands without it too.

The printed submit command contains the raw signature (`v`, `r`, `s`). Do not copy it into the evidence directory or chat logs; record a hash of the signature instead.

## Run the printed commands within one hour

1. **Check the authorization is unused:** `authorizationState(<EOA>, <nonce>)` should end in `0`.
2. **Estimate the network fee** with `circle wallet execute ... --estimate`. Show the estimate and get explicit approval for the transfer and fee before submitting.
3. **Submit once** with the printed `--idempotency-key`. Expect `"state": "COMPLETE"` (or `CONFIRMED`) and a `txHash`.
4. **Verify all three signals:**
   - backing EOA USDC decreased by the exact amount;
   - SCA USDC increased by the exact amount;
   - `authorizationState(<EOA>, <nonce>)` now ends in `1`.

Record the Circle transaction ID, idempotency key, onchain transaction hash, network fee, and the USDC `Transfer` log.

## Troubleshooting

| Output | Meaning | Action |
|---|---|---|
| `No active Circle login` | Not logged in for this chain's environment, or the session expired | `circle wallet login <email>` (with `--testnet` for testnets), then sign again |
| `... is not one of your Agent Wallets` | `--sca`, `--chain`, or the logged-in account does not match | Re-check `--sca` with `circle wallet list --chain <CHAIN> --type agent` |
| `The backing EOA of ... is X, not Y` | The funds are not at this SCA's backing EOA | Stop and escalate to Circle Support |
| `Signature is from ..., not ...` or a `sign/typedData` error | Circle did not return the backing EOA's signature | Do not submit; escalate with the output |
| `authorization is expired` | More than one hour passed since signing | Sign again to get a fresh authorization |
| Submit times out or the result is unclear | Outcome unknown | Run the verify commands first. If the authorization state ends in `1`, recovery is complete. Otherwise re-run the same submit command with the same idempotency key; the authorization can execute only once |

## Replay safety

Do not sign a new authorization just because a client timed out. Query authorization state, balances, and transaction history first; a consumed nonce proves the original authorization executed. If a signed authorization was never submitted, let it expire before signing another for the same amount.

## Verified behavior

Circle verified this flow end to end with the public Circle CLI: the backing EOA decreased by the exact amount, the linked SCA increased by the same amount, and the ERC-3009 nonce became consumed. The backing EOA held no native gas; the SCA relayed the call.

## Sources

- EIP-3009: https://eips.ethereum.org/EIPS/eip-3009
- Circle USDC contracts: https://developers.circle.com/stablecoins/usdc-contract-addresses
