import json
import re
import logging
from app.config import settings
from app.services.token_service import count_tokens
from app.services.cost_service import estimate_cost_per_request, estimate_monthly_cost
from app.services.backboard_memory_service import memory_service

logger = logging.getLogger(__name__)

# Mode instructions injected into the Gemini system prompt
_MODE_INSTRUCTIONS = {
    "aggressive": "Maximize token reduction. Compress heavily. Remove all redundancy. Preserve only core intent.",
    "balanced": "Reduce tokens while preserving quality and clarity. Remove redundancy but keep important context.",
    "safe": "Preserve meaning almost exactly. Only remove obvious filler and repeated phrases.",
    "json-strict": "Optimize while strictly preserving all JSON output format requirements and field names.",
    "agent": "Optimize for tool-using agent prompts. Keep tool descriptions, schemas, and decision logic intact.",
}

_SYSTEM_PROMPT = """You are Promptimize, an expert prompt optimization engine.
Your job is to reduce token usage while preserving the original prompt's intent, constraints, output format, and safety requirements.
Do not remove important requirements, critical constraints, or output format specifications.
Return ONLY valid JSON — no markdown, no explanation outside the JSON."""

_RESPONSE_SCHEMA = """{
  "optimizedPrompt": "the rewritten prompt",
  "riskLevel": "low | medium | high",
  "explanation": "one sentence explaining what was changed and why",
  "removedRedundancies": ["list of things removed"],
  "preservedRequirements": ["list of important things kept"]
}"""


def _heuristic_optimize(prompt: str) -> str:
    """Simple rule-based fallback when Gemini is unavailable."""
    # Collapse multiple blank lines
    text = re.sub(r"\n{3,}", "\n\n", prompt)
    # Collapse multiple spaces
    text = re.sub(r"[ \t]{2,}", " ", text)
    # Remove lines that are just filler
    filler = re.compile(
        r"^\s*(please note that|it is important to note that|as an ai language model|"
        r"certainly!|of course!|sure!|absolutely!)\s*$",
        re.IGNORECASE | re.MULTILINE,
    )
    text = filler.sub("", text)
    # Collapse consecutive blank lines again after removals
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


async def optimize_prompt(
    project_id: str,
    prompt_id: str,
    prompt: str,
    file_path: str,
    model: str,
    mode: str,
    monthly_calls: int | None = None,
) -> dict:
    original_tokens = count_tokens(prompt)

    # Retrieve memory context before calling Gemini
    memory = await memory_service.retrieve_relevant_memories(project_id, prompt, file_path)
    memory_rules = memory.get("rules", [])
    memory_style = memory.get("optimizationStyle", mode)
    effective_mode = mode or memory_style

    mode_instruction = _MODE_INSTRUCTIONS.get(effective_mode, _MODE_INSTRUCTIONS["balanced"])

    memory_section = ""
    if memory_rules:
        rules_text = "\n".join(f"- {r}" for r in memory_rules)
        memory_section = f"\n\nProject rules from memory (MUST respect):\n{rules_text}"

    user_prompt = (
        f"Optimization mode: {effective_mode}\n"
        f"Mode instruction: {mode_instruction}"
        f"{memory_section}\n\n"
        f"Original prompt to optimize:\n---\n{prompt}\n---\n\n"
        f"Return JSON matching this schema:\n{_RESPONSE_SCHEMA}"
    )

    optimized_prompt = None
    explanation = "Heuristic optimization applied (Gemini unavailable)."
    risk = "low"
    removed = []
    preserved = []

    if settings.has_gemini:
        try:
            import google.generativeai as genai
            genai.configure(api_key=settings.gemini_api_key)
            gemini_model = genai.GenerativeModel(
                model_name="gemini-1.5-flash",
                system_instruction=_SYSTEM_PROMPT,
            )
            response = gemini_model.generate_content(user_prompt)
            raw = response.text.strip()

            # Strip markdown code fences if Gemini wraps the JSON
            raw = re.sub(r"^```(?:json)?\s*", "", raw)
            raw = re.sub(r"\s*```$", "", raw)

            parsed = json.loads(raw)
            optimized_prompt = parsed.get("optimizedPrompt", "")
            explanation = parsed.get("explanation", "")
            risk = parsed.get("riskLevel", "low")
            removed = parsed.get("removedRedundancies", [])
            preserved = parsed.get("preservedRequirements", [])

        except json.JSONDecodeError as e:
            logger.warning(f"Gemini returned non-JSON: {e} — falling back to heuristic")
        except Exception as e:
            logger.warning(f"Gemini optimization failed: {e} — falling back to heuristic")

    if not optimized_prompt:
        optimized_prompt = _heuristic_optimize(prompt)

    optimized_tokens = count_tokens(optimized_prompt)
    savings_pct = round((1 - optimized_tokens / max(original_tokens, 1)) * 100, 1)

    orig_cost = estimate_cost_per_request(model, original_tokens, int(original_tokens * 0.6))
    opt_cost = estimate_cost_per_request(model, optimized_tokens, int(optimized_tokens * 0.6))
    calls = monthly_calls or settings.default_monthly_calls
    monthly_savings = round((orig_cost - opt_cost) * calls, 2)

    result = {
        "originalPrompt": prompt,
        "optimizedPrompt": optimized_prompt,
        "originalTokens": original_tokens,
        "optimizedTokens": optimized_tokens,
        "savingsPercent": savings_pct,
        "estimatedMonthlySavings": monthly_savings,
        "riskLevel": risk,
        "explanation": explanation,
        "memoryUsed": memory_rules,
        "removedRedundancies": removed,
        "preservedRequirements": preserved,
    }

    # Persist result to Backboard memory so future optimizations are smarter
    await memory_service.save_optimization_result(project_id, prompt_id, {
        "mode": effective_mode,
        "savingsPercent": savings_pct,
        "accepted": None,  # unknown until user confirms
        "filePath": file_path,
    })

    return result
