import type { GatewayBrowserClient } from "../gateway";
import type { TaskRecommendation } from "../types/chat-types";
import type { ChatAttachment } from "../ui-types";
import { extractText } from "../chat/message-extract";
import { generateUUID } from "../uuid";

export type ChatState = {
  client: GatewayBrowserClient | null;
  connected: boolean;
  sessionKey: string;
  chatLoading: boolean;
  chatMessages: unknown[];
  chatThinkingLevel: string | null;
  chatSending: boolean;
  chatMessage: string;
  chatAttachments: ChatAttachment[];
  chatRunId: string | null;
  chatStream: string | null;
  chatStreamStartedAt: number | null;
  lastError: string | null;
  chatRecommendations: TaskRecommendation[];
};

export type ChatEventPayload = {
  runId: string;
  sessionKey: string;
  state: "delta" | "final" | "aborted" | "error";
  message?: unknown;
  errorMessage?: string;
};

export async function fetchChatHistory(client: GatewayBrowserClient, sessionKey: string) {
  try {
    // oxlint-disable-next-line typescript/no-unnecessary-type-assertion -- client.request returns unknown, assertion is needed
    const res = (await client.request("chat.history", {
      sessionKey,
      limit: 1000,
    })) as { messages: unknown[] };
    return Array.isArray(res.messages) ? res.messages : [];
  } catch (err) {
    console.error("Failed to fetch chat history", err);
    return [];
  }
}

export async function fetchRecommendations(state: ChatState) {
  if (!state.client || !state.connected) {
    return;
  }
  try {
    // oxlint-disable-next-line typescript/no-unnecessary-type-assertion -- client.request returns unknown, assertion is needed
    const res = (await state.client.request("chat.recommendations", {
      sessionKey: state.sessionKey,
      limit: 5,
    })) as { recommendations: TaskRecommendation[] };
    state.chatRecommendations = Array.isArray(res.recommendations) ? res.recommendations : [];
  } catch (err) {
    console.error("Failed to fetch recommendations", err);
    state.chatRecommendations = [];
  }
}

export async function loadChatHistory(state: ChatState, options?: { retryCount?: number }) {
  if (!state.client || !state.connected) {
    return;
  }
  // Capture the session key at the start of the request to detect changes
  const sessionKeyAtStart = state.sessionKey;
  // Capture current message count to detect if server hasn't persisted new messages yet
  const currentMessageCount = state.chatMessages.length;
  const retryCount = options?.retryCount ?? 0;
  const maxRetries = 3;
  const retryDelayMs = 150;

  state.chatLoading = true;
  state.lastError = null;
  try {
    // oxlint-disable-next-line typescript/no-unnecessary-type-assertion -- client.request returns unknown, assertion is needed
    const res = (await state.client.request("chat.history", {
      sessionKey: sessionKeyAtStart,
      limit: 200,
    })) as { messages: unknown[]; thinkingLevel?: string };
    // Only update state if the session key hasn't changed during the async call
    // This prevents clearing messages when the user switches sessions mid-request
    if (state.sessionKey !== sessionKeyAtStart) {
      return;
    }
    const newMessages = Array.isArray(res.messages) ? res.messages : [];

    // If the server returns fewer messages than we have locally (due to optimistic updates),
    // it means the server hasn't persisted the new messages yet. Retry after a short delay.
    // This prevents the visual "clearing" bug where messages briefly disappear.
    if (
      newMessages.length < currentMessageCount &&
      currentMessageCount > 0 &&
      retryCount < maxRetries
    ) {
      // Keep loading state while retrying - don't set to false here
      await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
      return loadChatHistory(state, { retryCount: retryCount + 1 });
    }

    // Final safeguard: if server returns fewer messages than we have locally,
    // keep local messages to prevent visual "clearing" or data loss.
    // This happens when the server is lagging behind the optimistic client state.
    if (
      newMessages.length < currentMessageCount &&
      currentMessageCount > 0 &&
      retryCount >= maxRetries
    ) {
      console.warn(
        "[loadChatHistory] Server returned fewer messages after retries, keeping local messages",
        { current: currentMessageCount, received: newMessages.length },
      );
      return;
    }

    state.chatMessages = newMessages;
    state.chatThinkingLevel = res.thinkingLevel ?? null;
    // Fetch recommendations after loading history
    void fetchRecommendations(state);
  } catch (err) {
    // Only set error if session key hasn't changed
    if (state.sessionKey === sessionKeyAtStart) {
      state.lastError = String(err);
    }
  } finally {
    // Only clear loading state if session key hasn't changed
    if (state.sessionKey === sessionKeyAtStart) {
      state.chatLoading = false;
    }
  }
}

