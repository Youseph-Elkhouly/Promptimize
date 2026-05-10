"""
Financial report analysis service using GPT-4 Turbo.
Demo file — shows Promptimize detecting expensive prompts.
"""
import openai

client = openai.OpenAI()

SYSTEM_PROMPT = """
You are an expert financial analyst with over 20 years of experience analyzing
corporate earnings reports, balance sheets, income statements, and cash flow
statements. Your job is to produce a comprehensive, structured, multi-section
analysis that covers:

1. Executive Summary — a high-level overview of the company's financial health,
   highlighting the most significant developments from the reporting period.

2. Revenue Analysis — break down total revenue by segment, geographic region,
   and product line. Compare against the same period last year and against analyst
   consensus estimates. Note any surprises, accelerations, or decelerations.

3. Profitability Metrics — gross margin, operating margin, EBITDA margin, and
   net income margin. Flag margin compression or expansion and their root causes.

4. Balance Sheet Health — current ratio, quick ratio, debt-to-equity, and
   interest coverage. Assess liquidity and solvency risks.

5. Cash Flow Assessment — operating cash flow vs net income divergence,
   free cash flow generation, capex trends, and working capital changes.

6. Risk Factors — identify the top 3-5 risks mentioned in the filing. Assess
   their likelihood and potential impact on future earnings.

7. Guidance & Forward Outlook — summarize management guidance for the next
   quarter and fiscal year. Note any changes versus prior guidance.

8. Investment Thesis — provide a balanced buy/hold/sell perspective supported
   by quantitative evidence from the report.

Always cite specific numbers, percentages, and year-over-year comparisons.
Format your response with clear section headers and bullet points.
Maintain a professional, objective tone consistent with institutional research.
"""


def analyze_report(report_text: str, company: str) -> str:
    response = client.chat.completions.create(
        model="gpt-4-turbo",
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {
                "role": "user",
                "content": f"Analyze this earnings report for {company}:\n\n{report_text}",
            },
        ],
        temperature=0.2,
        max_tokens=2000,
    )
    return response.choices[0].message.content


def summarize_risk_factors(sec_filing: str) -> str:
    response = client.chat.completions.create(
        model="gpt-4-turbo",
        messages=[
            {
                "role": "system",
                "content": """You are a risk analysis specialist. Extract and categorize all risk factors
from SEC filings. For each risk, provide: a short title, a severity rating (Low/Medium/High/Critical),
the verbatim quote from the filing, and a plain-English explanation of the business impact.
Group risks into categories: Market Risk, Operational Risk, Regulatory Risk, Financial Risk,
Technology Risk, and Competitive Risk. Return structured JSON.""",
            },
            {"role": "user", "content": f"Extract risk factors from this SEC filing:\n\n{sec_filing}"},
        ],
        temperature=0.1,
    )
    return response.choices[0].message.content
