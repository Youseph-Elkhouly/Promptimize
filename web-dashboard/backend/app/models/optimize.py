from pydantic import BaseModel
from typing import List, Optional
from enum import Enum


class OptimizationMode(str, Enum):
    aggressive = "aggressive"
    balanced = "balanced"
    safe = "safe"
    json_strict = "json-strict"
    agent = "agent"


class OptimizeRequest(BaseModel):
    projectId: str
    promptId: str = ""
    prompt: str
    filePath: str = ""
    model: str = "gpt-4o"
    mode: OptimizationMode = OptimizationMode.balanced
    preserveIntent: bool = True


class OptimizeResponse(BaseModel):
    originalPrompt: str
    optimizedPrompt: str
    originalTokens: int
    optimizedTokens: int
    savingsPercent: float
    estimatedMonthlySavings: float
    riskLevel: str
    explanation: str
    memoryUsed: List[str] = []
