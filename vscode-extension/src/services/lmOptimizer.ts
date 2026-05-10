import * as vscode from "vscode";
import { OptimizeResponse } from "../types";

const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  "gpt-4o":            { input: 2.50,  output: 10.00 },
  "gpt-4o-mini":       { input: 0.15,  output: 0.60  },
  "gpt-4-turbo":       { input: 10.00, output: 30.00 },
  "gpt-3.5-turbo":     { input: 0.50,  output: 1.50  },
  "claude-3-5-sonnet": { input: 3.00,  output: 15.00 },
  "claude-3-haiku":    { input: 0.25,  output: 1.25  },
  "claude-3-opus":     { input: 15.00, output: 75.00 },
  "gemini-1.5-pro":    { input: 1.25,  output: 5.00  },
  "gemini-1.5-flash":  { input: 0.075, output: 0.30  },
};

const MONTHLY_CALLS = 100_000;

function tok(text: string): number {
  return Math.max(1, Math.floor(text.length / 4));
}

function calcMonthlySavings(origTok: number, optTok: number, model: string): number {
  const p = MODEL_PRICING[model] ?? MODEL_PRICING["gpt-4o"];
  const outOrig = Math.max(500, origTok * 2);
  const outOpt  = Math.max(500, optTok  * 2);
  const diff = ((origTok - optTok) / 1e6) * p.input + ((outOrig - outOpt) / 1e6) * p.output;
  return Math.max(0, diff * MONTHLY_CALLS);
}

// ── Smart rule-based optimizer ────────────────────────────────────────────────

