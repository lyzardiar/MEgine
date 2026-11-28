import type { AiProviderId } from './copilotProviders';
import type { CopilotToolExecution } from './copilotTools';

export type CopilotChatMessage = {
  id: string;
  role: 'assistant' | 'user';
  text: string;
  code?: string;
  meta?: string;
  isError?: boolean;
  suggestConfig?: boolean;
  toolExecutions?: CopilotToolExecution[];
  createdAt?: number;
};

export type CopilotSession = {
  id: string;
  title: string;
  untitled: boolean;
  createdAt: number;
  updatedAt: number;
  sceneName?: string;
  providerId?: AiProviderId;
  model?: string;
  messages: CopilotChatMessage[];
};

export type CopilotSessionStore = {
  activeSessionId: string;
  sessions: CopilotSession[];
};

const STORAGE_KEY = 'mengine.ai.copilot.sessions.v1';
const MAX_SESSIONS = 40;
const MAX_MESSAGES_PER_SESSION = 80;

export function deriveSessionTitle(text: string, fallback = '新对话'): string {
  const singleLine = text.replace(/\s+/gu, ' ').trim();
  if (!singleLine) return fallback;
  return singleLine.length > 28 ? `${singleLine.slice(0, 28)}…` : singleLine;
}

export function createSession(options: {
  welcomeText: string;
  defaultTitle: string;
  sceneName?: string;
  now?: number;
}): CopilotSession {
  const now = options.now ?? Date.now();
  const id = `chat-${now}-${Math.random().toString(36).slice(2, 7)}`;
  return {
    id,
    title: options.defaultTitle,
    untitled: true,
    createdAt: now,
    updatedAt: now,
    sceneName: options.sceneName,
    messages: [
      {
        id: 'welcome',
        role: 'assistant',
        text: options.welcomeText,
        createdAt: now,
      },
    ],
  };
}

export function sessionHasUserMessages(session: CopilotSession | undefined): boolean {
  if (!session) return false;
  return session.messages.some((m) => m.role === 'user');
}

export function loadCopilotSessionStore(options: {
  welcomeText: string;
  defaultTitle: string;
  sceneName?: string;
}): CopilotSessionStore {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null;
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<CopilotSessionStore> | null;
      if (parsed && Array.isArray(parsed.sessions) && parsed.sessions.length > 0) {
        const valid: CopilotSession[] = [];
        for (const item of parsed.sessions) {
          if (!item || typeof item !== 'object' || typeof item.id !== 'string') continue;
          const msgs = Array.isArray(item.messages)
            ? item.messages.filter(
                (m): m is CopilotChatMessage =>
                  Boolean(m && typeof m === 'object' && typeof m.id === 'string' && typeof m.text === 'string' && (m.role === 'user' || m.role === 'assistant')),
              )
            : [];
          if (msgs.length === 0) continue;
          valid.push({
            id: item.id,
            title: typeof item.title === 'string' && item.title.trim() ? item.title : options.defaultTitle,
            untitled: typeof item.untitled === 'boolean' ? item.untitled : !msgs.some((m) => m.role === 'user'),
            createdAt: typeof item.createdAt === 'number' ? item.createdAt : Date.now(),
            updatedAt: typeof item.updatedAt === 'number' ? item.updatedAt : Date.now(),
            sceneName: typeof item.sceneName === 'string' ? item.sceneName : undefined,
            providerId: typeof item.providerId === 'string' ? (item.providerId as AiProviderId) : undefined,
            model: typeof item.model === 'string' ? item.model : undefined,
            messages: msgs.slice(-MAX_MESSAGES_PER_SESSION),
          });
        }
        if (valid.length > 0) {
          const sorted = valid.sort((a, b) => b.updatedAt - a.updatedAt).slice(0, MAX_SESSIONS);
          const activeId = typeof parsed.activeSessionId === 'string' && sorted.some((s) => s.id === parsed.activeSessionId)
            ? parsed.activeSessionId
            : sorted[0].id;
          return { activeSessionId: activeId, sessions: sorted };
        }
      }
    }
  } catch {
    // Ignore corrupted storage and initialize fresh store.
  }

  const fresh = createSession(options);
  return { activeSessionId: fresh.id, sessions: [fresh] };
}

