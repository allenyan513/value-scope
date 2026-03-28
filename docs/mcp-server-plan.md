# ValuScope MCP Server — 产品规划

## 一、产品定位

将 ValuScope 的 9 个估值模型通过 MCP (Model Context Protocol) 协议对外开放，让任何 AI 助手（Claude、Cursor、Windsurf 等）都能实时查询美股估值数据。**完全免费**，作为 ValuScope 品牌推广渠道。

## 二、核心能力

### 唯一 Tool: `get_stock_valuation` — 获取估值数据

一个 tool 覆盖所有场景。AI 客户端拿到结构化数据后，自行决定如何呈现、解释、比较。

**输入参数：**
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `ticker` | string | 是 | 股票代码，如 "AAPL" |
| `models` | string[] | 否 | 指定模型，默认返回全部。可选值见下方 |

**可选模型 ID：**
| ID | 名称 | 类别 |
|----|------|------|
| `dcf_fcff_growth_5y` | DCF FCFF Growth Exit (5Y) | DCF |
| `dcf_fcff_growth_10y` | DCF FCFF Growth Exit (10Y) | DCF |
| `dcf_fcff_ebitda_exit_5y` | DCF FCFF EBITDA Exit (5Y) | DCF |
| `dcf_fcff_ebitda_exit_10y` | DCF FCFF EBITDA Exit (10Y) | DCF |
| `pe_multiples` | P/E Trading Multiples | Trading Multiples |
| `ev_ebitda_multiples` | EV/EBITDA Trading Multiples | Trading Multiples |
| `peg` | PEG Fair Value | Growth-Adjusted |
| `epv` | Earnings Power Value | Perpetuity |
| `analyst_consensus` | Analyst Price Target Consensus | Analyst |

**返回数据结构：**
```jsonc
{
  "ticker": "AAPL",
  "company_name": "Apple Inc.",
  "sector": "Technology",
  "industry": "Consumer Electronics",
  "market_cap": 3050000000000,
  "current_price": 198.50,
  "currency": "USD",
  "computed_at": "2026-03-28T12:00:00Z",

  // 各模型结果（按 models 参数过滤，默认全部）
  "models": [
    {
      "model_id": "dcf_fcff_growth_5y",
      "model_name": "DCF FCFF Growth Exit (5-Year)",
      "category": "DCF",
      "fair_value": 220.50,
      "upside_percent": 11.1,
      "low_estimate": 190.00,
      "high_estimate": 260.00,
      "assumptions": {
        "wacc": 0.092,
        "terminal_growth_rate": 0.03,
        "revenue_cagr_projected": 0.08,
        "projection_years": 5
      },
      "details": {
        "projections": [ /* 逐年预测：revenue, ebitda, fcff, pv_fcff */ ],
        "terminal_value": 2800000000000,
        "enterprise_value": 3200000000000,
        "net_debt": 50000000000,
        "sensitivity_matrix": {
          "wacc_values": [0.072, 0.082, 0.092, 0.102, 0.112],
          "growth_values": [0.02, 0.025, 0.03, 0.035, 0.04],
          "fair_values": [ /* 5x5 grid */ ]
        }
      }
    },
    {
      "model_id": "pe_multiples",
      "model_name": "P/E Trading Multiples",
      "category": "Trading Multiples",
      "fair_value": 205.00,
      "upside_percent": 3.3,
      "low_estimate": 185.00,
      "high_estimate": 230.00,
      "assumptions": {
        "peer_median_pe": 28.5,
        "ttm_eps": 6.42,
        "method": "trailing_5y_avg + peer_forward"
      },
      "details": {
        "peers": [
          { "ticker": "MSFT", "name": "Microsoft", "pe_ratio": 32.1, "market_cap": 2900000000000 }
          // ...
        ],
        "trailing_estimate": { "fair_value": 200.00, "multiple_used": 27.5 },
        "forward_estimate": { "fair_value": 210.00, "multiple_used": 29.5, "ntm_eps": 7.12 }
      }
    },
    {
      "model_id": "peg",
      "model_name": "PEG Fair Value",
      "category": "Growth-Adjusted",
      "fair_value": 195.00,
      "upside_percent": -1.8,
      "low_estimate": 170.00,
      "high_estimate": 220.00,
      "assumptions": {
        "growth_rate": 0.12,
        "growth_source": "forward",
        "dividend_yield": 0.005,
        "fair_pe": 12.5
      },
      "details": {
        "peg_ratio": 2.1,
        "current_pe": 30.9,
        "forward_estimates": [
          { "period": "2026", "eps": 7.12, "growth_pct": 0.11, "analysts": 38 }
        ]
      }
    }
    // ... epv, ev_ebitda, dcf variants, analyst_consensus
  ],

  // WACC（所有 DCF 模型共用）
  "wacc": {
    "wacc": 0.092,
    "cost_of_equity": 0.105,
    "cost_of_debt": 0.035,
    "beta": 1.2,
    "risk_free_rate": 0.043,
    "erp": 0.045,
    "debt_weight": 0.15,
    "equity_weight": 0.85
  },

  // 公司分类
  "classification": {
    "archetype": "profitable_growth",
    "label": "Profitable Growth",
    "description": "Strong revenue growth with sustained profitability"
  },

  // 来源 & 免责
  "source": "ValuScope (valuescope.dev)",
  "source_url": "https://valuescope.dev/AAPL",
  "disclaimer": "This is not financial advice. Valuation models are estimates based on public financial data."
}
```

