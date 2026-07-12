# WPAI X Tech Bot

Local automation dashboard for X (Twitter). On a jittered schedule it searches X for AI/dev posts
matching your keywords, uses a **local Ollama model** to draft a persona-styled reply, and queues
it. **Nothing is ever posted automatically** — a reply only goes live when *you* click *Approve &
Post*. No cloud AI API.

- **Brain:** local Ollama (`qwen2.5:7b` by default — fast; swap via `OLLAMA_MODEL`) via the `ollama-engine` container — no keys, no cloud calls.
- **X access:** `twitter-api-v2` (OAuth 1.0a user context). Real search + reply, gated behind **Live mode**.
- **Safety:** auto-posting is disabled server-side. Draft → human approve is the only path to X.

## Prerequisites

- Node.js
- Docker with the `ollama-engine` container running (`qwen2.5:7b` pulled; any Ollama chat model works)
- An X developer app (for Live mode) — see below

## Run locally

1. Install deps: `npm install`
2. Configure `.env.local` (gitignored — copied from `.env.example`):
   - `OLLAMA_URL` / `OLLAMA_MODEL` (defaults are fine for the local `ollama-engine`)
   - For **Live mode** only: paste your X app's four OAuth 1.0a values —
     `X_API_KEY`, `X_API_SECRET`, `X_ACCESS_TOKEN`, `X_ACCESS_TOKEN_SECRET`
     (from your X app's *Keys and tokens* page). Leave blank to stay in Sandbox mode.
3. Run: `npm run dev` → http://localhost:3000

## Modes

- **Sandbox** (default): Ollama simulates realistic tech tweets and drafts replies locally. Never touches X. Great for tuning your persona/keywords.
- **Live**: real X search + real replies. Requires the four X credentials. Even in Live mode, replies are drafted and **only posted on your explicit approval**.

## Credentials & safety

- Real secrets live only in `.env.local`, which is gitignored. Never commit them; never paste them into the UI logs.
- Creating the X app and its credentials, and the account the bot posts as, are yours to manage.
- Auto-posting is intentionally not available — this bot drafts, you decide.

## Scripts

- `npm run dev` — dev server (Vite middleware + Express API)
- `npm run build` — build client + bundle server
- `npm run start` — run the production bundle
- `npm run lint` — `tsc --noEmit`
