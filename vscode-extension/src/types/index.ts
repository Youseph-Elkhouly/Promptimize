export interface DetectedPrompt {
  id: string;
  filePath: string;
  startLine: number;
  endLine: number;
  model: string;
  inputTokens: number;
  estimatedOutputTokens: number;
  estimatedCostPerRequest: number;
  estimatedMonthlyCost: number;
  riskLevel: "low" | "medium" | "high";
  snippet: string;
}

export interface ScanResponse {
  scanId: string;
  projectId: string;
  commitHash: string;
  totalPrompts: number;
  totalInputTokens: number;
  estimatedMonthlyCost: number;
  prompts: DetectedPrompt[];
}

export interface OptimizeResponse {
  originalPrompt: string;
  optimizedPrompt: string;
  originalTokens: number;
  optimizedTokens: number;
  savingsPercent: number;
  estimatedMonthlySavings: number;
  riskLevel: string;
  explanation: string;
  memoryUsed: string[];
}

export interface CostDiffResponse {
  previousCommit: string;
  currentCommit: string;
  previousMonthlyCost: number;
  currentMonthlyCost: number;
  costIncreasePercent: number;
  tokenIncreasePercent: number;
  status: string;
  mainCauses: Array<{
    filePath: string;
    reason: string;
    monthlyCostIncrease: number;
  }>;
  recommendations: string[];
}
