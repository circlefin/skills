# App Kit onramp (`@circle-fin/app-kit` via `kit.onramp`)

App Kit is the all-in-one kit. The onramp is reached through `createAppServerKit` on the server and `kit.onramp` on the client, alongside bridge, swap, send, unified balance, and earn. Read `references/environments.md` for sandbox vs production env vars and CSP.

## Install

```bash
npm install @circle-fin/app-kit@latest
```

Onramp needs no wallet adapter.

## 1. Server: mint a session

`createSessionRouteHandler` is a drop-in `Request → Response` handler for Fetch-standard hosts (Next.js App Router, Hono, Cloudflare Workers, Bun, Deno, modern Node). It accepts only `POST`, validates the body, calls `server.onramp.createSession()`, maps errors to HTTP status codes, and sets `Cache-Control: no-store`.

```ts
// app/api/onramp/sessions/route.ts
import {
  createAppServerKit,
  createSessionRouteHandler,
} from "@circle-fin/app-kit/server";
import { auth } from "@/lib/auth";

const server = createAppServerKit({
  onramp: {
    apiKey: process.env.CIRCLE_API_KEY!, // server-only secret
    // Required for debit card / Apple Pay / Google Pay in embed mode.
    // Bare hostname that matches the domain submitted in KYB.
    referrerDomain: process.env.ONRAMP_REFERRER_DOMAIN,
    // Omit both for production. Set to sandbox values for local dev / testing.
    baseUrl: process.env.ONRAMP_API_BASE_URL,
    widgetBaseUrl: process.env.NEXT_PUBLIC_ONRAMP_WIDGET_BASE_URL,
  },
});

export const POST = createSessionRouteHandler(server.onramp, {
  authorize: async (request) => {
    const session = await auth(request);
    if (!session?.user) return false; // → 401

    const body = await request.clone().json().catch(() => null); // malformed JSON → 401, not 500
    if (!body || typeof body !== "object" || Array.isArray(body)) return false;
    if (body.appUserId !== session.user.id) return false; // never mint for another user
    return (await isWalletOfUser(session.user.id, body.destinationAddress)) === true;
  },
  onError: (error, request) => {
    console.error("onramp session mint failed", { url: request.url, error });
  },
});
```

- `authorize` runs before body validation. Return `true` to allow, `false` to reject with `401`, or throw a `KitError` for its mapped status. Always return an explicit boolean — never a helper's raw result (e.g. `wallets.find(...)`), which can be `undefined` or an object instead of `true` / `false`. The default handler (no `authorize`) is unauthenticated — never deploy it that way.
- `appUserId` is your app's stable, opaque ID for the user. Circle maps it to its own consumer record, so it must always equal the signed-in user's ID. Rejecting a mismatch stops one user from minting sessions under another user's ID.
- `isWalletOfUser` stands in for your own lookup and must resolve to `true` or `false`. Confirm `destinationAddress` is a wallet you created for this user (e.g. with Circle Wallets) or one they proved by signing a message (e.g. Sign-In with Ethereum) — not just an address the browser sent.
- `onError` is for observability only; it doesn't change the response.
- `referrerDomain` must come from trusted server config, never from the request. See `SKILL.md` → KYB for production.



### Express / Fastify (non-Fetch hosts)

Call `server.onramp.createSession()` directly and map `KitError.type` to HTTP status yourself:

```ts
import express from "express";
import { createAppServerKit, KitError } from "@circle-fin/app-kit/server";
import { requireAuth } from "./auth"; // your auth middleware; rejects anonymous requests and sets req.user

const server = createAppServerKit({
  onramp: {
    apiKey: process.env.CIRCLE_API_KEY!,
    referrerDomain: process.env.ONRAMP_REFERRER_DOMAIN,
    // Omit both for production. Set to sandbox values for local dev / testing.
    baseUrl: process.env.ONRAMP_API_BASE_URL,
    widgetBaseUrl: process.env.NEXT_PUBLIC_ONRAMP_WIDGET_BASE_URL,
  },
});

const STATUS: Record<string, number> = {
  INPUT: 400,
  RATE_LIMIT: 429,
  NETWORK: 504,
  SERVICE: 502,
  RPC: 502,
};

const app = express();
app.use(express.json());

app.post("/api/onramp/sessions", requireAuth, async (req, res) => {
  const appUserId = req.user.id; // from the authenticated session, never the request body
  const { destinationAddress, assets } = req.body ?? {};

  try {
    if ((await isWalletOfUser(appUserId, destinationAddress)) !== true) {
      return res.status(403).json({ message: "destinationAddress is not linked to this user" });
    }

    const session = await server.onramp.createSession({ appUserId, destinationAddress, assets });
    res.setHeader("Cache-Control", "no-store");
    res.json(session);
  } catch (error) {
    if (error instanceof KitError) {
      return res.status(STATUS[error.type] ?? 500).json({ message: error.message });
    }
    return res.sendStatus(500);
  }
});
```



