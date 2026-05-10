export type RiskLevel = "low" | "medium" | "high";

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
  riskLevel: RiskLevel;
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

export interface CostTimelineEntry {
  commit: string;
  branch: string;
  cost: number;
  tokens: number;
  timestamp: string;
}

export interface DashboardData {
  projectId: string;
  projectedMonthlyCost: number;
  potentialMonthlySavings: number;
  averagePromptCompression: number;
  mostExpensiveFile: string;
  totalPrompts: number;
  highRiskPrompts: number;
  biggestCostRegression: number;
  costTimeline: CostTimelineEntry[];
  topPrompts: DetectedPrompt[];
  recentOptimizations: OptimizationRecord[];
  memoryInsights: string[];
}

export interface OptimizationRecord {
  promptId: string;
  projectId: string;
  filePath: string;
  model: string;
  mode: string;
  originalTokens: number;
  optimizedTokens: number;
  savingsPercent: number;
  estimatedMonthlySavings: number;
  timestamp: string;
}

export interface CostDiffCause {
  filePath: string;
  reason: string;
  monthlyCostIncrease: number;
}

export interface CostDiffResponse {
  previousCommit: string;
  currentCommit: string;
  previousMonthlyCost: number;
  currentMonthlyCost: number;
  costIncreasePercent: number;
  tokenIncreasePercent: number;
  status: "pass" | "warning" | "failed_budget";
  mainCauses: CostDiffCause[];
  recommendations: string[];
}
