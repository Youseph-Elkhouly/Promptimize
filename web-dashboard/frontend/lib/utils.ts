import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCost(cost: number): string {
  return `$${cost.toFixed(2)}`;
}

export function formatTokens(tokens: number): string {
  if (tokens >= 1000) return `${(tokens / 1000).toFixed(1)}k`;
  return tokens.toString();
}

// B&W risk styles — high is white/dashed, medium is gray, low is dim
export function riskClasses(risk: string): string {
  switch (risk) {
    case "high":   return "text-white border border-dashed border-white";
    case "medium": return "text-zinc-400 border border-zinc-600";
    default:       return "text-zinc-600 border border-zinc-800";
  }
}

export function statusClasses(status: string): string {
  switch (status) {
    case "failed_budget": return "text-white border-dashed border-white";
    case "warning":       return "text-zinc-300 border-zinc-500";
    default:              return "text-zinc-500 border-zinc-700";
  }
}
