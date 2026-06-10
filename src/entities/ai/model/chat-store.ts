import type { AiIntent, QueryRun } from "./types";

/** A single message in a chat thread. */
export type ChatMessage =
  | { id: string; role: "user"; text: string }
  | {
      id: string;
      role: "assistant";
      intent: AiIntent;
      text: string;
      queries: QueryRun[];
      streaming: boolean;
    };

/** A saved conversation. */
export type ChatSession = {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messages: ChatMessage[];
};

type ChatState = {
  sessions: ChatSession[];
  activeId: string | null;
};

const STORAGE_KEY = "ai-chat-sessions-v1";
const MAX_SESSIONS = 50;
const DEFAULT_TITLE = "New chat";

function load(): ChatState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { sessions: [], activeId: null };
    const parsed = JSON.parse(raw) as ChatState;
    // Never restore a "streaming" flag — any in-flight request died with the
    // previous app run.
    parsed.sessions.forEach((s) =>
      s.messages.forEach((m) => {
        if (m.role === "assistant") m.streaming = false;
      }),
    );
    return {
      sessions: parsed.sessions ?? [],
      activeId: parsed.activeId ?? null,
    };
  } catch {
    return { sessions: [], activeId: null };
  }
}

let state: ChatState = load();
const listeners = new Set<() => void>();

function persist() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* quota / serialization errors are non-fatal for the UI */
  }
}

function set(next: ChatState) {
  state = next;
  persist();
  listeners.forEach((l) => l());
}

function titleFrom(text: string): string {
  const t = text.trim().replace(/\s+/g, " ");
  return t.length > 48 ? `${t.slice(0, 48)}…` : t || DEFAULT_TITLE;
}

export const chatStore = {
  subscribe(cb: () => void) {
    listeners.add(cb);
    return () => {
      listeners.delete(cb);
    };
  },
  getSnapshot(): ChatState {
    return state;
  },

  /** Create a fresh empty session and make it active. Returns its id. */
  newSession(): string {
    const id = crypto.randomUUID();
    const now = Date.now();
    const session: ChatSession = {
      id,
      title: DEFAULT_TITLE,
      createdAt: now,
      updatedAt: now,
      messages: [],
    };
    set({
      sessions: [session, ...state.sessions].slice(0, MAX_SESSIONS),
      activeId: id,
    });
    return id;
  },

  /** Ensure there is an active session, creating one if needed. Returns its id. */
  ensureActive(): string {
    if (state.activeId && state.sessions.some((s) => s.id === state.activeId)) {
      return state.activeId;
    }
    return this.newSession();
  },

  setActive(id: string) {
    if (id === state.activeId) return;
    set({ ...state, activeId: id });
  },

  deleteSession(id: string) {
    const sessions = state.sessions.filter((s) => s.id !== id);
    const activeId =
      state.activeId === id ? (sessions[0]?.id ?? null) : state.activeId;
    set({ sessions, activeId });
  },

  clearAll() {
    set({ sessions: [], activeId: null });
  },

  appendMessages(sessionId: string, msgs: ChatMessage[]) {
    set({
      ...state,
      sessions: state.sessions.map((s) => {
        if (s.id !== sessionId) return s;
        const firstUser = msgs.find((m) => m.role === "user");
        const title =
          s.title === DEFAULT_TITLE && firstUser ? titleFrom(firstUser.text) : s.title;
        return {
          ...s,
          title,
          updatedAt: Date.now(),
          messages: [...s.messages, ...msgs],
        };
      }),
    });
  },

  updateMessage(
    sessionId: string,
    messageId: string,
    patch: (m: ChatMessage) => ChatMessage,
  ) {
    set({
      ...state,
      sessions: state.sessions.map((s) =>
        s.id !== sessionId
          ? s
          : {
              ...s,
              updatedAt: Date.now(),
              messages: s.messages.map((m) => (m.id === messageId ? patch(m) : m)),
            },
      ),
    });
  },
};
