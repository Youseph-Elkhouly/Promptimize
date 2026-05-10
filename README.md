# Promptimize

> **Optimize prompts before they cost you.**

Promptimize is a developer-first AI cost intelligence platform. It instruments your codebase for expensive LLM prompts, estimates token usage and projected spend, rewrites prompts to be leaner without losing intent, and surfaces everything through a VS Code extension, a web dashboard, and a CLI — all in real time.

Built at **GDG Hacks 2026**.

---

## The Problem

AI applications are easy to ship and hard to control financially. Developers write verbose prompts full of filler phrases and redundant qualifiers, reach for expensive frontier models when smaller ones would do, and batch API calls in loops that multiply cost with every record processed — none of which shows up in a linter or a code review.

A single bloated 400-token prompt used 100,000 times a month on `gpt-4-turbo` costs:

$$
\frac{400}{10^6} \times \$10.00 \times 100{,}000 = \$400\text{/month}
$$

The same prompt, trimmed to 180 tokens, costs **$180/month** — a 55% reduction with identical output quality. Promptimize finds and closes that gap automatically.

---

## What It Does

| Capability | Where |
|---|---|
| Live token counter + per-call cost estimate | VS Code sidebar |
| Daily budget bar with colour-coded threshold | VS Code sidebar |
| Rule-based prompt optimizer (no API key needed) | VS Code sidebar |
| AI-powered optimizer via `vscode.lm` (Cursor) | VS Code sidebar |
| Click function name → jump to definition | VS Code API Calls tab |
| 14-day cost history graph per codebase | Web dashboard |
| Multi-codebase selector with per-repo filtering | Web dashboard |
| Project memory (context / constraint / preference) | Web dashboard |
| API call log with status, tokens, and cost | Web dashboard + sample app |
| Interactive cost analysis in the terminal | CLI |

---

## Architecture

```
promptimize/
├── vscode-extension/          # VS Code / Cursor extension
│   ├── src/
│   │   ├── extension.ts       # Activation, commands, chat participant
│   │   ├── providers/
│   │   │   └── PromptPanelView.ts   # Sidebar webview (optimizer + API calls tabs)
│   │   ├── services/
│   │   │   └── lmOptimizer.ts       # vscode.lm → smart rule-based fallback
│   │   └── api/
│   │       └── backendClient.ts     # FastAPI integration
│   └── dist/extension.js      # esbuild bundle
│
├── web-dashboard/
│   ├── frontend/              # Next.js 14 App Router
│   │   └── app/page.tsx       # Single-page dashboard
│   └── backend/               # FastAPI
│       └── app/main.py        # /optimize, /scan, /memory endpoints
│
├── examples/
│   └── sample-ai-app/
│       ├── app.ts             # Messy task manager + Gemini API calls
│       └── api-calls.json     # Live call log read by the extension
│
└── scripts/
    └── promptimize-cli.js     # Terminal cost analyser
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| VS Code Extension | TypeScript, VS Code Extension API, esbuild |
| Frontend | Next.js 14, React, Tailwind CSS, plain SVG |
| Backend | Python 3, FastAPI, Pydantic, Uvicorn |
| Memory layer | Backboard.io |
| Sample app | TypeScript, Node.js, Gemini REST API |
| CLI | Node.js (zero dependencies) |

---

## How the Optimizer Works

The extension runs optimization in two layers, falling back automatically:

**Layer 1 — `vscode.lm`**
Queries whichever AI model Cursor exposes to the extension host. Sends a structured system prompt and expects JSON back: `{ optimizedPrompt, explanation, savingsPercent }`.

**Layer 2 — `smartOptimize()` (always available)**
A deterministic TypeScript pipeline — no API key, no network call:

1. **Imperative conversion** — `"let's fix"` / `"we need to"` → `"Fix"`
2. **Filler removal** — strips `please`, `kindly`, `just`, `simply`, `basically`, `make sure to`, `ensure that`, `in order to`, `due to the fact that`, `it is important that`, and 15+ more patterns
3. **Verbose-to-concise substitution** — `"is able to"` → `"can"`, `"take into consideration"` → `"consider"`, `"at this point in time"` → `"now"`, etc.
4. **Semantic deduplication** — collapses repeated performance synonyms (`make it fast` + `improve performance` + `speed it up`) into a single directive
5. **Structural cleanup** — fixes whitespace artifacts, orphan punctuation, capitalisation

Savings percentage is calculated as:

$$
\text{savings} = \max\!\left(0,\ \frac{T_{\text{orig}} - T_{\text{opt}}}{T_{\text{orig}}} \times 100\right)
$$

Projected daily spend is derived from the per-call cost across estimated monthly volume:

$$
C_{\text{call}} = \frac{T_{\text{in}}}{10^6} \cdot P_{\text{in}} + \frac{\max(500,\, 2 T_{\text{in}})}{10^6} \cdot P_{\text{out}}
$$

$$
C_{\text{daily}} = \frac{C_{\text{call}} \times N_{\text{monthly}}}{30}
$$

---

## Quick Start

### 1. VS Code Extension

```bash
cd vscode-extension
npm install
npm run build
# Press F5 in Cursor / VS Code to open the Extension Development Host
# Open examples/sample-ai-app as the workspace
```

The sidebar panel (⚡ in the activity bar) opens automatically.

### 2. Sample App

```bash
cd examples/sample-ai-app
npm install
# Optional — add your Gemini key for live calls:
export GEMINI_API_KEY=your_key
npx ts-node app.ts
# Logs are written to api-calls.json and appear in the extension's API Calls tab
```

### 3. Web Dashboard

```bash
# Frontend
cd web-dashboard/frontend
npm install
npm run dev
# → http://localhost:3000

