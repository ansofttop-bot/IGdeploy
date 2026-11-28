/**
 * Sanitizes upstream error messages so third-party provider, vendor, or raw model names
 * never leak to end users — all user-facing errors are cleanly branded as IGseek.
 */
const THIRD_PARTY_PATTERNS: Array<[RegExp, string]> = [
  [/\b(?:OPENROUTER|GROQ|DEEPSEEK|APIMIRA|OPENAI|ANTHROPIC|GEMINI|GOOGLE_AI|FIREBASE|SUPABASE)_API_KEY\b/gi, "IGseek API key"],
  [/\b(?:google|deepseek|openai|anthropic|qwen|meta-llama|mistralai|x-ai|cohere|perplexity)\/[a-z0-9._:-]+\b/gi, "IGseek AI"],
  [/\b(?:OpenRouter|DeepSeek|Groq|OpenAI|ChatGPT|Pollinations(?:\.ai)?|APIMIRA|ApiMira|Anthropic|Claude|Gemini|Google\s+AI|Whisper|ElevenLabs|Perplexity|Replicate|Together(?:\.ai)?|Tavily|GPT\s*Image\s*2|GPT-\d+[a-z0-9-]*|Flux|DALL-?E(?:\s*\d)?|Midjourney|Stability\s*AI|Mistral|Cohere|Hugging\s*Face|Firebase(?:\s+Console)?|Firestore|Supabase)\b/gi, "IGseek"],
];

export function sanitizeErrorForUser(raw: unknown, fallback = "IGseek AI request failed. Please try again."): string {
  const input =
    typeof raw === "string"
      ? raw
      : raw instanceof Error
        ? raw.message
        : String(raw ?? "");

  let cleaned = input.trim();
  if (!cleaned) return fallback;

  for (const [pattern, replacement] of THIRD_PARTY_PATTERNS) {
    cleaned = cleaned.replace(pattern, replacement);
  }

  // Collapse duplicated "IGseek IGseek" or "IGseek (IGseek)"
  cleaned = cleaned
    .replace(/\bIGseek\s+IGseek\b/gi, "IGseek")
    .replace(/\(\s*IGseek\s*\)/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();

  return (cleaned || fallback).slice(0, 260);
}