function smartOptimize(text: string): { result: string; explanation: string } {
  let out = text.trim();
  const changes: string[] = [];

  // 1. Convert "let's / lets / we need to / we should" openers to imperative
  const imperative = out.replace(
    /^(?:let(?:'?s| us)|we(?:\s+need\s+to|\s+should|\s+want\s+to|\s+have\s+to))\s+/i,
    () => { changes.push("converted to imperative form"); return ""; }
  );
  if (imperative !== out) { out = imperative; out = out.charAt(0).toUpperCase() + out.slice(1); }

  // 2. Remove weak filler phrases
  const fillers: [RegExp, string][] = [
    [/\b(?:please|kindly)\b\s*/gi,                                    "removed filler words"],
    [/\b(?:make\s+sure(?:\s+to)?|ensure\s+that|be\s+sure\s+to)\s*/gi,"condensed directives"],
    [/\b(?:also\s+)?(?:we\s+need\s+to|you\s+(?:need|should|must)\s+(?:also\s+)?(?:make\s+sure\s+)?(?:to\s+)?)\s*/gi, "removed redundant directives"],
    [/\b(?:it\s+is\s+(?:very\s+)?important\s+(?:that|to))\s*/gi,     "removed emphasis filler"],
    [/\b(?:as\s+(?:an?\s+)?(?:ai|language\s+model|assistant))[^.]*\.\s*/gi, "removed AI self-reference"],
    [/\b(?:note\s+that|please\s+note\s+that|keep\s+in\s+mind\s+that)\s*/gi, "removed preamble"],
    [/\b(?:in\s+order\s+to)\b/gi,                                     "shortened phrasing"],
    [/\b(?:due\s+to\s+the\s+fact\s+that)\b/gi,                        "condensed"],
    [/\b(?:at\s+this\s+point\s+in\s+time)\b/gi,                       "condensed"],
    [/\b(?:for\s+the\s+purpose\s+of)\b/gi,                            "condensed"],
  ];

  for (const [re, reason] of fillers) {
    const next = out.replace(re, " ");
    if (next !== out) { changes.push(reason); out = next; }
  }

  // 3. Condense repeated "and ensure / and make sure / and X"
  out = out.replace(/\band\s+ensure\b/gi, (m) => { changes.push("merged redundant 'ensure' clauses"); return "and"; });

  // 4. Collapse synonymous performance phrases
  const perfMatch = /\b(?:make\s+it\s+(?:fast(?:er)?|quick(?:er)?|speedy)|improve\s+(?:the\s+)?performance|optimize\s+(?:for\s+)?(?:speed|performance)|speed\s+(?:it\s+)?up)\b/gi;
  const perfCount = (out.match(perfMatch) || []).length;
  if (perfCount > 1) {
    let first = true;
    out = out.replace(perfMatch, () => {
      if (first) { first = false; return "optimize performance"; }
      changes.push("deduplicated performance directives");
      return "";
    });
  }

  // 5. Condense "looks good / clean / readable" synonyms
  const readableMatch = /\b(?:looks?\s+good|(?:is\s+)?(?:clean|readable|well[\s-]?structured|well[\s-]?formatted|nicely\s+formatted))\b/gi;
  const readableCount = (out.match(readableMatch) || []).length;
  if (readableCount > 1) {
    let first = true;
    out = out.replace(readableMatch, () => {
      if (first) { first = false; return "is readable"; }
      changes.push("deduplicated readability directives");
      return "";
    });
  }

  // 6. Fix whitespace
  out = out.replace(/[ \t]{2,}/g, " ").replace(/\n{3,}/g, "\n\n").trim();

  // 7. Fix trailing punctuation and capitalise first char
  if (out && !out.match(/[.!?]$/)) { out += "."; }
  out = out.charAt(0).toUpperCase() + out.slice(1);

  const explanation = changes.length
    ? changes
        .filter((v, i, a) => a.indexOf(v) === i) // dedupe
        .slice(0, 3)
        .join("; ") + "."
    : "Normalised whitespace and punctuation.";

  return { result: out, explanation };
}

// ── vscode.lm path (works when Cursor exposes models to the extension host) ───

const LM_SYSTEM = `You are Promptimize, an expert prompt optimization engine.
Rewrite the given prompt to use significantly fewer tokens while preserving intent, constraints, and output format.
Remove: filler phrases, redundant qualifiers, repeated synonyms, wordy constructions.
Use: imperative verbs, concise directives, active voice.
Return ONLY valid JSON with no markdown fences:
{"optimizedPrompt":"<rewritten>","explanation":"<one sentence>","savingsPercent":<integer>}`;

async function tryVscodeLm(prompt: string): Promise<{ optimized: string; explanation: string; savings: number }> {
  const models = await vscode.lm.selectChatModels();
  if (!models.length) { throw new Error("no models"); }

  const lm = models[0];
  const msgs = [vscode.LanguageModelChatMessage.User(`${LM_SYSTEM}\n\nPrompt:\n${prompt}`)];
  const cts  = new vscode.CancellationTokenSource();
  const resp = await lm.sendRequest(msgs, {}, cts.token);

  let raw = "";
  for await (const chunk of resp.text) { raw += chunk; }

  const json = raw.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
  const parsed = JSON.parse(json);
  return { optimized: parsed.optimizedPrompt, explanation: parsed.explanation, savings: parsed.savingsPercent ?? 0 };
}

// ── Public entry point ────────────────────────────────────────────────────────

export async function optimizeWithLM(prompt: string, targetModel: string): Promise<OptimizeResponse> {
  const origTok = tok(prompt);

  let optimized: string;
  let explanation: string;
  let savings: number;

  // Try Cursor's built-in LM first; fall back to smart rule-based optimizer
  try {
    const lmResult = await tryVscodeLm(prompt);
    optimized   = lmResult.optimized;
    explanation = lmResult.explanation;
    savings     = lmResult.savings;
  } catch {
    const ruled  = smartOptimize(prompt);
    optimized   = ruled.result;
    explanation = ruled.explanation;
    const optTok = tok(optimized);
    savings      = origTok > 0 ? Math.max(0, Math.round(((origTok - optTok) / origTok) * 100)) : 0;
  }

  const optTok   = tok(optimized);
  const mSavings = calcMonthlySavings(origTok, optTok, targetModel);

  return {
    originalPrompt:          prompt,
    optimizedPrompt:         optimized,
    originalTokens:          origTok,
    optimizedTokens:         optTok,
    savingsPercent:          savings,
    estimatedMonthlySavings: mSavings,
    riskLevel:               "low",
    explanation,
    memoryUsed:              [],
  };
}
