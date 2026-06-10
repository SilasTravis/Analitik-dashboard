import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { listen } from "@tauri-apps/api/event";
import { useMutation, useQuery } from "@tanstack/react-query";
import { aiApi, aiKeys, chatStore, AI_CHAT_EVENT } from "@entities/ai";
import type {
  AiChatEvent,
  AiIntent,
  ChatMessage,
  PublicAiSettings,
} from "@entities/ai";
import type { BackendError } from "@shared/api";

export type { ChatMessage, ChatSession } from "@entities/ai";

export function useAiScanner() {
  const [question, setQuestion] = useState("");
  const chat = useSyncExternalStore(chatStore.subscribe, chatStore.getSnapshot);
  // Session + assistant bubble currently receiving streamed deltas.
  const activeSessionRef = useRef<string | null>(null);
  const activeMsgRef = useRef<string | null>(null);

  const settingsQuery = useQuery({
    queryKey: aiKeys.settings,
    queryFn: aiApi.loadSettings,
  });

  // One listener for the lifetime of the hook; routes events to the active bubble.
  useEffect(() => {
    const unlisten = listen<AiChatEvent>(AI_CHAT_EVENT, (event) => {
      const payload = event.payload;
      const sid = activeSessionRef.current;
      const mid = activeMsgRef.current;
      if (!sid || !mid) return;
      chatStore.updateMessage(sid, mid, (m) => {
        if (m.role !== "assistant") return m;
        if (payload.kind === "delta") return { ...m, text: m.text + payload.text };
        if (payload.kind === "query") {
          return {
            ...m,
            queries: [
              ...m.queries,
              {
                sql: payload.sql,
                ok: payload.ok,
                error: null,
                rows: null,
                row_count: payload.row_count,
              },
            ],
          };
        }
        return m;
      });
    });
    return () => {
      void unlisten.then((off) => off());
    };
  }, []);

  const run = useMutation({
    mutationFn: (vars: { intent: AiIntent; question?: string }) =>
      aiApi.chat(vars.intent, vars.question),
    onMutate: (vars) => {
      const prompt = vars.question?.trim() || vars.intent;
      const sessionId = chatStore.ensureActive();
      const assistantId = crypto.randomUUID();
      activeSessionRef.current = sessionId;
      activeMsgRef.current = assistantId;
      const userMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: "user",
        text: prompt,
      };
      const assistantMsg: ChatMessage = {
        id: assistantId,
        role: "assistant",
        intent: vars.intent,
        text: "",
        queries: [],
        streaming: true,
      };
      chatStore.appendMessages(sessionId, [userMsg, assistantMsg]);
      return { sessionId, assistantId };
    },
    onSuccess: (result, _vars, ctx) => {
      if (!ctx) return;
      chatStore.updateMessage(ctx.sessionId, ctx.assistantId, (m) =>
        m.role === "assistant"
          ? {
              ...m,
              text: result.analysis || m.text,
              queries: result.queries,
              streaming: false,
            }
          : m,
      );
      activeMsgRef.current = null;
    },
    onError: (_err, _vars, ctx) => {
      if (!ctx) return;
      chatStore.updateMessage(ctx.sessionId, ctx.assistantId, (m) =>
        m.role === "assistant" ? { ...m, streaming: false } : m,
      );
      activeMsgRef.current = null;
    },
  });

  const settings = (settingsQuery.data ?? null) as PublicAiSettings | null;

  const activeSession = chat.sessions.find((s) => s.id === chat.activeId) ?? null;
  const messages = activeSession?.messages ?? [];

  const runIntent = (intent: AiIntent) => {
    if (run.isPending) return;
    run.mutate({ intent });
  };

  const submitCustom = () => {
    const q = question.trim();
    if (!q || run.isPending) return;
    run.mutate({ intent: "custom", question: q });
    setQuestion("");
  };

  const newChat = () => {
    if (run.isPending) return;
    void aiApi.resetChat();
    chatStore.newSession();
  };

  const selectChat = (id: string) => {
    if (run.isPending || id === chat.activeId) return;
    // Switching threads starts a fresh backend context (server memory can't be
    // restored for an old thread); the displayed history stays intact.
    void aiApi.resetChat();
    chatStore.setActive(id);
  };

  const deleteChat = (id: string) => {
    if (run.isPending) return;
    chatStore.deleteSession(id);
  };

  return {
    question,
    setQuestion,
    sessions: chat.sessions,
    activeId: chat.activeId,
    messages,
    runIntent,
    submitCustom,
    newChat,
    selectChat,
    deleteChat,
    isRunning: run.isPending,
    error: run.error as BackendError | null,
    settings,
    isConfigured: !!settings?.has_key,
    settingsLoading: settingsQuery.isLoading,
  };
}
