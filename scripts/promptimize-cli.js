#!/usr/bin/env node
/**
 * Promptimize CLI
 * Usage:
 *   node scripts/promptimize-cli.js               ← interactive mode
 *   node scripts/promptimize-cli.js "your prompt" ← one-shot mode
 */

const readline = require("readline");
const http = require("http");

const BACKEND = "http://localhost:8000";
const MONTHLY_CALLS = 100_000;
const BUDGET = 1000; // monthly budget in USD

const PRICING = {
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

const DEFAULT_MODEL = "gpt-4o";

// ── helpers ────────────────────────────────────────────────────────────────────

const c = {
  reset:  "\x1b[0m",
  bold:   "\x1b[1m",
  dim:    "\x1b[2m",
  white:  "\x1b[97m",
  green:  "\x1b[92m",
  yellow: "\x1b[93m",
  red:    "\x1b[91m",
  cyan:   "\x1b[96m",
  gray:   "\x1b[90m",
};

function tokens(text) {
  return Math.max(1, Math.floor(text.length / 4));
}

function detectModel(text) {
  const lower = text.toLowerCase();
  for (const key of Object.keys(PRICING)) {
    if (lower.includes(key)) return key;
  }
  return DEFAULT_MODEL;
}

function cost(tok, model) {
  const p = PRICING[model] || PRICING[DEFAULT_MODEL];
  const out = Math.max(500, tok * 2); // code responses ~2x input length
  return (tok / 1e6) * p.input + (out / 1e6) * p.output;
}

function risk(tok) {
  if (tok < 300) return `${c.green}LOW${c.reset}`;
  if (tok < 900) return `${c.yellow}MEDIUM${c.reset}`;
  return `${c.red}HIGH${c.reset}`;
}

function budgetBar(monthlyCost) {
  const pct = Math.min(1, monthlyCost / BUDGET);
  const filled = Math.round(pct * 20);
  const bar = "█".repeat(filled) + "░".repeat(20 - filled);
  const colour = pct > 0.8 ? c.red : pct > 0.5 ? c.yellow : c.green;
  return `${colour}${bar}${c.reset} $${monthlyCost.toFixed(2)} / $${BUDGET}.00`;
}

function post(path, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const req = http.request(
      { hostname: "localhost", port: 8000, path, method: "POST",
        headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(data) } },
      (res) => {
        let buf = "";
        res.on("data", (d) => (buf += d));
        res.on("end", () => {
          try { resolve(JSON.parse(buf)); } catch { reject(new Error("Bad JSON")); }
        });
      }
    );
    req.on("error", reject);
    req.write(data);
    req.end();
  });
}

function heuristic(text) {
  const out = text
    .replace(/\bplease\b/gi, "")
    .replace(/\bcould you\b/gi, "")
    .replace(/\bcan you\b/gi, "")
    .replace(/\bi would like you to\b/gi, "")
    .replace(/\bi want you to\b/gi, "")
    .replace(/\bkindly\b/gi, "")
    .replace(/\bmake sure to\b/gi, "")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return out;
}

// ── analysis ──────────────────────────────────────────────────────────────────

async function analyse(prompt) {
  const tok     = tokens(prompt);
  const model   = detectModel(prompt);
  const perCall = cost(tok, model);
  const monthly = perCall * MONTHLY_CALLS;

  console.log();
  console.log(`${c.bold}${c.white}⚡ Promptimize — Cost Analysis${c.reset}`);
  console.log(`${c.gray}${"─".repeat(44)}${c.reset}`);
  console.log(`  Tokens          ${c.bold}${c.white}${tok.toLocaleString()}${c.reset}`);
  console.log(`  Model           ${c.cyan}${model}${c.reset}`);
  console.log(`  Cost / call     ${c.white}$${perCall.toFixed(4)}${c.reset}`);
  console.log(`  Monthly (10k)   ${c.bold}${c.white}$${monthly.toFixed(2)}${c.reset}`);
  console.log(`  Risk            ${risk(tok)}`);
  console.log(`${c.gray}${"─".repeat(44)}${c.reset}`);
  console.log(`  Budget          ${budgetBar(monthly)}`);
  console.log(`${c.gray}${"─".repeat(44)}${c.reset}`);

  // Try backend, fall back to heuristic
  let optimized, savings, explanation;
  try {
    const res = await post("/optimize", {
      projectId: "cli",
      prompt,
      model,
      mode: "balanced",
      preserveIntent: true,
    });
    optimized   = res.optimizedPrompt;
    savings     = res.savingsPercent;
    explanation = res.explanation;
  } catch {
    optimized   = heuristic(prompt);
    savings     = Math.round(((tok - tokens(optimized)) / tok) * 100);
    explanation = "Heuristic only — start the backend for AI optimization.";
  }

  if (savings > 0) {
    const savedMonthly = (perCall - cost(tokens(optimized), model)) * MONTHLY_CALLS;
    const savedYearly  = savedMonthly * 12;
    console.log();
    console.log(`${c.bold}${c.green}Optimized prompt${c.reset} ${c.gray}(saves ${savings}% · $${savedMonthly.toFixed(2)}/mo · $${savedYearly.toFixed(2)}/yr)${c.reset}`);
    console.log(`${c.gray}${explanation}${c.reset}`);
    console.log();
    console.log(`${c.white}${optimized}${c.reset}`);
  } else {
    console.log();
    console.log(`${c.gray}Already concise — no significant savings found.${c.reset}`);
  }

  console.log();
}

// ── entry ─────────────────────────────────────────────────────────────────────

const oneShot = process.argv.slice(2).join(" ").trim();

if (oneShot) {
  analyse(oneShot).catch(console.error);
} else {
  // Interactive mode
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  console.log();
  console.log(`${c.bold}${c.white}⚡ Promptimize CLI${c.reset}  ${c.gray}(Ctrl+C to exit)${c.reset}`);
  console.log(`${c.gray}Type or paste a prompt and press Enter to analyse its cost.${c.reset}`);
  console.log();

  const ask = () => {
    rl.question(`${c.cyan}prompt>${c.reset} `, async (input) => {
      const p = input.trim();
      if (p) await analyse(p).catch(console.error);
      ask();
    });
  };

  ask();
}