## 2. Client: mount inline via `kit.onramp`

The container must be attached to the DOM and have an explicit, non-zero height:

```html
<div id="onramp-root"></div>
```

```css
#onramp-root { width: 100%; height: 720px; }
```

```ts
import { AppKit } from "@circle-fin/app-kit";

const kit = new AppKit({
  onramp: {
    // Must match the server's widgetBaseUrl. Omit for production.
    widgetBaseUrl: process.env.NEXT_PUBLIC_ONRAMP_WIDGET_BASE_URL,
  },
});

let widget: { close: () => void } | undefined;
let remints = 0;

async function startOnramp(appUserId: string, destinationAddress: string) {
  widget?.close();

  // Look up the container at call time, not module load — module code runs before React renders and during SSR.
  const container = document.getElementById("onramp-root");
  if (!container) throw new Error("Missing #onramp-root container");

  // destinationAddress comes from the signed-in user's wallet, never a hardcoded repo value.
  const body = { appUserId, destinationAddress };
  const session = await kit.onramp.fetchSession({ url: "/api/onramp/sessions", body });

  widget = kit.onramp.mountIframe({
    session,
    container,
    onInitializationSuccess: () => { remints = 0; },
    onDepositSettled: ({ payload }) => console.log("settled", payload), // UI hint only
    onDepositNotCompleted: ({ code }) => console.log("not completed", code),
    // Also fires for INVALID_SESSION_TOKEN, so an environment mismatch would re-mint forever. Allow one retry in a row.
    onSessionExpired: () => {
      if (remints++ > 0) return showOnrampError("Couldn't start the onramp. Please try again.");
      startOnramp(appUserId, destinationAddress).catch(showOnrampError);
    },
  });
}

function stopOnramp() {
  widget?.close();
  widget = undefined;
}
```

`showOnrampError` is your own UI helper. In React, call `startOnramp` from `useEffect` (so the container is in the DOM) and `stopOnramp` from the effect cleanup. For an idle tab that times out, consider showing a "Restart" button instead of re-mounting automatically every 30 minutes.

### Scoping tokens and chains (optional)

```ts
const session = await kit.onramp.fetchSession({
  url: "/api/onramp/sessions",
  body: {
    appUserId,
    destinationAddress,
    assets: { tokens: ["USDC"], chains: ["arc"] },
    // assets: { pairs: [{ token: "USDC", chain: "arc" }, { token: "EURC", chain: "base" }] },
  },
});
```

The widget supports many common tokens and chains; the live catalog is what the widget shows, so don't hardcode a supported list. `tokens` takes symbols (e.g. `USDC`, `EURC`, `ETH`); `chains` takes a network id or display label (case-insensitive, e.g. `arc`, `base`, `ethereum`); `pairs` gives exact combinations. Multiple fields combine with AND. Omit `assets` for the full catalog. It's display-only and doesn't override eligibility or geo rules.

## Popup mode

Call `kit.onramp.openWindow({ session })` **synchronously** from a click and branch on `result.status` before touching `result.widget`. Mint the session before the click. Popup blocks return `{ status: "blocked" }`, but `openWindow` throws a `KitError` if the session is malformed or expired, so check `session.expiresAt` first:

