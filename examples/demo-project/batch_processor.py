"""
Batch document processor — calls AI for every item in a loop.
Demo file — shows Promptimize detecting costly operations in loops.
"""
import openai

client = openai.OpenAI()


def process_documents(documents: list[str]) -> list[dict]:
    """
    Classifies and summarizes each document individually.
    COSTLY: makes one AI call per document — should be batched.
    """
    results = []
    for doc in documents:
        # ⚠ Promptimize: costly operation in loop — ~800 tokens per call
        response = client.chat.completions.create(
            model="gpt-4o",
            messages=[
                {
                    "role": "system",
                    "content": """You are a document classification and summarization specialist.
For each document provided, you must:

1. Classify it into exactly one of the following categories:
   - Legal / Compliance
   - Financial / Accounting
   - Technical / Engineering
   - Marketing / Sales
   - HR / People Operations
   - Executive / Strategy
   - Customer Support
   - Other

2. Extract the top 5 key entities mentioned (people, companies, products, locations).

3. Write a 3-sentence executive summary capturing the who, what, and why.

4. Assign an urgency score from 1-10 based on action items and deadlines mentioned.

5. List any action items or follow-ups required.

Return your response as structured JSON.""",
                },
                {"role": "user", "content": f"Process this document:\n\n{doc}"},
            ],
            temperature=0.0,
        )
        results.append({"result": response.choices[0].message.content})
    return results


def tag_support_tickets(tickets: list[str]) -> list[str]:
    """Tags each support ticket — another loop with AI calls."""
    tags = []
    for ticket in tickets:
        response = client.chat.completions.create(
            model="gpt-4o",
            messages=[
                {
                    "role": "system",
                    "content": """You are a customer support triage assistant. Given a support ticket,
assign priority (P0/P1/P2/P3), product area, issue type, sentiment, and estimated resolution time.
Also determine if escalation is needed and suggest the best team to handle it.
Return a structured JSON response with all fields.""",
                },
                {"role": "user", "content": ticket},
            ],
        )
        tags.append(response.choices[0].message.content)
    return tags
