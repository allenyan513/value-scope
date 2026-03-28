// ============================================================
// MCP Server Endpoint (Streamable HTTP, Stateless)
// POST /api/mcp — handles MCP JSON-RPC messages
// GET/DELETE /api/mcp — 405 (stateless mode, no sessions)
// ============================================================

import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { createValuScopeMcpServer } from "@/mcp/server";
import { checkRateLimit, getClientIP } from "@/mcp/rate-limit";
import { createSupabaseWithAuth } from "@/lib/api/auth";

export const maxDuration = 30;

// CORS headers for cross-origin MCP clients
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, mcp-session-id, Last-Event-ID, mcp-protocol-version",
  "Access-Control-Expose-Headers": "mcp-session-id, mcp-protocol-version",
};

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

export async function POST(request: Request) {
  // Rate limiting
  const ip = getClientIP(request);
  const { allowed, remaining, limit } = checkRateLimit(ip);

  if (!allowed) {
    const masked = ip.replace(/\.\d+$/, ".***");
    console.warn(`[MCP] Rate limit exceeded: ${masked}`);
    return new Response(
      JSON.stringify({
        jsonrpc: "2.0",
        error: {
          code: -32000,
          message: `Rate limit exceeded. Max ${limit} requests per minute.`,
        },
        id: null,
      }),
      {
        status: 429,
        headers: {
          "Content-Type": "application/json",
          "Retry-After": "60",
          "X-RateLimit-Limit": String(limit),
          "X-RateLimit-Remaining": "0",
          ...CORS_HEADERS,
        },
      }
    );
  }

  try {
    const start = Date.now();

    // Extract user ID from auth header (optional — free tickers work without auth)
    let userId: string | null = null;
    const authHeader = request.headers.get("authorization");
    if (authHeader) {
      try {
        const supabase = createSupabaseWithAuth(request as unknown as import("next/server").NextRequest);
        const { data: { user } } = await supabase.auth.getUser();
        userId = user?.id ?? null;
      } catch {
        // Auth failure is non-fatal — anonymous access for free tickers
      }
    }

    const server = createValuScopeMcpServer({ userId });
    const transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: undefined, // stateless
      enableJsonResponse: true,
    });

    await server.connect(transport);

    const response = await transport.handleRequest(request);

    const duration = Date.now() - start;
    console.log(`[MCP] ${duration}ms | remaining=${remaining}`);

    // Add CORS + rate limit headers to the response
    const headers = new Headers(response.headers);
    for (const [key, value] of Object.entries(CORS_HEADERS)) {
      headers.set(key, value);
    }
    headers.set("X-RateLimit-Limit", String(limit));
    headers.set("X-RateLimit-Remaining", String(remaining));

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  } catch (error) {
    console.error("[MCP] Request error:", error);
    return new Response(
      JSON.stringify({
        jsonrpc: "2.0",
        error: {
          code: -32603,
          message: "Internal server error",
        },
        id: null,
      }),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json",
          ...CORS_HEADERS,
        },
      }
    );
  }
}

export async function GET() {
  return new Response(
    JSON.stringify({
      jsonrpc: "2.0",
      error: {
        code: -32000,
        message:
          "Method not allowed. This is a stateless MCP endpoint — use POST to send JSON-RPC messages.",
      },
      id: null,
    }),
    {
      status: 405,
      headers: {
        "Content-Type": "application/json",
        ...CORS_HEADERS,
      },
    }
  );
}

export async function DELETE() {
  return new Response(
    JSON.stringify({
      jsonrpc: "2.0",
      error: {
        code: -32000,
        message:
          "Method not allowed. This is a stateless MCP endpoint — no sessions to delete.",
      },
      id: null,
    }),
    {
      status: 405,
      headers: {
        "Content-Type": "application/json",
        ...CORS_HEADERS,
      },
    }
  );
}
