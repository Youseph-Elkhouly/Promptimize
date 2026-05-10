"""
Backboard.io memory service wrapper.

When BACKBOARD_API_KEY is set, this makes real HTTP calls to the Backboard API.
When it is missing, all calls silently fall back to an in-process dict store
so the rest of the application can run without credentials.

TODO: Replace placeholder HTTP calls with the official Backboard SDK once released.
"""

import logging
from typing import Any, Optional
import httpx
from app.config import settings

logger = logging.getLogger(__name__)

# In-process fallback store keyed by (project_id, namespace)
_local_store: dict[str, Any] = {}


def _local_key(project_id: str, namespace: str, sub_id: str = "") -> str:
    return f"{project_id}::{namespace}::{sub_id}"


def _local_set(key: str, value: Any) -> None:
    if key not in _local_store:
        _local_store[key] = []
    if isinstance(_local_store[key], list):
        _local_store[key].append(value)
    else:
        _local_store[key] = value


def _local_get(key: str) -> Any:
    return _local_store.get(key)


class BackboardMemoryService:
    def __init__(self):
        self._base = settings.backboard_base_url
        self._key = settings.backboard_api_key
        self._enabled = settings.has_backboard

        if self._enabled:
            logger.info("Backboard.io memory: ENABLED (real API)")
        else:
            logger.info("Backboard.io memory: DISABLED — using local in-process fallback")

    def _headers(self) -> dict:
        return {"Authorization": f"Bearer {self._key}", "Content-Type": "application/json"}

    async def _post(self, path: str, payload: dict) -> dict:
        # TODO: replace with official Backboard SDK call when available
        try:
            async with httpx.AsyncClient(timeout=10) as client:
                r = await client.post(f"{self._base}{path}", json=payload, headers=self._headers())
                r.raise_for_status()
                return r.json()
        except Exception as e:
            logger.warning(f"Backboard API call failed ({path}): {e}")
            return {}

    async def _get(self, path: str) -> dict:
        try:
            async with httpx.AsyncClient(timeout=10) as client:
                r = await client.get(f"{self._base}{path}", headers=self._headers())
                r.raise_for_status()
                return r.json()
        except Exception as e:
            logger.warning(f"Backboard API call failed ({path}): {e}")
            return {}

    # ------------------------------------------------------------------ #
    #  Public interface                                                    #
    # ------------------------------------------------------------------ #

    async def save_project_context(self, project_id: str, context: dict) -> bool:
        key = _local_key(project_id, "project_context")
        if self._enabled:
            # TODO: POST /memories  with namespace="project_context"
            result = await self._post("/memories", {
                "project_id": project_id,
                "namespace": "project_context",
                "data": context,
            })
            if not result:
                _local_set(key, context)
        else:
            _local_set(key, context)
        logger.debug(f"Saved project context for {project_id}")
        return True

    async def save_prompt_intent(self, project_id: str, prompt_id: str, intent: str) -> bool:
        key = _local_key(project_id, "prompt_intent", prompt_id)
        if self._enabled:
            # TODO: POST /memories  with namespace="prompt_intent"
            result = await self._post("/memories", {
                "project_id": project_id,
                "namespace": "prompt_intent",
                "prompt_id": prompt_id,
                "data": {"intent": intent},
            })
            if not result:
                _local_store[key] = intent
        else:
            _local_store[key] = intent
        return True

    async def save_optimization_result(self, project_id: str, prompt_id: str, result: dict) -> bool:
        key = _local_key(project_id, "optimization_results", prompt_id)
        if self._enabled:
            # TODO: POST /memories  with namespace="optimization_result"
            await self._post("/memories", {
                "project_id": project_id,
                "namespace": "optimization_result",
                "prompt_id": prompt_id,
                "data": result,
            })
        _local_set(key, result)
        return True

    async def save_cost_regression(self, project_id: str, cost_diff: dict) -> bool:
        key = _local_key(project_id, "cost_regressions")
        if self._enabled:
            # TODO: POST /memories  with namespace="cost_regression"
            await self._post("/memories", {
                "project_id": project_id,
                "namespace": "cost_regression",
                "data": cost_diff,
            })
        _local_set(key, cost_diff)
        return True

    async def retrieve_project_memory(self, project_id: str) -> dict:
        if self._enabled:
            # TODO: GET /memories?project_id=...&namespace=project_context
            data = await self._get(f"/memories?project_id={project_id}&namespace=project_context")
            if data:
                return data
        key = _local_key(project_id, "project_context")
        stored = _local_store.get(key, [])
        return stored[-1] if isinstance(stored, list) and stored else (stored or {})

    async def retrieve_prompt_memory(self, project_id: str, prompt_id: str) -> dict:
        if self._enabled:
            # TODO: GET /memories?project_id=...&prompt_id=...
            data = await self._get(f"/memories?project_id={project_id}&prompt_id={prompt_id}")
            if data:
                return data
        intent_key = _local_key(project_id, "prompt_intent", prompt_id)
        results_key = _local_key(project_id, "optimization_results", prompt_id)
        return {
            "intent": _local_store.get(intent_key, ""),
            "previous_optimizations": _local_store.get(results_key, []),
        }

    async def retrieve_relevant_memories(
        self, project_id: str, prompt: str, file_path: str
    ) -> dict:
        """Retrieve all memories relevant to optimizing a given prompt."""
        project_ctx = await self.retrieve_project_memory(project_id)
        regressions_key = _local_key(project_id, "cost_regressions")
        regressions = _local_store.get(regressions_key, [])

        # Build a flat list of rules from project context
        rules = []
        if isinstance(project_ctx, dict):
            rules = project_ctx.get("rules", [])
            budget = project_ctx.get("budget", None)
            style = project_ctx.get("optimizationStyle", "balanced")
        else:
            budget = None
            style = "balanced"

        return {
            "projectContext": project_ctx,
            "rules": rules,
            "budget": budget,
            "optimizationStyle": style,
            "recentRegressions": regressions[-3:] if regressions else [],
        }

    async def get_insights(self, project_id: str) -> list[str]:
        memories = await self.retrieve_relevant_memories(project_id, "", "")
        insights = []

        ctx = memories.get("projectContext", {})
        if isinstance(ctx, dict) and ctx.get("projectName"):
            insights.append(f"Project: {ctx['projectName']} — budget ${ctx.get('budget', 'unset')}/month")

        rules = memories.get("rules", [])
        for rule in rules:
            insights.append(f"Rule: {rule}")

        regressions = memories.get("recentRegressions", [])
        if regressions:
            insights.append(f"{len(regressions)} recent cost regressions recorded.")
        else:
            insights.append("No cost regressions recorded yet.")

        if not insights:
            insights.append("No memory data yet. Run a scan and optimize prompts to build memory.")

        return insights


memory_service = BackboardMemoryService()
