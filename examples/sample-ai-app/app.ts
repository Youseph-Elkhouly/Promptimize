// Simple task manager — intentionally messy for demo purposes
import * as fs   from "fs";
import * as path from "path";
import * as https from "https";

// ── Types ──────────────────────────────────────────────────────────────────────

type Task = {
  id: number;
  title: string;
  done: boolean;
  createdAt: Date;
};

interface ApiCallEntry {
  id: string;
  timestamp: string;
  fn: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  costUSD: number;
  status: "success" | "error" | "mock";
  promptSnippet: string;
}

// ── Task manager (intentionally messy — prompt Cursor to fix this) ─────────────

let tasks: Task[] = [];
let nextId = 1;

function addTask(title: string) {
  if (title == "") {
    console.log("cant add empty task");
    return;
  }
  if (title == null) {
    console.log("cant add empty task");
    return;
  }
  if (title == undefined) {
    console.log("cant add empty task");
    return;
  }
  let task = {
    id: nextId,
    title: title,
    done: false,
    createdAt: new Date(),
  };
  nextId = nextId + 1;
  tasks.push(task);
  console.log("added task: " + task.title);
}

function completeTask(id: number) {
  for (let i = 0; i < tasks.length; i++) {
    if (tasks[i].id == id) {
      tasks[i].done = true;
      console.log("completed: " + tasks[i].title);
      return;
    }
  }
  console.log("task not found");
}

function deleteTask(id: number) {
  for (let i = 0; i < tasks.length; i++) {
    if (tasks[i].id == id) {
      tasks.splice(i, 1);
      console.log("deleted task " + id);
      return;
    }
  }
  console.log("task not found");
}

function getPendingTasks(): Task[] {
  let pending: Task[] = [];
  for (let i = 0; i < tasks.length; i++) {
    if (tasks[i].done == false) {
      pending.push(tasks[i]);
    }
  }
  return pending;
}

function getCompletedTasks(): Task[] {
  let completed: Task[] = [];
  for (let i = 0; i < tasks.length; i++) {
    if (tasks[i].done == true) {
      completed.push(tasks[i]);
    }
  }
  return completed;
}

function printAllTasks() {
  if (tasks.length == 0) {
    console.log("no tasks");
    return;
  }
  for (let i = 0; i < tasks.length; i++) {
    let status = tasks[i].done == true ? "[x]" : "[ ]";
    console.log(status + " " + tasks[i].id + ": " + tasks[i].title);
  }
}

// ── Gemini API helpers ─────────────────────────────────────────────────────────

const GEMINI_MODEL   = "gemini-1.5-flash";
const GEMINI_API_KEY = process.env.GEMINI_API_KEY ?? "";

// Cost per 1M tokens (gemini-1.5-flash)
const PRICE_INPUT  = 0.075;
const PRICE_OUTPUT = 0.30;

const LOG_FILE = path.join(__dirname, "api-calls.json");

let _callCounter = 0;

function appendLog(entry: ApiCallEntry) {
  let existing: ApiCallEntry[] = [];
  try {
    existing = JSON.parse(fs.readFileSync(LOG_FILE, "utf-8"));
  } catch {}
  existing.push(entry);
  fs.writeFileSync(LOG_FILE, JSON.stringify(existing, null, 2));
}

