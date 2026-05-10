from app.db.repositories import scan_repo, optimization_repo
from app.services.backboard_memory_service import memory_service


async def get_dashboard_data(project_id: str) -> dict:
    scans = await scan_repo.get_scans_for_project(project_id, limit=30)
    optimizations = await optimization_repo.get_optimizations_for_project(project_id, limit=50)
    memory_insights = await memory_service.get_insights(project_id)

    if not scans:
        return _empty_dashboard(project_id, memory_insights)

    latest = scans[0]
    all_prompts = latest.get("prompts", [])

    projected_cost = latest.get("estimatedMonthlyCost", 0)
    total_prompts = latest.get("totalPrompts", 0)
    high_risk = sum(1 for p in all_prompts if p.get("riskLevel") == "high")

    # Calculate potential savings from optimizations
    potential_savings = sum(
        o.get("estimatedMonthlySavings", 0) for o in optimizations if o.get("estimatedMonthlySavings")
    )
    avg_compression = (
        sum(o.get("savingsPercent", 0) for o in optimizations) / len(optimizations)
        if optimizations else 0
    )

    # Most expensive file
    file_costs: dict[str, float] = {}
    for p in all_prompts:
        fp = p.get("filePath", "unknown")
        file_costs[fp] = file_costs.get(fp, 0) + p.get("estimatedMonthlyCost", 0)
    most_expensive_file = max(file_costs, key=file_costs.get) if file_costs else "—"

    # Cost timeline (one entry per scan, oldest first)
    cost_timeline = [
        {
            "commit": s.get("commitHash", "")[:7],
            "branch": s.get("branch", "main"),
            "cost": round(s.get("estimatedMonthlyCost", 0), 2),
            "tokens": s.get("totalInputTokens", 0),
            "timestamp": s.get("timestamp", ""),
        }
        for s in reversed(scans)
    ]

    # Top expensive prompts
    top_prompts = sorted(all_prompts, key=lambda p: p.get("estimatedMonthlyCost", 0), reverse=True)[:5]

    # Recent cost diff
    biggest_regression = 0
    if len(scans) >= 2:
        biggest_regression = round(scans[0].get("estimatedMonthlyCost", 0) - scans[1].get("estimatedMonthlyCost", 0), 2)

    return {
        "projectId": project_id,
        "projectedMonthlyCost": round(projected_cost, 2),
        "potentialMonthlySavings": round(potential_savings, 2),
        "averagePromptCompression": round(avg_compression, 1),
        "mostExpensiveFile": most_expensive_file,
        "totalPrompts": total_prompts,
        "highRiskPrompts": high_risk,
        "biggestCostRegression": biggest_regression,
        "costTimeline": cost_timeline,
        "topPrompts": top_prompts,
        "recentOptimizations": optimizations[:5],
        "memoryInsights": memory_insights,
    }


def _empty_dashboard(project_id: str, memory_insights: list) -> dict:
    return {
        "projectId": project_id,
        "projectedMonthlyCost": 0,
        "potentialMonthlySavings": 0,
        "averagePromptCompression": 0,
        "mostExpensiveFile": "—",
        "totalPrompts": 0,
        "highRiskPrompts": 0,
        "biggestCostRegression": 0,
        "costTimeline": [],
        "topPrompts": [],
        "recentOptimizations": [],
        "memoryInsights": memory_insights,
    }
