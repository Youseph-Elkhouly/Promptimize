import axios from "axios";
import { DashboardData, OptimizeResponse, ScanResponse, CostDiffResponse } from "./types";

const BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

const api = axios.create({ baseURL: BASE_URL });

export async function getDashboard(projectId: string): Promise<DashboardData> {
  const { data } = await api.get(`/dashboard/${projectId}`);
  return data;
}

export async function scanFiles(
  projectId: string,
  files: Array<{ path: string; language: string; content: string }>
): Promise<ScanResponse> {
  const { data } = await api.post("/scan", { projectId, files });
  return data;
}

export async function optimizePrompt(
  projectId: string,
  prompt: string,
  model = "gpt-4o",
  mode = "balanced"
): Promise<OptimizeResponse> {
  const { data } = await api.post("/optimize", {
    projectId,
    prompt,
    model,
    mode,
    preserveIntent: true,
  });
  return data;
}

export async function runCostDiff(
  projectId: string,
  previousCommit: string,
  currentCommit: string
): Promise<CostDiffResponse> {
  const { data } = await api.post("/cost-diff", { projectId, previousCommit, currentCommit });
  return data;
}

export async function getMemoryInsights(projectId: string): Promise<string[]> {
  const { data } = await api.get(`/memory/${projectId}/insights`);
  return data.insights;
}

export async function saveProjectContext(projectId: string, context: object): Promise<void> {
  await api.post("/memory/project-context", { projectId, context });
}

export async function checkHealth(): Promise<boolean> {
  try {
    const { data } = await api.get("/health");
    return data.status === "ok";
  } catch {
    return false;
  }
}