function geminiPost(prompt: string): Promise<{ text: string; inputTokens: number; outputTokens: number }> {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
    });
    const url = `/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;
    const req = https.request(
      { hostname: "generativelanguage.googleapis.com", path: url, method: "POST",
        headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) } },
      (res) => {
        let raw = "";
        res.on("data", (d) => (raw += d));
        res.on("end", () => {
          try {
            const parsed = JSON.parse(raw);
            const text   = parsed.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
            const usage  = parsed.usageMetadata ?? {};
            resolve({
              text,
              inputTokens:  usage.promptTokenCount       ?? Math.floor(prompt.length / 4),
              outputTokens: usage.candidatesTokenCount   ?? Math.floor(text.length   / 4),
            });
          } catch { reject(new Error("Bad JSON from Gemini")); }
        });
      }
    );
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

async function callGemini(fnName: string, prompt: string): Promise<string> {
  _callCounter++;
  const id = "call_" + String(Date.now()).slice(-6);
  const snippet = prompt.slice(0, 80).replace(/\n/g, " ");

  if (!GEMINI_API_KEY) {
    // No key — log a realistic mock entry so the extension still has data to show
    const inTok  = Math.max(30, Math.floor(prompt.length / 4));
    const outTok = Math.floor(inTok * 0.65);
    appendLog({
      id, timestamp: new Date().toISOString(), fn: fnName,
      model: GEMINI_MODEL, inputTokens: inTok, outputTokens: outTok,
      costUSD: parseFloat(((inTok / 1e6) * PRICE_INPUT + (outTok / 1e6) * PRICE_OUTPUT).toFixed(7)),
      status: "mock", promptSnippet: snippet,
    });
    return "[mock — set GEMINI_API_KEY to enable live calls]";
  }

  try {
    const { text, inputTokens, outputTokens } = await geminiPost(prompt);
    const costUSD = parseFloat(((inputTokens / 1e6) * PRICE_INPUT + (outputTokens / 1e6) * PRICE_OUTPUT).toFixed(7));
    appendLog({ id, timestamp: new Date().toISOString(), fn: fnName,
      model: GEMINI_MODEL, inputTokens, outputTokens, costUSD, status: "success", promptSnippet: snippet });
    return text;
  } catch (err) {
    appendLog({ id, timestamp: new Date().toISOString(), fn: fnName,
      model: GEMINI_MODEL, inputTokens: 0, outputTokens: 0, costUSD: 0, status: "error",
      promptSnippet: snippet });
    throw err;
  }
}

// ── AI-powered task features ───────────────────────────────────────────────────

async function analyzeTaskPriority(taskList: Task[]): Promise<void> {
  const titles = taskList.map((t) => `- ${t.title}`).join("\n");
  const prompt = `Analyze these tasks and rank them by urgency. Reply with a short ordered list:\n${titles}`;
  const result = await callGemini("analyzeTaskPriority", prompt);
  console.log("\n[AI] Task priority suggestion:\n" + result);
}

async function generateCompletionNote(task: Task): Promise<void> {
  const prompt = `Write a one-sentence upbeat completion note for this finished task: "${task.title}"`;
  const result = await callGemini("generateCompletionNote", prompt);
  console.log("[AI] Completion note:", result.trim());
}

async function suggestTaskTitle(roughTitle: string): Promise<string> {
  const prompt = `Suggest a concise, action-oriented task title (max 6 words) for: "${roughTitle}"`;
  const result = await callGemini("suggestTaskTitle", prompt);
  return result.trim();
}

// ── Demo run ───────────────────────────────────────────────────────────────────

(async () => {
  addTask("Buy groceries");
  addTask("Walk the dog");
  addTask("Fix the bug");
  addTask("Review PR");
  addTask("");
  completeTask(1);
  printAllTasks();

  console.log("\n── AI features ──────────────────────────────────────────────");
  console.log(GEMINI_API_KEY
    ? "Using Gemini API — calls will be logged to api-calls.json"
    : "No GEMINI_API_KEY found — logging mock entries to api-calls.json");

  await analyzeTaskPriority(getPendingTasks());

  const completed = getCompletedTasks();
  if (completed.length) {
    await generateCompletionNote(completed[0]);
  }

  const rough = "fix the login bug that breaks on Safari in production";
  const suggested = await suggestTaskTitle(rough);
  console.log("[AI] Suggested title:", suggested);

  addTask(suggested || rough);
  completeTask(2);

  console.log("\n── Final task list ──────────────────────────────────────────");
  printAllTasks();
  console.log("\nAPI call log written to api-calls.json");
})();
