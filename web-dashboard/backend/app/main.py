import uuid
import logging
from datetime import datetime, timezone
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.db.mongo import connect_db, disconnect_db
from app.db.repositories import scan_repo, optimization_repo
from app.models.scan import ScanRequest, ScanResponse, DetectedPrompt
from app.models.optimize import OptimizeRequest, OptimizeResponse
from app.models.cost_diff import CostDiffRequest, CostDiffResponse
from app.models.memory import ProjectContextRequest, MemoryInsightsResponse
from app.services.prompt_scanner import scan_file
from app.services.prompt_optimizer import optimize_prompt
from app.services.git_cost_service import compute_cost_diff
from app.services.dashboard_service import get_dashboard_data
from app.services.backboard_memory_service import memory_service

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s — %(message)s")
logger = logging.getLogger("promptimize")


@asynccontextmanager
async def lifespan(app: FastAPI):
    await connect_db()
    logger.info("Promptimize backend started")
    yield
    await disconnect_db()
    logger.info("Promptimize backend stopped")


app = FastAPI(
    title="Promptimize API",
    description="Optimize prompts before they cost you.",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list + ["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ------------------------------------------------------------------ #
#  Health                                                             #
# ------------------------------------------------------------------ #

@app.get("/health")
async def health():
    return {
        "status": "ok",
        "service": "promptimize-backend",
        "gemini": settings.has_gemini,
        "backboard": settings.has_backboard,
        "mongodb": settings.has_mongodb,
    }


# ------------------------------------------------------------------ #
#  Scan                                                               #
# ------------------------------------------------------------------ #

@app.post("/scan", response_model=ScanResponse)
async def scan(request: ScanRequest):
    all_prompts = []

    for file in request.files:
        try:
            detected = scan_file(file.path, file.content)
            all_prompts.extend(detected)
        except Exception as e:
            logger.warning(f"Failed to scan {file.path}: {e}")

    total_input_tokens = sum(p["inputTokens"] for p in all_prompts)
    total_monthly_cost = sum(p["estimatedMonthlyCost"] for p in all_prompts)

    scan_id = f"scan_{uuid.uuid4().hex[:12]}"
    scan_record = {
        "scanId": scan_id,
        "projectId": request.projectId,
        "repoName": request.repoName,
        "commitHash": request.commitHash,
        "branch": request.branch,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "totalPrompts": len(all_prompts),
        "totalInputTokens": total_input_tokens,
        "estimatedMonthlyCost": total_monthly_cost,
        "prompts": all_prompts,
    }

    await scan_repo.save_scan(scan_record)
    logger.info(
        f"Scan {scan_id}: {len(all_prompts)} prompts found, "
        f"${total_monthly_cost:.2f}/mo estimated for project {request.projectId}"
    )

    return ScanResponse(
        scanId=scan_id,
        projectId=request.projectId,
        commitHash=request.commitHash,
        totalPrompts=len(all_prompts),
        totalInputTokens=total_input_tokens,
        estimatedMonthlyCost=total_monthly_cost,
        prompts=[DetectedPrompt(**p) for p in all_prompts],
    )


# ------------------------------------------------------------------ #
#  Optimize                                                           #
# ------------------------------------------------------------------ #

@app.post("/optimize", response_model=OptimizeResponse)
async def optimize(request: OptimizeRequest):
    if not request.prompt.strip():
        raise HTTPException(status_code=400, detail="Prompt cannot be empty")

    result = await optimize_prompt(
        project_id=request.projectId,
        prompt_id=request.promptId,
        prompt=request.prompt,
        file_path=request.filePath,
        model=request.model,
        mode=request.mode.value,
    )

    # Persist optimization record
    opt_record = {
        "promptId": request.promptId,
        "projectId": request.projectId,
        "filePath": request.filePath,
        "model": request.model,
        "mode": request.mode.value,
        "originalPrompt": result["originalPrompt"],
        "optimizedPrompt": result["optimizedPrompt"],
        "originalTokens": result["originalTokens"],
        "optimizedTokens": result["optimizedTokens"],
        "savingsPercent": result["savingsPercent"],
        "estimatedMonthlySavings": result["estimatedMonthlySavings"],
        "riskLevel": result["riskLevel"],
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }
    await optimization_repo.save_optimization(opt_record)

    return OptimizeResponse(**result)


# ------------------------------------------------------------------ #
#  CostDiff                                                           #
# ------------------------------------------------------------------ #

@app.post("/cost-diff", response_model=CostDiffResponse)
async def cost_diff(request: CostDiffRequest):
    result = await compute_cost_diff(
        project_id=request.projectId,
        previous_commit=request.previousCommit,
        current_commit=request.currentCommit,
    )
    return CostDiffResponse(**result)


# ------------------------------------------------------------------ #
#  Dashboard                                                          #
# ------------------------------------------------------------------ #

@app.get("/dashboard/{project_id}")
async def dashboard(project_id: str):
    return await get_dashboard_data(project_id)


# ------------------------------------------------------------------ #
#  Memory                                                             #
# ------------------------------------------------------------------ #

@app.post("/memory/project-context")
async def save_project_context(request: ProjectContextRequest):
    await memory_service.save_project_context(
        request.projectId,
        request.context.model_dump(),
    )
    return {"success": True, "message": "Project context saved to Backboard memory."}


@app.get("/memory/{project_id}/insights", response_model=MemoryInsightsResponse)
async def get_memory_insights(project_id: str):
    insights = await memory_service.get_insights(project_id)
    return MemoryInsightsResponse(insights=insights)
