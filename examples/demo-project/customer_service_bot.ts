/**
 * Customer service chatbot — multiple expensive AI calls.
 * Demo file — shows Promptimize detecting high-cost prompts in TypeScript.
 */
import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";

const openai = new OpenAI();
const claude = new Anthropic();

const AGENT_SYSTEM_PROMPT = `
You are an advanced customer service AI agent for Acme Corp, a global SaaS company
serving over 50,000 enterprise customers. You have full access to customer account data,
order history, billing records, and product documentation.

Your responsibilities:
- Resolve billing disputes, subscription changes, and refund requests
- Troubleshoot technical issues using step-by-step diagnostic procedures
- Escalate to human agents when: the customer requests it, legal/compliance issues arise,
  or you cannot resolve the issue after 3 attempts
- Always verify customer identity before accessing account information
- Maintain GDPR and CCPA compliance — never expose PII unnecessarily
- Log all interactions with structured metadata for quality assurance

Communication guidelines:
- Match the customer's communication style (formal vs casual)
- Show empathy for frustrated customers — acknowledge before solving
- Provide ETAs for all commitments (refunds: 5-7 business days, callbacks: within 2 hours)
- End every interaction with a satisfaction check and ticket summary
- If the customer speaks a language other than English, respond in their language

Available tools (call as JSON when needed):
- lookup_account(email, account_id)
- process_refund(amount, reason, account_id)
- update_subscription(plan, account_id)
- create_escalation_ticket(priority, reason, account_id)
- send_follow_up_email(template, account_id)
`;

export async function handleCustomerMessage(
  message: string,
  conversationHistory: Array<{ role: string; content: string }>
): Promise<string> {
  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [
      { role: "system", content: AGENT_SYSTEM_PROMPT },
      ...conversationHistory,
      { role: "user", content: message },
    ] as any,
    temperature: 0.3,
    max_tokens: 800,
  });
  return response.choices[0].message.content ?? "";
}

const SENTIMENT_PROMPT = `
Analyze the emotional tone and intent of customer messages for our support team dashboard.

For each message, provide a JSON response with:
{
  "sentiment": "positive" | "neutral" | "negative" | "angry" | "frustrated" | "confused",
  "sentimentScore": number between -1.0 and 1.0,
  "urgency": "low" | "medium" | "high" | "critical",
  "primaryIntent": string describing what the customer wants,
  "emotionalSignals": string[] of detected emotional cues,
  "recommendedTone": "empathetic" | "direct" | "apologetic" | "informational",
  "escalationRisk": number between 0 and 1,
  "suggestedResponse": string with a recommended opening line
}
`;

export async function analyzeSentiment(message: string): Promise<object> {
  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: SENTIMENT_PROMPT },
      { role: "user", content: `Analyze: "${message}"` },
    ],
    response_format: { type: "json_object" },
  });
  return JSON.parse(response.choices[0].message.content ?? "{}");
}

export async function generateKnowledgeArticle(
  issueTitle: string,
  resolvedTickets: string[]
): Promise<string> {
  const message = await claude.messages.create({
    model: "claude-3-5-sonnet-20241022",
    max_tokens: 1500,
    messages: [
      {
        role: "user",
        content: `Based on these resolved support tickets, write a comprehensive knowledge base article.

Issue title: ${issueTitle}

Resolved tickets for reference:
${resolvedTickets.join("\n\n---\n\n")}

The article must include:
1. A clear problem statement (what the customer experiences)
2. Root cause explanation (technical but accessible)
3. Step-by-step resolution guide with screenshots references
4. Prevention tips
5. Related articles to link
6. Tags for search indexing

Format in Markdown, suitable for a public help center.`,
      },
    ],
  });
  return (message.content[0] as any).text;
}
