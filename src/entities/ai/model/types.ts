export type AiIntent = "analiz" | "prognoz" | "improve" | "discomfort" | "custom";

export type AiTableRow = Record<string, unknown>;

export type QueryRun = {
  sql: string;
  ok: boolean;
  error: string | null;
  rows: AiTableRow[] | null;
  row_count: number;
};

export type AiAnalyzeResult = {
  analysis: string;
  queries: QueryRun[];
};

export const AI_CHAT_EVENT = "ai-chat";

/** Streaming events emitted by the backend over the `ai-chat` Tauri channel. */
export type AiChatEvent =
  | { kind: "delta"; text: string }
  | { kind: "query"; sql: string; ok: boolean; row_count: number }
  | { kind: "done" };

export type PublicAiSettings = {
  provider: string;
  model: string | null;
  has_key: boolean;
};

export type SaveAiSettingsInput = {
  provider: string;
  api_key: string;
  model?: string | null;
};
