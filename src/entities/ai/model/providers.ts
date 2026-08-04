export type AiProviderId = "gemini" | "openai" | "anthropic";

export type AiProviderInfo = {
  id: AiProviderId;
  label: string;
  defaultModel: string;
  /** Shown before the live list loads or when no key is set. */
  fallbackModels: string[];
  keyUrl: string;
  keyHint: string;
};

export const AI_PROVIDERS: AiProviderInfo[] = [
  {
    id: "gemini",
    label: "Google Gemini",
    defaultModel: "gemini-2.0-flash",
    fallbackModels: [
      "gemini-2.5-flash",
      "gemini-2.5-pro",
      "gemini-2.0-flash",
      "gemini-2.0-flash-lite",
    ],
    keyUrl: "https://aistudio.google.com/apikey",
    keyHint: "Google AI Studio",
  },
  {
    id: "openai",
    label: "OpenAI",
    defaultModel: "gpt-5.5",
    // Newer GPT-5 family first — strongest at SQL/data reasoning — then the
    // proven GPT-4 models as fallbacks.
    fallbackModels: [
      "gpt-5.5-pro",
      "gpt-5.5",
      "gpt-5.4",
      "gpt-5.4-mini",
      "gpt-5.2-pro",
      "gpt-5.1-codex",
      "gpt-5-mini",
      "gpt-4o",
      "gpt-4o-mini",
      "gpt-4.1-mini",
    ],
    keyUrl: "https://platform.openai.com/api-keys",
    keyHint: "OpenAI Platform",
  },
  {
    id: "anthropic",
    label: "Anthropic Claude",
    defaultModel: "claude-sonnet-5",
    fallbackModels: [
      "claude-sonnet-5",
      "claude-opus-5",
      "claude-opus-4-8",
      "claude-haiku-4-5",
    ],
    keyUrl: "https://console.anthropic.com/settings/keys",
    keyHint: "Anthropic Console",
  },
];

export function getProvider(id: string | null | undefined): AiProviderInfo {
  return AI_PROVIDERS.find((p) => p.id === id) ?? AI_PROVIDERS[0];
}
