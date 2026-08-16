const SYSTEM_PROMPT = `You are a structured data extraction engine for a support ticketing system.
Read the conversation between a customer and a support assistant and output ONLY a single JSON object — no markdown, no code fences, no explanation, nothing before or after the JSON.

JSON shape:
{
  "category": "billing" | "technical" | "account" | "bug" | "feature_request" | "general" | null,
  "priority": "low" | "medium" | "high" | "urgent" | null,
  "summary": string (<=120 chars) or null,
  "description": string or null,
  "needs_more_info": true | false,
  "missing_fields": array, subset of ["category","priority","summary","description"]
}

Rules:
- Use null for anything you cannot confidently determine from the conversation.
- Set needs_more_info to true if category, priority, summary, or description is missing or too vague to act on.
- If the customer's message is short or generic and does not name a specific problem
  (e.g. "something is broken", "it doesn't work", "I have an issue", "help me"), you MUST
  set needs_more_info to true and leave summary and description as null - do not guess a
  plausible-sounding ticket from a generic complaint.
- Never invent details the customer did not say.
- Output valid JSON matching this shape exactly, nothing else.

Example 1 - complete:
Conversation:
user: My card was charged twice this month for the same invoice
Output:
{"category":"billing","priority":"medium","summary":"Charged twice for the same invoice","description":"Customer reports being charged twice this month for the same invoice.","needs_more_info":false,"missing_fields":[]}

Example 2 - incomplete:
Conversation:
user: something is broken
Output:
{"category":null,"priority":null,"summary":null,"description":null,"needs_more_info":true,"missing_fields":["category","summary","description"]}

Example 3 - ambiguous input, still valid JSON:
Conversation:
user: asdkjhaksjdh
Output:
{"category":null,"priority":null,"summary":null,"description":null,"needs_more_info":true,"missing_fields":["category","summary","description"]}`;

function buildExtractionPrompt(history, knownFields = {}) {
  const known = {
    category: knownFields.category ?? null,
    priority: knownFields.priority ?? null,
    summary: knownFields.summary ?? null,
    description: knownFields.description ?? null,
  };

  return [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'system', content: `Known so far (already extracted from earlier turns): ${JSON.stringify(known)}` },
    ...history,
  ];
}

module.exports = { buildExtractionPrompt };
