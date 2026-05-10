# Promptimize — Devpost Submission

## Project Name
Promptimize

## Tagline
Optimize prompts before they cost you.

---

## Problem

AI applications are easy to build but hard to control financially. Developers often write long prompts, use expensive models, or introduce slow AI workflows without realizing the cost impact. Existing tools catch syntax and security issues, but they do not warn developers when a commit makes their AI application more expensive.

The result: AI bills that grow invisibly, commit by commit, prompt by prompt — with no tooling to catch the regression before it ships.

---

## Solution

Promptimize brings AI cost intelligence directly into the developer workflow.

It scans codebases for LLM prompts, estimates token usage and cost, optimizes prompts to reduce spend, and tracks cost changes across Git commits. Backboard.io powers memory-aware optimization by remembering prompt intent, project rules, previous optimizations, and cost regressions.

Think of it as:
- A **linter for AI cost** — warns you about expensive prompts as you write them
- **Git blame for your AI bill** — shows which commit and file caused the spike
- A **prompt optimizer** — rewrites prompts to reduce tokens without losing quality
- A **memory-aware AI spend controller** — gets smarter about your codebase over time

---

## What It Does

- Detects LLM API calls (OpenAI, Gemini, Claude) and long hardcoded prompts
- Estimates token usage and projected monthly AI cost per prompt and per file
- Optimizes prompts using Google Gemini to reduce token spend
- Tracks how each Git commit changes estimated AI cost (CostDiff)
- Shows a beautiful dashboard with analytics, cost charts, and optimization history
- Remembers project context, rules, and past optimizations with Backboard.io

---

## How We Built It

**VS Code Extension (TypeScript)**
- Scans workspace files for LLM API calls using regex detection
- Shows inline warnings on expensive prompts using VS Code Diagnostics
- Provides one-click prompt optimization via VS Code commands
- Sends data to the FastAPI backend

**FastAPI Backend (Python)**
- Accepts file contents and scans for prompts
- Counts tokens using tiktoken with a character-based fallback
- Estimates cost using a pricing map for GPT-4o, Gemini, Claude, and more
- Calls Gemini API to optimize prompts in multiple modes (aggressive, balanced, safe)
- Stores scan results and prompt data in MongoDB
- Wraps Backboard.io as an intelligent memory layer

**Next.js Dashboard**
- Landing page with product overview
- Dashboard with cost analytics, charts, and top expensive prompts
- Prompt comparison UI with before/after token savings
- Commit cost timeline (CostDiff visualization)
- Prompt optimization playground
- Memory insights page powered by Backboard.io

**Backboard.io Memory**
- Stores project-level context: budget, preferred models, optimization rules
- Remembers accepted and rejected optimization patterns
- Tracks cost regressions across commits
- Enriches Gemini optimization requests with project-specific memory

**MongoDB Atlas**
- Stores structured scan records indexed by project and commit hash
- Stores prompt metadata, optimization results, and cost history

---

## Challenges

- Building a regex-based prompt scanner accurate enough to detect diverse LLM API patterns across TypeScript, Python, and JSON files
- Making the Gemini optimization robust to different prompt styles while preserving intent
- Designing the Backboard.io integration with a clean fallback so the app works even without credentials
- Making CostDiff meaningful by comparing scans at the commit level

---

## Accomplishments

- A working end-to-end flow: scan codebase → detect prompts → estimate cost → optimize → view dashboard
- Memory-aware optimization that becomes smarter with each project interaction
- A clean developer tool aesthetic that feels production-ready
- Git CostDiff that quantifies the exact financial impact of each commit

---

## What We Learned

- Token pricing varies by 40x across models — small model choices have a massive cost impact
- Most developer prompts have 30–50% redundancy that can be safely removed
- Memory-aware optimization significantly improves output quality vs stateless optimization
- Developer tools need to work without credentials to be hackathon-demo-friendly

---

## Impact

Promptimize helps developers reduce AI waste before deployment and understand exactly which prompts, files, and commits drive AI spend. In a world where AI API costs are becoming a significant line item for startups and enterprises alike, Promptimize makes cost control a first-class part of the developer workflow.

---

## Tech Stack

- TypeScript, VS Code Extension API
- Python, FastAPI, Pydantic, Uvicorn
- Next.js, Tailwind CSS, shadcn/ui, Recharts
- Google Gemini API
- Backboard.io
- MongoDB Atlas
- tiktoken
- simple-git

---

Built at GDG Hacks 2026.
