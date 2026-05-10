#!/usr/bin/env python3
"""
Seed the Promptimize backend with demo data for the dashboard.
Run: python scripts/seed-demo-data.py
"""

import asyncio
import httpx
import json

BASE_URL = "http://localhost:8000"
PROJECT_ID = "sample-ai-app"


DEMO_SCAN_1 = {
    "projectId": PROJECT_ID,
    "repoName": "sample-ai-app",
    "commitHash": "abc111aaa",
    "branch": "main",
    "files": [
        {
            "path": "src/supportAgent.ts",
            "language": "typescript",
            "content": """
const SUPPORT_SYSTEM_PROMPT = `
You are an expert customer support specialist for TechCorp, a leading software company.
Your role is to provide exceptional, empathetic, and highly detailed customer support to all users.
When responding to customers, you should always greet them warmly, express empathy, provide
clear step-by-step instructions, use simple language, offer multiple solutions, confirm resolution,
escalate when needed, document all interactions, and follow privacy policies.
Product knowledge: TechCorp Project Manager Pro supports 500 users per workspace.
The Analytics Dashboard updates in real-time. Mobile apps support offline mode.
API rate limits are 1,000 requests per minute for standard plans.
Remember that every interaction is an opportunity to strengthen our reputation.
`;
const response = await client.chat.completions.create({
    model: "gpt-4o",
    messages: [{ role: "system", content: SUPPORT_SYSTEM_PROMPT }]
});
""",
        },
        {
            "path": "src/summarizer.ts",
            "language": "typescript",
            "content": """
const SUMMARIZER_PROMPT = `You are a professional document summarizer. Read the provided document
and produce a clear, accurate, and concise summary that captures all key points, main arguments,
important data, and critical conclusions. The summary should be significantly shorter than the
original while preserving all essential information.`;
const response = await client.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "system", content: SUMMARIZER_PROMPT }]
});
""",
        },
    ],
}

DEMO_SCAN_2 = {
    "projectId": PROJECT_ID,
    "repoName": "sample-ai-app",
    "commitHash": "def222bbb",
    "branch": "main",
    "files": [
        {
            "path": "src/supportAgent.ts",
            "language": "typescript",
            "content": DEMO_SCAN_1["files"][0]["content"],
        },
        {
            "path": "src/studyGuideAgent.ts",
            "language": "typescript",
            "content": """
const STUDY_GUIDE_PROMPT = `
You are StudyBot, an advanced AI-powered educational assistant designed to help students of all
ages and academic levels create comprehensive, well-structured, and highly effective study guides.

When creating a study guide, always follow this structure:
SECTION 1 - EXECUTIVE SUMMARY: Provide a concise but comprehensive overview in 3-5 paragraphs.
SECTION 2 - KEY CONCEPTS AND DEFINITIONS: List every important term with definition, importance,
2-3 real-world examples, and common misconceptions.
SECTION 3 - MAIN TOPICS AND SUBTOPICS: Break down the material into a hierarchical outline.
SECTION 4 - VISUAL LEARNING AIDS: Create text-based diagrams and comparison tables.
SECTION 5 - MEMORY TECHNIQUES: Provide mnemonics and memory palace suggestions.
SECTION 6 - PRACTICE QUESTIONS: Generate 10-15 practice questions with detailed answers.
SECTION 7 - COMMON MISTAKES: Identify the most frequent errors students make.
SECTION 8 - CONNECTIONS AND APPLICATIONS: Real-world applications and future coursework.
SECTION 9 - QUICK REVIEW CHECKLIST: Bullet-point mastery verification checklist.

Additional instructions: Use clear headers, bullet points, and tables liberally.
Adjust complexity based on academic level. Be encouraging and supportive.
Prioritize depth and completeness over brevity.
`;
const model = genAI.getGenerativeModel({ model: "gemini-1.5-pro" });
const result = await model.generateContent(STUDY_GUIDE_PROMPT);
""",
        },
        {
            "path": "src/summarizer.ts",
            "language": "typescript",
            "content": DEMO_SCAN_1["files"][1]["content"],
        },
    ],
}

DEMO_MEMORY = {
    "projectId": PROJECT_ID,
    "context": {
        "projectName": "Sample AI App",
        "preferredModel": "gpt-4o",
        "budget": 100.0,
        "optimizationStyle": "balanced",
        "rules": [
            "Do not over-compress customer-facing prompts",
            "Preserve JSON output formats in all API responses",
            "Keep step-by-step instructions intact",
            "Always maintain safety and policy language",
        ],
    },
}


async def seed():
    async with httpx.AsyncClient(base_url=BASE_URL, timeout=30) as client:
        print("Checking backend health...")
        try:
            r = await client.get("/health")
            print(f"  Status: {r.json()['status']}")
        except Exception as e:
            print(f"  ERROR: Cannot reach backend at {BASE_URL}")
            print(f"  Start it with: uvicorn app.main:app --reload --port 8000")
            return

        print("\nSaving project memory context...")
        r = await client.post("/memory/project-context", json=DEMO_MEMORY)
        print(f"  {r.json()['message']}")

        print("\nSeeding scan 1 (commit abc111aaa)...")
        r = await client.post("/scan", json=DEMO_SCAN_1)
        d = r.json()
        print(f"  Found {d['totalPrompts']} prompts, ${d['estimatedMonthlyCost']:.2f}/mo")

        print("\nSeeding scan 2 (commit def222bbb — adds studyGuideAgent)...")
        r = await client.post("/scan", json=DEMO_SCAN_2)
        d = r.json()
        print(f"  Found {d['totalPrompts']} prompts, ${d['estimatedMonthlyCost']:.2f}/mo")

        print("\nRunning CostDiff between the two commits...")
        r = await client.post("/cost-diff", json={
            "projectId": PROJECT_ID,
            "previousCommit": "abc111aaa",
            "currentCommit": "def222bbb",
        })
        d = r.json()
        print(f"  Cost change: +{d['costIncreasePercent']:.1f}%  Status: {d['status']}")

        print("\nFetching memory insights...")
        r = await client.get(f"/memory/{PROJECT_ID}/insights")
        for insight in r.json()["insights"]:
            print(f"  • {insight}")

        print("\n✓ Demo data seeded. Open http://localhost:3000/dashboard to view.")


if __name__ == "__main__":
    asyncio.run(seed())
