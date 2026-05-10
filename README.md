# Promptimize

> **Optimize prompts before they cost you.**

Promptimize is a memory-aware AI cost optimizer for developers. It scans codebases for expensive LLM prompts, estimates token usage and projected spend, optimizes prompts using AI, and tracks how every Git commit affects AI cost and performance.

With **Backboard.io** memory, Promptimize remembers project context, prompt intent, previous optimizations, and cost regressions to make future optimizations smarter over time.

---

## Problem

AI applications are easy to build but hard to control financially. Developers write long prompts, use expensive models, or introduce bloated AI workflows without realizing the cost impact. Existing tools catch syntax and security issues — but nothing warns you when a commit makes your AI application 50% more expensive.

## Solution

Promptimize brings AI cost intelligence directly into the developer workflow:

- **Scan** your codebase for LLM API calls and hardcoded prompts
- **Estimate** token usage and projected monthly AI cost
- **Optimize** prompts using Gemini to reduce token spend
- **Track** cost changes across every Git commit
- **Remember** project rules and past optimizations with Backboard.io

---

## Key Features

| Feature | Description |
|---|---|
| Prompt Scanner | Detects OpenAI, Gemini, Claude API calls and long prompts |
| Token Estimator | Counts tokens using tiktoken with fallback approximation |
| Cost Calculator | Estimates monthly AI spend per prompt and per file |
| Prompt Optimizer | Uses Gemini to rewrite prompts for fewer tokens |
| Git CostDiff | Shows how each commit changes AI cost |
| Dashboard | Visual analytics for prompts, cost, and optimization history |
| VS Code Extension | Inline warnings and one-click optimization inside the editor |
| Backboard Memory | Remembers project context, rules, and past optimizations |

---

## Architecture

```
promptimize/
├── vscode-extension/        # VS Code extension (TypeScript)
├── web-dashboard/
│   ├── frontend/            # Next.js dashboard
│   └── backend/             # FastAPI backend
├── examples/
│   └── sample-ai-app/       # Demo app with expensive prompts
├── scripts/                 # CostDiff and seed scripts
└── docs/                    # Architecture and devpost docs
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| VS Code Extension | TypeScript, VS Code API |
| Frontend Dashboard | Next.js, TypeScript, Tailwind CSS, shadcn/ui, Recharts |
| Backend API | Python, FastAPI, Pydantic, Uvicorn |
| AI Optimization | Google Gemini API |
| Memory Layer | Backboard.io |
| Database | MongoDB Atlas |
| Token Counting | tiktoken (with fallback) |
| Git Integration | simple-git / Git CLI |

---

## Quick Start

### 1. Backend

```bash
cd web-dashboard/backend
cp .env.example .env
# Fill in your API keys in .env
python -m venv venv
source venv/bin/activate   # Windows: venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

Backend runs at: http://localhost:8000

### 2. Frontend Dashboard

```bash
cd web-dashboard/frontend
cp .env.example .env.local
npm install
npm run dev
```

Dashboard runs at: http://localhost:3000

### 3. VS Code Extension

```bash
cd vscode-extension
npm install
npm run compile
# Press F5 in VS Code to launch extension host
```

### 4. Run Demo

```
1. Open examples/sample-ai-app in the VS Code extension host
2. Press Ctrl+Shift+P → "Promptimize: Scan Workspace"
3. Watch warnings appear on expensive prompts
4. Highlight a prompt → "Promptimize: Optimize Selected Prompt"
5. See before/after token savings
6. Open http://localhost:3000/dashboard to view analytics
```

---

## Environment Variables

### Backend (`web-dashboard/backend/.env`)

```env
GEMINI_API_KEY=your_gemini_key
BACKBOARD_API_KEY=your_backboard_key
BACKBOARD_PROJECT_ID=your_project_id
MONGODB_URI=mongodb+srv://...
MONGODB_DB_NAME=promptimize
CORS_ORIGINS=http://localhost:3000
DEFAULT_MONTHLY_CALLS=10000
DEFAULT_OUTPUT_TOKEN_ESTIMATE=700
```

### Frontend (`web-dashboard/frontend/.env.local`)

```env
NEXT_PUBLIC_API_URL=http://localhost:8000
```

> **Note:** All API keys are optional for local development. The app will use mock/fallback behavior when keys are missing.

---

## API Routes

| Method | Route | Description |
|---|---|---|
| GET | `/health` | Health check |
| POST | `/scan` | Scan files for prompts |
| POST | `/optimize` | Optimize a prompt |
| POST | `/cost-diff` | Compare two commit scans |
| GET | `/dashboard/{projectId}` | Dashboard analytics |
| POST | `/memory/project-context` | Save project memory |
| GET | `/memory/{projectId}/insights` | Get memory insights |

---

## Backboard Memory

Promptimize uses Backboard.io as an intelligent memory layer:

- **Project context** — preferred models, budget, optimization style
- **Prompt intent** — what each prompt is supposed to accomplish
- **Accepted optimizations** — patterns that worked before
- **Cost regressions** — files that repeatedly caused cost spikes
- **Developer preferences** — rules like "never compress legal prompts"

Memory is used during optimization so Gemini has full context before rewriting a prompt.

---

## Future Improvements

- Tree-sitter / Babel AST parser (replace regex scanner)
- GitHub Actions PR comment with CostDiff report
- Husky pre-push hook to block budget-exceeding commits
- Multi-project support
- Team dashboards
- Support for Anthropic and Mistral pricing
- OpenTelemetry for latency tracking
- Fine-tuned optimization model

---

Built at GDG Hacks 2026.
