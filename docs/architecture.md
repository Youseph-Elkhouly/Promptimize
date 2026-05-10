# Promptimize — Architecture

## Overview

```
┌─────────────────────────────────────────────────────────┐
│                   Developer Workflow                    │
│                                                         │
│  ┌──────────────┐    ┌──────────────┐                  │
│  │ VS Code Ext  │    │   Git Hook   │                  │
│  │ (TypeScript) │    │  (pre-push)  │                  │
│  └──────┬───────┘    └──────┬───────┘                  │
│         │                  │                            │
└─────────┼──────────────────┼────────────────────────────┘
          │                  │
          ▼                  ▼
┌─────────────────────────────────────────────────────────┐
│               FastAPI Backend (:8000)                   │
│                                                         │
│  /scan → PromptScanner → TokenService → CostService    │
│  /optimize → BackboardMemory → GeminiAPI               │
│  /cost-diff → ScanRepository → DiffCalculator          │
│  /dashboard → DashboardService                         │
│  /memory → BackboardMemoryService                      │
│                                                         │
└──────────┬───────────────────────┬──────────────────────┘
           │                       │
     ┌─────▼──────┐        ┌───────▼──────┐
     │  MongoDB   │        │ Backboard.io │
     │   Atlas    │        │   Memory     │
     └────────────┘        └──────────────┘
           │
     ┌─────▼──────────────────────────────┐
     │     Next.js Dashboard (:3000)      │
     │                                    │
     │  /dashboard  — Cost analytics      │
     │  /prompts    — Prompt table        │
     │  /commits    — CostDiff timeline   │
     │  /playground — Optimize prompts    │
     │  /memory     — Backboard insights  │
     └────────────────────────────────────┘
```

## Data Flow

### Scan Flow
1. VS Code extension reads workspace files
2. Sends file contents to `POST /scan`
3. Backend runs regex scanner across each file
4. Token counts and costs estimated per prompt
5. Results stored in MongoDB with commit hash
6. Extension shows inline diagnostics
7. Dashboard updated with new scan data

### Optimize Flow
1. User selects a prompt (extension or playground)
2. Request sent to `POST /optimize`
3. Backend retrieves Backboard memory for project
4. Memory + prompt sent to Gemini API
5. Gemini returns optimized prompt as JSON
6. Token savings calculated
7. Result stored in MongoDB and Backboard memory
8. Before/after shown to user

### CostDiff Flow
1. Triggered by git push hook or manual command
2. `POST /cost-diff` with previous and current commit hashes
3. Backend loads both scan records from MongoDB
4. Calculates token and cost deltas per file and per prompt
5. Returns structured diff with causes and recommendations
6. Dashboard shows commit cost timeline

## Services

| Service | Responsibility |
|---|---|
| `prompt_scanner.py` | Regex-based detection of LLM API calls in source files |
| `token_service.py` | Token counting via tiktoken or character estimate |
| `cost_service.py` | Monthly cost estimation using model pricing map |
| `prompt_optimizer.py` | Gemini-powered prompt rewriting |
| `git_cost_service.py` | Commit-level cost comparison |
| `backboard_memory_service.py` | Backboard.io memory read/write wrapper |
| `dashboard_service.py` | Aggregates data for dashboard endpoints |

## Database Schema (MongoDB)

### `scans` collection
```json
{
  "_id": "ObjectId",
  "scanId": "scan_abc123",
  "projectId": "project_123",
  "commitHash": "abc123",
  "branch": "main",
  "timestamp": "ISO8601",
  "totalPrompts": 3,
  "totalInputTokens": 4200,
  "estimatedMonthlyCost": 120.50,
  "prompts": [...]
}
```

### `prompts` collection
```json
{
  "_id": "ObjectId",
  "promptId": "prompt_1",
  "scanId": "scan_abc123",
  "projectId": "project_123",
  "filePath": "src/agents/supportAgent.ts",
  "startLine": 12,
  "endLine": 28,
  "model": "gpt-4o",
  "inputTokens": 1240,
  "estimatedOutputTokens": 850,
  "estimatedCostPerRequest": 0.0098,
  "estimatedMonthlyCost": 98.00,
  "riskLevel": "high",
  "snippet": "...",
  "optimizations": [...]
}
```

### `optimizations` collection
```json
{
  "_id": "ObjectId",
  "promptId": "prompt_1",
  "projectId": "project_123",
  "originalPrompt": "...",
  "optimizedPrompt": "...",
  "originalTokens": 1240,
  "optimizedTokens": 690,
  "savingsPercent": 44.3,
  "mode": "balanced",
  "accepted": true,
  "timestamp": "ISO8601"
}
```