export function saveCopilotSessionStore(store: CopilotSessionStore): void {
  try {
    if (typeof localStorage !== 'undefined') {
      const compact: CopilotSessionStore = {
        activeSessionId: store.activeSessionId,
        sessions: store.sessions.slice(0, MAX_SESSIONS).map((s) => ({
          ...s,
          messages: s.messages.slice(-MAX_MESSAGES_PER_SESSION),
        })),
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(compact));
    }
  } catch {
    // Ignore storage quota errors.
  }
}

export function appendMessagesToSession(
  store: CopilotSessionStore,
  sessionId: string,
  nextMessages: CopilotChatMessage[],
  meta?: { sceneName?: string; providerId?: AiProviderId; model?: string; now?: number },
): CopilotSessionStore {
  if (nextMessages.length === 0) return store;
  const now = meta?.now ?? Date.now();
  const stamped = nextMessages.map((m) => (m.createdAt ? m : { ...m, createdAt: now }));
  const updated = store.sessions.map((session) => {
    if (session.id !== sessionId) return session;
    const firstUser = stamped.find((m) => m.role === 'user');
    const title = session.untitled && firstUser
      ? deriveSessionTitle(firstUser.text, session.title)
      : session.title;
    const untitled = session.untitled && firstUser ? false : session.untitled;
    return {
      ...session,
      title,
      untitled,
      updatedAt: now,
      sceneName: meta?.sceneName ?? session.sceneName,
      providerId: meta?.providerId ?? session.providerId,
      model: meta?.model ?? session.model,
      messages: [...session.messages, ...stamped].slice(-MAX_MESSAGES_PER_SESSION),
    };
  });
  updated.sort((a, b) => b.updatedAt - a.updatedAt);
  return {
    activeSessionId: store.activeSessionId,
    sessions: updated.slice(0, MAX_SESSIONS),
  };
}

export function startNewChatSession(
  store: CopilotSessionStore,
  options: { welcomeText: string; defaultTitle: string; sceneName?: string; now?: number },
): { store: CopilotSessionStore; reusedEmpty: boolean } {
  const existingEmpty = store.sessions.find((s) => !sessionHasUserMessages(s));
  if (existingEmpty) {
    return {
      store: {
        ...store,
        activeSessionId: existingEmpty.id,
      },
      reusedEmpty: true,
    };
  }
  const fresh = createSession(options);
  return {
    store: {
      activeSessionId: fresh.id,
      sessions: [fresh, ...store.sessions].slice(0, MAX_SESSIONS),
    },
    reusedEmpty: false,
  };
}

export function deleteChatSession(
  store: CopilotSessionStore,
  sessionId: string,
  options: { welcomeText: string; defaultTitle: string; sceneName?: string; now?: number },
): CopilotSessionStore {
  const remaining = store.sessions.filter((s) => s.id !== sessionId);
  if (remaining.length === 0) {
    const fresh = createSession(options);
    return { activeSessionId: fresh.id, sessions: [fresh] };
  }
  const nextActive = store.activeSessionId === sessionId
    ? remaining[0].id
    : store.activeSessionId;
  return {
    activeSessionId: nextActive,
    sessions: remaining,
  };
}

export function formatSessionTime(timestamp: number, zh: boolean, now = Date.now()): string {
  const diffSec = Math.max(0, Math.floor((now - timestamp) / 1000));
  if (diffSec < 60) return zh ? '刚刚' : 'Just now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return zh ? `${diffMin} 分钟前` : `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return zh ? `${diffHr} 小时前` : `${diffHr}h ago`;
  const d = new Date(timestamp);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${mm}/${dd}`;
}
