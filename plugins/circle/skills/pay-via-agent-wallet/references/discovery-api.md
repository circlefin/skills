#### Filter by network, payment method, or price

`circle services search` filters only by keyword, `--category`, `--type`, `--limit`, and `--offset`, and always leaves out SIWX endpoints. It has no network, payment-method, or price flag, and it treats an unknown flag's value as search text. For those filters, query the public discovery API directly (no API key):

```bash
curl -s --compressed "https://api.circle.com/v2/x402/discovery/resources?supportsCircleGateway=true&network=eip155:5042&siwx=false"
curl -s --compressed "https://api.circle.com/v2/x402/discovery/resources?supportsVanillax402=true&network=eip155:5042&siwx=false"
```

The first lists sellers that accept Gateway on Arc, the second sellers that accept vanilla x402 on Arc. Query parameters, all optional and combinable:

- `query`: fuzzy match across resource URLs, providers, descriptions, and tags (URL-encode spaces as `%20`).
- `category`: one of the categories below.
- `type`: protocol type, e.g. `http` or `mcp`.
- `network`: a CAIP-2 chain ID, e.g. `eip155:5042` for Arc; legacy x402 v1 network names also work.
- `supportsCircleGateway=true`: only sellers that accept Gateway (batched payments from the Gateway balance).
- `supportsVanillax402=true`: only sellers that accept vanilla x402 (onchain payments from the wallet's own USDC).
- `maxUsdPrice`: highest price per call in USD, e.g. `0.01` for under 1 cent.
- `asset`, `scheme`, `payTo`: the payment token contract, the payment scheme (e.g. `exact`), or the seller's wallet address.
- `siwx`: ALWAYS `false`. SIWX (Sign-In With X) endpoints need browser sign-in, which the CLI can't do.
- `fields`: comma-separated fields to return.
- `limit` (default 50, max 200) and `offset`: paging.

Common networks: Arc mainnet `eip155:5042`, Base `eip155:8453`, Polygon `eip155:137`. More query strings to append after `resources?`:

- A keyword with Gateway on Base: `query=<keyword>&supportsCircleGateway=true&network=eip155:8453&siwx=false`
- Everything under 1 cent: `maxUsdPrice=0.01&siwx=false`

Filter by network, e.g. `network=eip155:5042` (Arc), when the user wants a specific chain. Seller coverage differs by chain: if an Arc search returns few or no results, repeat it without the `network` filter before telling the user nothing is available. Don't pre-filter by where the wallet's balance is; Step 2 covers moving USDC to a seller's chain.

#### Categories

`circle services search --category` and the API's `category` take one of:

- **INFERENCE**: AI models to call per use: chat and completions, embeddings, image, audio and video models
- **WEB_SEARCH_RESEARCH**: Web search, scraping, page and document extraction
- **DATA_ENRICHMENT**: People and companies: B2B contacts, emails, firmographics, identity
- **SOCIAL_INTELLIGENCE**: Social media: X, Instagram, TikTok, Reddit, creators
- **FINANCIAL_ANALYSIS**: Crypto and markets: prices, onchain and wallet data, DeFi, stocks and FX, and prediction markets (Polymarket, Kalshi)
- **COMMUNICATION**: Email inboxes, SMS, phone numbers and calls
- **TRAVEL_SHOPPING**: Reservations, flights, travel reviews, gift cards and retail prices
- **MAPS_WEATHER**: Places, weather, property and location data
- **CREATIVE**: Image, video, audio and design generation
- **INFRASTRUCTURE**: Blockchain nodes, compute sandboxes, browsers, CAPTCHAs, identity checks, domains

A service can be in more than one category: `provider.category` is its main one, `provider.additionalCategories` lists the rest, and the `category` filter matches either.

#### Response shape

Each entry in `items[]` is one endpoint. Trimmed:

```json
{
  "x402Version": 2,
  "items": [
    {
      "resource": "https://api.example.com/v1/data",
      "type": "http",
      "accepts": [
        {
          "network": "eip155:5042",
          "asset": "0x3600000000000000000000000000000000000000",
          "scheme": "exact",
          "amount": "100000",
          "payTo": "0x…",
          "extra": { "name": "GatewayWalletBatched" }
        }
      ],
      "metadata": {
        "provider": { "name": "…", "category": "DATA_ENRICHMENT", "additionalCategories": ["…"], "tags": ["…"] },
        "method": "GET",
        "description": "…",
        "siwx": false,
        "supportsVanillax402": false,
        "supportsCircleGateway": true
      }
    }
  ],
  "pagination": { "limit": 50, "offset": 0, "total": 8 }
}
```

`amount` is in USDC base units (6 decimals, so `100000` is $0.10); x402 v2 uses `amount`, not `maxAmountRequired`. `extra.name: "GatewayWalletBatched"` marks a Gateway offer. When the seller publishes them, `metadata.input` and `metadata.output` are JSON Schemas. All fields: https://developers.circle.com/agent-stack/agent-marketplace/discovery-api

#### MCP server

MCP clients can search the same catalog as tool calls. The server is public: no API key, token, or signup.

- URL: `https://agents.circle.com/api/mcp`
- Transport: MCP Streamable HTTP (POST only, stateless, no session to keep alive)

```json
{
  "mcpServers": {
    "circle-agent-marketplace": {
      "type": "http",
      "url": "https://agents.circle.com/api/mcp"
    }
  }
}
```

Tools:

- `search_agent_marketplace_services`: search or list the catalog. Takes the discovery API's query parameters above as JSON arguments (pass `siwx: false`) and returns the matches plus `pagination`. `limit` defaults to 10 here (max 200); page with `offset`.
- `get_agent_marketplace_service`: one catalog entry by the exact `resource` URL the search returned. There is no fuzzy fallback.

Both tools only read the catalog: they never hold funds, pay, or call a listed service. Inspect and pay with the CLI as in Steps 2–4.

#### Pages for people

To let the user browse, link https://agents.circle.com/services. To point someone at one chain, link `https://agents.circle.com/services/network/<chain>` (e.g. https://agents.circle.com/services/network/arc); it lists only the services payable on that chain.
