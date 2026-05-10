from pydantic import BaseModel
from typing import List, Optional, Any, Dict


class ProjectContext(BaseModel):
    projectName: str = ""
    preferredModel: str = "gpt-4o"
    budget: float = 100.0
    optimizationStyle: str = "balanced"
    rules: List[str] = []


class ProjectContextRequest(BaseModel):
    projectId: str
    context: ProjectContext


class MemoryInsightsResponse(BaseModel):
    insights: List[str]
