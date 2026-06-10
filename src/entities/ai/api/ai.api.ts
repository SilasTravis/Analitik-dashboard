import { invoke } from "@shared/api";
import type {
  AiAnalyzeResult,
  PublicAiSettings,
  SaveAiSettingsInput,
} from "../model/types";

export const aiApi = {
  chat: (intent: string, question?: string) =>
    invoke<AiAnalyzeResult>("ai_chat", { intent, question: question ?? null }),
  resetChat: () => invoke<void>("ai_reset_chat"),
  loadSettings: () => invoke<PublicAiSettings | null>("load_ai_settings"),
  saveSettings: (settings: SaveAiSettingsInput) =>
    invoke<PublicAiSettings>("save_ai_settings", { settings }),
  clearSettings: () => invoke<void>("clear_ai_settings"),
  listModels: (provider: string, apiKey?: string) =>
    invoke<string[]>("list_ai_models", { provider, apiKey: apiKey ?? null }),
};
