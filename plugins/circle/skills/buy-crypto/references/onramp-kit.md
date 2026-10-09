# Standalone Onramp Kit (`@circle-fin/onramp-kit`)

Onramp Kit has two parts: a **server** part (`@circle-fin/onramp-kit/server`) that mints a short-lived session from your Circle API key, and a **client** part (`@circle-fin/onramp-kit`) that renders the widget in the browser. Read `references/environments.md` for sandbox vs production env vars and CSP. Authorization, Express/Fastify, events, and error handling work the same as in `references/app-kit.md` — substitute `createOnrampServerKit` / `server` for `createAppServerKit` / `server.onramp`.

## Install

```bash
npm install @circle-fin/onramp-kit@latest
```

## 1. Server: mint a session behind an API route

Works on Next.js App Router, Hono, Cloudflare Workers, Bun, Deno, and modern Node. The handler allows only `POST`, validates the request, asks Circle for the session, returns it as JSON, maps errors to HTTP status codes, and marks the response non-cacheable.

```ts
// app/api/onramp/sessions/route.ts
import {
  createOnrampServerKit,
  createSessionRouteHandler,
} from "@circle-fin/onramp-kit/server";
import { auth } from "@/lib/auth";

const server = createOnrampServerKit({
  apiKey: process.env.CIRCLE_API_KEY!, // server-only secret
  // Required for debit card / Apple Pay / Google Pay in embed mode.
  // Bare hostname that matches the domain submitted in KYB.
  referrerDomain: process.env.ONRAMP_REFERRER_DOMAIN,
  // Omit both for production. Set to sandbox values for local dev / testing.
  baseUrl: process.env.ONRAMP_API_BASE_URL,
  widgetBaseUrl: process.env.NEXT_PUBLIC_ONRAMP_WIDGET_BASE_URL,
});

export const POST = createSessionRouteHandler(server, {
  authorize: async (request) => {
    const session = await auth(request);
    if (!session?.user) return false; // → 401

    const body = await request.clone().json().catch(() => null); // malformed JSON → 401, not 500
    if (!body || typeof body !== "object" || Array.isArray(body)) return false;
    if (body.appUserId !== session.user.id) return false; // never mint for another user
    return (await isWalletOfUser(session.user.id, body.destinationAddress)) === true;
  },
});
```

`appUserId` is your app's stable, opaque ID for the user; Circle maps it to its own consumer record, so it must always equal the signed-in user's ID. `isWalletOfUser` stands in for your own check that `destinationAddress` belongs to this user (a wallet you created for them, or one they proved by signing a message). Always return an explicit `true` / `false` from `authorize`, never a helper's raw result.

For Express / Fastify, put auth middleware in front of the route, take `appUserId` from the authenticated user (not `req.body`), call `server.createSession({ appUserId, destinationAddress, assets })` directly, and map `KitError.type` to status as shown in `references/app-kit.md`.

## 2. Client: inline iframe (`mountIframe`)

`mountIframe` renders the widget inline. You may call it any time — no click required. The container must already be in the DOM and have an explicit, non-zero height.

```ts
import { createOnrampKit, fetchOnrampSession } from "@circle-fin/onramp-kit";

const onramp = createOnrampKit({
  // Must match the server's widgetBaseUrl. Omit for production.
  widgetBaseUrl: process.env.NEXT_PUBLIC_ONRAMP_WIDGET_BASE_URL,
});

let widget: { close: () => void } | undefined;
let remints = 0;

async function startOnramp(appUserId: string, destinationAddress: string) {
  widget?.close();

  const container = document.getElementById("onramp-root");
  if (!container) throw new Error("Missing #onramp-root container");
  // destinationAddress comes from the signed-in user's wallet, never a hardcoded repo value.
  const body = { appUserId, destinationAddress };

  const session = await fetchOnrampSession({ url: "/api/onramp/sessions", body });

  const mounted = onramp.mountIframe({
    session,
    container,
    onInitializationSuccess: () => { remints = 0; },
    onDepositSettled: ({ payload }) => {
      // UI hint only — verify onchain before crediting (see references/app-kit.md → Confirming a purchase).
      console.log("settled", payload.tokenSymbol);
    },
    // Also fires for INVALID_SESSION_TOKEN, so an environment mismatch would re-mint forever. Allow one retry in a row.
    onSessionExpired: () => {
      if (remints++ > 0) return showOnrampError("Couldn't start the onramp. Please try again.");
      startOnramp(appUserId, destinationAddress).catch(showOnrampError);
    },
  });

  mounted.on("*", (envelope) => console.log("onramp", envelope.event, envelope.code, envelope.payload));
  widget = mounted;
}

function stopOnramp() {
  widget?.close(); // call on unmount / when leaving the view
  widget = undefined;
}
```