function dataUrlToBase64(dataUrl: string): { content: string; mimeType: string } | null {
  const match = /^data:([^;]+);base64,(.+)$/.exec(dataUrl);
  if (!match) {
    return null;
  }
  return { mimeType: match[1], content: match[2] };
}

export async function sendChatMessage(
  state: ChatState,
  message: string,
  attachments?: ChatAttachment[],
): Promise<string | null> {
  if (!state.client || !state.connected) {
    return null;
  }
  const msg = message.trim();
  const hasAttachments = attachments && attachments.length > 0;
  if (!msg && !hasAttachments) {
    return null;
  }

  const now = Date.now();

  // Build user message content blocks
  const contentBlocks: Array<{ type: string; text?: string; source?: unknown }> = [];
  if (msg) {
    contentBlocks.push({ type: "text", text: msg });
  }
  // Add image previews to the message for display
  if (hasAttachments) {
    for (const att of attachments) {
      contentBlocks.push({
        type: "image",
        source: { type: "base64", media_type: att.mimeType, data: att.dataUrl },
      });
    }
  }

  state.chatMessages = [
    ...state.chatMessages,
    {
      role: "user",
      content: contentBlocks,
      timestamp: now,
    },
  ];

  state.chatSending = true;
  state.lastError = null;
  const runId = generateUUID();
  state.chatRunId = runId;
  state.chatStream = "";
  state.chatStreamStartedAt = now;

  // Convert attachments to API format
  const apiAttachments = hasAttachments
    ? attachments
        .map((att) => {
          const parsed = dataUrlToBase64(att.dataUrl);
          if (!parsed) {
            return null;
          }
          return {
            type: "image",
            mimeType: parsed.mimeType,
            content: parsed.content,
          };
        })
        .filter((a): a is NonNullable<typeof a> => a !== null)
    : undefined;

  try {
    await state.client.request("chat.send", {
      sessionKey: state.sessionKey,
      message: msg,
      deliver: false,
      idempotencyKey: runId,
      attachments: apiAttachments,
    });
    return runId;
  } catch (err) {
    const error = String(err);
    state.chatRunId = null;
    state.chatStream = null;
    state.chatStreamStartedAt = null;
    state.lastError = error;
    state.chatMessages = [
      ...state.chatMessages,
      {
        role: "assistant",
        content: [{ type: "text", text: "Error: " + error }],
        timestamp: Date.now(),
      },
    ];
    return null;
  } finally {
    state.chatSending = false;
  }
}

export async function abortChatRun(state: ChatState): Promise<boolean> {
  if (!state.client || !state.connected) {
    return false;
  }
  const runId = state.chatRunId;
  try {
    await state.client.request(
      "chat.abort",
      runId ? { sessionKey: state.sessionKey, runId } : { sessionKey: state.sessionKey },
    );
    return true;
  } catch (err) {
    state.lastError = String(err);
    return false;
  }
}

export async function deleteMessage(state: ChatState, messageId: string) {
  if (!state.client || !state.connected) {
    return;
  }
  try {
    await state.client.request("chat.delete", {
      sessionKey: state.sessionKey,
      messageId,
    });
  } catch (err) {
    state.lastError = String(err);
  }
}

