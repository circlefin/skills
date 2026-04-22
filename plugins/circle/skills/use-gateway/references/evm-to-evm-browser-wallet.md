# Transfer Unified USDC from EVM to EVM via Browser Wallet

This example burns from Arc Testnet and mints on Base Sepolia. The same pattern applies to any supported EVM source and destination chains after substituting the correct chain config, contract addresses, and domain IDs.

Canonical runnable references:
- Transfer unified USDC balance: https://developers.circle.com/gateway/howtos/transfer-unified-usdc-balance.md
- Unified balance EVM quickstart: https://developers.circle.com/gateway/quickstarts/unified-balance-evm.md

## What this does

This browser script:

1. Discovers an injected EVM wallet provider
2. Requests the user's account
3. Switches the browser wallet to the source chain
4. Builds a Gateway burn intent and signs it as EIP-712 typed data
5. Submits the signed burn intent to the Gateway `/transfer` API
6. Switches the browser wallet to the destination chain
7. Calls `gatewayMint(bytes,bytes)` on the destination EVM chain
8. Waits for the mint transaction receipt

## Runnable example

```ts
import {
  createPublicClient,
  createWalletClient,
  custom,
  formatUnits,
  getContract,
  parseUnits,
  zeroAddress,
} from "viem";
import { arcTestnet, baseSepolia } from "viem/chains";
import type { Chain } from "viem";

type Eip1193Provider = {
  request(args: { method: string; params?: unknown[] | object }): Promise<unknown>;
};

type Eip6963ProviderDetail = {
  info: {
    uuid: string;
    name: string;
    icon: string;
  };
  provider: Eip1193Provider;
};

declare global {
  interface Window {
    ethereum?: Eip1193Provider;
  }
}

const GATEWAY_WALLET_ADDRESS = "0x0077777d7EBA4688BDeF3E311b846F25870A19B9";
const GATEWAY_MINTER_ADDRESS = "0x0022222ABE238Cc2C7Bb1f21003F0a260052475B";
const GATEWAY_API_URL = "https://gateway-api-testnet.circle.com/v1/transfer";

const SOURCE_CHAIN = {
  chain: arcTestnet,
  domain: 26,
  usdc: "0x3600000000000000000000000000000000000000",
};

const DESTINATION_CHAIN = {
  chain: baseSepolia,
  domain: 6,
  usdc: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
};

const TRANSFER_AMOUNT_USDC = "5";
const MAX_FEE = 2_010000n;

const gatewayMinterAbi = [
  {
    type: "function",
    name: "gatewayMint",
    inputs: [
      { name: "attestationPayload", type: "bytes" },
      { name: "signature", type: "bytes" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
] as const;

const typedData = {
  domain: { name: "GatewayWallet", version: "1" },
  types: {
    EIP712Domain: [
      { name: "name", type: "string" },
      { name: "version", type: "string" },
    ],
    TransferSpec: [
      { name: "version", type: "uint32" },
      { name: "sourceDomain", type: "uint32" },
      { name: "destinationDomain", type: "uint32" },
      { name: "sourceContract", type: "bytes32" },
      { name: "destinationContract", type: "bytes32" },
      { name: "sourceToken", type: "bytes32" },
      { name: "destinationToken", type: "bytes32" },
      { name: "sourceDepositor", type: "bytes32" },
      { name: "destinationRecipient", type: "bytes32" },
      { name: "sourceSigner", type: "bytes32" },
      { name: "destinationCaller", type: "bytes32" },
      { name: "value", type: "uint256" },
      { name: "salt", type: "bytes32" },
      { name: "hookData", type: "bytes" },
    ],
    BurnIntent: [
      { name: "maxBlockHeight", type: "uint256" },
      { name: "maxFee", type: "uint256" },
      { name: "spec", type: "TransferSpec" },
    ],
  },
  primaryType: "BurnIntent" as const,
};

async function getInjectedProvider(): Promise<Eip1193Provider> {
  const discovered: Eip6963ProviderDetail[] = [];

  const onAnnounce = (event: Event) => {
    const detail = (event as CustomEvent<Eip6963ProviderDetail>).detail;
    if (detail?.provider) discovered.push(detail);
  };

  window.addEventListener("eip6963:announceProvider", onAnnounce as EventListener);
  window.dispatchEvent(new Event("eip6963:requestProvider"));
  await new Promise((resolve) => setTimeout(resolve, 150));
  window.removeEventListener("eip6963:announceProvider", onAnnounce as EventListener);

  return discovered[0]?.provider ?? window.ethereum ?? (() => {
    throw new Error("No EVM wallet provider found");
  })();
}

async function ensureChain(provider: Eip1193Provider, chain: Chain) {
  const chainIdHex = `0x${chain.id.toString(16)}`;

  try {
    await provider.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: chainIdHex }],
    });
  } catch {
    await provider.request({
      method: "wallet_addEthereumChain",
      params: [
        {
          chainId: chainIdHex,
          chainName: chain.name,
          nativeCurrency: chain.nativeCurrency,
          rpcUrls: chain.rpcUrls.default.http,
          blockExplorerUrls: chain.blockExplorers?.default?.url
            ? [chain.blockExplorers.default.url]
            : [],
        },
      ],
    });
  }
}

function toBytes32(address: `0x${string}`) {
  return `0x${address.toLowerCase().replace(/^0x/, "").padStart(64, "0")}` as const;
}

function randomHex32(): `0x${string}` {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return `0x${Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}

