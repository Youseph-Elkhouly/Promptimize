import * as vscode from "vscode";
import { findingsStore } from "./CostHoverProvider";

export class CostCodeLensProvider implements vscode.CodeLensProvider {
  private _onDidChangeCodeLenses = new vscode.EventEmitter<void>();
  readonly onDidChangeCodeLenses = this._onDidChangeCodeLenses.event;

  // Called by the extension whenever findings update, to refresh lenses
  refresh(): void {
    this._onDidChangeCodeLenses.fire();
  }

  provideCodeLenses(document: vscode.TextDocument): vscode.CodeLens[] {
    const findings = findingsStore.get(document.uri.toString());
    if (!findings || findings.length === 0) return [];

    return findings.map((f) => {
      const icon = f.risk === "high" ? "⚠" : f.risk === "medium" ? "◆" : "●";
      const costLabel = `$${f.monthlyCost.toFixed(2)}/mo`;
      const tokenLabel = `~${f.tokens.toLocaleString()} tokens`;
      const modelLabel = f.model !== "unknown" ? ` · ${f.model}` : "";

      // The primary lens: cost summary
      const costLens = new vscode.CodeLens(
        new vscode.Range(f.range.start.line, 0, f.range.start.line, 0),
        {
          title: `${icon} Promptimize: ${tokenLabel} · ${costLabel}${modelLabel}`,
          command: "promptimize.showPromptDetail",
          arguments: [f],
          tooltip: `${f.risk.toUpperCase()} cost prompt. Click to see breakdown.`,
        }
      );

      // Secondary lens: quick optimize action — opens detail panel for this specific finding
      const optimizeLens = new vscode.CodeLens(
        new vscode.Range(f.range.start.line, 0, f.range.start.line, 0),
        {
          title: "$(zap) Optimize",
          command: "promptimize.showPromptDetail",
          arguments: [f],
          tooltip: "Open optimization panel for this prompt",
        }
      );

      return [costLens, optimizeLens];
    }).flat();
  }
}
