import * as vscode from "vscode";
import { PromptFinding } from "../scanner/promptScanner";
import { OptimizeResponse } from "../types";

export class PromptDetailPanel {
  static currentPanel: PromptDetailPanel | undefined;
  private readonly _panel: vscode.WebviewPanel;
  private _finding: PromptFinding;
  private _optimizeResult: OptimizeResponse | null = null;

  static show(finding: PromptFinding, context: vscode.ExtensionContext): PromptDetailPanel {
    if (PromptDetailPanel.currentPanel) {
      PromptDetailPanel.currentPanel._update(finding);
      PromptDetailPanel.currentPanel._panel.reveal(vscode.ViewColumn.Beside);
      return PromptDetailPanel.currentPanel;
    }
    const panel = vscode.window.createWebviewPanel(
      "promptimizeDetail",
      "Promptimize: Prompt Cost",
      vscode.ViewColumn.Beside,
      { enableScripts: true }
    );
    PromptDetailPanel.currentPanel = new PromptDetailPanel(panel, finding);
    return PromptDetailPanel.currentPanel;
  }

  private constructor(panel: vscode.WebviewPanel, finding: PromptFinding) {
    this._panel = panel;
    this._finding = finding;
    this._render();
    this._panel.onDidDispose(() => {
      PromptDetailPanel.currentPanel = undefined;
    });
  }

  setOptimizeResult(result: OptimizeResponse): void {
    this._optimizeResult = result;
    this._render();
  }

  private _update(finding: PromptFinding): void {
    this._finding = finding;
    this._optimizeResult = null;
    this._render();
  }

