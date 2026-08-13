import { createHash, randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { isAbsolute, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

export function parseArgs(argv, { booleanFlags = [] } = {}) {
  const booleans = new Set(booleanFlags);
  const result = { _: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (!item.startsWith("--")) {
      result._.push(item);
      continue;
    }
    const name = item.slice(2);
    const next = argv[index + 1];
    if (booleans.has(name)) {
      if (next && !next.startsWith("--")) {
        throw new Error(
          `--${name} is a bare boolean flag and does not accept the value ${next}.`,
        );
      }
      result[name] = true;
      continue;
    }
    if (!next || next.startsWith("--")) {
      result[name] = true;
      continue;
    }
    result[name] = next;
    index += 1;
  }
  return result;
}

export function required(args, name) {
  const value = args[name];
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Missing required flag --${name}.`);
  }
  return value;
}

export function requireHex(value, bytes, label) {
  const expected = bytes * 2;
  if (!new RegExp(`^0x[0-9a-fA-F]{${expected}}$`).test(value)) {
    throw new Error(`${label} must be a ${bytes}-byte 0x-prefixed hex value.`);
  }
  return value;
}

export function requireAddress(value, label) {
  return requireHex(value, 20, label);
}

export function json(value) {
  return JSON.stringify(
    sanitize(value),
    (_key, item) => (typeof item === "bigint" ? item.toString() : item),
    2,
  );
}

export function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

export async function rpc(rpcUrl, method, params) {
  const response = await fetch(rpcUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: randomUUID(), method, params }),
    signal: AbortSignal.timeout(30_000),
  });
  const body = await response.json();
  if (!response.ok || body.error) {
    throw new Error(
      `RPC ${method} failed: ${JSON.stringify(body.error ?? body)}`,
    );
  }
  return body.result;
}

export function rpcOrigin(rpcUrl) {
  const parsed = new URL(rpcUrl);
  return `${parsed.protocol}//${parsed.host}`;
}

export function requireApprovedProxyOverride(proxyUrl, args) {
  if (!process.env.CIRCLE_PROXY_URL) return;
  const origin = rpcOrigin(proxyUrl);
  if (args["allow-proxy-origin"] !== origin) {
    throw new Error(
      `CIRCLE_PROXY_URL overrides Circle's default proxy with ${origin}. Inspect it and re-run with --allow-proxy-origin ${origin} only if the user explicitly trusts that origin.`,
    );
  }
}

export function sanitize(value) {
  if (Array.isArray(value)) return value.map(sanitize);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => {
      const lowered = key.toLowerCase();
      const secret = [
        /^signature$/,
        /^signatures$/,
        /^rawsignature$/,
        /(user|session|access|refresh|bearer|auth|id)[-_]?token$/,
        /^otp$/,
        /^pin$/,
        /secret/,
        /password/,
        /private[-_]?key/,
        /encryption[-_]?key/,
        /api[-_]?key/,
        /credential/,
        /^authorization$/,
        /^cookie$/,
      ].some((pattern) => pattern.test(lowered));
      return [key, secret ? "[REDACTED]" : sanitize(item)];
    }),
  );
}

export function safeErrorMessage(error) {
  const text =
    error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  return text
    .replace(/0x[0-9a-f]{130}\b/gi, "[REDACTED_SIGNATURE]")
    .replace(
      /((?:user|session|access|refresh|bearer|auth|id)[-_ ]?token|otp|pin|(?:private|encryption|api)[-_ ]?key|credential|authorization|cookie|password|secret)(["']?\s*[:=]\s*["']?)([^"',}\]\s]+)/gi,
      "$1$2[REDACTED]",
    );
}

export async function writeEvidence(directory, label, value) {
  if (!directory) return undefined;
  const target = isAbsolute(directory) ? directory : resolve(directory);
  await mkdir(target, { recursive: true, mode: 0o700 });
  const timestamp = new Date().toISOString().replaceAll(":", "-");
  const filename = `${timestamp}-${label}.json`;
  const outputPath = join(target, filename);
  const payload = sanitize({ capturedAt: new Date().toISOString(), ...value });
  await writeFile(outputPath, `${json(payload)}\n`, { mode: 0o600 });
  return outputPath;
}

export async function loadCircleRuntime(circleCliRepo) {
  const root = resolve(circleCliRepo);
  const moduleUrl = (relativePath) =>
    pathToFileURL(join(root, relativePath)).href;

  const [httpClient, config, session, helpers, chainMap, viem, viemAccounts] =
    await Promise.all([
      import(moduleUrl("apps/cli/src/circle-http-client.ts")),
      import(moduleUrl("apps/cli/src/config.ts")),
      import(moduleUrl("apps/cli/src/session.ts")),
      import(moduleUrl("apps/cli/src/commands/wallet/helpers.ts")),
      import(moduleUrl("apps/cli/src/chain-map.ts")),
      import(moduleUrl("apps/cli/node_modules/viem/_esm/index.js")),
      import(moduleUrl("apps/cli/node_modules/viem/_esm/accounts/index.js")),
    ]);

  return {
    root,
    CircleHttpClient: httpClient.CircleHttpClient,
    getProxyUrl: config.getProxyUrl,
    getEvmChainId: chainMap.getEvmChainId,
    loadAgentEnv: session.loadAgentEnv,
    ...helpers,
    viem,
    viemAccounts,
  };
}

export function requireCircleChainId(runtime, chain, chainId) {
  const configuredChainId = BigInt(runtime.getEvmChainId(chain));
  if (configuredChainId !== chainId) {
    throw new Error(
      `Circle chain ${chain} uses EVM chain ID ${configuredChainId}, not ${chainId}.`,
    );
  }
}

export async function resolveAgentWallet(runtime, chain, sca, args = {}) {
  const env = await runtime.loadAgentEnv(chain);
  if (!env) {
    throw new Error(
      `No active Circle agent session for ${chain}. Use the use-agent-wallet skill once, then retry.`,
    );
  }
  const proxyUrl = runtime.getProxyUrl("agent", chain);
  requireApprovedProxyOverride(proxyUrl, args);
  const client = new runtime.CircleHttpClient(proxyUrl);
  const wallets = await client.listWallets(env.userToken, {
    blockchain: chain,
    address: sca,
  });
  const wallet = wallets.find(
    (candidate) => candidate.address.toLowerCase() === sca.toLowerCase(),
  );
  if (!wallet) {
    throw new Error(`Circle agent wallet ${sca} was not found on ${chain}.`);
  }
  return { env, proxyUrl, client, wallet };
}

export function freshIdempotencyKey(value) {
  if (value) {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
      throw new Error("--idempotency-key must be a UUID.");
    }
    return value;
  }
  return randomUUID();
}

export function isFailedTransaction(state) {
  return ["FAILED", "CANCELLED", "DENIED"].includes(String(state));
}
