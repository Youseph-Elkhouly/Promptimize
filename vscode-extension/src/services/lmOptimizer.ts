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
  const changes = new Set<string>();

  // ── 0. Normalise whitespace ───────────────────────────────────────────────
  out = out.replace(/[ \t]{2,}/g, " ").replace(/\n{3,}/g, "\n\n");

  // ── 1. Remove adjacent repeated words  (messy messy messy → messy) ────────
  // 3+ repetitions first, then 2 repetitions for words of 4+ characters
  let prev = "";
  while (prev !== out) {
    prev = out;
    out = out.replace(/\b(\w+)(?:\s+\1){2,}/gi, (_, w) => {
      changes.add("removed repeated words"); return w;
    });
  }
  out = out.replace(/\b(\w{4,})(?:\s+\1)\b/gi, (_, w) => {
    changes.add("removed repeated words"); return w;
  });

  // ── 2. Remove adjacent repeated phrases  (fix this file × 3 → once) ──────
  // Iterate from longest to shortest to catch multi-word repetitions first
  for (let len = 6; len >= 2; len--) {
    const re = new RegExp(
      `\\b((?:\\w+\\s+){${len - 1}}\\w+)(?:[,.]?\\s+\\1)+`,
      "gi"
    );
    const next = out.replace(re, (_, p) => {
      changes.add("removed repeated phrases"); return p;
    });
    if (next !== out) out = next;
  }

  // ── 3. Merge "X is ADJ and Y is ADJ and Z is ADJ" → "X, Y, Z are ADJ" ────
  out = out.replace(
    /(?:(?:the\s+)?\w[\w\s]{1,35}?\s+(?:is|are)\s+\w+)(?:\s+and\s+(?:the\s+)?\w[\w\s]{1,35}?\s+(?:is|are)\s+\w+){2,}/gi,
    (match) => {
      const parts = match.split(/\s+and\s+/i);
      const adjs  = new Set<string>();
      const subjects: string[] = [];
      for (const p of parts) {
        const m = p.trim().match(/^(?:the\s+)?(.+?)\s+(?:is|are)\s+(\w+)$/i);
        if (m) { subjects.push(m[1].trim()); adjs.add(m[2].toLowerCase()); }
      }
      if (adjs.size === 1 && subjects.length >= 3) {
        changes.add("merged repeated predicate");
        const list = subjects.slice(0, -1).join(", ") + ", and " + subjects[subjects.length - 1];
        return `${list} are ${[...adjs][0]}`;
      }
      return match;
    }
  );

  // ── 4. Reformat long "and" chains as comma lists (5+ short items) ─────────
  // e.g. "good and clean and readable and fast and short" → "good, clean, readable, fast, and short"
  out = out.replace(
    /\b\w+(?:\s+\w+){0,2}(?:\s+and\s+\w+(?:\s+\w+){0,2}){4,}/gi,
    (match) => {
      const parts = match.split(/\s+and\s+/i).map((p) => p.trim()).filter(Boolean);
      if (parts.length >= 5 && parts.every((p) => p.split(" ").length <= 3)) {
        changes.add("compressed redundant list");
        // Remove duplicates within the list
        const unique = [...new Set(parts.map(p => p.toLowerCase()))].map((low) =>
          parts.find((p) => p.toLowerCase() === low)!
        );
        return unique.slice(0, -1).join(", ") + ", and " + unique[unique.length - 1];
      }
      return match;
    }
  );

  // ── 5. Convert opener to imperative ──────────────────────────────────────
  const openers = [
    /^(?:let(?:'?s| us)|we(?:\s+need\s+to|\s+should|\s+want\s+to|\s+have\s+to))\s+/i,
    /^(?:(?:i\s+)?(?:want|need|would\s+like)\s+(?:you\s+)?to|(?:can|could|will|would)\s+you(?:\s+please)?|please)\s+/i,
  ];
  for (const re of openers) {
    const next = out.replace(re, () => { changes.add("converted to imperative"); return ""; });
    if (next !== out) { out = next.charAt(0).toUpperCase() + next.slice(1); break; }
  }

  // ── 6. Verbose → concise substitutions ───────────────────────────────────
  const subs: [RegExp, string, string][] = [
    [/\bin\s+order\s+to\b/gi,                                       "to",         "shortened phrasing"],
    [/\bdue\s+to\s+the\s+fact\s+that\b/gi,                          "because",    "shortened phrasing"],
    [/\bin\s+the\s+event\s+that\b/gi,                               "if",         "shortened phrasing"],
    [/\bwith\s+the\s+exception\s+of\b/gi,                           "except",     "shortened phrasing"],
    [/\bat\s+this\s+point\s+in\s+time\b/gi,                         "now",        "shortened phrasing"],
    [/\bfor\s+the\s+purpose\s+of\b/gi,                              "for",        "shortened phrasing"],
    [/\bis\s+able\s+to\b/gi,                                        "can",        "shortened phrasing"],
    [/\bhas\s+the\s+ability\s+to\b/gi,                              "can",        "shortened phrasing"],
    [/\bit\s+is\s+(?:very\s+|extremely\s+)?(?:important|critical|essential|necessary)\s+(?:that|to)\s*/gi, "", "removed emphasis filler"],
    [/\bplease\s+note\s+that\s*/gi,                                 "",           "removed preamble"],
    [/\bkeep\s+in\s+mind\s+that\s*/gi,                              "",           "removed preamble"],
    [/\bit(?:'s|\s+is)\s+worth\s+(?:noting|mentioning)\s+that\s*/gi,"",           "removed preamble"],
  ];
  for (const [re, repl, reason] of subs) {
    const next = out.replace(re, repl);
    if (next !== out) { changes.add(reason); out = next; }
  }

  // ── 7. Remove filler / hedge words ───────────────────────────────────────
  const fillers: [RegExp, string][] = [
    [/\b(?:please|kindly)\b\s*/gi,                                               "removed filler words"],
    [/\b(?:just|simply|basically|essentially|literally)\b\s*/gi,                 "removed filler words"],
    [/\b(?:make\s+sure(?:\s+to)?|ensure\s+that|be\s+sure\s+to)\s*/gi,           "condensed directives"],
    [/\b(?:we\s+need\s+to|you\s+(?:need|should|must)\s+(?:also\s+)?(?:to\s+)?)\s*/gi, "removed redundant directives"],
    [/\b(?:note\s+that|please\s+note\s+that)\s*/gi,                              "removed preamble"],
    [/\band\s+also\b/gi,                                                          "removed filler words"],
    [/,?\s*and\s+not\s+bad\b/gi,                                                  "removed weak qualifier"],
  ];
  for (const [re, reason] of fillers) {
    const next = out.replace(re, " ");
    if (next !== out) { changes.add(reason); out = next; }
  }

  // ── 8. Condense clause connectors ────────────────────────────────────────
  out = out.replace(/\band\s+(?:ensure|make\s+sure)(?:\s+that)?\b\s*/gi, () => {
    changes.add("merged redundant clauses"); return "and ";
  });

  // ── 9. Deduplicate performance / quality synonyms ─────────────────────────
  const perfRe = /\b(?:make\s+it\s+(?:fast(?:er)?|quick(?:er)?|speedy)|improve\s+(?:the\s+)?performance|optimize\s+(?:for\s+)?(?:speed|performance)|speed\s+(?:it\s+)?up|run\s+(?:faster|quicker))\b/gi;
  let pfirst = true;
  const perfOut = out.replace(perfRe, () => {
    if (pfirst) { pfirst = false; return "optimize performance"; }
    changes.add("deduplicated performance directives"); return "";
  });
  if (perfOut !== out) out = perfOut;

  const qualRe = /\b(?:looks?\s+good|(?:is\s+)?(?:clean|readable|well[\s-]?structured|well[\s-]?formatted|nicely\s+formatted|easy\s+to\s+read))\b/gi;
  let qfirst = true;
  const qualOut = out.replace(qualRe, () => {
    if (qfirst) { qfirst = false; return "readable"; }
    changes.add("deduplicated quality directives"); return "";
  });
  if (qualOut !== out) out = qualOut;

  // ── 10. Remove closing pleasantries ──────────────────────────────────────
  out = out.replace(/[,.]?\s*(?:thank(?:s|\s+you)(?:\s+(?:in\s+advance|for\s+your\s+help))?)\.?\s*$/i, () => {
    changes.add("removed closing pleasantries"); return "";
  });

  // ── 11. Final cleanup ─────────────────────────────────────────────────────
  out = out
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([.,!?])/g, "$1")
    .replace(/([.,])\s*,/g, "$1")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  if (out && !/[.!?]$/.test(out)) out += ".";
  out = out.charAt(0).toUpperCase() + out.slice(1);

  const explanation = changes.size
    ? [...changes].slice(0, 4).join("; ") + "."
    : "Normalized whitespace and punctuation.";

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
