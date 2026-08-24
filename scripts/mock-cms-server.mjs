/**
 * Mock company CMS — a real MCP server (streamable HTTP) implementing the
 * publishing destination. The Publishing Agent's `publish_article` tool call
 * is approval-gated in TrueForge, so the external action only executes after
 * an explicit human decision.
 *
 * Run: npm run mock:cms   (listens on MOCK_CMS_PORT, default 3780)
 * Register in TrueForge with header auth:
 *   Authorization: Bearer $CMS_MCP_HEADER_TOKEN
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import express from "express";
import { randomUUID } from "node:crypto";
import { z } from "zod";

// Plain `node script.mjs` does not load .env either (Node >= 20.6 API).
try {
  process.loadEnvFile();
} catch {
  /* no .env file */
}

const PORT = Number(process.env.MOCK_CMS_PORT ?? 3780);
const REQUIRED_TOKEN = process.env.CMS_MCP_HEADER_TOKEN ?? "local-dev-cms-token";

// In-memory publication store — enough to demonstrate create/verify flows.
/** @type {Map<string, object>} */
const publications = new Map();

const server = new McpServer({ name: "content-cms", version: "1.0.0" });

server.registerTool(
  "prepare_draft",
  {
    title: "Prepare draft",
    description: "Create a draft article entry and return its draft id.",
    inputSchema: z.object({
      title: z.string(),
      slug: z.string(),
      metaDescription: z.string(),
      content: z.string(),
    }),
  },
  async ({ title, slug, metaDescription, content }) => {
    const id = `draft-${randomUUID().slice(0, 8)}`;
    publications.set(id, { id, kind: "draft", title, slug, metaDescription, content });
    return { content: [{ type: "text", text: JSON.stringify({ draftId: id }) }] };
  },
);

server.registerTool(
  "upload_asset",
  {
    title: "Upload asset",
    description: "Register an image asset for an article.",
    inputSchema: z.object({
      draftId: z.string(),
      url: z.string(),
      altText: z.string(),
      type: z.string(),
    }),
  },
  async ({ draftId, url, altText, type }) => {
    const pub = publications.get(draftId);
    if (!pub) throw new Error(`unknown draft ${draftId}`);
    if (!Array.isArray(pub.assets)) pub.assets = [];
    pub.assets.push({ url, altText, type });
    return { content: [{ type: "text", text: JSON.stringify({ uploaded: pub.assets.length }) }] };
  },
);

server.registerTool(
  "publish_article",
  {
    title: "Publish article",
    description: "Publish a prepared draft. This is the gated external action.",
    inputSchema: z.object({ draftId: z.string(), idempotencyKey: z.string() }),
  },
  async ({ draftId, idempotencyKey }) => {
    for (const pub of publications.values()) {
      if (pub.idempotencyKey === idempotencyKey) {
        // Duplicate external action on retry — return the original result.
        return {
          content: [{ type: "text", text: JSON.stringify({ publishedUrl: pub.publishedUrl, externalId: pub.id, duplicate: true }) }],
        };
      }
    }
    const pub = publications.get(draftId);
    if (!pub) throw new Error(`unknown draft ${draftId}`);
    pub.kind = "published";
    pub.idempotencyKey = idempotencyKey;
    pub.publishedAt = new Date().toISOString();
    pub.publishedUrl = `http://localhost:${PORT}/blog/${pub.slug}`;
    return {
      content: [{ type: "text", text: JSON.stringify({ publishedUrl: pub.publishedUrl, externalId: pub.id }) }],
    };
  },
);

server.registerTool(
  "get_publication_status",
  {
    title: "Get publication status",
    description: "Verify that a publication exists and is live.",
    inputSchema: z.object({ externalId: z.string() }),
  },
  async ({ externalId }) => {
    const pub = publications.get(externalId);
    if (!pub) throw new Error(`unknown publication ${externalId}`);
    return {
      content: [
        { type: "text", text: JSON.stringify({ status: pub.kind === "published" ? "live" : "draft", publishedUrl: pub.publishedUrl ?? null }) },
      ],
    };
  },
);

const app = express();
app.use(express.json());

// Header-auth gate matching TrueForge's connector auth model.
app.use("/mcp", (req, res, next) => {
  const auth = req.headers.authorization ?? "";
  if (auth !== `Bearer ${REQUIRED_TOKEN}`) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }
  next();
});

app.all("/mcp", async (req, res) => {
  const sessionId = req.headers["mcp-session-id"];
  let transport;
  if (sessionId && transports[sessionId]) {
    transport = transports[sessionId];
  } else if (req.method === "POST" && !sessionId) {
    transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      onsessioninitialized: (id) => {
        transports[id] = transport;
      },
    });
    transport.onclose = () => {
      if (transport.sessionId) delete transports[transport.sessionId];
    };
    await server.connect(transport);
  } else {
    res.status(400).json({ error: "missing or invalid session" });
    return;
  }
  await transport.handleRequest(req, res, req.body);
});

const transports = {};

app.listen(PORT, () => {
  console.log(`Mock CMS MCP listening on http://localhost:${PORT}/mcp`);
});
