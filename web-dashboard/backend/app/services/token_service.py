import logging

logger = logging.getLogger(__name__)

# Try to import tiktoken; fall back gracefully if not installed
try:
    import tiktoken
    _TIKTOKEN_AVAILABLE = True
    _encoder = tiktoken.get_encoding("cl100k_base")  # used by GPT-4, GPT-3.5, embeddings
    logger.info("tiktoken loaded — using exact token counts")
except Exception:
    _TIKTOKEN_AVAILABLE = False
    _encoder = None
    logger.info("tiktoken not available — using approximate token counts (len / 4)")


def count_tokens(text: str) -> int:
    if not text:
        return 0
    if _TIKTOKEN_AVAILABLE and _encoder:
        try:
            return len(_encoder.encode(text))
        except Exception:
            pass
    # Approximate: 1 token ≈ 4 characters for English text
    return max(1, len(text) // 4)


def estimate_output_tokens(input_tokens: int, default: int = 700) -> int:
    # Heuristic: output is often 50-100% of input for generation tasks
    return max(default, int(input_tokens * 0.6))
