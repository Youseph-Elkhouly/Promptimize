const MODEL_PATTERNS: Array<[RegExp, string]> = [
  [/gpt-4o-mini/i, "gpt-4o-mini"],
  [/gpt-4o/i, "gpt-4o"],
  [/gpt-4-turbo/i, "gpt-4-turbo"],
  [/gpt-3\.5-turbo/i, "gpt-3.5-turbo"],
  [/gemini-1\.5-pro/i, "gemini-1.5-pro"],
  [/gemini-1\.5-flash/i, "gemini-1.5-flash"],
  [/gemini-2\.0-flash/i, "gemini-2.0-flash"],
  [/claude-3-5-sonnet|claude-3\.5-sonnet/i, "claude-3-5-sonnet"],
  [/claude-3-haiku/i, "claude-3-haiku"],
  [/claude-3-opus/i, "claude-3-opus"],
];

export function detectModel(contextText: string): string {
  for (const [pattern, name] of MODEL_PATTERNS) {
    if (pattern.test(contextText)) {
      return name;
    }
  }
  return "unknown";
}
