from pydantic import BaseModel, Field
from typing import List, Optional
from enum import Enum


class RiskLevel(str, Enum):
    low = "low"
    medium = "medium"
    high = "high"


class FileInput(BaseModel):
    path: str
    language: str = "unknown"
    content: str


class ScanRequest(BaseModel):
    projectId: str
    repoName: str = ""
    commitHash: str = "unknown"
    branch: str = "main"
    files: List[FileInput]


class DetectedPrompt(BaseModel):
    id: str
    filePath: str
    startLine: int
    endLine: int
    model: str = "unknown"
    inputTokens: int
    estimatedOutputTokens: int
    estimatedCostPerRequest: float
    estimatedMonthlyCost: float
    riskLevel: RiskLevel
    snippet: str


class ScanResponse(BaseModel):
    scanId: str
    projectId: str
    commitHash: str
    totalPrompts: int
    totalInputTokens: int
    estimatedMonthlyCost: float
    prompts: List[DetectedPrompt]