```ts
button.addEventListener("click", () => {
  const result = kit.onramp.openWindow({ session });

  if (result.status === "blocked") {
    if (result.reason === "popup_blocked") showPopupRetryDialog(result.errorMessage);
    else kit.onramp.mountIframe({ session, container }); // in_app_browser / pwa_standalone
    return;
  }

  result.widget.on("DEPOSIT_SETTLED", ({ payload }) => console.log("settled", payload)); // UI hint only
  result.widget.on("DEPOSIT_NOT_COMPLETED", ({ code }) => console.log(code));
});
```

If the user closes the popup before depositing, the kit emits `DEPOSIT_NOT_COMPLETED` with code `CANCELED_BY_CUSTOMER`. See the React synchronicity pattern in `references/onramp-kit.md` — substitute `kit.onramp.fetchSession` / `kit.onramp.openWindow`.

## Events

Envelopes are `{ event, code, payload? }` — switch on `.event`, not `.type`.


| Event                    | Meaning                                                                                                                                                                     |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `INITIALIZATION_SUCCESS` | Widget loaded, waiting for input.                                                                                                                                           |
| `INITIALIZATION_ERROR`   | Couldn't start. Codes: `PAGE_NOT_LOADED`, `INVALID_SESSION_TOKEN`.                                                                                                          |
| `DEPOSIT_SUBMITTED`      | Customer submitted a deposit. If `payload.settlementExpected` is `false`, this is the **final** event for the session — no `DEPOSIT_SETTLED` follows, so don't leave the UI waiting. |
| `DEPOSIT_SETTLED`        | Deposit settled onchain (UI hint).                                                                                                                                          |
| `DEPOSIT_NOT_COMPLETED`  | Ended without settlement. Codes: `SESSION_TIMEOUT`, `CANCELED_BY_CUSTOMER`, `NO_PAYMENT_OPTIONS`, `CUSTOMER_PENDING_REVIEW`, `CUSTOMER_REJECTED`, `PAYMENT_PROVIDER_ERROR`. |


Subscribe with typed callbacks (`onDepositSubmitted`, `onInitializationError`, …), or after mount with `widget.on(name, handler)` / `widget.off(name, handler)`. Use `'*'` for analytics:

```ts
widget.on("*", (envelope) => {
  analytics.track("onramp", { event: envelope.event, code: envelope.code, ...envelope.payload });
});
```

`onSessionExpired` fires for `SESSION_TIMEOUT` and `INVALID_SESSION_TOKEN` — use it as the "mint a new session and re-mount" signal, but cap retries (see the example above) so a misconfigured environment can't loop.

### Confirming a purchase

Events are `postMessage` browser events, and Circle sends no onramp webhooks. Treat them as UI hints and confirm on your server before crediting a user:

- **`payload.transactionHash` is untrusted** — it comes from the browser. Look it up onchain and check that it moves the expected token to `destinationAddress`.
- **Take the amount from the chain**, not `payload.amount` (that's the fiat source amount, and best-effort).
- **Wait for finality** on the destination chain, and only count transfers that land after the session was minted.
- **An onchain transfer alone doesn't prove it came from the onramp** — the user can send funds to their own wallet. Weigh that before releasing goods or credit on onramp deposits alone.
- **Credit at most once**, keyed by `transactionHash`, so a repeated event or retry never credits the same deposit twice.

## Error handling

Every onramp error is a `KitError` (exported from `@circle-fin/app-kit` and `@circle-fin/app-kit/server`). Branch on `type` and `recoverability`, not message strings:

```ts
import { KitError } from "@circle-fin/app-kit";

try {
  const session = await kit.onramp.fetchSession({ url, body });
  kit.onramp.mountIframe({ session, container });
} catch (err) {
  if (err instanceof KitError) {
    if (err.recoverability === "RETRYABLE") return scheduleRetry();
    if (err.type === "INPUT") return showValidationError(err.message);
    if (err.type === "RATE_LIMIT") return showRateLimitToast();
  }
  throw err;
}
```

Common codes: `1907 INPUT_INVALID_API_KEY`, `1910 INPUT_WIDGET_URL_ORIGIN_MISMATCH`, `1914 INPUT_NO_WINDOW`, `8923 SERVICE_SESSION_ENDPOINT_REJECTED`. See the troubleshooting table in `references/environments.md`.