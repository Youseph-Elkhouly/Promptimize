# Prices are per 1,000,000 tokens (USD)
MODEL_PRICING: dict[str, dict[str, float]] = {
    "gpt-4o": {"input": 2.50, "output": 10.00},
    "gpt-4o-mini": {"input": 0.15, "output": 0.60},
    "gpt-4-turbo": {"input": 10.00, "output": 30.00},
    "gpt-3.5-turbo": {"input": 0.50, "output": 1.50},
    "gemini-1.5-pro": {"input": 1.25, "output": 5.00},
    "gemini-1.5-flash": {"input": 0.075, "output": 0.30},
    "gemini-2.0-flash": {"input": 0.10, "output": 0.40},
    "claude-3-5-sonnet": {"input": 3.00, "output": 15.00},
    "claude-3-haiku": {"input": 0.25, "output": 1.25},
    "claude-3-opus": {"input": 15.00, "output": 75.00},
    "unknown": {"input": 2.50, "output": 10.00},  # default to gpt-4o pricing
}

DEFAULT_MODEL = "gpt-4o"


def get_pricing(model: str) -> dict[str, float]:
    model_lower = model.lower()
    for key in MODEL_PRICING:
        if key in model_lower:
            return MODEL_PRICING[key]
    return MODEL_PRICING["unknown"]
