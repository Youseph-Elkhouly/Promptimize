import * as vscode from "vscode";
import axios from "axios";
import { ScanResponse, OptimizeResponse, CostDiffResponse } from "../types";

function getBackendUrl(): string {
  return vscode.workspace
    .getConfiguration("promptimize")
    .get<string>("backendUrl", "http://localhost:8000");
}

export async function scanFiles(
  projectId: string,
  files: Array<{ path: string; language: string; content: string }>,
  commitHash = "unknown",
  branch = "main"
): Promise<ScanResponse> {
  const url = `${getBackendUrl()}/scan`;
  const response = await axios.post<ScanResponse>(url, {
    projectId,
    repoName: projectId,
    commitHash,
    branch,
    files,
  });
  return response.data;
}

export async function optimizePrompt(
  projectId: string,
  prompt: string,
  model = "unknown",
  mode = "balanced"
): Promise<OptimizeResponse> {
  const url = `${getBackendUrl()}/optimize`;
  const response = await axios.post<OptimizeResponse>(url, {
    projectId,
    prompt,
    model,
    mode,
    preserveIntent: true,
  });
  return response.data;
}

export async function runCostDiff(
  projectId: string,
  previousCommit: string,
  currentCommit: string
): Promise<CostDiffResponse> {
  const url = `${getBackendUrl()}/cost-diff`;
  const response = await axios.post<CostDiffResponse>(url, {
    projectId,
    previousCommit,
    currentCommit,
  });
  return response.data;
}

export async function checkHealth(): Promise<boolean> {
  try {
    const url = `${getBackendUrl()}/health`;
    const response = await axios.get(url, { timeout: 3000 });
    return response.data?.status === "ok";
  } catch {
    return false;
  }
}
