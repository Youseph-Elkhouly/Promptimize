from app.utils.pricing import get_pricing
from app.config import settings


def estimate_cost_per_request(
    model: str,
    input_tokens: int,
    output_tokens: int,
) -> float:
    pricing = get_pricing(model)
    input_cost = (input_tokens / 1_000_000) * pricing["input"]
    output_cost = (output_tokens / 1_000_000) * pricing["output"]
    return round(input_cost + output_cost, 6)


def estimate_monthly_cost(
    cost_per_request: float,
    monthly_calls: int | None = None,
) -> float:
    calls = monthly_calls or settings.default_monthly_calls
    return round(cost_per_request * calls, 2)


def calculate_savings(
    original_cost: float,
    optimized_cost: float,
    monthly_calls: int | None = None,
) -> float:
    calls = monthly_calls or settings.default_monthly_calls
    savings_per_call = original_cost - optimized_cost
    return round(savings_per_call * calls, 2)


def risk_level(input_tokens: int) -> str:
    if input_tokens < 300:
        return "low"
    elif input_tokens < 900:
        return "medium"
    return "high"
