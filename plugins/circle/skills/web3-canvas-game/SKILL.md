---
name: web3-canvas-game
description: Build a browser-based canvas game with on-chain mechanics using Arc Testnet (USDC as gas) or any EVM chain. Covers wallet connection, on-chain leaderboard, move-gated gameplay via smart contract, and multi-chain switching. Use when building GameFi apps, on-chain games, or any project that combines HTML5 Canvas gameplay with blockchain state.
---

# Web3 Canvas Game on Arc

Build a fully on-chain browser game where gameplay is gated by blockchain moves, scores are saved to a leaderboard smart contract, and players pay USDC (Arc) or ETH (other EVM chains) to spin for extra moves.

Reference implementation: [Snake Robinhood](https://github.com/OliverDevDS/snakeweb3) — a Snake game deployed on Arc Testnet and Robinhood Chain.

---

## Overview

The pattern combines three layers:

- **Game layer** — HTML5 Canvas, vanilla JS, keyboard/touch/D-pad controls
- **Web3 layer** — ethers.js v6, MetaMask, multi-chain switching via `wallet_addEthereumChain`
- **Contract layer** — Solidity contract with nickname registry, move counter, roulette spin, score submission, and leaderboard

---

## When to Use

- Building a GameFi app on Arc or any EVM chain
- Adding on-chain leaderboards to an existing browser game
- Implementing move-gated or credit-gated gameplay via smart contract
- Multi-chain game that switches between networks (e.g. Arc USDC + ETH mainnet)
- Any project where users pay to play and scores are saved on-chain

---

## Architecture

```
index.html       — layout, chain selector, wallet auth, D-pad UI
style.css        — retro terminal aesthetic, responsive layout
web3.js          — wallet connect, chain switching, contract calls
game.js          — canvas game loop, audio engine, particle FX
Contract.sol     — Solidity: nicknames, moves, spinRoulette, submitScore, leaderboard
```

---

## Smart Contract Pattern

The contract enforces game rules on-chain. Key functions:

```solidity
// Player registers a nickname (stored on-chain, shown on leaderboard)
function registerNickname(string memory _name) public

// Player pays to receive random moves (game credits)
function spinRoulette() public payable

// Game over — frontend submits final score
function submitScore(uint256 score) public

// Read moves available for a player
function moves(address) public view returns (uint256)

// Read leaderboard entry by index
function leaderboard(uint256) public view returns (address player, string nickname, uint256 score)

// Total leaderboard entries
function getLeaderboardLength() public view returns (uint256)
```

**Critical rules:**
- `spinRoulette` must require `msg.value >= spinCost` — validate on-chain, never trust frontend
- `submitScore` must check `moves[msg.sender] > 0` before accepting a score
- Decrement moves on each game tick via frontend (`window.steps--`), not on-chain — saves gas
- Store only the final score on-chain via `submitScore`

---

## Multi-Chain Configuration

Define all chains in a single config object. Never hardcode chain details inline:

```javascript
const CHAINS = {
    arc: {
        id: "arc",
        chainId: "0x4cef52",        // 5042002 decimal
        chainIdDec: 5042002,
        chainName: "Arc Network Testnet",
        nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
        rpcUrls: ["https://rpc.testnet.arc.network"],
        blockExplorerUrls: ["https://testnet.arcscan.app"],
        spinCost: "0.0001",
        color: "#00c8ff",
        icon: "🌐"
    },
    robinhood: {
        id: "robinhood",
        chainId: "0xB626",          // 46630 decimal
        chainIdDec: 46630,
        chainName: "Robinhood Chain Testnet",
        nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 },
        rpcUrls: ["https://rpc.testnet.chain.robinhood.com"],
        blockExplorerUrls: ["https://explorer.testnet.chain.robinhood.com"],
        spinCost: "0.00001",
        color: "#00ff44",
        icon: "🏹"
    }
};
```

Switch chains using `wallet_addEthereumChain` + `wallet_switchEthereumChain` in sequence — always add before switching so the chain exists in MetaMask:

```javascript
async function ensureChain(chainConfig) {
    await window.ethereum.request({
        method: "wallet_addEthereumChain",
        params: [{ chainId: chainConfig.chainId, ... }]
    });
    await window.ethereum.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: chainConfig.chainId }]
    });
}
```

---

## ethers.js v6 Setup

Load ethers from CDN with fallback chain:

```html
<script>
  var ETHERS_CDNS = [
    "https://cdnjs.cloudflare.com/ajax/libs/ethers/6.13.2/index.umd.min.js",
    "https://cdn.jsdelivr.net/npm/ethers@6.13.2/dist/ethers.umd.min.js",
    "https://unpkg.com/ethers@6.13.2/dist/ethers.umd.min.js"
  ];
  var _idx = 0;
  function tryNextCDN() {
    if (_idx >= ETHERS_CDNS.length) return;
    var s = document.createElement('script');
    s.src = ETHERS_CDNS[_idx++];
    s.onerror = tryNextCDN;
    document.head.appendChild(s);
  }
  tryNextCDN();
</script>
```

Use `ethers.BrowserProvider` (v6) for signer and `ethers.JsonRpcProvider` for read-only calls:

```javascript
// Write (requires signer)
const provider = new ethers.BrowserProvider(window.ethereum);
const signer = await provider.getSigner();
const contract = new ethers.Contract(address, ABI, signer);

// Read-only (no wallet needed)
const readProvider = new ethers.JsonRpcProvider(rpcUrl);
const readContract = new ethers.Contract(address, ABI, readProvider);
```

---

## Game Loop Pattern

The game loop runs on `setInterval`. Moves are decremented each tick — when `window.steps` reaches 0, the game ends and the score is submitted on-chain:

```javascript
window.steps = 0; // set by contract after spin

async function update() {
    if (window.steps <= 0 || gameOver) { draw(); return; }

    // Move snake, check collisions...
    window.steps--;
    document.getElementById("steps").innerText = window.steps;

    if (window.steps <= 0) {
        handleGameOver("🎰 Out of moves!");
        return;
    }
    draw();
}

window.startGameLoop = function() {
    gameStarted = true;
    if (gameInterval) { clearInterval(gameInterval); gameInterval = null; }
    gameInterval = setInterval(update, 140); // ~7fps for snake feel
};
```

**Auto-start on first input** — if wallet is already connected and steps > 0, start the loop on first keypress or D-pad tap, not just after `connectWallet`:

```javascript
window.moveSnake = function(dir) {
    if (!gameStarted && window.steps > 0) window.startGameLoop();
    if (!gameStarted || gameOver) return;
    // set dx/dy...
};
```

---

## Audio Engine

Use Web Audio API for retro 8-bit sound effects. Always check `ctx.state === "suspended"` and call `ctx.resume()` — browsers block audio until user interaction:

```javascript
let audioMuted = false;

function playTone(freq, type, duration, volume, startTime) {
    if (audioMuted) return;
    try {
        const ctx = getAudio();
        if (ctx.state === "suspended") ctx.resume();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = type || "square";
        osc.frequency.setValueAtTime(freq, startTime || ctx.currentTime);
        gain.gain.setValueAtTime(volume || 0.15, startTime || ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, (startTime || ctx.currentTime) + duration);
        osc.start(startTime || ctx.currentTime);
        osc.stop((startTime || ctx.currentTime) + duration);
    } catch (e) {}
}
```

**Do NOT redeclare `playTone` with `function` to wrap it** — JavaScript hoisting will cause both declarations to exist at parse time and break the reference. Use a flag (`audioMuted`) inside the single function instead.

---

## Common Mistakes

| Mistake | Fix |
|---|---|
| Redeclaring `function playTone()` to add mute logic | Use `audioMuted` flag inside the original function |
| `gameInterval` never cleared on restart | Always `clearInterval` before `setInterval` on restart |
| Game doesn't start after wallet reconnect | Check `!gameStarted && steps > 0` on every input handler |
| Leaderboard read fails silently | Use `ethers.JsonRpcProvider` (read-only), not BrowserProvider |
| `wallet_switchEthereumChain` fails on unknown chain | Always call `wallet_addEthereumChain` first |
| Score submitted with 0 moves remaining | Check `moves[msg.sender] > 0` in `submitScore` on-chain |
| Zone.Identifier files committed to Git (WSL) | Add `*:Zone.Identifier` to `.gitignore` |

---

## Arc Testnet Details

- **Chain ID:** 5042002 (`0x4cef52`)
- **Native token:** USDC (6 decimals on mainnet, 18 on testnet — verify before deploy)
- **RPC:** `https://rpc.testnet.arc.network`
- **Explorer:** `https://testnet.arcscan.app`
- **Faucet:** `https://faucet.circle.com`
- **Bridge:** CCTP from Ethereum Sepolia → Arc via `use-arc` skill

For accurate chain ID, contract addresses, and SDK signatures, use [Circle MCP](https://developers.circle.com/ai/mcp) alongside this skill.

---

## Deployment Checklist

- [ ] Contract deployed and verified on Arc testnet explorer
- [ ] `CONTRACT_ADDRESSES` updated in `web3.js`
- [ ] `spinCost` matches deployed contract value exactly
- [ ] `.gitignore` includes `*:Zone.Identifier`
- [ ] ethers CDN fallback list tested
- [ ] Audio tested after user interaction (not on page load)
- [ ] Mobile D-pad tested on iOS and Android
- [ ] Leaderboard read works without wallet connected (read-only provider)

---

## Resources

- [Arc Docs](https://docs.arc.network)
- [Circle Developer Docs](https://developers.circle.com)
- [Arc Testnet Faucet](https://faucet.circle.com)
- [ethers.js v6 Docs](https://docs.ethers.org/v6/)
- [Reference Implementation](https://github.com/OliverDevDS/snakeweb3)
