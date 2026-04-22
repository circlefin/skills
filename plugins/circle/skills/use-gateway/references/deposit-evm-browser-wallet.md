# Deposit USDC on EVM into Gateway via Browser Wallet

This example uses Arc Testnet, but the same deposit pattern applies to any supported EVM chain after substituting the correct chain config, Gateway Wallet address, and USDC address.

Canonical runnable references:
- Create unified USDC balance: https://developers.circle.com/gateway/howtos/create-unified-usdc-balance.md
- Unified balance EVM quickstart: https://developers.circle.com/gateway/quickstarts/unified-balance-evm.md
- Arc crosschain USDC tutorial: https://docs.arc.network/arc/tutorials/access-usdc-crosschain.md

## What this does

This browser script:

1. Discovers an injected EVM wallet provider
2. Requests the user's account
3. Switches to Arc Testnet if needed
4. Approves the Gateway Wallet contract to spend USDC
5. Calls `deposit(address,uint256)` on the Gateway Wallet contract
6. Waits for both transactions to confirm

## Critical warning

Do **not** send USDC directly to the Gateway Wallet contract with a normal ERC-20 transfer. The funds will not be credited to the unified balance. You must call the Gateway `deposit()` method.

## Runnable example

```ts
import {
  createPublicClient,
  createWalletClient,
  custom,
  erc20Abi,
  formatUnits,
  getContract,
  parseUnits,
} from "viem";
import { arcTestnet } from "viem/chains";

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
const USDC_ADDRESS = "0x3600000000000000000000000000000000000000";
const DEPOSIT_AMOUNT_USDC = "5";

const gatewayWalletAbi = [
  {
    type: "function",
    name: "deposit",
    inputs: [
      { name: "token", type: "address" },
      { name: "value", type: "uint256" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
] as const;

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

async function ensureChain(provider: Eip1193Provider) {
  const targetChainHex = `0x${arcTestnet.id.toString(16)}`;

  try {
    await provider.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: targetChainHex }],
    });
  } catch {
    await provider.request({
      method: "wallet_addEthereumChain",
      params: [
        {
          chainId: targetChainHex,
          chainName: arcTestnet.name,
          nativeCurrency: arcTestnet.nativeCurrency,
          rpcUrls: arcTestnet.rpcUrls.default.http,
          blockExplorerUrls: arcTestnet.blockExplorers?.default?.url
            ? [arcTestnet.blockExplorers.default.url]
            : [],
        },
      ],
    });
  }
}

async function main() {
  const provider = await getInjectedProvider();
  const accounts = (await provider.request({
    method: "eth_requestAccounts",
  })) as string[];

  const account = accounts[0];
  if (!account) throw new Error("No wallet account returned");

  await ensureChain(provider);

  const walletClient = createWalletClient({
    account,
    chain: arcTestnet,
    transport: custom(provider),
  });

  const publicClient = createPublicClient({
    chain: arcTestnet,
    transport: custom(provider),
  });

  const amount = parseUnits(DEPOSIT_AMOUNT_USDC, 6);

  const usdc = getContract({
    address: USDC_ADDRESS,
    abi: erc20Abi,
    client: walletClient,
  });

  const gatewayWallet = getContract({
    address: GATEWAY_WALLET_ADDRESS,
    abi: gatewayWalletAbi,
    client: walletClient,
  });

  console.log(`Connected wallet: ${account}`);
  console.log(`Approving ${formatUnits(amount, 6)} USDC...`);

  const approvalTx = await usdc.write.approve(
    [gatewayWallet.address, amount],
    { account },
  );
  await publicClient.waitForTransactionReceipt({ hash: approvalTx });

  console.log(`Depositing ${formatUnits(amount, 6)} USDC into Gateway...`);

  const depositTx = await gatewayWallet.write.deposit(
    [usdc.address, amount],
    { account },
  );
  await publicClient.waitForTransactionReceipt({ hash: depositTx });

  console.log(`Deposit tx: ${depositTx}`);
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


