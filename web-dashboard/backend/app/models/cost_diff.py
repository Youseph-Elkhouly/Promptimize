from pydantic import BaseModel
from typing import List


class CostDiffRequest(BaseModel):
    projectId: str
    previousCommit: str
    currentCommit: str


class CostCause(BaseModel):
    filePath: str
    reason: str
    monthlyCostIncrease: float


class CostDiffResponse(BaseModel):
    previousCommit: str
    currentCommit: str
    previousMonthlyCost: float
    currentMonthlyCost: float
    costIncreasePercent: float
    tokenIncreasePercent: float
    status: str  # "pass" | "warning" | "failed_budget"
    mainCauses: List[CostCause]
    recommendations: List[str]