# Backend (optional — required only for AI-powered optimize modal)
cd web-dashboard/backend
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

### 4. CLI

```bash
# One-shot
node scripts/promptimize-cli.js "your prompt here"

# Interactive
node scripts/promptimize-cli.js
```

---

## Environment Variables

**`web-dashboard/backend/.env`**

```env
GEMINI_API_KEY=                        # Optional — powers the /optimize endpoint
BACKBOARD_API_KEY=                     # Backboard.io memory layer
BACKBOARD_PROJECT_ID=promptimize
MONGODB_URI=                           # Optional — persists call history
MONGODB_DB_NAME=promptimize
PROMPTIMIZE_DEFAULT_MONTHLY_CALLS=100000
PROMPTIMIZE_COST_BUDGET_MONTHLY=1000
```

**`web-dashboard/frontend/.env.local`**

```env
NEXT_PUBLIC_API_URL=http://localhost:8000
```

> All keys are optional for local development. The extension and CLI run entirely offline using the rule-based optimizer.

---

## API Reference

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/health` | Liveness check |
| `POST` | `/optimize` | Rewrite a prompt for fewer tokens |
| `POST` | `/scan` | Scan a file or directory for LLM calls |
| `GET` | `/dashboard/{projectId}` | Aggregated cost analytics |
| `POST` | `/memory/project-context` | Persist a project memory entry |
| `GET` | `/memory/{projectId}/insights` | Retrieve memory for a project |

---

## Model Pricing Reference

| Model | Input ($/1M tok) | Output ($/1M tok) |
|---|---|---|
| gpt-4-turbo | $10.00 | $30.00 |
| gpt-4o | $2.50 | $10.00 |
| gpt-4o-mini | $0.15 | $0.60 |
| claude-3-opus | $15.00 | $75.00 |
| claude-3-5-sonnet | $3.00 | $15.00 |
| claude-3-haiku | $0.25 | $1.25 |
| gemini-1.5-pro | $1.25 | $5.00 |
| gemini-1.5-flash | $0.075 | $0.30 |
| gpt-3.5-turbo | $0.50 | $1.50 |

---

## Roadmap

- [ ] AST-based scanner (Tree-sitter / Babel) to replace regex heuristics
- [ ] GitHub Actions integration — post CostDiff as a PR comment
- [ ] Husky pre-push hook — block commits that exceed budget threshold
- [ ] OpenTelemetry support for latency + cost tracing
- [ ] Fine-tuned optimization model trained on accepted rewrites
- [ ] Team dashboards with per-developer cost attribution
- [ ] Support for Anthropic and Mistral pricing tiers
- [ ] Streaming token counter (real-time output cost)

---

## License

MIT