export async function deleteFromMessage(state: ChatState, messageId: string) {
  if (!state.client || !state.connected) {
    return;
  }
  try {
    await state.client.request("chat.deleteFrom", {
      sessionKey: state.sessionKey,
      messageId,
    });
  } catch (err) {
    state.lastError = String(err);
  }
}

export async function rerunFromMessage(
  state: ChatState,
  messageId: string,
): Promise<string | null> {
  if (!state.client || !state.connected) {
    return null;
  }
  const runId = generateUUID();
  state.chatRunId = runId;
  state.chatStream = "";
  state.chatStreamStartedAt = Date.now();
  state.chatSending = true;
  state.lastError = null;

  try {
    await state.client.request("chat.rerun", {
      sessionKey: state.sessionKey,
      messageId,
      idempotencyKey: runId,
    });
    return runId;
  } catch (err) {
    state.chatRunId = null;
    state.chatStream = null;
    state.chatStreamStartedAt = null;
    state.lastError = String(err);
    return null;
  } finally {
    state.chatSending = false;
  }
}

export async function editMessage(
  state: ChatState,
  messageId: string,
  content: string,
  rerun: boolean = false,
): Promise<string | null> {
  if (!state.client || !state.connected) {
    return null;
  }
  const runId = rerun ? generateUUID() : null;

  if (rerun && runId) {
    state.chatRunId = runId;
    state.chatStream = "";
    state.chatStreamStartedAt = Date.now();
    state.chatSending = true;
  }
  state.lastError = null;

  try {
    await state.client.request("chat.edit", {
      sessionKey: state.sessionKey,
      messageId,
      content,
      rerun,
      idempotencyKey: runId ?? undefined,
    });
    return runId;
  } catch (err) {
    if (rerun) {
      state.chatRunId = null;
      state.chatStream = null;
      state.chatStreamStartedAt = null;
    }
    state.lastError = String(err);
    return null;
  } finally {
    if (rerun) {
      state.chatSending = false;
    }
  }
}

export function handleChatEvent(state: ChatState, payload?: ChatEventPayload) {
  if (!payload) {
    return null;
  }
  if (payload.sessionKey !== state.sessionKey) {
    return null;
  }

  // Final from another run (e.g. sub-agent announce): refresh history to show new message.
  // See https://github.com/openclaw/openclaw/issues/1909
  if (payload.runId && state.chatRunId && payload.runId !== state.chatRunId) {
    if (payload.state === "final") {
      // Set loading state immediately to prevent empty state flash while history loads
      state.chatLoading = true;
      return "final";
    }
    return null;
  }

  if (payload.state === "delta") {
    const next = extractText(payload.message);
    if (typeof next === "string") {
      const current = state.chatStream ?? "";
      if (!current || next.length >= current.length) {
        state.chatStream = next;
      }
    }
  } else if (payload.state === "final") {
    // Optimistically append final message to ensure it appears immediately
    // and prevents data loss if the history fetch lags or fails.
    if (payload.message && typeof payload.message === "object") {
      state.chatMessages = [...state.chatMessages, payload.message];
    }

    // Set loading state BEFORE clearing stream to prevent empty state flash
    // This ensures the skeleton loader shows during the transition to loaded history
    state.chatLoading = true;
    state.chatStream = null;
    state.chatRunId = null;
    state.chatStreamStartedAt = null;
    // Refresh recommendations on final message
    void fetchRecommendations(state);
  } else if (payload.state === "aborted") {
    state.chatStream = null;
    state.chatRunId = null;
    state.chatStreamStartedAt = null;
  } else if (payload.state === "error") {
    state.chatStream = null;
    state.chatRunId = null;
    state.chatStreamStartedAt = null;
    state.lastError = payload.errorMessage ?? "chat error";
  }
  return payload.state;
}
