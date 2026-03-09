/**
 * CounselView Backend Server
 *
 * Lightweight API proxy that keeps the Anthropic API key server-side.
 * Exposes legal AI endpoints consumed by the Even Hub frontend.
 *
 * Stack: Hono (fast, works on Bun/Node/Cloudflare Workers/Vercel)
 */

import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import Anthropic from "@anthropic-ai/sdk";

const app = new Hono();
const client = new Anthropic(); // reads ANTHROPIC_API_KEY from env

// --- Config ---
const FAST_MODEL = "claude-haiku-4-5-20251001";
const SMART_MODEL = "claude-sonnet-4-6";
const PORT = parseInt(process.env.PORT || "3001");
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || "*";

// --- CORS ---
app.use(
  "*",
  cors({
    origin: ALLOWED_ORIGIN,
    allowMethods: ["GET", "POST"],
    allowHeaders: ["Content-Type"],
  })
);

// --- Health check ---
app.get("/", (c) => c.json({ status: "ok", service: "counselview" }));
app.get("/health", (c) => c.json({ status: "ok" }));

// --- Glasses display constraint ---
const GLASSES_CONSTRAINT = `CRITICAL: Max 280 chars total. Short lines (~36 chars). Max 8 lines. No disclaimers. No caveats. Direct answers only.`;

// --- Generic legal query ---
app.post("/api/legal", async (c) => {
  const { system, message, fast } = await c.req.json<{
    system: string;
    message: string;
    fast?: boolean;
  }>();

  const response = await client.messages.create({
    model: fast ? FAST_MODEL : SMART_MODEL,
    max_tokens: 250,
    system: system || `You are a litigation support AI on AR glasses. ${GLASSES_CONSTRAINT}`,
    messages: [{ role: "user", content: message }],
  });

  const text = response.content[0].type === "text" ? response.content[0].text : "";
  return c.json({ text });
});

// --- Objection analysis (optimized for speed) ---
app.post("/api/objection", async (c) => {
  const { question } = await c.req.json<{ question: string }>();

  const response = await client.messages.create({
    model: FAST_MODEL,
    max_tokens: 150,
    system: `You analyze trial questions for objections.
${GLASSES_CONSTRAINT}
Format:
OBJECTION: [type]
Rule: FRE [#]
[one-line reason]

Types: Leading, Hearsay, Relevance, Speculation, Compound, Asked & Answered, Assumes Facts, Argumentative, Foundation, Best Evidence, Character

If NOT objectionable: "NO OBJECTION"`,
    messages: [{ role: "user", content: question }],
  });

  const text = response.content[0].type === "text" ? response.content[0].text : "";
  return c.json({ text });
});

// --- Legal search ---
app.post("/api/search", async (c) => {
  const { query, caseContext } = await c.req.json<{
    query: string;
    caseContext?: string;
  }>();

  const message = caseContext ? `Case: ${caseContext}\n\nQuery: ${query}` : query;

  const response = await client.messages.create({
    model: SMART_MODEL,
    max_tokens: 250,
    system: `You are a litigation support AI on AR glasses during live proceedings.
${GLASSES_CONSTRAINT}
For case law: case name, cite, one-line holding.
For statutes: section + key language.
For rules: number, title, critical clause.`,
    messages: [{ role: "user", content: message }],
  });

  const text = response.content[0].type === "text" ? response.content[0].text : "";
  return c.json({ text });
});

// --- Impeachment check ---
app.post("/api/impeach", async (c) => {
  const { witness, priorTestimony, currentStatement } = await c.req.json<{
    witness: string;
    priorTestimony: string[];
    currentStatement?: string;
  }>();

  const priorText = priorTestimony.join("\n");
  const userMessage = currentStatement
    ? `Witness: ${witness}\nPrior testimony:\n${priorText}\n\nCurrent statement: "${currentStatement}"\nIdentify contradiction.`
    : `Witness: ${witness}\nPrior testimony:\n${priorText}\n\nKey impeachment points.`;

  const response = await client.messages.create({
    model: SMART_MODEL,
    max_tokens: 250,
    system: `You identify impeachment opportunities from prior testimony.
${GLASSES_CONSTRAINT}
Format: page cite + contradiction. Be specific.`,
    messages: [{ role: "user", content: userMessage }],
  });

  const text = response.content[0].type === "text" ? response.content[0].text : "";
  return c.json({ text });
});

// --- Statute / FRE lookup ---
app.post("/api/statute", async (c) => {
  const { query, knownStatutes } = await c.req.json<{
    query: string;
    knownStatutes?: string[];
  }>();

  const context = knownStatutes?.length
    ? `Known case statutes:\n${knownStatutes.join("\n")}\n\n`
    : "";

  const response = await client.messages.create({
    model: SMART_MODEL,
    max_tokens: 250,
    system: `You provide statute and rule references for trial lawyers.
${GLASSES_CONSTRAINT}
Give: section number, title, key operative language.
For FRE: rule number + most critical clause.`,
    messages: [{ role: "user", content: `${context}Lookup: ${query}` }],
  });

  const text = response.content[0].type === "text" ? response.content[0].text : "";
  return c.json({ text });
});

// --- Follow-up suggestion ---
app.post("/api/followup", async (c) => {
  const { witnessAnswer, topic } = await c.req.json<{
    witnessAnswer: string;
    topic: string;
  }>();

  const response = await client.messages.create({
    model: SMART_MODEL,
    max_tokens: 250,
    system: `You suggest follow-up examination questions.
${GLASSES_CONSTRAINT}
Give 2-3 short follow-ups.
Focus on pinning down vague answers and exposing inconsistencies.`,
    messages: [
      {
        role: "user",
        content: `Topic: ${topic}\nWitness said: "${witnessAnswer}"\nSuggest follow-ups.`,
      },
    ],
  });

  const text = response.content[0].type === "text" ? response.content[0].text : "";
  return c.json({ text });
});

// --- Start ---
serve({ fetch: app.fetch, port: PORT }, (info) => {
  console.log(`CounselView server running on http://localhost:${info.port}`);
});
