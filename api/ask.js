import Anthropic from "@anthropic-ai/sdk";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { timingSafeEqual, createHash } from "node:crypto";

// The Help Center copy ships with the function (see vercel.json includeFiles).
const KB = new Map(
  JSON.parse(readFileSync(join(process.cwd(), "data", "kb.json"), "utf8")).map((a) => [a.n, a]),
);

const client = new Anthropic(); // reads ANTHROPIC_API_KEY from the Vercel environment

const MAX_ARTICLES = 6;
const MAX_EXCERPT = 7000;
const MAX_DESC = 2000;

function samePassword(given) {
  const expected = process.env.APP_PASSWORD;
  if (!expected) return true; // no password configured
  const a = createHash("sha256").update(String(given || "")).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

const clean = (s, max) => String(s ?? "").replace(/\s+/g, " ").trim().slice(0, max);

function buildContext(articles) {
  let out = "";
  const used = [];
  for (const item of (Array.isArray(articles) ? articles : []).slice(0, MAX_ARTICLES)) {
    const a = KB.get(String(item?.n || ""));
    if (!a || used.includes(a.n)) continue;
    // Excerpts must be verbatim pieces of the article, so nothing but Help Center text reaches the prompt.
    const parts = (Array.isArray(item.excerpts) ? item.excerpts : [])
      .map(String)
      .filter((x) => x && a.b.includes(x));
    let body = a.b.length <= 6000 || !parts.length ? a.b : parts.join("\n...\n");
    body = body.slice(0, MAX_EXCERPT);
    out += `\n\n=== ARTICLE ${a.n} ===\nTitle: ${a.t}\nArticle #: ${a.n}\nTopics: ${a.g}\n---\n${body}`;
    used.push(a.n);
  }
  return { text: out, used };
}

function prompt(ctx, form) {
  return `You are the internal ApplicantStack help desk for employees of one company. Diagnose the employee's problem using ONLY the Help Center article excerpts below. Do not use outside knowledge about ApplicantStack or any other product. Every step, setting name, menu path and limitation you state must come from an excerpt.

Employee context:
- Product: ${form.product}
- Role: ${form.role}
- Problem area: ${form.area}
- Description: """${form.desc}"""

Rules:
- If the excerpts do not actually address this problem, set "covered" to false, leave the step lists empty, and use "headline" to say plainly that the Help Center articles don't cover it and the employee should contact ApplicantStack support.
- Steps and permissions differ by product and role. If a fix needs a permission the employee's role may not have (for example a Hiring Manager changing setup), say they should ask their ApplicantStack Administrator to do that step.
- If the excerpts mention a third party (Indeed, other job boards, ADP, Namely, Verified First, a calendar provider), say what ApplicantStack controls and what the partner controls.
- If the product or role is "Not sure", note where the answer would differ.
- Keep each step to one or two plain sentences, written to the employee ("Open Setup > ...").
- Every item must cite 1-2 article numbers from the excerpts in "sources", plus the section heading if one applies. Never cite an article that is not below.
- "escalate" lists when to stop and contact ApplicantStack support (or the partner), grounded in the excerpts where possible; if an item is general advice not from an article, give it an empty "sources" list.

Reply with only JSON in this shape:
{"covered":true,"headline":"one-sentence diagnosis","note":"optional caveat about role/product, or empty string","cause":[{"text":"...","sources":["000004203"],"section":"optional heading"}],"checks":[...],"fix":[...],"escalate":[...]}

Help Center excerpts:${ctx}`;
}

function parseJson(text) {
  try { return JSON.parse(text); } catch {}
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) { try { return JSON.parse(fence[1]); } catch {} }
  const i = text.indexOf("{"), j = text.lastIndexOf("}");
  if (i >= 0 && j > i) { try { return JSON.parse(text.slice(i, j + 1)); } catch {} }
  return null;
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ code: "method_not_allowed" });
  if (!samePassword(req.headers["x-app-password"])) return res.status(401).json({ code: "bad_password" });

  const body = req.body || {};
  const form = {
    product: clean(body.form?.product, 40) || "Not sure",
    role: clean(body.form?.role, 40) || "Not sure",
    area: clean(body.form?.area, 80) || "Not specified",
    desc: clean(body.form?.desc, MAX_DESC),
  };
  if (!process.env.ANTHROPIC_API_KEY) return res.status(500).json({ code: "server_misconfigured" });
  if (form.desc.length < 8) return res.status(400).json({ code: "no_description" });

  const ctx = buildContext(body.articles);
  if (!ctx.used.length) return res.status(400).json({ code: "no_articles" });

  try {
    const response = await client.beta.messages.create({
      model: "claude-opus-5-5",
      max_tokens: 16000,
      output_config: { effort: "medium" },
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      messages: [{ role: "user", content: prompt(ctx.text, form) }],
    });
    if (response.stop_reason === "refusal") return res.status(200).json({ code: "refused", used: ctx.used });
    const text = response.content.filter((b) => b.type === "text").map((b) => b.text).join("");
    const result = parseJson(text);
    if (!result || typeof result !== "object") return res.status(502).json({ code: "invalid_json" });
    return res.status(200).json({ result, used: ctx.used });
  } catch (error) {
    if (error instanceof Anthropic.AuthenticationError) {
      console.error("Anthropic API key was rejected");
      return res.status(500).json({ code: "bad_api_key" });
    }
    if (error instanceof Anthropic.RateLimitError) return res.status(429).json({ code: "rate_limited" });
    if (error instanceof Anthropic.APIError) {
      console.error(`Anthropic API error ${error.status}:`, error.message);
      return res.status(502).json({ code: "upstream_error" });
    }
    console.error(error);
    return res.status(500).json({ code: "server_error" });
  }
}