`showOnrampError` is your own UI helper.

```css
#onramp-root { height: 720px; } /* required — no height = invisible iframe */
```

### Scoping tokens and chains (optional)

The widget supports many common tokens and chains and shows its live catalog by default. Pass an optional `assets` field on the session body to limit which token/chain pairs the widget shows. Fields are optional and combined with AND. Omit `assets` to show the full supported catalog. It is display-only, so it's safe to set from the browser.

```ts
const session = await fetchOnrampSession({
  url: "/api/onramp/sessions",
  body: {
    appUserId,
    destinationAddress,
    assets: { chains: ["arc"] },        // Arc only, all supported tokens
    // assets: { tokens: ["USDC"] },    // USDC on every supported chain
    // assets: { pairs: [{ token: "USDC", chain: "arc" }, { token: "EURC", chain: "base" }] },
  },
});
```

## 3. Client: popup mode (`openWindow`)

`openWindow` opens the widget in a popup window (a new tab on mobile). It **must** be called directly inside a click handler (not after an `await`) or the browser blocks the popup. Popup blocks don't throw — they return `{ status: "blocked" }` — but it **does** throw a `KitError` if the session is malformed or expired, so check `session.expiresAt` before calling it.

```ts
button.addEventListener("click", () => {
  const result = onramp.openWindow({ session }); // session minted beforehand
  if (result.status === "blocked") {
    if (result.reason === "popup_blocked") showRetryDialog(result.errorMessage);
    else onramp.mountIframe({ session, container }); // in_app_browser / pwa_standalone
    return;
  }
  result.widget.on("DEPOSIT_NOT_COMPLETED", ({ code }) => console.log(code));
});
```

## Synchronicity in React / Next.js

`openWindow` must fire inside the click handler's synchronous call stack. Mint the session ahead of time (e.g. when the form renders) and store it. Sessions last 30 minutes — mint a fresh one after each open, and re-mint instead of opening if the stored one is about to expire (awaiting inside the handler would get the popup blocked, so the user clicks again).

```tsx
const [session, setSession] = useState<OnrampSession | null>(null);

function mintSession() {
  fetchOnrampSession({ url: "/api/onramp/sessions", body }).then(setSession, console.error);
}
useEffect(mintSession, []);

function handleClick() {
  if (!session || Date.parse(session.expiresAt) - Date.now() < 60_000) {
    mintSession();
    return;
  }
  const result = onramp.openWindow({ session });
  setSession(null);
  mintSession(); // fresh session for the next click
  if (result.status === "blocked") {
    if (result.reason === "popup_blocked") showRetryDialog(result.errorMessage);
    else onramp.mountIframe({ session, container }); // in_app_browser / pwa_standalone
    return;
  }
  result.widget.on("DEPOSIT_NOT_COMPLETED", ({ code }) => console.log(code));
}
```

## What "working" looks like

1. The browser calls `/api/onramp/sessions` (authorized) and gets a session.
2. `mountIframe` / `openWindow` shows the widget (sandbox or production, per your env values).
3. Sandbox needs no KYB. In production, the flow offers bank transfer without KYB; with KYB approved and `referrerDomain` set to the KYB domain, debit card / Apple Pay / Google Pay also appear.
4. Callbacks fire as the user moves through the flow; `widget.on('*', …)` receives every event. The discriminator is `.event`, not `.type`.
5. **Treat browser events as UI hints only.** They're `postMessage` events and there are no onramp webhooks; if you need an authoritative result, verify onchain as described in `references/app-kit.md` → Confirming a purchase.
