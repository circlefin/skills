# Onramp Environments, CSP & Troubleshooting

Shared setup for both App Kit (`@circle-fin/app-kit`) and Onramp Kit (`@circle-fin/onramp-kit`). Both install from the public npm registry — use the latest release:

```bash
npm install @circle-fin/app-kit@latest     # or @circle-fin/onramp-kit@latest
```

## When to use which environment

- **Sandbox** — every non-production context: local development, automated tests, CI, internal demos, and QA. No real funds move. Scaffold new integrations here by default and only promote to production after the full flow (session → widget → deposit settled onchain) works in sandbox. The production widget's CSP blocks `localhost`, so a production widget won't load from a local dev server.
- **Production** — only the live app, where real users pay real money and real crypto settles into real wallets. Requires a mainnet API key.

Switch environments by changing **environment variables only** — never by editing source. The API key, `baseUrl`, and `widgetBaseUrl` must all belong to the same environment.

## Sandbox vs Production

| Setting | Set on | Env var (suggested) | Sandbox | Production (default when omitted) |
| --- | --- | --- | --- | --- |
| `apiKey` | server only | `CIRCLE_API_KEY` | your testnet API key | your mainnet API key |
| `baseUrl` | server | `ONRAMP_API_BASE_URL` | `https://api-test.circle.com` | `https://api.circle.com` |
| `widgetBaseUrl` | server **and** client | `NEXT_PUBLIC_ONRAMP_WIDGET_BASE_URL` | `https://onramp-sandbox.arc.io` | `https://onramp.arc.io` |
| `referrerDomain` | server only | `ONRAMP_REFERRER_DOMAIN` | e.g. `localhost` (not enforced) | the exact hostname submitted in KYB (enforced for card payments) |

Notes:

- **API keys are environment-bound.** Use a testnet API key with sandbox and a mainnet API key with production. A testnet key won't work against production and a mainnet key won't work against sandbox. Create both on the [Circle Console → App Kits → Onramp Kit](https://console.circle.com/app-kits/onramp) page, using the environment toggle at the top left: **Testnet** for the testnet key, **Mainnet** for the mainnet key. Generate the mainnet key when you're ready for production; KYB (production only) is completed on the same page in Mainnet.
- **Widget origin must be identical on server and client.** Otherwise `mountIframe`/`openWindow` throw `INPUT_WIDGET_URL_ORIGIN_MISMATCH` (code 1910).
- The widget origin is safe to expose to the browser, so it carries a `NEXT_PUBLIC_` (or framework-equivalent) prefix. The API key is the only real secret and never gets a public prefix. `referrerDomain` isn't secret but MUST stay server-side config so clients can't influence it.
- **`referrerDomain`** is a bare hostname (no scheme, port, path, or wildcard). In production it must match a KYB `web_url` entry, or debit card / Apple Pay / Google Pay fail with `403`. Bank transfer works without it.

### Example `.env`

```bash
# --- server-only secret: testnet API key for sandbox, mainnet API key for production ---
CIRCLE_API_KEY=YOUR_TESTNET_API_KEY

# --- sandbox ---
ONRAMP_API_BASE_URL=https://api-test.circle.com
NEXT_PUBLIC_ONRAMP_WIDGET_BASE_URL=https://onramp-sandbox.arc.io
ONRAMP_REFERRER_DOMAIN=localhost

# --- production (swap CIRCLE_API_KEY for your mainnet API key) ---
# ONRAMP_API_BASE_URL=https://api.circle.com
# NEXT_PUBLIC_ONRAMP_WIDGET_BASE_URL=https://onramp.arc.io
# ONRAMP_REFERRER_DOMAIN=app.example.com   # must match the domain submitted in KYB
```

## Content Security Policy

If your host app sends a CSP, allow the widget and API origins for the environment you target, or the iframe silently fails to load:

| Environment | CSP directives |
| --- | --- |
| Sandbox | `frame-src https://onramp-sandbox.arc.io; connect-src https://onramp-sandbox.arc.io https://api-test.circle.com;` |
| Production | `frame-src https://onramp.arc.io; connect-src https://onramp.arc.io https://api.circle.com;` |

## Troubleshooting

| Symptom | Cause / fix |
| --- | --- |
| `Cannot find module '@circle-fin/app-kit/server'` (or `onramp-kit/server`) | Old SDK version. Run `npm install @circle-fin/app-kit@latest` (or `@circle-fin/onramp-kit@latest`). |
| `INPUT_INVALID_API_KEY` (code 1907) | API key missing, malformed, or for the wrong environment. Use the key exactly as issued: a testnet API key with sandbox `baseUrl`, a mainnet API key with production. |
| `INPUT_WIDGET_URL_ORIGIN_MISMATCH` (code 1910) | Server and client `widgetBaseUrl` differ. Point both at the same environment. |
| `SERVICE_SESSION_ENDPOINT_REJECTED` (code 8923) from `fetchSession` | Your session route returned non-2xx — check the `authorize` callback, auth cookies, and the request body. |
| `401` from the session route | Your `authorize` callback returned `false` (user not signed in, or `appUserId` doesn't match). |
| Only bank transfer shows in production; no card / Apple Pay / Google Pay | KYB not approved yet — check the status at the bottom of the [Onramp Kit page](https://console.circle.com/app-kits/onramp) with the Console toggled to Mainnet (≈48 hour review; watch email for questions from Transak) — or `referrerDomain` isn't set on the server kit. |
| Card / Apple Pay / Google Pay fails with `403` in production | `referrerDomain` doesn't match a domain submitted in KYB, or includes a scheme/port/path. Use the exact bare hostname of the embedding page. |
| Widget area is blank / has no height | The container needs an explicit height and must be attached to the DOM. If your app sends a CSP, allow the widget origin (see above). Using a production widget from `localhost` also fails — use sandbox. |
| KYC or session issues only on iOS Safari | Safari ITP restricts storage inside cross-origin iframes. Use `openWindow` on that platform. |
| `openWindow` returns `blocked` | Not called directly inside a click, or the user is in an in-app browser / installed PWA. Fall back to `mountIframe`. |
| `INPUT_NO_WINDOW` (code 1914) when running in Node | Expected — the client part only runs in a browser. Use it in the browser (or pass your own `{ window }`). |
| Stale session error | Sessions last 30 minutes. Mint a fresh one before mounting. |
