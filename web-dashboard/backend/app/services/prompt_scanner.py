import re
import uuid
from typing import List, Tuple
from app.services.token_service import count_tokens, estimate_output_tokens
from app.services.cost_service import estimate_cost_per_request, estimate_monthly_cost, risk_level

# Patterns that signal an LLM API call is nearby
_API_CALL_PATTERNS = [
    r"openai\.chat\.completions\.create",
    r"client\.chat\.completions\.create",
    r"generateContent\s*\(",
    r"anthropic\.messages\.create",
    r"messages\.create\s*\(",
    r"ChatCompletion\.create",
]

# Patterns that extract inline prompt text.
# We match Python triple-quotes, JS/TS backtick templates, and long inline strings.
# Case-insensitive matching catches SYSTEM_PROMPT, supportPrompt, etc.
_PROMPT_FIELD_PATTERNS = [
    # Python triple-double-quote (system/prompt/content/user = """...""")
    r'(?i)(?:system|prompt|content|user|instruction|message)\s*[=:]\s*[f]?"""([\s\S]{50,}?)"""',
    # Python triple-single-quote
    r"(?i)(?:system|prompt|content|user|instruction|message)\s*[=:]\s*[f]?'''([\s\S]{50,}?)'''",
    # Long inline double-quoted strings
    r'(?i)(?:system|prompt|content|user|instruction|message)\s*[=:]\s*[f]?"([^"]{150,})"',
    # Long inline single-quoted strings
    r"(?i)(?:system|prompt|content|user|instruction|message)\s*[=:]\s*[f]?'([^']{150,})'",
    # JS/TS backtick template literal assigned to variable (captures *_PROMPT, *_SYSTEM, etc.)
    r'(?i)(?:const|let|var)\s+\w*(?:PROMPT|SYSTEM|INSTRUCTION|MESSAGE|TEMPLATE)\w*\s*=\s*`([\s\S]{50,}?)`',
    # Backtick after field name  system: `...`  content: `...`
    r'(?i)(?:system|prompt|content|user|instruction|message)\s*:\s*`([\s\S]{50,}?)`',
    # Catch-all: any backtick template longer than 300 chars (very likely a prompt)
    r'`([\s\S]{300,}?)`',
]

# Patterns that detect which model is referenced nearby
_MODEL_PATTERNS = {
    "gpt-4o": r"gpt-4o(?!-mini)",
    "gpt-4o-mini": r"gpt-4o-mini",
    "gpt-4-turbo": r"gpt-4-turbo",
    "gpt-3.5-turbo": r"gpt-3\.5-turbo",
    "gemini-1.5-pro": r"gemini-1\.5-pro",
    "gemini-1.5-flash": r"gemini-1\.5-flash",
    "gemini-2.0-flash": r"gemini-2\.0-flash",
    "claude-3-5-sonnet": r"claude-3-5-sonnet|claude-3\.5-sonnet",
    "claude-3-haiku": r"claude-3-haiku",
    "claude-3-opus": r"claude-3-opus",
}

_MIN_PROMPT_LENGTH = 150  # characters — shorter strings are not flagged


def _detect_model_in_window(lines: List[str], center: int, window: int = 30) -> str:
    start = max(0, center - window)
    end = min(len(lines), center + window)
    window_text = "\n".join(lines[start:end])
    for model_name, pattern in _MODEL_PATTERNS.items():
        if re.search(pattern, window_text, re.IGNORECASE):
            return model_name
    return "unknown"


def _make_snippet(lines: List[str], start: int, end: int, max_chars: int = 300) -> str:
    snippet = "\n".join(lines[start:end])
    return snippet[:max_chars] + ("..." if len(snippet) > max_chars else "")


def scan_file(file_path: str, content: str) -> List[dict]:
    lines = content.splitlines()
    results = []
    seen_ranges: List[Tuple[int, int]] = []

    def _overlaps(s: int, e: int) -> bool:
        for rs, re_ in seen_ranges:
            if not (e < rs or s > re_):
                return True
        return False

    # Strategy 1: find explicit API call sites, then look nearby for prompt text
    for api_pattern in _API_CALL_PATTERNS:
        for m in re.finditer(api_pattern, content, re.MULTILINE):
            call_line = content[: m.start()].count("\n")
            # Extract a ~60-line window around the call
            win_start = max(0, call_line - 5)
            win_end = min(len(lines), call_line + 55)
            window_text = "\n".join(lines[win_start:win_end])

            for field_pat in _PROMPT_FIELD_PATTERNS:
                for fm in re.finditer(field_pat, window_text, re.MULTILINE | re.DOTALL):
                    prompt_text = fm.group(1).strip()
                    if len(prompt_text) < _MIN_PROMPT_LENGTH:
                        continue
                    offset = window_text[: fm.start()].count("\n")
                    abs_start = win_start + offset
                    abs_end = abs_start + prompt_text.count("\n") + 1
                    if _overlaps(abs_start, abs_end):
                        continue
                    seen_ranges.append((abs_start, abs_end))
                    model = _detect_model_in_window(lines, call_line)
                    _append_result(results, file_path, prompt_text, abs_start, abs_end, model, lines)

    # Strategy 2: scan entire file for any long prompt string regardless of API context
    for field_pat in _PROMPT_FIELD_PATTERNS:
        for m in re.finditer(field_pat, content, re.MULTILINE | re.DOTALL):
            prompt_text = m.group(1).strip()
            if len(prompt_text) < _MIN_PROMPT_LENGTH:
                continue
            abs_start = content[: m.start()].count("\n")
            abs_end = abs_start + prompt_text.count("\n") + 1
            if _overlaps(abs_start, abs_end):
                continue
            seen_ranges.append((abs_start, abs_end))
            model = _detect_model_in_window(lines, abs_start)
            _append_result(results, file_path, prompt_text, abs_start, abs_end, model, lines)

    return results


def _append_result(
    results: list,
    file_path: str,
    prompt_text: str,
    start_line: int,
    end_line: int,
    model: str,
    lines: list,
) -> None:
    input_tokens = count_tokens(prompt_text)
    output_tokens = estimate_output_tokens(input_tokens)
    cost_per_req = estimate_cost_per_request(model, input_tokens, output_tokens)
    monthly_cost = estimate_monthly_cost(cost_per_req)
    risk = risk_level(input_tokens)

    results.append({
        "id": f"prompt_{uuid.uuid4().hex[:8]}",
        "filePath": file_path,
        "startLine": start_line + 1,  # 1-indexed for display
        "endLine": end_line + 1,
        "model": model,
        "inputTokens": input_tokens,
        "estimatedOutputTokens": output_tokens,
        "estimatedCostPerRequest": cost_per_req,
        "estimatedMonthlyCost": monthly_cost,
        "riskLevel": risk,
        "snippet": prompt_text[:300] + ("..." if len(prompt_text) > 300 else ""),
    })
