from app.db.repositories import scan_repo
from app.config import settings
import logging

logger = logging.getLogger(__name__)

_WARN_THRESHOLD = settings.promptimize_max_cost_increase_percent if hasattr(settings, "promptimize_max_cost_increase_percent") else 20


async def compute_cost_diff(project_id: str, previous_commit: str, current_commit: str) -> dict:
    prev_scan = await scan_repo.get_scan_by_commit(project_id, previous_commit)
    curr_scan = await scan_repo.get_scan_by_commit(project_id, current_commit)

    # Graceful: if either scan is missing, try latest available
    if not prev_scan:
        scans = await scan_repo.get_scans_for_project(project_id, limit=10)
        if len(scans) >= 2:
            prev_scan = scans[1]
        elif len(scans) == 1:
            prev_scan = scans[0]

    if not curr_scan:
        curr_scan = await scan_repo.get_latest_scan(project_id)

    if not prev_scan or not curr_scan:
        return _empty_diff(previous_commit, current_commit)

    prev_cost = prev_scan.get("estimatedMonthlyCost", 0)
    curr_cost = curr_scan.get("estimatedMonthlyCost", 0)
    prev_tokens = prev_scan.get("totalInputTokens", 0)
    curr_tokens = curr_scan.get("totalInputTokens", 0)

    cost_change_pct = _pct_change(prev_cost, curr_cost)
    token_change_pct = _pct_change(prev_tokens, curr_tokens)

    # Identify files with biggest cost increases
    prev_by_file = _group_by_file(prev_scan.get("prompts", []))
    curr_by_file = _group_by_file(curr_scan.get("prompts", []))

    causes = []
    for file_path, curr_file_cost in curr_by_file.items():
        prev_file_cost = prev_by_file.get(file_path, 0)
        delta = curr_file_cost - prev_file_cost
        if delta > 0:
            # Estimate token delta
            prev_tokens_file = sum(p.get("inputTokens", 0) for p in prev_scan.get("prompts", []) if p.get("filePath") == file_path)
            curr_tokens_file = sum(p.get("inputTokens", 0) for p in curr_scan.get("prompts", []) if p.get("filePath") == file_path)
            token_delta = curr_tokens_file - prev_tokens_file
            causes.append({
                "filePath": file_path,
                "reason": f"Prompt grew by {token_delta:,} tokens",
                "monthlyCostIncrease": round(delta, 2),
            })

    causes.sort(key=lambda x: x["monthlyCostIncrease"], reverse=True)

    recommendations = _build_recommendations(causes, cost_change_pct)

    if cost_change_pct > _WARN_THRESHOLD * 2:
        status = "failed_budget"
    elif cost_change_pct > _WARN_THRESHOLD:
        status = "warning"
    else:
        status = "pass"

    return {
        "previousCommit": previous_commit,
        "currentCommit": current_commit,
        "previousMonthlyCost": round(prev_cost, 2),
        "currentMonthlyCost": round(curr_cost, 2),
        "costIncreasePercent": round(cost_change_pct, 1),
        "tokenIncreasePercent": round(token_change_pct, 1),
        "status": status,
        "mainCauses": causes[:3],
        "recommendations": recommendations,
    }


def _pct_change(prev: float, curr: float) -> float:
    if prev == 0:
        return 0 if curr == 0 else 100.0
    return ((curr - prev) / prev) * 100


def _group_by_file(prompts: list) -> dict[str, float]:
    result: dict[str, float] = {}
    for p in prompts:
        fp = p.get("filePath", "unknown")
        result[fp] = result.get(fp, 0) + p.get("estimatedMonthlyCost", 0)
    return result


def _build_recommendations(causes: list, cost_change_pct: float) -> list[str]:
    recs = []
    for cause in causes[:2]:
        fname = cause["filePath"].split("/")[-1]
        recs.append(f"Run 'Promptimize: Optimize Prompt' on {fname}")
    if cost_change_pct > 30:
        recs.append("Consider switching to a cheaper model for high-volume prompts")
    if cost_change_pct > 50:
        recs.append("Set a max_tokens limit to cap output costs")
    return recs


def _empty_diff(prev: str, curr: str) -> dict:
    return {
        "previousCommit": prev,
        "currentCommit": curr,
        "previousMonthlyCost": 0,
        "currentMonthlyCost": 0,
        "costIncreasePercent": 0,
        "tokenIncreasePercent": 0,
        "status": "pass",
        "mainCauses": [],
        "recommendations": ["No previous scan found. Run a scan first to enable CostDiff."],
    }
