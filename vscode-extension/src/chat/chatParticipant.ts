import * as vscode from "vscode";
import { optimizePrompt } from "../api/backendClient";

const MODEL_PRICING: Record<string, { input: number; output: number; label: string }> = {
  "gpt-4o":            { input: 2.50,  output: 10.00, label: "GPT-4o"            },
  "gpt-4o-mini":       { input: 0.15,  output: 0.60,  label: "GPT-4o Mini"       },
  "gpt-4-turbo":       { input: 10.00, output: 30.00, label: "GPT-4 Turbo"       },
  "claude-3-5-sonnet": { input: 3.00,  output: 15.00, label: "Claude 3.5 Sonnet" },
  "claude-3-haiku":    { input: 0.25,  output: 1.25,  label: "Claude 3 Haiku"    },
  "claude-3-opus":     { input: 15.00, output: 75.00, label: "Claude 3 Opus"     },
  "gemini-1.5-pro":    { input: 1.25,  output: 5.00,  label: "Gemini 1.5 Pro"    },
  "gemini-1.5-flash":  { input: 0.075, output: 0.30,  label: "Gemini 1.5 Flash"  },
};

const DEFAULT_MODEL = "gpt-4o";
const MONTHLY_CALLS = 10_000;

function estimateTokens(text: string): number {
  return Math.max(1, Math.floor(text.length / 4));
}

function detectModel(text: string): string {
  const lower = text.toLowerCase();
  for (const key of Object.keys(MODEL_PRICING)) {
    if (lower.includes(key)) return key;
  }
  return DEFAULT_MODEL;
}

function getRisk(tokens: number): string {
  if (tokens < 300) return "🟢 LOW";
  if (tokens < 900) return "🟡 MEDIUM";
  return "🔴 HIGH";
}

function heuristicOptimize(text: string): { optimized: string; savings: number } {
  let out = text
    .replace(/\bplease\b/gi, "")
    .replace(/\bcould you\b/gi, "")
    .replace(/\bcan you\b/gi, "")
    .replace(/\bi would like you to\b/gi, "")
    .replace(/\bi want you to\b/gi, "")
    .replace(/\bkindly\b/gi, "")
    .replace(/\bmake sure to\b/gi, "")
    .replace(/\bit is important that\b/gi, "")
    .replace(/\bplease note that\b/gi, "")
    .replace(/\bas an? (?:ai|language model|assistant)\b[^.]*\./gi, "")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  const origTokens = estimateTokens(text);
  const optTokens  = estimateTokens(out);
  const savings    = origTokens > 0 ? Math.round(((origTokens - optTokens) / origTokens) * 100) : 0;
  return { optimized: out, savings };
}

export function registerChatParticipant(context: vscode.ExtensionContext): void {
  const participant = vscode.chat.createChatParticipant(
    "promptimize.chat",
    async (
      request: vscode.ChatRequest,
      _ctx: vscode.ChatContext,
      response: vscode.ChatResponseStream,
      token: vscode.CancellationToken
    ) => {
      const userMessage = request.prompt.trim();

      if (!userMessage) {
        response.markdown(
          "Paste your prompt or refactoring request and I'll analyze the token cost before you send it.\n\n" +
          "**Example:**\n```\n@promptimize Refactor the summarizeDocument function to reduce the system prompt and use streaming\n```"
        );
        return;
      }

      const tokens  = estimateTokens(userMessage);
      const model   = detectModel(userMessage);
      const pricing = MODEL_PRICING[model];
      const outputTokens  = Math.max(500, Math.floor(tokens * 0.6));
      const costPerCall   = (tokens / 1_000_000) * pricing.input + (outputTokens / 1_000_000) * pricing.output;
      const monthlyCost   = costPerCall * MONTHLY_CALLS;
      const risk          = getRisk(tokens);

      // ── Cost breakdown ──────────────────────────────────────────
      response.markdown(`## ⚡ Promptimize — Cost Analysis\n\n`);
      response.markdown(
        `| | |\n` +
        `|---|---|\n` +
        `| **Tokens** | \`${tokens.toLocaleString()}\` |\n` +
        `| **Model** | ${pricing.label} |\n` +
        `| **Cost / call** | $${costPerCall.toFixed(4)} |\n` +
        `| **Monthly** (${MONTHLY_CALLS.toLocaleString()} calls) | **$${monthlyCost.toFixed(2)}** |\n` +
        `| **Risk** | ${risk} |\n\n`
      );

      if (token.isCancellationRequested) return;

      // ── Optimization ─────────────────────────────────────────────
      response.markdown(`---\n\n`);

      let optimizedPrompt = "";
      let savingsPercent  = 0;
      let monthlySavings  = 0;
      let explanation     = "";

      const projectId = vscode.workspace.workspaceFolders?.[0]
        ? require("path").basename(vscode.workspace.workspaceFolders[0].uri.fsPath)
        : "promptimize";

      try {
        const result = await optimizePrompt(projectId, userMessage, model, "balanced");
        optimizedPrompt = result.optimizedPrompt;
        savingsPercent  = result.savingsPercent;
        monthlySavings  = result.estimatedMonthlySavings;
        explanation     = result.explanation;
      } catch {
        // Backend offline — fall back to heuristic
        const h = heuristicOptimize(userMessage);
        optimizedPrompt = h.optimized;
        savingsPercent  = h.savings;
        const optTokens = estimateTokens(optimizedPrompt);
        const optCost   = (optTokens / 1_000_000) * pricing.input + (outputTokens / 1_000_000) * pricing.output;
        monthlySavings  = (costPerCall - optCost) * MONTHLY_CALLS;
        explanation     = "Removed filler phrases and redundant qualifiers. Connect the backend for AI-powered optimization.";
      }

      if (token.isCancellationRequested) return;

      if (savingsPercent > 0) {
        response.markdown(
          `### Optimized prompt — saves ${savingsPercent}% tokens ($${monthlySavings.toFixed(2)}/mo)\n\n` +
          `> *${explanation}*\n\n` +
          `\`\`\`\n${optimizedPrompt}\n\`\`\`\n\n`
        );
      } else {
        response.markdown(`*Prompt is already concise — no significant savings found.*\n\n`);
      }

      // Follow-up actions
      response.button({
        command: "promptimize.openDashboard",
        title: "Open Dashboard",
      });
    }
  );

  participant.iconPath = new vscode.ThemeIcon("zap");
  context.subscriptions.push(participant);
}
