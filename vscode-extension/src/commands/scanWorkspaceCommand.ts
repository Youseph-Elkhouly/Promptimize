import * as vscode from "vscode";
import * as path from "path";
import { scanFiles, checkHealth } from "../api/backendClient";
import { getCommitHash, getBranch, getRepoName } from "../git/gitInfo";
import { DetectedPrompt } from "../types";

const IGNORE_DIRS = new Set(["node_modules", ".git", "dist", "build", ".next", "venv", ".venv", "out", "__pycache__"]);

function shouldSkip(filePath: string): boolean {
  return filePath.split(path.sep).some((part) => IGNORE_DIRS.has(part));
}

export async function scanWorkspaceCommand(
  outputChannel: vscode.OutputChannel,
  diagnosticCollection: vscode.DiagnosticCollection
): Promise<DetectedPrompt[]> {
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders) {
    vscode.window.showWarningMessage("Promptimize: No workspace folder open.");
    return [];
  }

  const healthy = await checkHealth();
  if (!healthy) {
    vscode.window.showErrorMessage(
      "Promptimize: Cannot reach backend. Start the backend with: uvicorn app.main:app --reload --port 8000"
    );
    return [];
  }

  const wsPath = workspaceFolders[0].uri.fsPath;
  const projectId = getRepoName(wsPath) || "promptimize-project";
  const commitHash = getCommitHash(wsPath);
  const branch = getBranch(wsPath);

  // Collect TypeScript, JavaScript, Python files
  const fileUris = await vscode.workspace.findFiles(
    "**/*.{ts,tsx,js,jsx,py}",
    "{node_modules,dist,build,.next,venv,.venv,__pycache__}/**"
  );

  if (fileUris.length === 0) {
    vscode.window.showInformationMessage("Promptimize: No supported files found in workspace.");
    return [];
  }

  return vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title: "Promptimize: Scanning workspace...", cancellable: false },
    async (progress) => {
      const files: Array<{ path: string; language: string; content: string }> = [];

      for (const uri of fileUris) {
        if (shouldSkip(uri.fsPath)) continue;
        try {
          const doc = await vscode.workspace.openTextDocument(uri);
          files.push({
            path: vscode.workspace.asRelativePath(uri),
            language: doc.languageId,
            content: doc.getText(),
          });
        } catch {
          // skip unreadable files
        }
      }

      progress.report({ message: `Sending ${files.length} files to backend...` });

      let result;
      try {
        result = await scanFiles(projectId, files, commitHash, branch);
      } catch (err: any) {
        vscode.window.showErrorMessage(`Promptimize: Scan failed — ${err.message}`);
        return [];
      }

      // Update diagnostics
      diagnosticCollection.clear();
      const diagMap = new Map<string, vscode.Diagnostic[]>();

      for (const prompt of result.prompts) {
        const uri = fileUris.find((u) => vscode.workspace.asRelativePath(u) === prompt.filePath);
        if (!uri) continue;
        const diags = diagMap.get(uri.toString()) || [];
        const range = new vscode.Range(
          new vscode.Position(Math.max(0, prompt.startLine - 1), 0),
          new vscode.Position(Math.max(0, prompt.endLine - 1), 999)
        );
        const severity =
          prompt.riskLevel === "high"
            ? vscode.DiagnosticSeverity.Warning
            : vscode.DiagnosticSeverity.Information;
        const message =
          `Promptimize [${prompt.riskLevel.toUpperCase()}]: ~${prompt.inputTokens} tokens, ` +
          `~$${prompt.estimatedMonthlyCost.toFixed(2)}/mo on ${prompt.model}`;
        const diag = new vscode.Diagnostic(range, message, severity);
        diag.source = "Promptimize";
        diags.push(diag);
        diagMap.set(uri.toString(), diags);
      }

      for (const [uriStr, diags] of diagMap) {
        diagnosticCollection.set(vscode.Uri.parse(uriStr), diags);
      }

      // Print report to output channel
      outputChannel.clear();
      outputChannel.appendLine("═══════════════════════════════════════════");
      outputChannel.appendLine("  Promptimize — Scan Report");
      outputChannel.appendLine("═══════════════════════════════════════════");
      outputChannel.appendLine(`  Project:      ${projectId}`);
      outputChannel.appendLine(`  Commit:       ${commitHash.slice(0, 7)}`);
      outputChannel.appendLine(`  Branch:       ${branch}`);
      outputChannel.appendLine(`  Files scanned: ${files.length}`);
      outputChannel.appendLine(`  Prompts found: ${result.totalPrompts}`);
      outputChannel.appendLine(`  Total tokens:  ${result.totalInputTokens.toLocaleString()}`);
      outputChannel.appendLine(`  Est. monthly:  $${result.estimatedMonthlyCost.toFixed(2)}`);
      outputChannel.appendLine("");

      if (result.prompts.length > 0) {
        outputChannel.appendLine("  TOP EXPENSIVE PROMPTS:");
        const sorted = [...result.prompts].sort((a, b) => b.estimatedMonthlyCost - a.estimatedMonthlyCost);
        for (const p of sorted.slice(0, 5)) {
          outputChannel.appendLine(`  [${p.riskLevel.toUpperCase()}] ${p.filePath}:${p.startLine}`);
          outputChannel.appendLine(`         Model: ${p.model} | Tokens: ${p.inputTokens} | $${p.estimatedMonthlyCost.toFixed(2)}/mo`);
        }
      }
      outputChannel.appendLine("═══════════════════════════════════════════");
      outputChannel.show(true);

      const highCount = result.prompts.filter((p) => p.riskLevel === "high").length;
      vscode.window.showInformationMessage(
        `Promptimize: Found ${result.totalPrompts} prompts. ` +
          `${highCount} high-risk. Estimated $${result.estimatedMonthlyCost.toFixed(2)}/month.`,
        "Show Report"
      ).then((choice) => {
        if (choice === "Show Report") outputChannel.show();
      });

      return result.prompts;
    }
  );
}