### Tool Description（注册给 MCP 客户端的说明）

```
Get comprehensive stock valuation for US equities (S&P 500).
Returns fair value estimates from up to 9 models: 4 DCF variants (FCFF Growth/EBITDA Exit × 5Y/10Y),
P/E Multiples, EV/EBITDA Multiples, PEG, Earnings Power Value, and Analyst Consensus.

Each model returns fair value, upside/downside %, low/high estimates, assumptions, and detailed breakdowns.
Use `models` parameter to request specific models, or omit for all.

Data updates daily. Covers ~500 S&P 500 stocks.
```

## 三、技术架构（已实现）

```
┌──────────────────────────────────────────────────┐
│  AI Clients (Claude Desktop, Cursor, etc.)       │
│  ↓ MCP Streamable HTTP (POST /api/mcp)           │
├──────────────────────────────────────────────────┤
│  ValuScope MCP Server                            │
│  ┌────────────────────────────────────────────┐  │
│  │  src/app/api/mcp/route.ts                  │  │
│  │  - Next.js API route (POST/GET/DELETE)     │  │
│  │  - CORS headers                            │  │
│  │  - Per-request server + transport          │  │
│  ├────────────────────────────────────────────┤  │
│  │  src/mcp/server.ts                         │  │
│  │  - McpServer factory                       │  │
│  │  - get_stock_valuation tool registration   │  │
│  │  - Zod input validation                    │  │
│  ├────────────────────────────────────────────┤  │
│  │  src/mcp/valuation-handler.ts              │  │
│  │  - Shared data fetch + compute pipeline    │  │
│  │  - Also used by /api/valuation/[ticker]    │  │
│  ├────────────────────────────────────────────┤  │
│  │  Reuses existing lib:                      │  │
│  │  - src/lib/valuation/* (all 9 models)      │  │
│  │  - src/lib/db/* (Supabase queries)         │  │
│  │  - src/lib/data/* (FMP, FRED)              │  │
│  └────────────────────────────────────────────┘  │
├──────────────────────────────────────────────────┤
│  Deployment: Vercel (same as main app)           │
└──────────────────────────────────────────────────┘
```

### 关键设计决策

1. **单 Tool 设计**
   - 一个 `get_stock_valuation` 覆盖所有查询场景
   - AI 客户端天然擅长解读结构化数据、生成自然语言解释、做多股对比
   - 不需要我们在服务端做解读——让 AI 做 AI 擅长的事

