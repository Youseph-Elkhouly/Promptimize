"""
Legacy text classifier — uses deprecated OpenAI Completion API.
Demo file — shows Promptimize detecting deprecated and expensive models.
"""
import openai
import anthropic

openai_client = openai.OpenAI()
claude_client = anthropic.Anthropic()


def classify_text_legacy(text: str) -> str:
    """Uses deprecated text-davinci-003 — should migrate to chat completions."""
    response = openai_client.completions.create(
        model="text-davinci-003",
        prompt=f"""Classify the following customer feedback into one of these categories:
Positive, Negative, Neutral, Feature Request, Bug Report, or General Inquiry.
Also extract the main topic and sentiment score from -1.0 to 1.0.

Customer feedback:
{text}

Classification:""",
        max_tokens=150,
        temperature=0.0,
    )
    return response.choices[0].text.strip()


def deep_analysis_claude(document: str) -> str:
    """Uses Claude Opus — most expensive Claude model."""
    message = claude_client.messages.create(
        model="claude-3-opus-20240229",
        max_tokens=2048,
        messages=[
            {
                "role": "user",
                "content": f"""Perform a comprehensive multi-dimensional analysis of the following document.
Your analysis must cover:

SECTION 1 — CONTENT ANALYSIS
Identify the primary thesis, supporting arguments, logical structure, and rhetorical devices employed.
Evaluate the strength of each argument on a scale of 1-10 with justification.

SECTION 2 — FACTUAL ACCURACY
Cross-reference all factual claims against your training knowledge. Flag any claims that appear
inaccurate, outdated, misleading, or unverifiable. Provide corrections where applicable.

SECTION 3 — BIAS DETECTION
Identify any political, cultural, commercial, or cognitive biases present. Note loaded language,
selective framing, false dichotomies, or strawman arguments.

SECTION 4 — AUDIENCE & INTENT
Determine the likely target audience, the author's intent, and the expected emotional response.

SECTION 5 — RECOMMENDATIONS
Suggest specific improvements to strengthen the document's credibility and impact.

Document to analyze:
{document}""",
            }
        ],
    )
    return message.content[0].text


def translate_with_context(text: str, target_language: str) -> str:
    """Translation with full cultural context using expensive model."""
    response = openai_client.chat.completions.create(
        model="gpt-4-turbo",
        messages=[
            {
                "role": "system",
                "content": """You are a professional translator and cultural consultant with expertise in
over 50 languages. Your translations must preserve not just literal meaning but also:
- Idiomatic expressions adapted to the target culture
- Tone and register appropriate to the context
- Cultural references localized or explained
- Formatting conventions of the target locale (dates, numbers, punctuation)
- Any domain-specific terminology translated with industry standards

Always provide: (1) the primary translation, (2) alternative phrasings where ambiguous,
(3) cultural notes for significant adaptations, and (4) a confidence score.""",
            },
            {
                "role": "user",
                "content": f"Translate to {target_language} with full cultural context:\n\n{text}",
            },
        ],
    )
    return response.choices[0].message.content
