# ApplicantStack Help Desk

An internal help form for ApplicantStack problems. An employee picks the product (Recruit or Onboard), their role and the problem area, describes the issue, and gets back a likely cause, checks, a fix and when to escalate. Every step cites the ApplicantStack Help Center article it came from.

## How it works

- `public/index.html` is the page. It searches the copied Help Center articles in `public/kb.json` in the browser and picks the best 6 matches.
- `api/ask.js` is a Vercel function. It checks the team password, rebuilds the article excerpts from its own copy (`data/kb.json`, so only Help Center text reaches the prompt), and asks Claude (`claude-opus-5-5`) for a grounded answer.
- If Claude can't answer, the page still shows the best-matching articles and a link to ApplicantStack support.

## Running it

- **Hostinger, or any host that runs `npm start`:** `server.js` serves the page and the `/api/ask` endpoint. Set the entry file to `server.js` if the host asks for one.
- **Vercel:** deploys `public/` and `api/ask.js` as is (see `vercel.json`).

## Settings (environment variables in your host's dashboard)

| Name | What it is |
|---|---|
| `ANTHROPIC_API_KEY` | An API key from console.anthropic.com. Usage is billed to that account. |
| `APP_PASSWORD` | The shared team password employees type once per device. Leave unset to allow anyone with the link. |

Redeploy after changing either one.

## Updating the articles

Re-copy the Help Center into the project's `knowledge/kb/articles/`, rebuild `kb.json`, and copy it to both `public/kb.json` and `data/kb.json`.