2. **传输层：Streamable HTTP (Stateless)**
   - `WebStandardStreamableHTTPServerTransport` — 使用 Web Standard Request/Response，直接兼容 Next.js App Router
   - `sessionIdGenerator: undefined` — 无状态模式，每个请求创建新的 server + transport，适合 Vercel serverless
   - `enableJsonResponse: true` — 返回 JSON 而非 SSE stream，简化客户端处理
   - CORS 完全开放，支持跨域 MCP 客户端

3. **复用现有代码**
   - 提取 `computeValuationForTicker()` 到 `src/mcp/valuation-handler.ts`
   - `/api/valuation/[ticker]` 和 MCP server 共用同一函数，零重复
   - 输出裁剪：去掉 consensus 遗留字段，添加 source/disclaimer 元数据

4. **Rate Limiting**（待实现）
   - 免费无需认证
   - Per-session: 30 requests/minute
   - Global: 10,000 requests/day（可调）
   - 超限返回友好错误信息

5. **依赖**
   - `@modelcontextprotocol/sdk` — 官方 MCP TypeScript SDK（已安装）
   - `zod` — 输入验证（已有）

## 四、用户使用方式

### 方式 A：远程 SSE（推荐，零安装）

用户在 Claude Desktop / Cursor 的 MCP 配置中添加：
```json
{
  "mcpServers": {
    "valuescope": {
      "url": "https://valuescope.dev/api/mcp"
    }
  }
}
```

### 方式 B：NPX 本地运行

```bash
npx valuescope-mcp
```

自动启动 stdio MCP server，连接 ValuScope 云端 API。

### 使用示例

用户对 AI 说：
- "帮我查一下 AAPL 的估值" → `get_stock_valuation(ticker: "AAPL")`
- "NVDA 的 DCF 估值是多少？帮我解释一下" → `get_stock_valuation(ticker: "NVDA", models: ["dcf_fcff_growth_5y"])` → AI 自行解读
- "比较 MSFT 的 P/E 和 EV/EBITDA 估值" → `get_stock_valuation(ticker: "MSFT", models: ["pe_multiples", "ev_ebitda_multiples"])`
- "TSLA 被高估了吗？" → `get_stock_valuation(ticker: "TSLA")` → AI 综合所有模型给出判断
- "用最简单的话解释 GOOGL 的 PEG 估值" → `get_stock_valuation(ticker: "GOOGL", models: ["peg"])` → AI 用通俗语言解释

## 五、实施计划

### Phase 1: Core MCP Server（MVP）✅ Done
- [x] 安装 `@modelcontextprotocol/sdk`
- [x] 提取共享估值逻辑 (`src/mcp/valuation-handler.ts`)
- [x] 搭建 MCP server 框架 (`src/mcp/server.ts`)
- [x] 实现 `get_stock_valuation` tool（复用 computeFullValuation，裁剪输出）
- [x] Streamable HTTP transport via `/api/mcp` route
- [x] Error handling（ticker 不存在、数据不足等）
- [x] 重构 `/api/valuation/[ticker]` 使用共享 handler
- [x] Build 通过 + 263 tests 通过

### Phase 2: Hardening（待做）
- [ ] 基础 rate limiting
- [ ] MCP 专用单元测试
- [ ] 性能监控 / 日志

### Phase 3: Distribution（待做）
- [ ] NPX package (`valuescope-mcp`) 发布到 npm
- [ ] 提交到 MCP 官方 registry
- [ ] Landing page on valuescope.dev/mcp
- [ ] README & 用户文档

## 六、成功指标

- MCP 日活调用量
- 通过 MCP 导流到 valuescope.dev 的 UV
- MCP registry 安装/star 数
- 用户反馈 & GitHub issues

## 七、风险与限制

| 风险 | 缓解策略 |
|------|---------|
| FMP API 调用量暴增 | 估值数据靠 ISR 缓存，MCP 调用复用同一缓存层 |
| Supabase 连接数 | Serverless 函数已用连接池，MCP 共享同一机制 |
| 滥用/爬虫 | Rate limiting + 可选 API key（未来） |
| 数据准确性争议 | 每个响应带 disclaimer + source 链接 |
