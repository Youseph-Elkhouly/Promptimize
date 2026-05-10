import * as vscode from "vscode";
import { scanDocumentForExpensivePrompts, PromptFinding } from "./scanner/promptScanner";
import { findingsStore, CostHoverProvider } from "./providers/CostHoverProvider";
import { CostCodeLensProvider } from "./providers/CostCodeLensProvider";
import { PromptDetailPanel } from "./providers/PromptDetailPanel";
import { PromptPanelViewProvider } from "./providers/PromptPanelView";
import { registerChatParticipant } from "./chat/chatParticipant";
import { scanWorkspaceCommand } from "./commands/scanWorkspaceCommand";
import { optimizeSelectedPromptCommand } from "./commands/optimizePromptCommand";
import { costDiffCommand } from "./commands/costDiffCommand";
import { optimizePrompt } from "./api/backendClient";

const SUPPORTED = ["typescript", "javascript", "python", "typescriptreact", "javascriptreact"];

let outputChannel: vscode.OutputChannel;
let diagnosticCollection: vscode.DiagnosticCollection;
let codeLensProvider: CostCodeLensProvider;

// ── Live scanning ─────────────────────────────────────────────────────────────

function updateFindings(document: vscode.TextDocument): PromptFinding[] {
  if (!SUPPORTED.includes(document.languageId)) return [];
  const enableInline = vscode.workspace.getConfiguration("promptimize").get<boolean>("enableInlineWarnings", true);
  if (!enableInline) return [];

  const findings = scanDocumentForExpensivePrompts(document);
  const key = document.uri.toString();
  findingsStore.set(key, findings);
  codeLensProvider?.refresh();

  // Update diagnostics
  const diags: vscode.Diagnostic[] = findings.map((f) => {
    const severity =
      f.risk === "high" ? vscode.DiagnosticSeverity.Warning : vscode.DiagnosticSeverity.Information;
    const d = new vscode.Diagnostic(
      f.range,
      `Promptimize [${f.risk.toUpperCase()}]: ~${f.tokens} tokens · ~$${f.monthlyCost.toFixed(2)}/mo · ${f.model} — hover for details, click ⚡ to optimize`,
      severity
    );
    d.source = "Promptimize";
    d.code = { value: "prompt-cost", target: vscode.Uri.parse("command:promptimize.showCostReport") };
    return d;
  });
  diagnosticCollection.set(document.uri, diags);

  return findings;
}

// ── Activate ─────────────────────────────────────────────────────────────────

export function activate(context: vscode.ExtensionContext): void {
  outputChannel = vscode.window.createOutputChannel("Promptimize");
  diagnosticCollection = vscode.languages.createDiagnosticCollection("promptimize");
  codeLensProvider = new CostCodeLensProvider();

  const hoverProvider = new CostHoverProvider();
  const docSelector: vscode.DocumentSelector = SUPPORTED.map((lang) => ({ language: lang }));

  // Register chat participant (@promptimize in the chat window)
  registerChatParticipant(context);

  // Register the sidebar panel
  const promptPanelProvider = new PromptPanelViewProvider(context.extensionUri);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(PromptPanelViewProvider.viewId, promptPanelProvider),
  );

  // Auto-feed selected text into the panel
  let selectionDebounce: ReturnType<typeof setTimeout> | undefined;
  context.subscriptions.push(
    vscode.window.onDidChangeTextEditorSelection((e) => {
      const selected = e.textEditor.document.getText(e.selections[0]);
      if (!selected || selected.trim().length < 10) return;
      clearTimeout(selectionDebounce);
      selectionDebounce = setTimeout(() => {
        promptPanelProvider.setPrompt(selected.trim());
      }, 300);
    }),
  );

  // Register providers
  context.subscriptions.push(
    vscode.languages.registerHoverProvider(docSelector, hoverProvider),
    vscode.languages.registerCodeLensProvider(docSelector, codeLensProvider),
    diagnosticCollection,
  );

  // ── Commands ───────────────────────────────────────────────────────────────

  context.subscriptions.push(

    vscode.commands.registerCommand("promptimize.scanWorkspace", async () => {
      await scanWorkspaceCommand(outputChannel, diagnosticCollection);
      // Re-scan open editors to update lenses
      vscode.workspace.textDocuments.forEach(updateFindings);
    }),

    vscode.commands.registerCommand("promptimize.optimizeSelected", async () => {
      await optimizeSelectedPromptCommand(outputChannel);
    }),

    vscode.commands.registerCommand("promptimize.showCostReport", () => {
      outputChannel.show();
    }),

    vscode.commands.registerCommand("promptimize.runCostDiff", async () => {
      await costDiffCommand(outputChannel);
    }),

    vscode.commands.registerCommand("promptimize.openDashboard", () => {
      vscode.env.openExternal(vscode.Uri.parse("http://localhost:3000"));
    }),

    // Called by code lens click — shows the detail panel for a specific finding
    vscode.commands.registerCommand("promptimize.showPromptDetail", async (finding: PromptFinding) => {
      const panel = PromptDetailPanel.show(finding, context);
      // Listen for optimize message from the webview
      (panel as any)._panel?.webview?.onDidReceiveMessage(async (msg: any) => {
        if (msg.command === "optimize") {
          const editor = vscode.window.activeTextEditor;
          const projectId = getProjectId();
          const text = editor
            ? editor.document.getText(finding.range).slice(0, 4000)
            : finding.snippet;

          let result;
          try {
            await vscode.window.withProgress(
              { location: vscode.ProgressLocation.Notification, title: "Promptimize: Optimizing…", cancellable: false },
              async () => {
                result = await optimizePrompt(projectId, text, finding.model, "balanced");
              }
            );
            panel.setOptimizeResult(result!);
          } catch (e: any) {
            vscode.window.showErrorMessage(`Promptimize: ${e.message} — is the backend running?`);
          }
        }
      });
    }),
  );

  // ── Live scanning on open / edit ───────────────────────────────────────────

  vscode.workspace.textDocuments.forEach(updateFindings);

  context.subscriptions.push(
    vscode.workspace.onDidOpenTextDocument(updateFindings),
    vscode.workspace.onDidChangeTextDocument((e) => {
      // Debounce heavy re-scans slightly — update on every change is fine for regex
      updateFindings(e.document);
    }),
    vscode.workspace.onDidCloseTextDocument((doc) => {
      diagnosticCollection.delete(doc.uri);
      findingsStore.delete(doc.uri.toString());
      codeLensProvider.refresh();
    }),
  );

  // Welcome message shown in the Output panel (not the debug console)
  outputChannel.appendLine("═══════════════════════════════════════");
  outputChannel.appendLine("  Promptimize  ·  v0.1.0");
  outputChannel.appendLine("═══════════════════════════════════════");
  outputChannel.appendLine("  Hover any prompt  →  see cost");
  outputChannel.appendLine("  Click ⚡ lens     →  optimize");
  outputChannel.appendLine("  Ctrl+Shift+P → Promptimize: Scan Workspace");
  outputChannel.appendLine("───────────────────────────────────────");
  outputChannel.appendLine(`  Backend: ${vscode.workspace.getConfiguration("promptimize").get("backendUrl", "http://localhost:8000")}`);
  outputChannel.appendLine("═══════════════════════════════════════");
  outputChannel.show(true);
}

export function deactivate(): void {
  outputChannel?.dispose();
  diagnosticCollection?.dispose();
}

function getProjectId(): string {
  const folders = vscode.workspace.workspaceFolders;
  if (folders && folders.length > 0) {
    return require("path").basename(folders[0].uri.fsPath);
  }
  return "promptimize-project";
}
