import * as vscode from "vscode";
import { optimizePrompt } from "../api/backendClient";
import { detectModel } from "../scanner/modelDetector";
import { OptimizeResponse } from "../types";

export async function optimizeSelectedPromptCommand(
  outputChannel: vscode.OutputChannel
): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    vscode.window.showWarningMessage("Promptimize: Open a file and select a prompt to optimize.");
    return;
  }

  const selection = editor.selection;
  const selectedText = editor.document.getText(selection);

  if (!selectedText || selectedText.trim().length < 50) {
    vscode.window.showWarningMessage("Promptimize: Select at least 50 characters of prompt text.");
    return;
  }

  // Detect which model the surrounding code uses
  const surrounding = editor.document.getText();
  const model = detectModel(surrounding);

  const workspaceFolders = vscode.workspace.workspaceFolders;
  const projectId = workspaceFolders?.[0]
    ? require("path").basename(workspaceFolders[0].uri.fsPath)
    : "promptimize-project";

  const modes = ["balanced", "aggressive", "safe", "json-strict", "agent"];
  const mode = await vscode.window.showQuickPick(modes, {
    placeHolder: "Select optimization mode",
    title: "Promptimize: Optimization Mode",
  });
  if (!mode) return;

  let result: OptimizeResponse;
  try {
    await vscode.window.withProgress(
      { location: vscode.ProgressLocation.Notification, title: "Promptimize: Optimizing prompt...", cancellable: false },
      async () => {
        result = await optimizePrompt(projectId, selectedText, model, mode);
      }
    );
  } catch (err: any) {
    vscode.window.showErrorMessage(`Promptimize: Optimization failed — ${err.message}`);
    return;
  }

  // Show results in output channel
  outputChannel.clear();
  outputChannel.appendLine("═══════════════════════════════════════════");
  outputChannel.appendLine("  Promptimize — Optimization Result");
  outputChannel.appendLine("═══════════════════════════════════════════");
  outputChannel.appendLine(`  Mode:         ${mode}`);
  outputChannel.appendLine(`  Model:        ${model}`);
  outputChannel.appendLine(`  Original:     ${result!.originalTokens} tokens`);
  outputChannel.appendLine(`  Optimized:    ${result!.optimizedTokens} tokens`);
  outputChannel.appendLine(`  Savings:      ${result!.savingsPercent}% fewer tokens`);
  outputChannel.appendLine(`  Monthly save: $${result!.estimatedMonthlySavings.toFixed(2)}`);
  outputChannel.appendLine(`  Risk:         ${result!.riskLevel}`);
  outputChannel.appendLine("");
  outputChannel.appendLine("  EXPLANATION:");
  outputChannel.appendLine(`  ${result!.explanation}`);
  outputChannel.appendLine("");
  if (result!.memoryUsed.length > 0) {
    outputChannel.appendLine("  MEMORY RULES APPLIED:");
    result!.memoryUsed.forEach((r) => outputChannel.appendLine(`  • ${r}`));
    outputChannel.appendLine("");
  }
  outputChannel.appendLine("  OPTIMIZED PROMPT:");
  outputChannel.appendLine("  ─────────────────────────────────────────");
  outputChannel.appendLine(result!.optimizedPrompt);
  outputChannel.appendLine("═══════════════════════════════════════════");
  outputChannel.show(true);

  // Offer to replace selection
  const action = await vscode.window.showInformationMessage(
    `Promptimize: Saved ${result!.savingsPercent}% tokens ($${result!.estimatedMonthlySavings.toFixed(2)}/mo). Replace selected text?`,
    "Replace",
    "Keep Original"
  );

  if (action === "Replace") {
    await editor.edit((editBuilder) => {
      editBuilder.replace(selection, result!.optimizedPrompt);
    });
    vscode.window.showInformationMessage("Promptimize: Prompt replaced with optimized version.");
  }
}