async function main() {
  const provider = await getInjectedProvider();
  const accounts = (await provider.request({
    method: "eth_requestAccounts",
  })) as string[];

  const account = accounts[0] as `0x${string}` | undefined;
  if (!account) throw new Error("No wallet account returned");

  await ensureChain(provider, SOURCE_CHAIN.chain);

  const sourceWalletClient = createWalletClient({
    account,
    chain: SOURCE_CHAIN.chain,
    transport: custom(provider),
  });

  const burnIntent = {
    maxBlockHeight: (2n ** 256n - 1n).toString(),
    maxFee: MAX_FEE,
    spec: {
      version: 1,
      sourceDomain: SOURCE_CHAIN.domain,
      destinationDomain: DESTINATION_CHAIN.domain,
      sourceContract: toBytes32(GATEWAY_WALLET_ADDRESS),
      destinationContract: toBytes32(GATEWAY_MINTER_ADDRESS),
      sourceToken: toBytes32(SOURCE_CHAIN.usdc as `0x${string}`),
      destinationToken: toBytes32(DESTINATION_CHAIN.usdc as `0x${string}`),
      sourceDepositor: toBytes32(account),
      destinationRecipient: toBytes32(account),
      sourceSigner: toBytes32(account),
      destinationCaller: toBytes32(zeroAddress),
      value: parseUnits(TRANSFER_AMOUNT_USDC, 6),
      salt: randomHex32(),
      hookData: "0x",
    },
  };

  const signature = await sourceWalletClient.signTypedData({
    ...typedData,
    message: burnIntent,
  });

  const apiResponse = await fetch(GATEWAY_API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(
      [{ burnIntent, signature }],
      (_key, value) => (typeof value === "bigint" ? value.toString() : value),
    ),
  });

  if (!apiResponse.ok) {
    throw new Error(
      `Gateway API request failed: ${apiResponse.status} ${await apiResponse.text()}`,
    );
  }

  const { attestation, signature: mintSignature } = (await apiResponse.json()) as {
    attestation: `0x${string}`;
    signature: `0x${string}`;
  };

  await ensureChain(provider, DESTINATION_CHAIN.chain);

  const destinationWalletClient = createWalletClient({
    account,
    chain: DESTINATION_CHAIN.chain,
    transport: custom(provider),
  });

  const destinationPublicClient = createPublicClient({
    chain: DESTINATION_CHAIN.chain,
    transport: custom(provider),
  });

  const gatewayMinter = getContract({
    address: GATEWAY_MINTER_ADDRESS,
    abi: gatewayMinterAbi,
    client: destinationWalletClient,
  });

  const mintTx = await gatewayMinter.write.gatewayMint([attestation, mintSignature], {
    account,
  });
  await destinationPublicClient.waitForTransactionReceipt({ hash: mintTx });

  console.log(`Minted ${formatUnits(parseUnits(TRANSFER_AMOUNT_USDC, 6), 6)} USDC`);
  console.log(`Mint transaction hash: ${mintTx}`);
}

main().catch((error) => {
  console.error(error);
});
```

## Optional: Multiple Wallets

If the browser may have more than one injected EVM wallet installed, use EIP-6963 discovery to present a wallet picker instead of silently taking the first provider.

```ts
type Eip1193Provider = {
  request(args: { method: string; params?: unknown[] | object }): Promise<unknown>;
};

type Eip6963ProviderDetail = {
  info: {
    uuid: string;
    name: string;
    icon: string;
  };
  provider: Eip1193Provider;
};

async function discoverEvmProviders(): Promise<Eip6963ProviderDetail[]> {
  const providers: Eip6963ProviderDetail[] = [];

  const onAnnounce = (event: Event) => {
    const detail = (event as CustomEvent<Eip6963ProviderDetail>).detail;
    if (!detail?.provider) return;

    const alreadySeen = providers.some(
      (entry) => entry.info.uuid === detail.info.uuid,
    );
    if (!alreadySeen) providers.push(detail);
  };

  window.addEventListener(
    "eip6963:announceProvider",
    onAnnounce as EventListener,
  );
  window.dispatchEvent(new Event("eip6963:requestProvider"));
  await new Promise((resolve) => setTimeout(resolve, 150));
  window.removeEventListener(
    "eip6963:announceProvider",
    onAnnounce as EventListener,
  );

  return providers;
}

async function connectChosenProvider(provider: Eip1193Provider) {
  const accounts = (await provider.request({
    method: "eth_requestAccounts",
  })) as string[];

  const address = accounts[0];
  if (!address) throw new Error("No wallet account returned");

  return { address, provider };
}
```

