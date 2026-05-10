import * as vscode from "vscode";
import * as path from "path";
import { optimizeWithLM } from "../services/lmOptimizer";
import { optimizePrompt } from "../api/backendClient";

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

const BUDGET        = 1000;   // monthly budget USD
const MONTHLY_CALLS = 100_000; // realistic API calls per month

export class PromptPanelViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewId = "promptimize.promptPanel";
  private _view?: vscode.WebviewView;

  constructor(private readonly _extensionUri: vscode.Uri) {}

  setPrompt(text: string): void {
    this._view?.webview.postMessage({ command: "setPrompt", text });
  }

  resolveWebviewView(webviewView: vscode.WebviewView) {
    this._view = webviewView;
    webviewView.webview.options = { enableScripts: true };
    webviewView.webview.html = this._getHtml();

    webviewView.webview.onDidReceiveMessage(async (msg) => {
      if (msg.command === "optimize") {
        // 1st: Cursor/Copilot built-in LM  2nd: backend  3rd: error
        try {
          const result = await optimizeWithLM(msg.prompt, msg.model);
          webviewView.webview.postMessage({ command: "optimizeResult", result });
        } catch {
          try {
            const projectId = this._getProjectId();
            const result = await optimizePrompt(projectId, msg.prompt, msg.model, "balanced");
            webviewView.webview.postMessage({ command: "optimizeResult", result });
          } catch {
            webviewView.webview.postMessage({
              command: "optimizeError",
              error: "Optimization unavailable — no AI model found and backend is offline.",
            });
          }
        }
      }

      if (msg.command === "getApiCalls") {
        const wsFolder = vscode.workspace.workspaceFolders?.[0];
        try {
          const uri   = vscode.Uri.joinPath(wsFolder!.uri, "api-calls.json");
          const bytes = await vscode.workspace.fs.readFile(uri);
          const calls = JSON.parse(Buffer.from(bytes).toString("utf-8"));
          webviewView.webview.postMessage({ command: "apiCallsData", calls });
        } catch {
          webviewView.webview.postMessage({ command: "apiCallsData", calls: [] });
        }
        return;
      }

      if (msg.command === "gotoFunction") {
        const fnName = msg.fn as string;
        const files  = await vscode.workspace.findFiles("**/*.{ts,js,py}", "**/node_modules/**", 20);
        for (const fileUri of files) {
          const doc   = await vscode.workspace.openTextDocument(fileUri);
          const lines = doc.getText().split("\n");
          for (let i = 0; i < lines.length; i++) {
            if (new RegExp(`(?:async\\s+)?function\\s+${fnName}\\b|const\\s+${fnName}\\s*=|def\\s+${fnName}\\b`).test(lines[i])) {
              const pos = new vscode.Position(i, 0);
              await vscode.window.showTextDocument(doc, {
                selection: new vscode.Range(pos, pos),
                preserveFocus: false,
              });
              return;
            }
          }
        }
        vscode.window.showWarningMessage(`Function "${fnName}" not found in workspace.`);
        return;
      }

      if (msg.command === "sendToCli") {
        const cliPath = path.join(this._extensionUri.fsPath, "..", "scripts", "promptimize-cli.js");
        const terminal = vscode.window.terminals.find((t) => t.name === "Promptimize")
          ?? vscode.window.createTerminal({ name: "Promptimize" });
        terminal.show(false);
        const escaped = msg.prompt.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, " ");
        terminal.sendText(`node "${cliPath}" "${escaped}"`);
      }
    });
  }

  private _getProjectId(): string {
    const folders = vscode.workspace.workspaceFolders;
    return folders?.length ? path.basename(folders[0].uri.fsPath) : "promptimize";
  }

  private _getHtml(): string {
    const models = Object.keys(MODEL_PRICING);
    const modelOptions = models
      .map((m) => `<option value="${m}"${m === "gpt-4o" ? " selected" : ""}>${m}</option>`)
      .join("");

    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  body {
    background: #0a0a0a;
    color: #c9c9c9;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    font-size: 12px;
    height: 100vh;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  /* ── Header ── */
  .header {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 12px 14px 10px;
    border-bottom: 1px solid #1e1e1e;
    flex-shrink: 0;
    background: #0d0d0d;
  }
  .header-zap { font-size: 14px; }
  .header-title { font-size: 12px; font-weight: 700; color: #fff; letter-spacing: 0.06em; }
  .header-badge {
    margin-left: auto;
    font-size: 9px;
    color: #3a3a3a;
    border: 1px solid #1e1e1e;
    padding: 1px 6px;
    letter-spacing: 0.08em;
  }

  /* ── Budget ── */
  .budget-section {
    padding: 10px 14px 8px;
    border-bottom: 1px solid #1e1e1e;
    flex-shrink: 0;
  }
  .budget-row {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    margin-bottom: 6px;
  }
  .budget-label { font-size: 9px; text-transform: uppercase; letter-spacing: 0.14em; color: #3a3a3a; }
  .budget-nums  { font-size: 10px; color: #666; font-variant-numeric: tabular-nums; font-weight: 500; }
  .budget-track { height: 3px; background: #1e1e1e; border-radius: 99px; overflow: hidden; }
  .budget-fill  {
    height: 3px;
    background: linear-gradient(90deg, #3ecf8e, #69db7c);
    width: 0%;
    border-radius: 99px;
    transition: width 0.5s cubic-bezier(.4,0,.2,1), background 0.4s;
  }

  /* ── Model selector ── */
  .model-section {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 7px 14px;
    border-bottom: 1px solid #1e1e1e;
    flex-shrink: 0;
    background: #0d0d0d;
  }
  .model-label { font-size: 9px; text-transform: uppercase; letter-spacing: 0.12em; color: #3a3a3a; white-space: nowrap; }
  select {
    flex: 1;
    background: #111;
    border: 1px solid #222;
    color: #999;
    font-size: 11px;
    padding: 4px 8px;
    outline: none;
    cursor: pointer;
    border-radius: 3px;
    transition: border-color 0.15s;
  }
  select:hover { border-color: #333; }
  select:focus { border-color: #444; color: #ccc; }

  /* ── Input ── */
  .input-section {
    flex: 1;
    display: flex;
    flex-direction: column;
    padding: 10px 14px 8px;
    min-height: 0;
  }
  .section-label {
    font-size: 9px;
    text-transform: uppercase;
    letter-spacing: 0.14em;
    color: #3a3a3a;
    margin-bottom: 7px;
  }
  textarea {
    flex: 1;
    background: #111;
    border: 1px solid #1e1e1e;
    color: #c9c9c9;
    font-size: 11.5px;
    font-family: inherit;
    padding: 10px;
    resize: none;
    outline: none;
    line-height: 1.6;
    min-height: 90px;
    border-radius: 4px;
    transition: border-color 0.15s;
  }
  textarea:focus { border-color: #2e2e2e; background: #131313; }
  textarea::placeholder { color: #282828; }

  /* ── Live stats ── */
  .stats-section {
    padding: 8px 14px;
    border-top: 1px solid #1e1e1e;
    background: #0d0d0d;
    flex-shrink: 0;
  }
  .stats-row { display: flex; align-items: center; gap: 0; }
  .stat-block {
    flex: 1;
    padding: 4px 0;
    border-right: 1px solid #1e1e1e;
  }
  .stat-block:last-of-type { border-right: none; }
  .stat-val { font-size: 13px; font-weight: 700; color: #fff; font-variant-numeric: tabular-nums; line-height: 1; }
  .stat-lbl { font-size: 8.5px; color: #3a3a3a; text-transform: uppercase; letter-spacing: 0.1em; margin-top: 3px; }
  .risk-chip {
    font-size: 8.5px;
    font-weight: 700;
    letter-spacing: 0.12em;
    padding: 3px 8px;
    border-radius: 99px;
    white-space: nowrap;
    border: 1px solid;
    margin-left: 10px;
    flex-shrink: 0;
  }
  .risk-high   { color: #ff6b6b; border-color: rgba(255,107,107,0.3); background: rgba(255,107,107,0.06); }
  .risk-medium { color: #ffa94d; border-color: rgba(255,169,77,0.3);  background: rgba(255,169,77,0.06);  }
  .risk-low    { color: #3ecf8e; border-color: rgba(62,207,142,0.3);  background: rgba(62,207,142,0.06);  }
  .risk-none   { color: #333;    border-color: #1e1e1e;               background: transparent;            }
  .calls-note  { font-size: 8.5px; color: #272727; margin-top: 5px; }

  /* ── Actions ── */
  .actions-section {
    padding: 10px 14px;
    border-top: 1px solid #1e1e1e;
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
    gap: 7px;
    background: #0d0d0d;
  }
  .btn-primary {
    width: 100%;
    background: #fff;
    color: #000;
    border: none;
    padding: 8px 14px;
    font-size: 11.5px;
    font-weight: 700;
    letter-spacing: 0.04em;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 7px;
    border-radius: 4px;
    transition: background 0.15s, transform 0.1s;
  }
  .btn-primary:hover { background: #e8e8e8; }
  .btn-primary:active { transform: scale(0.99); }
  .btn-primary:disabled { background: #1a1a1a; color: #3a3a3a; cursor: not-allowed; transform: none; }

  .btn-secondary {
    width: 100%;
    background: transparent;
    color: #3ecf8e;
    border: 1px solid rgba(62,207,142,0.2);
    padding: 7px 14px;
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.04em;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 7px;
    border-radius: 4px;
    transition: all 0.15s;
  }
  .btn-secondary:hover { background: rgba(62,207,142,0.07); border-color: rgba(62,207,142,0.4); }
  .btn-secondary:disabled { color: #2a2a2a; border-color: #1e1e1e; cursor: not-allowed; }

  /* ── Error ── */
  .error-bar {
    margin: 0 14px 8px;
    padding: 8px 10px;
    background: rgba(255,107,107,0.06);
    border: 1px solid rgba(255,107,107,0.2);
    border-radius: 4px;
    color: #ff6b6b;
    font-size: 10.5px;
    line-height: 1.4;
    display: none;
    flex-shrink: 0;
  }
  .error-bar.visible { display: block; }

  /* ── Result ── */
  .result-area {
    border-top: 1px solid #1e1e1e;
    flex-shrink: 0;
    max-height: 360px;
    overflow-y: auto;
    display: none;
  }
  .result-area.visible { display: block; }

  .result-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 9px 14px;
    background: #0d0d0d;
    border-bottom: 1px solid #1e1e1e;
    position: sticky;
    top: 0;
    z-index: 1;
  }
  .result-title { font-size: 9px; text-transform: uppercase; letter-spacing: 0.14em; color: #666; }
  .savings-chip {
    font-size: 10px;
    font-weight: 700;
    color: #3ecf8e;
    background: rgba(62,207,142,0.1);
    border: 1px solid rgba(62,207,142,0.25);
    padding: 2px 9px;
    border-radius: 99px;
  }

  .result-stats-top,
  .result-stats-bottom {
    display: grid;
    gap: 1px;
    background: #1a1a1a;
  }
  .result-stats-top    { grid-template-columns: repeat(3, 1fr); }
  .result-stats-bottom { grid-template-columns: repeat(2, 1fr); border-top: 1px solid #1a1a1a; }

  .r-stat { background: #111; padding: 10px 12px; text-align: center; }
  .r-val {
    font-size: 16px;
    font-weight: 700;
    color: #fff;
    font-variant-numeric: tabular-nums;
    line-height: 1;
  }
  .r-val.accent { color: #3ecf8e; }
  .r-lbl { font-size: 8.5px; color: #3a3a3a; text-transform: uppercase; letter-spacing: 0.1em; margin-top: 4px; }

  .result-explanation {
    padding: 10px 14px;
    color: #4a4a4a;
    font-size: 11px;
    line-height: 1.55;
    border-bottom: 1px solid #1e1e1e;
    font-style: italic;
  }

  .result-prompt-section { padding: 10px 14px 14px; }
  .result-prompt-label { font-size: 9px; text-transform: uppercase; letter-spacing: 0.14em; color: #3a3a3a; margin-bottom: 7px; }
  .result-prompt {
    background: #111;
    border: 1px solid rgba(62,207,142,0.15);
    border-radius: 4px;
    padding: 10px;
    font-size: 11px;
    color: #999;
    white-space: pre-wrap;
    word-break: break-word;
    line-height: 1.6;
    font-family: inherit;
    margin-bottom: 10px;
  }
  .result-btns { display: flex; gap: 7px; }
  .btn-sm {
    flex: 1;
    padding: 6px;
    font-size: 11px;
    cursor: pointer;
    border-radius: 3px;
    font-weight: 500;
    transition: all 0.15s;
    border: 1px solid;
  }
  .btn-ghost { background: transparent; border-color: #2a2a2a; color: #666; }
  .btn-ghost:hover { border-color: #444; color: #ccc; }
  .btn-green { background: rgba(62,207,142,0.1); border-color: rgba(62,207,142,0.3); color: #3ecf8e; font-weight: 600; }
  .btn-green:hover { background: rgba(62,207,142,0.18); }

  /* ── Misc ── */
  .spinner { animation: spin 0.75s linear infinite; display: inline-block; }
  @keyframes spin { to { transform: rotate(360deg); } }

  ::-webkit-scrollbar { width: 4px; }
  ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb { background: #2a2a2a; border-radius: 99px; }

  /* ── Tabs ── */
  .tab-bar {
    display: flex;
    border-bottom: 1px solid #1e1e1e;
    flex-shrink: 0;
    background: #0d0d0d;
  }
  .tab-btn {
    flex: 1;
    padding: 8px 0;
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    background: transparent;
    border: none;
    color: #3a3a3a;
    cursor: pointer;
    border-bottom: 2px solid transparent;
    transition: color 0.15s, border-color 0.15s;
  }
  .tab-btn:hover { color: #666; }
  .tab-btn.active { color: #fff; border-bottom-color: #3ecf8e; }

  .tab-pane { display: none; flex: 1; flex-direction: column; min-height: 0; overflow-y: auto; }
  .tab-pane.active { display: flex; }

  /* ── API Calls tab ── */
  .api-top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 14px 8px;
    border-bottom: 1px solid #1e1e1e;
    flex-shrink: 0;
  }
  .api-title { font-size: 9px; text-transform: uppercase; letter-spacing: 0.14em; color: #3a3a3a; }
  .btn-refresh {
    background: transparent;
    border: 1px solid #222;
    color: #555;
    font-size: 13px;
    width: 24px;
    height: 24px;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    border-radius: 3px;
    transition: all 0.15s;
  }
  .btn-refresh:hover { border-color: #444; color: #aaa; }
  .api-stats {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 1px;
    background: #1a1a1a;
    border-bottom: 1px solid #1a1a1a;
    flex-shrink: 0;
  }
  .api-stat { background: #111; padding: 10px 10px; text-align: center; }
  .api-list { flex: 1; overflow-y: auto; }
  .api-empty { padding: 28px 14px; text-align: center; color: #2a2a2a; font-size: 11px; line-height: 1.7; }
  .call-row { padding: 9px 14px; border-bottom: 1px solid #111; }
  .call-row:hover { background: #0e0e0e; }
  .call-top { display: flex; align-items: baseline; justify-content: space-between; margin-bottom: 3px; }
  .call-fn { font-size: 11px; font-weight: 600; color: #ccc; cursor: pointer; }
  .call-fn:hover { color: #3ecf8e; text-decoration: underline; text-underline-offset: 2px; }
  .call-cost { font-size: 11px; font-weight: 700; color: #3ecf8e; font-variant-numeric: tabular-nums; }
  .call-bottom { display: flex; align-items: center; gap: 8px; }
  .call-model { font-size: 9.5px; color: #444; }
  .call-tokens { font-size: 9.5px; color: #333; }
  .call-time { font-size: 9.5px; color: #2e2e2e; margin-left: auto; }
  .dot { width: 5px; height: 5px; border-radius: 50%; flex-shrink: 0; margin-top: 1px; }
  .dot-ok   { background: #3ecf8e; }
  .dot-err  { background: #ff6b6b; }
  .dot-mock { background: #ffa94d; }
</style>
</head>
<body>

<div class="header">
  <span class="header-title">Promptimize</span>
  <span class="header-badge">v0.1</span>
</div>

<div class="tab-bar">
  <button class="tab-btn active" id="tabOptimizer">Optimizer</button>
  <button class="tab-btn"        id="tabApiCalls">API Calls</button>
</div>

<!-- ── Optimizer pane ── -->
<div id="paneOptimizer" class="tab-pane active">
<div class="budget-section">
  <div class="budget-row">
    <span class="budget-label">Daily budget</span>
    <span class="budget-nums" id="budgetNums">$0.00 / $${Math.round(BUDGET / 30).toLocaleString()}</span>
  </div>
  <div class="budget-track"><div class="budget-fill" id="budgetFill"></div></div>
</div>

<div class="model-section">
  <span class="model-label">Model</span>
  <select id="modelSelect">${modelOptions}</select>
</div>

<div class="input-section">
  <div class="section-label">Your prompt</div>
  <textarea id="promptInput"
    placeholder="Select text in the editor — or type your prompt here…"
    spellcheck="false"></textarea>
</div>

<div class="stats-section">
  <div class="stats-row">
    <div class="stat-block" style="padding-right:10px">
      <div class="stat-val" id="tokenCount">0</div>
      <div class="stat-lbl">Tokens</div>
    </div>
    <div class="stat-block" style="padding-left:10px">
      <div class="stat-val" id="costPerCall">$0.0000</div>
      <div class="stat-lbl">This prompt costs</div>
    </div>
    <div class="risk-chip risk-none" id="riskBadge">–</div>
  </div>
</div>

<div class="actions-section">
  <button class="btn-primary" id="optimizeBtn" disabled>
    <span id="btnIcon">⚡</span>
    <span id="btnText">Optimize prompt</span>
  </button>
  <button class="btn-secondary" id="sendBtn" disabled>
    ↗ Send off prompt
  </button>
</div>

<div class="error-bar" id="errorBar"></div>

<div class="result-area" id="resultArea">
  <div class="result-header">
    <span class="result-title">Optimization result</span>
    <span class="savings-chip" id="savingsPill"></span>
  </div>

  <div class="result-stats-top">
    <div class="r-stat">
      <div class="r-val" id="origTokens">—</div>
      <div class="r-lbl">Original</div>
    </div>
    <div class="r-stat">
      <div class="r-val" id="optTokens">—</div>
      <div class="r-lbl">Optimized</div>
    </div>
    <div class="r-stat">
      <div class="r-val accent" id="savingsPct">—</div>
      <div class="r-lbl">Saved %</div>
    </div>
  </div>

  <div class="result-stats-bottom">
    <div class="r-stat">
      <div class="r-val accent" id="monthlySavings">—</div>
      <div class="r-lbl">Monthly savings</div>
    </div>
    <div class="r-stat">
      <div class="r-val accent" id="yearlySavings">—</div>
      <div class="r-lbl">Yearly savings</div>
    </div>
  </div>

  <div class="result-explanation" id="resultExplanation"></div>

  <div class="result-prompt-section">
    <div class="result-prompt-label">Optimized prompt</div>
    <pre class="result-prompt" id="resultPrompt"></pre>
    <div class="result-btns">
      <button class="btn-sm btn-ghost" id="copyBtn">Copy</button>
      <button class="btn-sm btn-green" id="useBtn">✓ Use this</button>
    </div>
  </div>
</div>
</div><!-- end pane-optimizer -->

<!-- ── API Calls pane ── -->
<div id="paneApiCalls" class="tab-pane">
  <div class="api-top">
    <span class="api-title">API Call Monitor</span>
    <button class="btn-refresh" id="refreshBtn" title="Refresh">↺</button>
  </div>
  <div class="api-stats">
    <div class="api-stat">
      <div class="r-val" id="totalCalls">—</div>
      <div class="r-lbl">Calls</div>
    </div>
    <div class="api-stat">
      <div class="r-val accent" id="totalSpend">—</div>
      <div class="r-lbl">Total spend</div>
    </div>
    <div class="api-stat">
      <div class="r-val" id="topModel" style="font-size:9px;letter-spacing:0.05em">—</div>
      <div class="r-lbl">Top model</div>
    </div>
  </div>
  <div class="api-list" id="apiList">
    <div class="api-empty">Loading API call history…</div>
  </div>
</div><!-- end pane-api-calls -->

<script>
  const vscode = acquireVsCodeApi();

  const PRICING = ${JSON.stringify(MODEL_PRICING)};
  const MONTHLY_CALLS = ${MONTHLY_CALLS};
  const BUDGET        = ${BUDGET};

  const promptEl    = document.getElementById('promptInput');
  const modelEl     = document.getElementById('modelSelect');
  const tokenEl     = document.getElementById('tokenCount');
  const costEl      = document.getElementById('costPerCall');
  const riskEl      = document.getElementById('riskBadge');
  const optimizeBtn = document.getElementById('optimizeBtn');
  const btnIcon     = document.getElementById('btnIcon');
  const btnText     = document.getElementById('btnText');
  const sendBtn     = document.getElementById('sendBtn');
  const resultArea  = document.getElementById('resultArea');
  const errorBar    = document.getElementById('errorBar');
  const budgetFill  = document.getElementById('budgetFill');
  const budgetNums  = document.getElementById('budgetNums');

  let lastOptimized = '';

  function estimateTokens(text) {
    return Math.max(0, Math.floor(text.length / 4));
  }

  function calcCostPerCall(inputTok, model) {
    if (inputTok === 0) return 0;
    const p = PRICING[model] || PRICING['gpt-4o'];
    const outputTok = Math.max(500, inputTok * 2);
    return (inputTok / 1e6) * p.input + (outputTok / 1e6) * p.output;
  }

  function getRisk(tokens) {
    if (tokens === 0)    return { label: '–',      cls: 'risk-none'   };
    if (tokens < 200)    return { label: 'LOW',    cls: 'risk-low'    };
    if (tokens < 600)    return { label: 'MEDIUM', cls: 'risk-medium' };
    return                { label: 'HIGH',   cls: 'risk-high'   };
  }

  function fmt(n)  { return '$' + n.toFixed(2); }
  function fmt4(n) { return '$' + n.toFixed(4); }

  function updateStats() {
    const text  = promptEl.value;
    const model = modelEl.value;
    const tok   = estimateTokens(text);
    const cpc   = calcCostPerCall(tok, model);
    const mo    = cpc * MONTHLY_CALLS;
    const risk  = getRisk(tok);

    tokenEl.textContent = tok.toLocaleString();
    costEl.textContent  = fmt4(cpc);
    riskEl.textContent  = risk.label;
    riskEl.className     = 'risk-badge ' + risk.cls;

    const dailyBudget = BUDGET / 30;
    const daily = mo / 30;
    const pct = Math.min(1, daily / dailyBudget);
    budgetFill.style.width      = (pct * 100) + '%';
    budgetFill.style.background = pct > 0.8 ? '#ff6b6b' : pct > 0.5 ? '#ffa94d' : '#69db7c';
    budgetNums.textContent      = fmt(daily) + ' / $' + Math.round(dailyBudget).toLocaleString() + '.00';

    const hasText = tok >= 10;
    optimizeBtn.disabled = !hasText;
    sendBtn.disabled     = !hasText;
  }

  promptEl.addEventListener('input', updateStats);
  modelEl.addEventListener('change', updateStats);

  optimizeBtn.addEventListener('click', () => {
    const prompt = promptEl.value.trim();
    if (!prompt) return;
    errorBar.classList.remove('visible');
    resultArea.classList.remove('visible');
    optimizeBtn.disabled = true;
    btnIcon.classList.add('spinner');
    btnIcon.textContent = '↻';
    btnText.textContent = 'Optimizing…';
    vscode.postMessage({ command: 'optimize', prompt, model: modelEl.value });
  });

  sendBtn.addEventListener('click', () => {
    const prompt = lastOptimized || promptEl.value.trim();
    vscode.postMessage({ command: 'sendToCli', prompt });
    const prev = sendBtn.textContent;
    sendBtn.textContent = '↗ Sending to terminal…';
    setTimeout(() => { sendBtn.textContent = prev; }, 2000);
  });

  document.getElementById('copyBtn').addEventListener('click', () => {
    navigator.clipboard.writeText(lastOptimized);
    const btn = document.getElementById('copyBtn');
    btn.textContent = '✓ Copied';
    setTimeout(() => { btn.textContent = 'Copy'; }, 1500);
  });

  document.getElementById('useBtn').addEventListener('click', () => {
    promptEl.value = lastOptimized;
    updateStats();
    resultArea.classList.remove('visible');
    const btn = document.getElementById('useBtn');
    btn.textContent = '✓ Applied';
    setTimeout(() => { btn.textContent = '✓ Use this'; }, 1500);
  });

  // ── Tab switching ──────────────────────────────────────────────────────────
  const tabBtns    = { optimizer: document.getElementById('tabOptimizer'), apiCalls: document.getElementById('tabApiCalls') };
  const tabPanes   = { optimizer: document.getElementById('paneOptimizer'), apiCalls: document.getElementById('paneApiCalls') };

  function switchTab(tab) {
    Object.keys(tabBtns).forEach((k) => {
      tabBtns[k].classList.toggle('active', k === tab);
      tabPanes[k].classList.toggle('active', k === tab);
    });
    if (tab === 'apiCalls') { loadApiCalls(); }
  }

  tabBtns.optimizer.addEventListener('click', () => switchTab('optimizer'));
  tabBtns.apiCalls.addEventListener('click',  () => switchTab('apiCalls'));

  // ── API Calls tab ──────────────────────────────────────────────────────────
  function loadApiCalls() {
    vscode.postMessage({ command: 'getApiCalls' });
  }

  document.getElementById('refreshBtn').addEventListener('click', loadApiCalls);

  document.getElementById('apiList').addEventListener('click', (e) => {
    const el = e.target.closest('[data-fn]');
    if (el) { vscode.postMessage({ command: 'gotoFunction', fn: el.dataset.fn }); }
  });

  function fmtTime(iso) {
    try {
      const d = new Date(iso);
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch { return '—'; }
  }

  function renderApiCalls(calls) {
    const list = document.getElementById('apiList');
    if (!calls || calls.length === 0) {
      list.innerHTML = '<div class="api-empty">No API calls logged yet.<br>Run the sample app to generate data.</div>';
      document.getElementById('totalCalls').textContent = '0';
      document.getElementById('totalSpend').textContent = '$0.0000';
      document.getElementById('topModel').textContent   = '—';
      return;
    }

    // Sort newest first
    const sorted = [...calls].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    // Stats
    const total  = sorted.length;
    const spend  = sorted.reduce((s, c) => s + (c.costUSD || 0), 0);
    const models = {};
    sorted.forEach((c) => { models[c.model] = (models[c.model] || 0) + 1; });
    const top = Object.entries(models).sort((a, b) => b[1] - a[1])[0]?.[0] ?? '—';

    document.getElementById('totalCalls').textContent = total.toString();
    document.getElementById('totalSpend').textContent = '$' + spend.toFixed(4);
    document.getElementById('topModel').textContent   = top.replace('gemini-', 'gemini‑').replace('gpt-', 'gpt‑');

    list.innerHTML = sorted.map((c) => {
      const dotCls = c.status === 'error' ? 'dot dot-err' : c.status === 'mock' ? 'dot dot-mock' : 'dot dot-ok';
      const tok    = (c.inputTokens || 0) + (c.outputTokens || 0);
      return '<div class="call-row">' +
        '<div class="call-top">' +
          '<span class="call-fn" data-fn="' + c.fn + '" title="Go to function">' + c.fn + '</span>' +
          '<span class="call-cost">$' + (c.costUSD || 0).toFixed(7) + '</span>' +
        '</div>' +
        '<div class="call-bottom">' +
          '<span class="' + dotCls + '"></span>' +
          '<span class="call-model">' + (c.model || '—') + '</span>' +
          '<span class="call-tokens">' + tok.toLocaleString() + ' tok</span>' +
          '<span class="call-time">' + fmtTime(c.timestamp) + '</span>' +
        '</div>' +
      '</div>';
    }).join('');
  }

  window.addEventListener('message', ({ data: msg }) => {
    if (msg.command === 'setPrompt') {
      promptEl.value = msg.text;
      updateStats();
      resultArea.classList.remove('visible');
      errorBar.classList.remove('visible');
      return;
    }

    // Restore button after optimize attempt
    optimizeBtn.disabled = false;
    btnIcon.classList.remove('spinner');
    btnIcon.textContent = '⚡';
    btnText.textContent = 'Optimize prompt';

    if (msg.command === 'optimizeResult') {
      const r = msg.result;
      lastOptimized = r.optimizedPrompt;

      const monthly = r.estimatedMonthlySavings;
      const yearly  = monthly * 12;

      document.getElementById('savingsPill').textContent      = '-' + r.savingsPercent + '% tokens';
      document.getElementById('origTokens').textContent       = r.originalTokens.toLocaleString();
      document.getElementById('optTokens').textContent        = r.optimizedTokens.toLocaleString();
      document.getElementById('savingsPct').textContent       = r.savingsPercent + '%';
      document.getElementById('monthlySavings').textContent   = fmt(monthly);
      document.getElementById('yearlySavings').textContent    = fmt(yearly);
      document.getElementById('resultExplanation').textContent= r.explanation;
      document.getElementById('resultPrompt').textContent     = r.optimizedPrompt;

      resultArea.classList.add('visible');
      resultArea.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    if (msg.command === 'optimizeError') {
      errorBar.textContent = msg.error;
      errorBar.classList.add('visible');
    }

    if (msg.command === 'apiCallsData') {
      renderApiCalls(msg.calls);
    }
  });
</script>
</body>
</html>`;
  }
}
