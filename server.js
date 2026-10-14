// Standalone Node server for hosts that run `npm start` (Hostinger, Render, a VPS).
// Serves public/ and routes POST /api/ask to the same handler Vercel uses.
import http from "node:http";
import { readFile } from "node:fs/promises";
import { join, normalize, extname, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import "./load-env.js";
import handler from "./api/ask.js";

const PUBLIC = join(dirname(fileURLToPath(import.meta.url)), "public");
const TYPES = { ".html": "text/html; charset=utf-8", ".json": "application/json", ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".svg": "image/svg+xml", ".ico": "image/x-icon" };
const MAX_BODY = 256 * 1024;

function shim(res) {
  const r = {
    status(code) { res.statusCode = code; return r; },
    json(obj) { res.setHeader("content-type", "application/json"); res.end(JSON.stringify(obj)); return r; },
  };
  return r;
}

async function readJson(req) {
  let size = 0;
  const chunks = [];
  for await (const c of req) {
    size += c.length;
    if (size > MAX_BODY) throw new Error("too_large");
    chunks.push(c);
  }
  return chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : {};
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");
  if (url.pathname === "/api/ask") {
    if (req.method === "POST") {
      try { req.body = await readJson(req); } catch { return shim(res).status(400).json({ code: "bad_request" }); }
    }
    return handler(req, shim(res));
  }
  if (req.method !== "GET" && req.method !== "HEAD") { res.statusCode = 405; return res.end(); }
  const rel = normalize(decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname)).replace(/^(\.\.[/\\])+/, "");
  const file = join(PUBLIC, rel);
  if (!file.startsWith(PUBLIC)) { res.statusCode = 404; return res.end(); }
  try {
    const data = await readFile(file);
    res.setHeader("content-type", TYPES[extname(file)] || "application/octet-stream");
    res.setHeader("x-robots-tag", "noindex");
    res.end(req.method === "HEAD" ? undefined : data);
  } catch {
    res.statusCode = 404;
    res.end("Not found");
  }
});

const port = Number(process.env.PORT) || 3000;
server.listen(port, () => console.log(`ApplicantStack Help Desk listening on ${port}`));