  private _render(): void {
    const f = this._finding;
    const opt = this._optimizeResult;
    const riskColor = f.risk === "high" ? "#ffffff" : f.risk === "medium" ? "#aaaaaa" : "#555555";
    const riskBorder = f.risk === "high" ? "1px dashed #ffffff" : f.risk === "medium" ? "1px solid #555" : "1px solid #333";

    const optimizeSection = opt
      ? `
        <div class="section">
          <div class="section-label">Optimized prompt</div>
          <div class="stat-row">
            <div class="stat"><div class="stat-val">${opt.originalTokens}</div><div class="stat-lbl">original tokens</div></div>
            <div class="stat"><div class="stat-val">${opt.optimizedTokens}</div><div class="stat-lbl">optimized tokens</div></div>
            <div class="stat accent"><div class="stat-val">${opt.savingsPercent}%</div><div class="stat-lbl">token reduction</div></div>
            <div class="stat accent"><div class="stat-val">$${opt.estimatedMonthlySavings.toFixed(2)}</div><div class="stat-lbl">monthly savings</div></div>
          </div>
          <div class="section-label" style="margin-top:16px">Explanation</div>
          <div class="explanation">${opt.explanation}</div>
          ${opt.memoryUsed.length > 0 ? `
          <div class="section-label" style="margin-top:12px">Memory rules applied</div>
          <ul class="rule-list">${opt.memoryUsed.map(r => `<li>${r}</li>`).join("")}</ul>
          ` : ""}
          <div class="col-grid">
            <div>
              <div class="section-label">Before</div>
              <pre class="code-block">${escHtml(opt.originalPrompt)}</pre>
            </div>
            <div>
              <div class="section-label accent-label">After</div>
              <pre class="code-block accent-block">${escHtml(opt.optimizedPrompt)}</pre>
            </div>
          </div>
          <button class="btn" onclick="copyOptimized()">Copy optimized prompt</button>
        </div>`
      : `<button class="btn btn-primary" onclick="optimize()">⚡ Optimize this prompt</button>`;

    this._panel.webview.html = `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: #000; color: #fff; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; font-size: 13px; padding: 24px; }
  h1 { font-size: 15px; font-weight: 600; letter-spacing: 0.03em; margin-bottom: 4px; }
  .subtitle { color: #666; font-size: 12px; margin-bottom: 20px; }
  .risk-badge { display: inline-block; padding: 2px 10px; font-size: 11px; font-weight: 700; letter-spacing: 0.1em; border: ${riskBorder}; color: ${riskColor}; margin-bottom: 20px; }
  .section { margin-bottom: 20px; }
  .section-label { font-size: 10px; text-transform: uppercase; letter-spacing: 0.12em; color: #555; margin-bottom: 8px; font-weight: 600; }
  .accent-label { color: #fff; }
  .stat-row { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; }
  .stat { background: #0d0d0d; border: 1px solid #1a1a1a; padding: 12px; }
  .stat.accent { border-color: #fff; }
  .stat-val { font-size: 20px; font-weight: 700; font-variant-numeric: tabular-nums; }
  .stat-lbl { font-size: 10px; color: #555; margin-top: 2px; text-transform: uppercase; letter-spacing: 0.08em; }
  .snippet-block { background: #0d0d0d; border: 1px solid #1a1a1a; padding: 12px; font-family: 'SF Mono', 'Fira Code', monospace; font-size: 11px; color: #888; white-space: pre-wrap; word-break: break-word; max-height: 120px; overflow: auto; line-height: 1.5; margin-bottom: 16px; }
  .col-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin: 12px 0; }
  .code-block { background: #0d0d0d; border: 1px solid #1a1a1a; padding: 10px; font-family: 'SF Mono', 'Fira Code', monospace; font-size: 11px; color: #888; white-space: pre-wrap; word-break: break-word; max-height: 200px; overflow: auto; line-height: 1.5; }
  .accent-block { border-color: #fff; color: #fff; }
  .explanation { color: #aaa; font-size: 12px; line-height: 1.6; }
  .rule-list { padding-left: 16px; color: #666; font-size: 12px; }
  .rule-list li { margin-bottom: 4px; }
  .divider { border: none; border-top: 1px solid #1a1a1a; margin: 20px 0; }
  .btn { background: #111; border: 1px solid #333; color: #fff; padding: 8px 16px; font-size: 12px; cursor: pointer; margin-top: 12px; margin-right: 8px; letter-spacing: 0.05em; }
  .btn:hover { border-color: #fff; }
  .btn-primary { background: #fff; color: #000; border-color: #fff; font-weight: 600; }
  .btn-primary:hover { background: #ddd; }
</style>
</head>
<body>
<h1>Prompt Cost Analysis</h1>
<div class="subtitle">Line ${f.range.start.line + 1} — ${escHtml(f.model)}</div>
<div class="risk-badge">${f.risk.toUpperCase()} RISK</div>

<div class="section">
  <div class="section-label">Cost breakdown</div>
  <div class="stat-row">
    <div class="stat"><div class="stat-val">${f.tokens.toLocaleString()}</div><div class="stat-lbl">input tokens</div></div>
    <div class="stat"><div class="stat-val">~${f.outputTokens.toLocaleString()}</div><div class="stat-lbl">output tokens</div></div>
    <div class="stat"><div class="stat-val">$${f.costPerRequest.toFixed(5)}</div><div class="stat-lbl">per request</div></div>
    <div class="stat accent"><div class="stat-val">$${f.monthlyCost.toFixed(2)}</div><div class="stat-lbl">monthly (10k calls)</div></div>
  </div>
</div>

<div class="section">
  <div class="section-label">Prompt snippet</div>
  <div class="snippet-block">${escHtml(f.snippet)}</div>
</div>

<hr class="divider">

${optimizeSection}

<script>
  const vscode = acquireVsCodeApi();
  function optimize() { vscode.postMessage({ command: 'optimize' }); }
  function copyOptimized() {
    const text = ${JSON.stringify(opt?.optimizedPrompt ?? "")};
    navigator.clipboard.writeText(text);
  }
</script>
</body>
</html>`;
  }
}

function escHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
