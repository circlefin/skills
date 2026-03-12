# Gateway Contract Addresses Configuration

```typescript
import { Chain, defineChain, type Address } from "viem";
import {
  arbitrum,
  arcTestnet,
  avalanche,
  avalancheFuji,
  base,
  baseSepolia,
  hyperliquid,
  hyperliquidEvmTestnet,
  mainnet,
  optimism,
  polygon,
  sei,
  seiTestnet,
  sepolia,
  sonic,
  unichain,
  worldchain,
  worldchainSepolia
} from "viem/chains";

export type NetworkConfig = {
  RPC: string;
  GatewayWallet: string;
  GatewayMinter: string;
  USDCAddress: string;
  ViemChain: Chain;
};

export type ChainConfig = {
  domain: number;
  mainnet?: NetworkConfig;
  testnet?: NetworkConfig;
};

// Endpoints: /transfer (POST) — submit burn intents, /balances (POST) — query unified balances
export const GATEWAY_CONFIG = {
  TESTNET_URL: "https://gateway-api-testnet.circle.com/v1",
  MAINNET_URL: "https://gateway-api.circle.com/v1",
}

const sonicTestnet = defineChain({
  id: 14601,
  name: "Sonic Testnet",
  nativeCurrency: { name: "Sonic", symbol: "S", decimals: 18 },
  rpcUrls: {
    default: {
      http: ["https://rpc.testnet.soniclabs.com"],
    },
  },
  blockExplorers: {
    default: {
      name: "Sonic Testnet Explorer",
      url: "https://testnet.soniclabs.com/",
    },
  },
  testnet: true,
})

export const ethereumContracts: ChainConfig = {
  domain: 0,
  mainnet: {
    RPC: "https://ethereum-rpc.publicnode.com",
    GatewayWallet: "0x77777777Dcc4d5A8B6E418Fd04D8997ef11000eE",
    GatewayMinter: "0x2222222d7164433c4C09B0b0D809a9b52C04C205",
    USDCAddress: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
    ViemChain: mainnet,
  },
  testnet: {
    RPC: "https://ethereum-sepolia-rpc.publicnode.com",
    GatewayWallet: "0x0077777d7EBA4688BDeF3E311b846F25870A19B9",
    GatewayMinter: "0x0022222ABE238Cc2C7Bb1f21003F0a260052475B",
    USDCAddress: "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238",
    ViemChain: sepolia,
  }
};

export const avalancheContracts: ChainConfig = {
  domain: 1,
  mainnet: {
    RPC: "https://avalanche-c-chain-rpc.publicnode.com",
    GatewayWallet: "0x77777777Dcc4d5A8B6E418Fd04D8997ef11000eE",
    GatewayMinter: "0x2222222d7164433c4C09B0b0D809a9b52C04C205",
    USDCAddress: "0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E",
    ViemChain: avalanche,
  },
  testnet: {
    RPC: "https://avalanche-fuji-c-chain-rpc.publicnode.com",
    GatewayWallet: "0x0077777d7EBA4688BDeF3E311b846F25870A19B9",
    GatewayMinter: "0x0022222ABE238Cc2C7Bb1f21003F0a260052475B",
    USDCAddress: "0x5425890298aed601595a70AB815c96711a31Bc65",
    ViemChain: avalancheFuji,
  }
};

export const optimismContracts: ChainConfig = {
  domain: 2,
  mainnet: {
    RPC: "https://optimism-rpc.publicnode.com",
    GatewayWallet: "0x77777777Dcc4d5A8B6E418Fd04D8997ef11000eE",
    GatewayMinter: "0x2222222d7164433c4C09B0b0D809a9b52C04C205",
    USDCAddress: "0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85",
    ViemChain: optimism,
  }
};

export const arbitrumContracts: ChainConfig = {
  domain: 3,
  mainnet: {
    RPC: "https://arbitrum-one-rpc.publicnode.com",
    GatewayWallet: "0x77777777Dcc4d5A8B6E418Fd04D8997ef11000eE",
    GatewayMinter: "0x2222222d7164433c4C09B0b0D809a9b52C04C205",
    USDCAddress: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
    ViemChain: arbitrum,
  }
};

export const baseContracts: ChainConfig = {
  domain: 6,
  mainnet: {
    RPC: "https://base-rpc.publicnode.com",
    GatewayWallet: "0x77777777Dcc4d5A8B6E418Fd04D8997ef11000eE",
    GatewayMinter: "0x2222222d7164433c4C09B0b0D809a9b52C04C205",
    USDCAddress: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    ViemChain: base,

  },
  testnet: {
    RPC: "https://base-sepolia-rpc.publicnode.com",
    GatewayWallet: "0x0077777d7EBA4688BDeF3E311b846F25870A19B9",
    GatewayMinter: "0x0022222ABE238Cc2C7Bb1f21003F0a260052475B",
    USDCAddress: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
    ViemChain: baseSepolia,
  }
};

export const polygonContracts: ChainConfig = {
  domain: 7,
  mainnet: {
    RPC: "https://polygon-rpc.com",
    GatewayWallet: "0x77777777Dcc4d5A8B6E418Fd04D8997ef11000eE",
    GatewayMinter: "0x2222222d7164433c4C09B0b0D809a9b52C04C205",
    USDCAddress: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359",
    ViemChain: polygon,
  }
};

export const unichainContracts: ChainConfig = {
  domain: 10,
  mainnet: {
    RPC: "https://mainnet.unichain.org",
    GatewayWallet: "0x77777777Dcc4d5A8B6E418Fd04D8997ef11000eE",
    GatewayMinter: "0x2222222d7164433c4C09B0b0D809a9b52C04C205",
    USDCAddress: "0x078D782b760474a361dDA0AF3839290b0EF57AD6",
    ViemChain: unichain,
  }
};

export const sonicContracts: ChainConfig = {
  domain: 13,
  mainnet: {
    RPC: "https://rpc.soniclabs.com",
    GatewayWallet: "0x77777777Dcc4d5A8B6E418Fd04D8997ef11000eE",
    GatewayMinter: "0x2222222d7164433c4C09B0b0D809a9b52C04C205",
    USDCAddress: "0x29219dd400f2Bf60E5a23d13Be72B486D4038894",
    ViemChain: sonic,
  },
  testnet: {
    RPC: "https://rpc.testnet.soniclabs.com",
    GatewayWallet: "0x0077777d7EBA4688BDeF3E311b846F25870A19B9",
    GatewayMinter: "0x0022222ABE238Cc2C7Bb1f21003F0a260052475B",
    USDCAddress: "0x0BA304580ee7c9a980CF72e55f5Ed2E9fd30Bc51",
    ViemChain: sonicTestnet,
  }
};

export const worldChainContracts: ChainConfig = {
  domain: 14,
  mainnet: {
    RPC: "https://worldchain-mainnet.g.alchemy.com/public",
    GatewayWallet: "0x77777777Dcc4d5A8B6E418Fd04D8997ef11000eE",
    GatewayMinter: "0x2222222d7164433c4C09B0b0D809a9b52C04C205",
    USDCAddress: "0x79A02482A880bCe3F13E09da970dC34dB4cD24D1",
    ViemChain: worldchain,
  },
  testnet: {
    RPC: "https://worldchain-sepolia.g.alchemy.com/public",
    GatewayWallet: "0x0077777d7EBA4688BDeF3E311b846F25870A19B9",
    GatewayMinter: "0x0022222ABE238Cc2C7Bb1f21003F0a260052475B",
    USDCAddress: "0x66145f38cBAC35Ca6F1Dfb4914dF98F1614aeA88",
    ViemChain: worldchainSepolia,
  }
};

export const seiContracts: ChainConfig = {
  domain: 16,
  mainnet: {
    RPC: "https://evm-rpc.sei-apis.com",
    GatewayWallet: "0x77777777Dcc4d5A8B6E418Fd04D8997ef11000eE",
    GatewayMinter: "0x2222222d7164433c4C09B0b0D809a9b52C04C205",
    USDCAddress: "0xe15fC38F6D8c56aF07bbCBe3BAf5708A2Bf42392",
    ViemChain: sei,
  },
  testnet: {
    RPC: "https://evm-rpc-testnet.sei-apis.com",
    GatewayWallet: "0x0077777d7EBA4688BDeF3E311b846F25870A19B9",
    GatewayMinter: "0x0022222ABE238Cc2C7Bb1f21003F0a260052475B",
    USDCAddress: "0x4fCF1784B31630811181f670Aea7A7bEF803eaED",
    ViemChain: seiTestnet,
  }
};

export const hyperliquidEvmContracts: ChainConfig = {
  domain: 19,
  mainnet: {
    RPC: "https://rpc.hyperliquid.xyz/evm",
    GatewayWallet: "0x77777777Dcc4d5A8B6E418Fd04D8997ef11000eE",
    GatewayMinter: "0x2222222d7164433c4C09B0b0D809a9b52C04C205",
    USDCAddress: "0xb88339CB7199b77E23DB6E890353E22632Ba630f",
    ViemChain: hyperliquid,
  },
  testnet: {
    RPC: "https://rpc.hyperliquid-testnet.xyz/evm",
    GatewayWallet: "0x0077777d7EBA4688BDeF3E311b846F25870A19B9",
    GatewayMinter: "0x0022222ABE238Cc2C7Bb1f21003F0a260052475B",
    USDCAddress: "0x2B3370eE501B4a559b57D449569354196457D8Ab",
    ViemChain: hyperliquidEvmTestnet,
  }
};

export const arcContracts: ChainConfig = {
  domain: 26,
  testnet: {
    RPC: "https://rpc.testnet.arc.network",
    GatewayWallet: "0x0077777d7EBA4688BDeF3E311b846F25870A19B9",
    GatewayMinter: "0x0022222ABE238Cc2C7Bb1f21003F0a260052475B",
    USDCAddress: "0x3600000000000000000000000000000000000000",
    ViemChain: arcTestnet,
  }
};

export type SolanaNetworkConfig = {
  RPC: string;
  GatewayWallet: string;
  GatewayMinter: string;
  USDCAddress: string;
};

export type SolanaChainConfig = {
  domain: number;
  mainnet?: SolanaNetworkConfig;
  devnet?: SolanaNetworkConfig;
};

export const solanaContracts: SolanaChainConfig = {
  domain: 5,
  mainnet: {
    RPC: "https://api.mainnet-beta.solana.com",
    GatewayWallet: "GATEwy4YxeiEbRJLwB6dXgg7q61e6zBPrMzYj5h1pRXQ",
    GatewayMinter: "GATEm5SoBJiSw1v2Pz1iPBgUYkXzCUJ27XSXhDfSyzVZ",
    USDCAddress: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
  },
  devnet: {
    RPC: "https://api.devnet.solana.com",
    GatewayWallet: "GATEwdfmYNELfp5wDmmR6noSr2vHnAfBPMm2PvCzX5vu",
    GatewayMinter: "GATEmKK2ECL1brEngQZWCgMWPbvrEYqsV6u29dAaHavr",
    USDCAddress: "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU",
  }
};


export const SOLANA_CONFIG = {
  rpcEndpoint: "https://api.devnet.solana.com",
  domain: 5,
  zeroAddress: "11111111111111111111111111111111",
  gatewayWalletAddress: "GATEwdfmYNELfp5wDmmR6noSr2vHnAfBPMm2PvCzX5vu",
  gatewayMinterAddress: "GATEmKK2ECL1brEngQZWCgMWPbvrEYqsV6u29dAaHavr",
  usdcAddress: "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU",
} as const;

// Legacy exports for backward compatibility
export const RPC_ENDPOINT = SOLANA_CONFIG.rpcEndpoint;
export const SOLANA_DOMAIN = SOLANA_CONFIG.domain;
export const SOLANA_ZERO_ADDRESS = SOLANA_CONFIG.zeroAddress;
export const SOLANA_GATEWAY_WALLET_ADDRESS = SOLANA_CONFIG.gatewayWalletAddress;
export const GATEWAY_WALLET_ADDRESS = SOLANA_CONFIG.gatewayWalletAddress;
export const GATEWAY_MINTER_ADDRESS = SOLANA_CONFIG.gatewayMinterAddress;
export const USDC_ADDRESS = SOLANA_CONFIG.usdcAddress;

export const gatewayWalletIdl = {
  address: SOLANA_CONFIG.gatewayWalletAddress,
  metadata: {
    name: "gatewayWallet",
    version: "0.1.0",
    spec: "0.1.0",
  },
  instructions: [
    {
      name: "deposit",
      discriminator: [22, 0],
      accounts: [
        { name: "payer", writable: true, signer: true },
        { name: "owner", signer: true },
        { name: "gatewayWallet" },
        { name: "ownerTokenAccount", writable: true },
        { name: "custodyTokenAccount", writable: true },
        { name: "deposit", writable: true },
        { name: "depositorDenylist" },
        { name: "tokenProgram" },
        { name: "systemProgram" },
        { name: "eventAuthority" },
        { name: "program" },
      ],
      args: [{ name: "amount", type: "u64" }],
    },
  ],
} as const;


export const gatewayMinterIdl = {
  address: SOLANA_CONFIG.gatewayMinterAddress,
  metadata: { name: "gatewayMinter", version: "0.1.0", spec: "0.1.0" },
  instructions: [
    {
      name: "gatewayMint",
      discriminator: [12, 0],
      accounts: [
        { name: "payer", writable: true, signer: true },
        { name: "destinationCaller", signer: true },
        { name: "gatewayMinter" },
        { name: "systemProgram" },
        { name: "tokenProgram" },
        { name: "eventAuthority" },
        { name: "program" },
      ],
      args: [
        { name: "params", type: { defined: { name: "gatewayMintParams" } } },
      ],
    },
  ],
  types: [
    {
      name: "gatewayMintParams",
      type: {
        kind: "struct",
        fields: [
          { name: "attestation", type: "bytes" },
          { name: "signature", type: "bytes" },
        ],
      },
    },
  ],
} as const;
```
