from app.db.mongo import get_db, get_memory_store
from typing import Optional
import logging

logger = logging.getLogger(__name__)


class ScanRepository:
    async def save_scan(self, scan: dict) -> str:
        db = get_db()
        if db is not None:
            await db.scans.insert_one(scan)
        else:
            get_memory_store()["scans"].append(scan)
        return scan["scanId"]

    async def get_scan_by_commit(self, project_id: str, commit_hash: str) -> Optional[dict]:
        db = get_db()
        if db is not None:
            return await db.scans.find_one(
                {"projectId": project_id, "commitHash": commit_hash},
                {"_id": 0},
            )
        store = get_memory_store()
        for s in reversed(store["scans"]):
            if s["projectId"] == project_id and s["commitHash"] == commit_hash:
                return s
        return None

    async def get_latest_scan(self, project_id: str) -> Optional[dict]:
        db = get_db()
        if db is not None:
            cursor = db.scans.find({"projectId": project_id}, {"_id": 0}).sort("timestamp", -1).limit(1)
            results = await cursor.to_list(length=1)
            return results[0] if results else None
        store = get_memory_store()
        project_scans = [s for s in store["scans"] if s["projectId"] == project_id]
        return project_scans[-1] if project_scans else None

    async def get_scans_for_project(self, project_id: str, limit: int = 20) -> list:
        db = get_db()
        if db is not None:
            cursor = db.scans.find({"projectId": project_id}, {"_id": 0}).sort("timestamp", -1).limit(limit)
            return await cursor.to_list(length=limit)
        store = get_memory_store()
        return [s for s in reversed(store["scans"]) if s["projectId"] == project_id][:limit]


class OptimizationRepository:
    async def save_optimization(self, record: dict) -> None:
        db = get_db()
        if db is not None:
            await db.optimizations.insert_one(record)
        else:
            get_memory_store()["optimizations"].append(record)

    async def get_optimizations_for_project(self, project_id: str, limit: int = 20) -> list:
        db = get_db()
        if db is not None:
            cursor = db.optimizations.find({"projectId": project_id}, {"_id": 0}).sort("timestamp", -1).limit(limit)
            return await cursor.to_list(length=limit)
        store = get_memory_store()
        return [o for o in reversed(store["optimizations"]) if o["projectId"] == project_id][:limit]


scan_repo = ScanRepository()
optimization_repo = OptimizationRepository()
