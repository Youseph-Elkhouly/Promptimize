import * as vscode from "vscode";
import { PromptFinding } from "../scanner/promptScanner";

// Shared map: document URI → findings. Populated by the extension's live scanner.
export const findingsStore = new Map<string, PromptFinding[]>();

function riskIcon(risk: string): string {
  return risk === "high" ? "⚠" : risk === "medium" ? "◆" : "●";
}

function formatCost(n: number): string {
  return `$${n.toFixed(2)}`;
}

function formatCostPer(n: number): string {
  if (n < 0.001) return `$${(n * 1000).toFixed(3)}m`;
  return `$${n.toFixed(4)}`;
}

export class CostHoverProvider implements vscode.HoverProvider {
  provideHover(
    document: vscode.TextDocument,
    position: vscode.Position
  ): vscode.Hover | undefined {
    const findings = findingsStore.get(document.uri.toString());
    if (!findings || findings.length === 0) return undefined;

    const hit = findings.find((f) => f.range.contains(position));
    if (!hit) return undefined;

    const md = new vscode.MarkdownString("", true);
    md.isTrusted = true;
    md.supportHtml = false;

    const riskLabel = hit.risk.toUpperCase();
    const icon = riskIcon(hit.risk);

    md.appendMarkdown(`**${icon} Promptimize** — ${riskLabel} cost prompt\n\n`);
    md.appendMarkdown("---\n\n");
    md.appendMarkdown(`| | |\n|---|---|\n`);
    md.appendMarkdown(`| Model | \`${hit.model}\` |\n`);
    md.appendMarkdown(`| Input tokens | **${hit.tokens.toLocaleString()}** |\n`);
    md.appendMarkdown(`| Output tokens | ~${hit.outputTokens.toLocaleString()} |\n`);
    md.appendMarkdown(`| Cost / request | ${formatCostPer(hit.costPerRequest)} |\n`);
    md.appendMarkdown(`| **Monthly cost** (10k calls) | **${formatCost(hit.monthlyCost)}** |\n`);
    md.appendMarkdown("\n");

    // Snippet preview
    if (hit.snippet) {
      md.appendMarkdown("---\n\n");
      md.appendMarkdown("**Prompt snippet:**\n\n");
      md.appendCodeblock(hit.snippet, "text");
    }

    md.appendMarkdown("\n---\n\n");

    // Clickable command links
    const optimizeUri = vscode.Uri.parse(
      `command:promptimize.optimizeSelected`
    );
    md.appendMarkdown(`[$(zap) Optimize this prompt](${optimizeUri})`);
    md.appendMarkdown("  |  ");
    const reportUri = vscode.Uri.parse(`command:promptimize.showCostReport`);
    md.appendMarkdown(`[$(graph) Cost report](${reportUri})`);

    return new vscode.Hover(md, hit.range);
  }
}
