import * as vscode from "vscode";

// Per-million-token pricing (input / output) for common models
const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  "gpt-4o":           { input: 2.50,  output: 10.00 },
  "gpt-4o-mini":      { input: 0.15,  output: 0.60  },
  "gpt-4-turbo":      { input: 10.00, output: 30.00 },
  "gpt-3.5-turbo":    { input: 0.50,  output: 1.50  },
  "gemini-1.5-pro":   { input: 1.25,  output: 5.00  },
  "gemini-1.5-flash": { input: 0.075, output: 0.30  },
  "gemini-2.0-flash": { input: 0.10,  output: 0.40  },
  "claude-3-5-sonnet":{ input: 3.00,  output: 15.00 },
  "claude-3-haiku":   { input: 0.25,  output: 1.25  },
  "claude-3-opus":    { input: 15.00, output: 75.00 },
};

const DEFAULT_MONTHLY_CALLS = 10_000;

function estimateTokens(text: string): number {
  return Math.max(1, Math.floor(text.length / 4));
}

function getPricing(model: string): { input: number; output: number } {
  const lower = model.toLowerCase();
  for (const [key, price] of Object.entries(MODEL_PRICING)) {
    if (lower.includes(key)) return price;
  }
  return MODEL_PRICING["gpt-4o"]; // default
}

export interface PromptFinding {
  range: vscode.Range;
  tokens: number;
  outputTokens: number;
  model: string;
  costPerRequest: number;
  monthlyCost: number;
  risk: "low" | "medium" | "high";
  snippet: string;
}

function riskLevel(tokens: number): "low" | "medium" | "high" {
  if (tokens < 300) return "low";
  if (tokens < 900) return "medium";
  return "high";
}

// Detect model referenced within ±40 lines of a position
function detectModel(lines: string[], centerLine: number): string {
  const MODEL_RE: Array<[RegExp, string]> = [
    [/gpt-4o-mini/i,           "gpt-4o-mini"],
    [/gpt-4o/i,                "gpt-4o"],
    [/gpt-4-turbo/i,           "gpt-4-turbo"],
    [/gpt-3\.5-turbo/i,        "gpt-3.5-turbo"],
    [/gemini-1\.5-pro/i,       "gemini-1.5-pro"],
    [/gemini-1\.5-flash/i,     "gemini-1.5-flash"],
    [/gemini-2\.0-flash/i,     "gemini-2.0-flash"],
    [/claude-3-5-sonnet/i,     "claude-3-5-sonnet"],
    [/claude-3-haiku/i,        "claude-3-haiku"],
    [/claude-3-opus/i,         "claude-3-opus"],
  ];
  const start = Math.max(0, centerLine - 40);
  const end = Math.min(lines.length, centerLine + 40);
  const window = lines.slice(start, end).join("\n");
  for (const [re, name] of MODEL_RE) {
    if (re.test(window)) return name;
  }
  return "unknown";
}

// Patterns for prompt strings — order matters (more specific first)
const PROMPT_PATTERNS: RegExp[] = [
  // Variable named *PROMPT* / *SYSTEM* / *INSTRUCTION* assigned a backtick template
  /(?:const|let|var)\s+\w*(?:PROMPT|SYSTEM|INSTRUCTION|MESSAGE|TEMPLATE)\w*\s*=\s*`([\s\S]{50,}?)`/gi,
  // field: `...`  or  field = `...`  (system, prompt, content, user)
  /(?:system|prompt|content|user|instruction|message)\s*[=:]\s*`([\s\S]{50,}?)`/gi,
  // Python triple-double-quote
  /(?:system|prompt|content|user|instruction|message)\s*[=:]\s*[f]?"""([\s\S]{50,}?)"""/gi,
  // Python triple-single-quote
  /(?:system|prompt|content|user|instruction|message)\s*[=:]\s*[f]?'''([\s\S]{50,}?)'''/gi,
  // Long inline double-quoted string (≥150 chars)
  /(?:system|prompt|content|user|instruction|message)\s*[=:]\s*"([^"]{150,})"/gi,
  // Catch-all: any backtick template ≥300 chars
  /`([\s\S]{300,}?)`/g,
];

export function scanDocumentForExpensivePrompts(document: vscode.TextDocument): PromptFinding[] {
  const text = document.getText();
  const lines = text.split("\n");
  const results: PromptFinding[] = [];
  const seen = new Set<string>();

  for (const pattern of PROMPT_PATTERNS) {
    pattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(text)) !== null) {
      const promptText = match[1]?.trim() ?? "";
      if (promptText.length < 50) continue;

      const startOffset = match.index;
      const endOffset = match.index + match[0].length;
      const startPos = document.positionAt(startOffset);
      const endPos = document.positionAt(endOffset);

      // De-duplicate by line range
      const key = `${startPos.line}:${endPos.line}`;
      if (seen.has(key)) continue;
      seen.add(key);

      const tokens = estimateTokens(promptText);
      const outputTokens = Math.max(700, Math.floor(tokens * 0.6));
      const model = detectModel(lines, startPos.line);
      const pricing = getPricing(model);
      const costPerRequest =
        (tokens / 1_000_000) * pricing.input +
        (outputTokens / 1_000_000) * pricing.output;
      const monthlyCost = costPerRequest * DEFAULT_MONTHLY_CALLS;

      results.push({
        range: new vscode.Range(startPos, endPos),
        tokens,
        outputTokens,
        model,
        costPerRequest: Math.round(costPerRequest * 1_000_000) / 1_000_000,
        monthlyCost: Math.round(monthlyCost * 100) / 100,
        risk: riskLevel(tokens),
        snippet: promptText.slice(0, 200) + (promptText.length > 200 ? "…" : ""),
      });
    }
  }

  // Sort by line number
  results.sort((a, b) => a.range.start.line - b.range.start.line);
  return results;
}
