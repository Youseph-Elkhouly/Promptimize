import * as vscode from "vscode";
import * as path from "path";
import { runCostDiff } from "../api/backendClient";
import { getCommitHash, getPreviousCommitHash, getRepoName } from "../git/gitInfo";

export async function costDiffCommand(outputChannel: vscode.OutputChannel): Promise<void> {
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders) {
    vscode.window.showWarningMessage("Promptimize: No workspace folder open.");
    return;
  }

  const wsPath = workspaceFolders[0].uri.fsPath;
  const projectId = getRepoName(wsPath) || "promptimize-project";
  const currentCommit = getCommitHash(wsPath);
  const previousCommit = getPreviousCommitHash(wsPath);

  if (currentCommit === "unknown" || previousCommit === "unknown") {
    vscode.window.showWarningMessage("Promptimize: Git history not available. Run a scan on two different commits first.");
    return;
  }

  let result;
  try {
    await vscode.window.withProgress(
      { location: vscode.ProgressLocation.Notification, title: "Promptimize: Computing CostDiff...", cancellable: false },
      async () => {
        result = await runCostDiff(projectId, previousCommit, currentCommit);
      }
    );
  } catch (err: any) {
    vscode.window.showErrorMessage(`Promptimize: CostDiff failed — ${err.message}`);
    return;
  }

  const statusEmoji = result!.status === "pass" ? "✓" : result!.status === "warning" ? "⚠" : "✗";

  outputChannel.clear();
  outputChannel.appendLine("═══════════════════════════════════════════");
  outputChannel.appendLine("  Promptimize — CostDiff Report");
  outputChannel.appendLine("═══════════════════════════════════════════");
  outputChannel.appendLine(`  Previous commit: ${result!.previousCommit.slice(0, 7)}`);
  outputChannel.appendLine(`  Current commit:  ${result!.currentCommit.slice(0, 7)}`);
  outputChannel.appendLine("");
  outputChannel.appendLine(`  Previous cost:   $${result!.previousMonthlyCost.toFixed(2)}/mo`);
  outputChannel.appendLine(`  Current cost:    $${result!.currentMonthlyCost.toFixed(2)}/mo`);
  outputChannel.appendLine(`  Token change:    ${result!.tokenIncreasePercent > 0 ? "+" : ""}${result!.tokenIncreasePercent.toFixed(1)}%`);
  outputChannel.appendLine(`  Cost change:     ${result!.costIncreasePercent > 0 ? "+" : ""}${result!.costIncreasePercent.toFixed(1)}%`);
  outputChannel.appendLine("");

  if (result!.mainCauses.length > 0) {
    outputChannel.appendLine("  MAIN CAUSES:");
    for (const cause of result!.mainCauses) {
      outputChannel.appendLine(`  • ${cause.filePath}`);
      outputChannel.appendLine(`    ${cause.reason} (+$${cause.monthlyCostIncrease.toFixed(2)}/mo)`);
    }
    outputChannel.appendLine("");
  }

  if (result!.recommendations.length > 0) {
    outputChannel.appendLine("  RECOMMENDATIONS:");
    for (const rec of result!.recommendations) {
      outputChannel.appendLine(`  → ${rec}`);
    }
    outputChannel.appendLine("");
  }

  outputChannel.appendLine(`  STATUS: ${statusEmoji} ${result!.status.toUpperCase()}`);
  outputChannel.appendLine("═══════════════════════════════════════════");
  outputChannel.show(true);

  const msg =
    result!.status === "pass"
      ? `Promptimize CostDiff: No significant cost increase. ✓`
      : `Promptimize CostDiff: ${result!.status === "failed_budget" ? "BUDGET EXCEEDED" : "WARNING"} — +${result!.costIncreasePercent.toFixed(1)}% cost`;

  vscode.window.showInformationMessage(msg);
}
