# ValuScope

Stock valuation platform for S&P 500 equities. 9 automated valuation models with daily updates, available as a website and a free MCP server for AI assistants.

**Live:** [valuescope.dev](https://valuescope.dev)

## Valuation Models

| Model | Category | Approach |
|-------|----------|----------|
| FCFF Growth Exit (5Y / 10Y) | DCF | Unlevered FCF → Gordon Growth terminal value |
| FCFF EBITDA Exit (5Y / 10Y) | DCF | Unlevered FCF → Peer EV/EBITDA terminal multiple |
| P/E Multiples | Trading Multiples | Trailing 5Y avg + forward peer median |
| EV/EBITDA Multiples | Trading Multiples | Trailing 5Y avg + forward peer median |
| PEG Fair Value | Growth-Adjusted | Fair P/E = EPS growth + dividend yield |
| Earnings Power Value (EPV) | Perpetuity | Normalized earnings / WACC, zero growth |

Each model returns fair value, upside/downside %, low/high estimates, key assumptions, and full detailed breakdowns (projections, sensitivity matrices, peer comparisons).

## MCP Server (Free)

ValuScope exposes a free MCP endpoint — any AI assistant can query real-time stock valuations.

### Setup

Add to your MCP client config (Claude Desktop, Cursor, Windsurf, etc.):

```json
{
  "mcpServers": {
    "valuescope": {
      "url": "https://valuescope.dev/api/mcp"
    }
  }
}
```

No API key needed. No installation required.

### Tool: `get_stock_valuation`

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `ticker` | string | Yes | Stock ticker (e.g. `AAPL`, `NVDA`, `BRK-B`) |
| `models` | string[] | No | Filter to specific models. Omit for all. |

**Model IDs:** `dcf_fcff_growth_5y`, `dcf_fcff_growth_10y`, `dcf_fcff_ebitda_exit_5y`, `dcf_fcff_ebitda_exit_10y`, `pe_multiples`, `ev_ebitda_multiples`, `peg`, `epv`

### Example Prompts

- "What's the fair value of AAPL?"
- "Show me NVDA's DCF valuation and explain it simply"
- "Compare MSFT's P/E and EV/EBITDA multiples"
- "Is TSLA overvalued? Check all models"
- "Get GOOGL's PEG ratio details"

## Tech Stack

- **Framework:** Next.js (App Router) + React + TypeScript
- **Database:** Supabase (PostgreSQL)
- **Styling:** Tailwind CSS + shadcn/ui + Recharts
- **Deployment:** Vercel (ISR) + GitHub Actions (cron)
- **Data:** FMP API (financials) + FRED (Treasury yields)
- **MCP:** `@modelcontextprotocol/sdk` (Streamable HTTP, stateless)

## Development

```bash
npm install
npm run dev        # Start dev server
npm run build      # Production build
npm test           # Run tests
npm run lint       # ESLint
```

## License

Proprietary. All rights reserved.
