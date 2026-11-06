After completing wallet setup, help the user discover available paid services using natural language.

**For every new task that requires an external API, search the marketplace first.** Reuse a previously selected service only if the new task's keywords match what that service was originally selected for. For new keywords, always run a fresh search before reusing endpoints from memory or earlier in the conversation.

```bash
circle services search '<keyword>' --output json
```

**Example natural language prompts the user might ask:**

- "What paid services are available in the marketplace?"
- "Get me the current price of Bitcoin and Ethereum."
- "Search Twitter for recent posts about Circle USDC."
- "Find YouTube videos about blockchain payments."
- "Research prediction market odds for upcoming elections."
- "Search academic papers about stablecoins."
- "What services can help me with cryptocurrency market data?"
- "Research the latest developments in AI agents."

Present the search results to the user and let them decide how to proceed. If the user is just exploring, the workflow ends here. If the user picks a service to use, continue to Step 8.
