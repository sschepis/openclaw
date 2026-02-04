import { CURRENT_SESSION_VERSION } from "@mariozechner/pi-coding-agent";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { MsgContext } from "../../auto-reply/templating.js";
import type { GatewayRequestContext, GatewayRequestHandlers } from "./types.js";
import { resolveSessionAgentId } from "../../agents/agent-scope.js";
import { resolveEffectiveMessagesConfig, resolveIdentityName } from "../../agents/identity.js";
import { resolveThinkingDefault } from "../../agents/model-selection.js";
import { resolveAgentTimeoutMs } from "../../agents/timeout.js";
import { dispatchInboundMessage } from "../../auto-reply/dispatch.js";
import { createReplyDispatcher } from "../../auto-reply/reply/reply-dispatcher.js";
import {
  extractShortModelName,
  type ResponsePrefixContext,
} from "../../auto-reply/reply/response-prefix-template.js";
import { resolveSendPolicy } from "../../sessions/send-policy.js";
import { INTERNAL_MESSAGE_CHANNEL } from "../../utils/message-channel.js";
import {
  abortChatRunById,
  abortChatRunsForSessionKey,
  isChatStopCommandText,
  resolveChatRunExpiresAtMs,
} from "../chat-abort.js";
import { type ChatImageContent, parseMessageWithAttachments } from "../chat-attachments.js";
import { stripEnvelopeFromMessages } from "../chat-sanitize.js";
import {
  ErrorCodes,
  errorShape,
  formatValidationErrors,
  validateChatAbortParams,
  validateChatDeleteParams,
  validateChatDeleteFromParams,
  validateChatRerunParams,
  validateChatEditParams,
  validateChatHistoryParams,
  validateChatInjectParams,
  validateChatSendParams,
} from "../protocol/index.js";
import { getMaxChatHistoryMessagesBytes } from "../server-constants.js";
import {
  capArrayByJsonBytes,
  deleteMessageFromTranscript,
  deleteMessagesFromId,
  editMessageInTranscript,
  getMessageContentFromTranscript,
  loadSessionEntry,
  readSessionMessages,
  resolveSessionModelRef,
} from "../session-utils.js";
import { formatForLog } from "../ws-log.js";
import { injectTimestamp, timestampOptsFromConfig } from "./agent-timestamp.js";

type TranscriptAppendResult = {
  ok: boolean;
  messageId?: string;
  message?: Record<string, unknown>;
  error?: string;
};

function resolveTranscriptPath(params: {
  sessionId: string;
  storePath: string | undefined;
  sessionFile?: string;
}): string | null {
  const { sessionId, storePath, sessionFile } = params;
  if (sessionFile) {
    return sessionFile;
  }
  if (!storePath) {
    return null;
  }
  return path.join(path.dirname(storePath), `${sessionId}.jsonl`);
}

function ensureTranscriptFile(params: { transcriptPath: string; sessionId: string }): {
  ok: boolean;
  error?: string;
} {
  if (fs.existsSync(params.transcriptPath)) {
    return { ok: true };
  }
  try {
    fs.mkdirSync(path.dirname(params.transcriptPath), { recursive: true });
    const header = {
      type: "session",
      version: CURRENT_SESSION_VERSION,
      id: params.sessionId,
      timestamp: new Date().toISOString(),
      cwd: process.cwd(),
    };
    fs.writeFileSync(params.transcriptPath, `${JSON.stringify(header)}\n`, "utf-8");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

function appendAssistantTranscriptMessage(params: {
  message: string;
  label?: string;
  sessionId: string;
  storePath: string | undefined;
  sessionFile?: string;
  createIfMissing?: boolean;
}): TranscriptAppendResult {
  const transcriptPath = resolveTranscriptPath({
    sessionId: params.sessionId,
    storePath: params.storePath,
    sessionFile: params.sessionFile,
  });
  if (!transcriptPath) {
    return { ok: false, error: "transcript path not resolved" };
  }

  if (!fs.existsSync(transcriptPath)) {
    if (!params.createIfMissing) {
      return { ok: false, error: "transcript file not found" };
    }
    const ensured = ensureTranscriptFile({
      transcriptPath,
      sessionId: params.sessionId,
    });
    if (!ensured.ok) {
      return { ok: false, error: ensured.error ?? "failed to create transcript file" };
    }
  }

  const now = Date.now();
  const messageId = randomUUID().slice(0, 8);
  const labelPrefix = params.label ? `[${params.label}]\n\n` : "";
  const messageBody: Record<string, unknown> = {
    role: "assistant",
    content: [{ type: "text", text: `${labelPrefix}${params.message}` }],
    timestamp: now,
    stopReason: "injected",
    usage: { input: 0, output: 0, totalTokens: 0 },
  };
  const transcriptEntry = {
    type: "message",
    id: messageId,
    timestamp: new Date(now).toISOString(),
    message: messageBody,
  };

  try {
    fs.appendFileSync(transcriptPath, `${JSON.stringify(transcriptEntry)}\n`, "utf-8");
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }

  return { ok: true, messageId, message: transcriptEntry.message };
}

function nextChatSeq(context: { agentRunSeq: Map<string, number> }, runId: string) {
  const next = (context.agentRunSeq.get(runId) ?? 0) + 1;
  context.agentRunSeq.set(runId, next);
  return next;
}

function broadcastChatFinal(params: {
  context: Pick<GatewayRequestContext, "broadcast" | "nodeSendToSession" | "agentRunSeq">;
  runId: string;
  sessionKey: string;
  message?: Record<string, unknown>;
}) {
  const seq = nextChatSeq({ agentRunSeq: params.context.agentRunSeq }, params.runId);
  const payload = {
    runId: params.runId,
    sessionKey: params.sessionKey,
    seq,
    state: "final" as const,
    message: params.message,
  };
  params.context.broadcast("chat", payload);
  params.context.nodeSendToSession(params.sessionKey, "chat", payload);
}

function broadcastChatError(params: {
  context: Pick<GatewayRequestContext, "broadcast" | "nodeSendToSession" | "agentRunSeq">;
  runId: string;
  sessionKey: string;
  errorMessage?: string;
}) {
  const seq = nextChatSeq({ agentRunSeq: params.context.agentRunSeq }, params.runId);
  const payload = {
    runId: params.runId,
    sessionKey: params.sessionKey,
    seq,
    state: "error" as const,
    errorMessage: params.errorMessage,
  };
  params.context.broadcast("chat", payload);
  params.context.nodeSendToSession(params.sessionKey, "chat", payload);
}

export const chatHandlers: GatewayRequestHandlers = {
  "chat.history": async ({ params, respond, context }) => {
    if (!validateChatHistoryParams(params)) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.INVALID_REQUEST,
          `invalid chat.history params: ${formatValidationErrors(validateChatHistoryParams.errors)}`,
        ),
      );
      return;
    }
    const { sessionKey, limit } = params as {
      sessionKey: string;
      limit?: number;
    };
    const { cfg, storePath, entry } = loadSessionEntry(sessionKey);
    const sessionId = entry?.sessionId;
    const rawMessages =
      sessionId && storePath ? readSessionMessages(sessionId, storePath, entry?.sessionFile) : [];
    const hardMax = 1000;
    const defaultLimit = 200;
    const requested = typeof limit === "number" ? limit : defaultLimit;
    const max = Math.min(hardMax, requested);
    const sliced = rawMessages.length > max ? rawMessages.slice(-max) : rawMessages;
    const sanitized = stripEnvelopeFromMessages(sliced);
    const capped = capArrayByJsonBytes(sanitized, getMaxChatHistoryMessagesBytes()).items;
    let thinkingLevel = entry?.thinkingLevel;
    if (!thinkingLevel) {
      const configured = cfg.agents?.defaults?.thinkingDefault;
      if (configured) {
        thinkingLevel = configured;
      } else {
        const { provider, model } = resolveSessionModelRef(cfg, entry);
        const catalog = await context.loadGatewayModelCatalog();
        thinkingLevel = resolveThinkingDefault({
          cfg,
          provider,
          model,
          catalog,
        });
      }
    }
    respond(true, {
      sessionKey,
      sessionId,
      messages: capped,
      thinkingLevel,
    });
  },
  "chat.abort": ({ params, respond, context }) => {
    if (!validateChatAbortParams(params)) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.INVALID_REQUEST,
          `invalid chat.abort params: ${formatValidationErrors(validateChatAbortParams.errors)}`,
        ),
      );
      return;
    }
    const { sessionKey, runId } = params as {
      sessionKey: string;
      runId?: string;
    };

    const ops = {
      chatAbortControllers: context.chatAbortControllers,
      chatRunBuffers: context.chatRunBuffers,
      chatDeltaSentAt: context.chatDeltaSentAt,
      chatAbortedRuns: context.chatAbortedRuns,
      removeChatRun: context.removeChatRun,
      agentRunSeq: context.agentRunSeq,
      broadcast: context.broadcast,
      nodeSendToSession: context.nodeSendToSession,
    };

    if (!runId) {
      const res = abortChatRunsForSessionKey(ops, {
        sessionKey,
        stopReason: "rpc",
      });
      respond(true, { ok: true, aborted: res.aborted, runIds: res.runIds });
      return;
    }

    const active = context.chatAbortControllers.get(runId);
    if (!active) {
      respond(true, { ok: true, aborted: false, runIds: [] });
      return;
    }
    if (active.sessionKey !== sessionKey) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "runId does not match sessionKey"),
      );
      return;
    }

    const res = abortChatRunById(ops, {
      runId,
      sessionKey,
      stopReason: "rpc",
    });
    respond(true, {
      ok: true,
      aborted: res.aborted,
      runIds: res.aborted ? [runId] : [],
    });
  },
  "chat.send": async ({ params, respond, context, client }) => {
    if (!validateChatSendParams(params)) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.INVALID_REQUEST,
          `invalid chat.send params: ${formatValidationErrors(validateChatSendParams.errors)}`,
        ),
      );
      return;
    }
    const p = params as {
      sessionKey: string;
      message: string;
      thinking?: string;
      deliver?: boolean;
      attachments?: Array<{
        type?: string;
        mimeType?: string;
        fileName?: string;
        content?: unknown;
      }>;
      timeoutMs?: number;
      idempotencyKey: string;
    };
    const stopCommand = isChatStopCommandText(p.message);
    const normalizedAttachments =
      p.attachments
        ?.map((a) => ({
          type: typeof a?.type === "string" ? a.type : undefined,
          mimeType: typeof a?.mimeType === "string" ? a.mimeType : undefined,
          fileName: typeof a?.fileName === "string" ? a.fileName : undefined,
          content:
            typeof a?.content === "string"
              ? a.content
              : ArrayBuffer.isView(a?.content)
                ? Buffer.from(
                    a.content.buffer,
                    a.content.byteOffset,
                    a.content.byteLength,
                  ).toString("base64")
                : undefined,
        }))
        .filter((a) => a.content) ?? [];
    const rawMessage = p.message.trim();
    if (!rawMessage && normalizedAttachments.length === 0) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "message or attachment required"),
      );
      return;
    }
    let parsedMessage = p.message;
    let parsedImages: ChatImageContent[] = [];
    if (normalizedAttachments.length > 0) {
      try {
        const parsed = await parseMessageWithAttachments(p.message, normalizedAttachments, {
          maxBytes: 5_000_000,
          log: context.logGateway,
        });
        parsedMessage = parsed.message;
        parsedImages = parsed.images;
      } catch (err) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, String(err)));
        return;
      }
    }
    const { cfg, entry } = loadSessionEntry(p.sessionKey);
    const timeoutMs = resolveAgentTimeoutMs({
      cfg,
      overrideMs: p.timeoutMs,
    });
    const now = Date.now();
    const clientRunId = p.idempotencyKey;

    const sendPolicy = resolveSendPolicy({
      cfg,
      entry,
      sessionKey: p.sessionKey,
      channel: entry?.channel,
      chatType: entry?.chatType,
    });
    if (sendPolicy === "deny") {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "send blocked by session policy"),
      );
      return;
    }

    if (stopCommand) {
      const res = abortChatRunsForSessionKey(
        {
          chatAbortControllers: context.chatAbortControllers,
          chatRunBuffers: context.chatRunBuffers,
          chatDeltaSentAt: context.chatDeltaSentAt,
          chatAbortedRuns: context.chatAbortedRuns,
          removeChatRun: context.removeChatRun,
          agentRunSeq: context.agentRunSeq,
          broadcast: context.broadcast,
          nodeSendToSession: context.nodeSendToSession,
        },
        { sessionKey: p.sessionKey, stopReason: "stop" },
      );
      respond(true, { ok: true, aborted: res.aborted, runIds: res.runIds });
      return;
    }

    const cached = context.dedupe.get(`chat:${clientRunId}`);
    if (cached) {
      respond(cached.ok, cached.payload, cached.error, {
        cached: true,
      });
      return;
    }

    const activeExisting = context.chatAbortControllers.get(clientRunId);
    if (activeExisting) {
      respond(true, { runId: clientRunId, status: "in_flight" as const }, undefined, {
        cached: true,
        runId: clientRunId,
      });
      return;
    }

    try {
      const abortController = new AbortController();
      context.chatAbortControllers.set(clientRunId, {
        controller: abortController,
        sessionId: entry?.sessionId ?? clientRunId,
        sessionKey: p.sessionKey,
        startedAtMs: now,
        expiresAtMs: resolveChatRunExpiresAtMs({ now, timeoutMs }),
      });

      const ackPayload = {
        runId: clientRunId,
        status: "started" as const,
      };
      respond(true, ackPayload, undefined, { runId: clientRunId });

      const trimmedMessage = parsedMessage.trim();
      const injectThinking = Boolean(
        p.thinking && trimmedMessage && !trimmedMessage.startsWith("/"),
      );
      const commandBody = injectThinking ? `/think ${p.thinking} ${parsedMessage}` : parsedMessage;
      const clientInfo = client?.connect?.client;
      // Inject timestamp so agents know the current date/time.
      // Only BodyForAgent gets the timestamp — Body stays raw for UI display.
      // See: https://github.com/moltbot/moltbot/issues/3658
      const stampedMessage = injectTimestamp(parsedMessage, timestampOptsFromConfig(cfg));

      const ctx: MsgContext = {
        Body: parsedMessage,
        BodyForAgent: stampedMessage,
        BodyForCommands: commandBody,
        RawBody: parsedMessage,
        CommandBody: commandBody,
        SessionKey: p.sessionKey,
        Provider: INTERNAL_MESSAGE_CHANNEL,
        Surface: INTERNAL_MESSAGE_CHANNEL,
        OriginatingChannel: INTERNAL_MESSAGE_CHANNEL,
        ChatType: "direct",
        CommandAuthorized: true,
        MessageSid: clientRunId,
        SenderId: clientInfo?.id,
        SenderName: clientInfo?.displayName,
        SenderUsername: clientInfo?.displayName,
      };

      const agentId = resolveSessionAgentId({
        sessionKey: p.sessionKey,
        config: cfg,
      });
      let prefixContext: ResponsePrefixContext = {
        identityName: resolveIdentityName(cfg, agentId),
      };
      const finalReplyParts: string[] = [];
      const dispatcher = createReplyDispatcher({
        responsePrefix: resolveEffectiveMessagesConfig(cfg, agentId).responsePrefix,
        responsePrefixContextProvider: () => prefixContext,
        onError: (err) => {
          context.logGateway.warn(`webchat dispatch failed: ${formatForLog(err)}`);
        },
        deliver: async (payload, info) => {
          if (info.kind !== "final") {
            return;
          }
          const text = payload.text?.trim() ?? "";
          if (!text) {
            return;
          }
          finalReplyParts.push(text);
        },
      });

      let agentRunStarted = false;
      void dispatchInboundMessage({
        ctx,
        cfg,
        dispatcher,
        replyOptions: {
          runId: clientRunId,
          abortSignal: abortController.signal,
          images: parsedImages.length > 0 ? parsedImages : undefined,
          disableBlockStreaming: true,
          onAgentRunStart: () => {
            agentRunStarted = true;
          },
          onModelSelected: (ctx) => {
            prefixContext.provider = ctx.provider;
            prefixContext.model = extractShortModelName(ctx.model);
            prefixContext.modelFull = `${ctx.provider}/${ctx.model}`;
            prefixContext.thinkingLevel = ctx.thinkLevel ?? "off";
          },
        },
      })
        .then(() => {
          if (!agentRunStarted) {
            const combinedReply = finalReplyParts
              .map((part) => part.trim())
              .filter(Boolean)
              .join("\n\n")
              .trim();
            let message: Record<string, unknown> | undefined;
            if (combinedReply) {
              const { storePath: latestStorePath, entry: latestEntry } = loadSessionEntry(
                p.sessionKey,
              );
              const sessionId = latestEntry?.sessionId ?? entry?.sessionId ?? clientRunId;
              const appended = appendAssistantTranscriptMessage({
                message: combinedReply,
                sessionId,
                storePath: latestStorePath,
                sessionFile: latestEntry?.sessionFile,
                createIfMissing: true,
              });
              if (appended.ok) {
                message = appended.message;
              } else {
                context.logGateway.warn(
                  `webchat transcript append failed: ${appended.error ?? "unknown error"}`,
                );
                const now = Date.now();
                message = {
                  role: "assistant",
                  content: [{ type: "text", text: combinedReply }],
                  timestamp: now,
                  stopReason: "injected",
                  usage: { input: 0, output: 0, totalTokens: 0 },
                };
              }
            }
            broadcastChatFinal({
              context,
              runId: clientRunId,
              sessionKey: p.sessionKey,
              message,
            });
          }
          context.dedupe.set(`chat:${clientRunId}`, {
            ts: Date.now(),
            ok: true,
            payload: { runId: clientRunId, status: "ok" as const },
          });
        })
        .catch((err) => {
          const error = errorShape(ErrorCodes.UNAVAILABLE, String(err));
          context.dedupe.set(`chat:${clientRunId}`, {
            ts: Date.now(),
            ok: false,
            payload: {
              runId: clientRunId,
              status: "error" as const,
              summary: String(err),
            },
            error,
          });
          broadcastChatError({
            context,
            runId: clientRunId,
            sessionKey: p.sessionKey,
            errorMessage: String(err),
          });
        })
        .finally(() => {
          context.chatAbortControllers.delete(clientRunId);
        });
    } catch (err) {
      const error = errorShape(ErrorCodes.UNAVAILABLE, String(err));
      const payload = {
        runId: clientRunId,
        status: "error" as const,
        summary: String(err),
      };
      context.dedupe.set(`chat:${clientRunId}`, {
        ts: Date.now(),
        ok: false,
        payload,
        error,
      });
      respond(false, payload, error, {
        runId: clientRunId,
        error: formatForLog(err),
      });
    }
  },
  "chat.inject": async ({ params, respond, context }) => {
    if (!validateChatInjectParams(params)) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.INVALID_REQUEST,
          `invalid chat.inject params: ${formatValidationErrors(validateChatInjectParams.errors)}`,
        ),
      );
      return;
    }
    const p = params as {
      sessionKey: string;
      message: string;
      label?: string;
    };

    // Load session to find transcript file
    const { storePath, entry } = loadSessionEntry(p.sessionKey);
    const sessionId = entry?.sessionId;
    if (!sessionId || !storePath) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "session not found"));
      return;
    }

    // Resolve transcript path
    const transcriptPath = entry?.sessionFile
      ? entry.sessionFile
      : path.join(path.dirname(storePath), `${sessionId}.jsonl`);

    if (!fs.existsSync(transcriptPath)) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "transcript file not found"),
      );
      return;
    }

    // Build transcript entry
    const now = Date.now();
    const messageId = randomUUID().slice(0, 8);
    const labelPrefix = p.label ? `[${p.label}]\n\n` : "";
    const messageBody: Record<string, unknown> = {
      role: "assistant",
      content: [{ type: "text", text: `${labelPrefix}${p.message}` }],
      timestamp: now,
      stopReason: "injected",
      usage: { input: 0, output: 0, totalTokens: 0 },
    };
    const transcriptEntry = {
      type: "message",
      id: messageId,
      timestamp: new Date(now).toISOString(),
      message: messageBody,
    };

    // Append to transcript file
    try {
      fs.appendFileSync(transcriptPath, `${JSON.stringify(transcriptEntry)}\n`, "utf-8");
    } catch (err) {
      const errMessage = err instanceof Error ? err.message : String(err);
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.UNAVAILABLE, `failed to write transcript: ${errMessage}`),
      );
      return;
    }

    // Broadcast to webchat for immediate UI update
    const chatPayload = {
      runId: `inject-${messageId}`,
      sessionKey: p.sessionKey,
      seq: 0,
      state: "final" as const,
      message: transcriptEntry.message,
    };
    context.broadcast("chat", chatPayload);
    context.nodeSendToSession(p.sessionKey, "chat", chatPayload);

    respond(true, { ok: true, messageId });
  },
  "chat.delete": async ({ params, respond, context }) => {
    if (!validateChatDeleteParams(params)) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.INVALID_REQUEST,
          `invalid chat.delete params: ${formatValidationErrors(validateChatDeleteParams.errors)}`,
        ),
      );
      return;
    }
    const { sessionKey, messageId } = params as {
      sessionKey: string;
      messageId: string;
    };

    const { storePath, entry } = loadSessionEntry(sessionKey);
    const sessionId = entry?.sessionId;

    if (!sessionId) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "session not found"));
      return;
    }

    const res = deleteMessageFromTranscript(sessionId, storePath, entry?.sessionFile, messageId);
    if (!res.ok) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.UNAVAILABLE, res.error ?? "failed to delete message"),
      );
      return;
    }

    // Broadcast update
    const payload = {
      runId: `delete-${messageId}`,
      sessionKey,
      seq: 0,
      state: "final" as const,
      message: { id: messageId, deleted: true }, // Signal deletion
    };
    context.broadcast("chat", payload);
    context.nodeSendToSession(sessionKey, "chat", payload);

    respond(true, { ok: true });
  },
  "chat.deleteFrom": async ({ params, respond, context }) => {
    if (!validateChatDeleteFromParams(params)) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.INVALID_REQUEST,
          `invalid chat.deleteFrom params: ${formatValidationErrors(validateChatDeleteFromParams.errors)}`,
        ),
      );
      return;
    }
    const { sessionKey, messageId } = params as {
      sessionKey: string;
      messageId: string;
    };

    const { storePath, entry } = loadSessionEntry(sessionKey);
    const sessionId = entry?.sessionId;

    if (!sessionId) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "session not found"));
      return;
    }

    const res = deleteMessagesFromId(sessionId, storePath, entry?.sessionFile, messageId);
    if (!res.ok) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.UNAVAILABLE, res.error ?? "failed to delete messages"),
      );
      return;
    }

    // Broadcast update for each deleted message
    for (const deletedId of res.deletedIds) {
      const payload = {
        runId: `delete-${deletedId}`,
        sessionKey,
        seq: 0,
        state: "final" as const,
        message: { id: deletedId, deleted: true },
      };
      context.broadcast("chat", payload);
      context.nodeSendToSession(sessionKey, "chat", payload);
    }

    respond(true, { ok: true, deletedCount: res.deletedIds.length, deletedIds: res.deletedIds });
  },
  "chat.rerun": async ({ params, respond, context, client }) => {
    if (!validateChatRerunParams(params)) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.INVALID_REQUEST,
          `invalid chat.rerun params: ${formatValidationErrors(validateChatRerunParams.errors)}`,
        ),
      );
      return;
    }
    const { sessionKey, messageId, idempotencyKey } = params as {
      sessionKey: string;
      messageId: string;
      idempotencyKey: string;
    };

    const { storePath, entry, cfg } = loadSessionEntry(sessionKey);
    const sessionId = entry?.sessionId;

    if (!sessionId) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "session not found"));
      return;
    }

    // Get the message content
    const msgRes = getMessageContentFromTranscript(
      sessionId,
      storePath,
      entry?.sessionFile,
      messageId,
    );
    if (!msgRes.ok || !msgRes.content) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.INVALID_REQUEST,
          msgRes.error ?? "message not found or has no content",
        ),
      );
      return;
    }

    // Only allow rerun on user messages
    if (msgRes.role !== "user") {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "can only rerun from user messages"),
      );
      return;
    }

    // Delete all messages from this one onwards
    const delRes = deleteMessagesFromId(sessionId, storePath, entry?.sessionFile, messageId);
    if (!delRes.ok) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.UNAVAILABLE, delRes.error ?? "failed to delete messages for rerun"),
      );
      return;
    }

    // Broadcast deletions
    for (const deletedId of delRes.deletedIds) {
      const payload = {
        runId: `delete-${deletedId}`,
        sessionKey,
        seq: 0,
        state: "final" as const,
        message: { id: deletedId, deleted: true },
      };
      context.broadcast("chat", payload);
      context.nodeSendToSession(sessionKey, "chat", payload);
    }

    // Now re-send the user message (this will trigger the AI response)
    const timeoutMs = resolveAgentTimeoutMs({ cfg });
    const now = Date.now();
    const clientRunId = idempotencyKey;

    const sendPolicy = resolveSendPolicy({
      cfg,
      entry,
      sessionKey,
      channel: entry?.channel,
      chatType: entry?.chatType,
    });
    if (sendPolicy === "deny") {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "send blocked by session policy"),
      );
      return;
    }

    const abortController = new AbortController();
    context.chatAbortControllers.set(clientRunId, {
      controller: abortController,
      sessionId: entry?.sessionId ?? clientRunId,
      sessionKey,
      startedAtMs: now,
      expiresAtMs: resolveChatRunExpiresAtMs({ now, timeoutMs }),
    });

    respond(true, {
      ok: true,
      runId: clientRunId,
      deletedCount: delRes.deletedIds.length,
      status: "started" as const,
    });

    const parsedMessage = msgRes.content;
    const stampedMessage = injectTimestamp(parsedMessage, timestampOptsFromConfig(cfg));
    const clientInfo = client?.connect?.client;

    const ctx: MsgContext = {
      Body: parsedMessage,
      BodyForAgent: stampedMessage,
      BodyForCommands: parsedMessage,
      RawBody: parsedMessage,
      CommandBody: parsedMessage,
      SessionKey: sessionKey,
      Provider: INTERNAL_MESSAGE_CHANNEL,
      Surface: INTERNAL_MESSAGE_CHANNEL,
      OriginatingChannel: INTERNAL_MESSAGE_CHANNEL,
      ChatType: "direct",
      CommandAuthorized: true,
      MessageSid: clientRunId,
      SenderId: clientInfo?.id,
      SenderName: clientInfo?.displayName,
      SenderUsername: clientInfo?.displayName,
    };

    const agentId = resolveSessionAgentId({ sessionKey, config: cfg });
    let prefixContext: ResponsePrefixContext = {
      identityName: resolveIdentityName(cfg, agentId),
    };
    const finalReplyParts: string[] = [];
    const dispatcher = createReplyDispatcher({
      responsePrefix: resolveEffectiveMessagesConfig(cfg, agentId).responsePrefix,
      responsePrefixContextProvider: () => prefixContext,
      onError: (err) => {
        context.logGateway.warn(`webchat rerun dispatch failed: ${formatForLog(err)}`);
      },
      deliver: async (payload, info) => {
        if (info.kind !== "final") {
          return;
        }
        const text = payload.text?.trim() ?? "";
        if (!text) {
          return;
        }
        finalReplyParts.push(text);
      },
    });

    let agentRunStarted = false;
    void dispatchInboundMessage({
      ctx,
      cfg,
      dispatcher,
      replyOptions: {
        runId: clientRunId,
        abortSignal: abortController.signal,
        disableBlockStreaming: true,
        onAgentRunStart: () => {
          agentRunStarted = true;
        },
        onModelSelected: (modelCtx) => {
          prefixContext.provider = modelCtx.provider;
          prefixContext.model = extractShortModelName(modelCtx.model);
          prefixContext.modelFull = `${modelCtx.provider}/${modelCtx.model}`;
          prefixContext.thinkingLevel = modelCtx.thinkLevel ?? "off";
        },
      },
    })
      .then(() => {
        if (!agentRunStarted) {
          const combinedReply = finalReplyParts
            .map((part) => part.trim())
            .filter(Boolean)
            .join("\n\n")
            .trim();
          let message: Record<string, unknown> | undefined;
          if (combinedReply) {
            const { storePath: latestStorePath, entry: latestEntry } = loadSessionEntry(sessionKey);
            const sid = latestEntry?.sessionId ?? entry?.sessionId ?? clientRunId;
            const appended = appendAssistantTranscriptMessage({
              message: combinedReply,
              sessionId: sid,
              storePath: latestStorePath,
              sessionFile: latestEntry?.sessionFile,
              createIfMissing: true,
            });
            if (appended.ok) {
              message = appended.message;
            } else {
              context.logGateway.warn(
                `webchat rerun transcript append failed: ${appended.error ?? "unknown error"}`,
              );
              message = {
                role: "assistant",
                content: [{ type: "text", text: combinedReply }],
                timestamp: Date.now(),
                stopReason: "injected",
                usage: { input: 0, output: 0, totalTokens: 0 },
              };
            }
          }
          broadcastChatFinal({
            context,
            runId: clientRunId,
            sessionKey,
            message,
          });
        }
        context.dedupe.set(`chat:${clientRunId}`, {
          ts: Date.now(),
          ok: true,
          payload: { runId: clientRunId, status: "ok" as const },
        });
      })
      .catch((err) => {
        const error = errorShape(ErrorCodes.UNAVAILABLE, String(err));
        context.dedupe.set(`chat:${clientRunId}`, {
          ts: Date.now(),
          ok: false,
          payload: {
            runId: clientRunId,
            status: "error" as const,
            summary: String(err),
          },
          error,
        });
        broadcastChatError({
          context,
          runId: clientRunId,
          sessionKey,
          errorMessage: String(err),
        });
      })
      .finally(() => {
        context.chatAbortControllers.delete(clientRunId);
      });
  },
  "chat.edit": async ({ params, respond, context, client }) => {
    if (!validateChatEditParams(params)) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.INVALID_REQUEST,
          `invalid chat.edit params: ${formatValidationErrors(validateChatEditParams.errors)}`,
        ),
      );
      return;
    }
    const { sessionKey, messageId, content, rerun, idempotencyKey } = params as {
      sessionKey: string;
      messageId: string;
      content: string;
      rerun?: boolean;
      idempotencyKey?: string;
    };

    const { storePath, entry, cfg } = loadSessionEntry(sessionKey);
    const sessionId = entry?.sessionId;

    if (!sessionId) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "session not found"));
      return;
    }

    // Get the original message to verify it's a user message
    const msgRes = getMessageContentFromTranscript(
      sessionId,
      storePath,
      entry?.sessionFile,
      messageId,
    );
    if (!msgRes.ok) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, msgRes.error ?? "message not found"),
      );
      return;
    }

    if (msgRes.role !== "user") {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "can only edit user messages"),
      );
      return;
    }

    // If rerun is requested, delete all subsequent messages first
    if (rerun) {
      // First, delete all messages after this one (but not this one)
      // We need to find the next message after this one
      const delRes = deleteMessagesFromId(sessionId, storePath, entry?.sessionFile, messageId);
      if (delRes.ok) {
        // Broadcast deletions for all except the edited message itself
        for (const deletedId of delRes.deletedIds) {
          if (deletedId === messageId) {
            continue;
          }
          const payload = {
            runId: `delete-${deletedId}`,
            sessionKey,
            seq: 0,
            state: "final" as const,
            message: { id: deletedId, deleted: true },
          };
          context.broadcast("chat", payload);
          context.nodeSendToSession(sessionKey, "chat", payload);
        }
      }
    }

    // Edit the message content
    const editRes = editMessageInTranscript(
      sessionId,
      storePath,
      entry?.sessionFile,
      messageId,
      content,
    );
    if (!editRes.ok) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.UNAVAILABLE, editRes.error ?? "failed to edit message"),
      );
      return;
    }

    // Broadcast the edit
    const editPayload = {
      runId: `edit-${messageId}`,
      sessionKey,
      seq: 0,
      state: "final" as const,
      message: { id: messageId, edited: true, content: [{ type: "text", text: content }] },
    };
    context.broadcast("chat", editPayload);
    context.nodeSendToSession(sessionKey, "chat", editPayload);

    // If rerun requested and we have an idempotency key, trigger AI response
    if (rerun && idempotencyKey) {
      const timeoutMs = resolveAgentTimeoutMs({ cfg });
      const now = Date.now();
      const clientRunId = idempotencyKey;

      const sendPolicy = resolveSendPolicy({
        cfg,
        entry,
        sessionKey,
        channel: entry?.channel,
        chatType: entry?.chatType,
      });
      if (sendPolicy === "deny") {
        respond(true, { ok: true, edited: true, rerun: false, reason: "send blocked by policy" });
        return;
      }

      const abortController = new AbortController();
      context.chatAbortControllers.set(clientRunId, {
        controller: abortController,
        sessionId: entry?.sessionId ?? clientRunId,
        sessionKey,
        startedAtMs: now,
        expiresAtMs: resolveChatRunExpiresAtMs({ now, timeoutMs }),
      });

      respond(true, { ok: true, edited: true, rerun: true, runId: clientRunId, status: "started" });

      const stampedMessage = injectTimestamp(content, timestampOptsFromConfig(cfg));
      const clientInfo = client?.connect?.client;

      const ctx: MsgContext = {
        Body: content,
        BodyForAgent: stampedMessage,
        BodyForCommands: content,
        RawBody: content,
        CommandBody: content,
        SessionKey: sessionKey,
        Provider: INTERNAL_MESSAGE_CHANNEL,
        Surface: INTERNAL_MESSAGE_CHANNEL,
        OriginatingChannel: INTERNAL_MESSAGE_CHANNEL,
        ChatType: "direct",
        CommandAuthorized: true,
        MessageSid: clientRunId,
        SenderId: clientInfo?.id,
        SenderName: clientInfo?.displayName,
        SenderUsername: clientInfo?.displayName,
      };

      const agentId = resolveSessionAgentId({ sessionKey, config: cfg });
      let prefixContext: ResponsePrefixContext = {
        identityName: resolveIdentityName(cfg, agentId),
      };
      const finalReplyParts: string[] = [];
      const dispatcher = createReplyDispatcher({
        responsePrefix: resolveEffectiveMessagesConfig(cfg, agentId).responsePrefix,
        responsePrefixContextProvider: () => prefixContext,
        onError: (err) => {
          context.logGateway.warn(`webchat edit+rerun dispatch failed: ${formatForLog(err)}`);
        },
        deliver: async (payload, info) => {
          if (info.kind !== "final") {
            return;
          }
          const text = payload.text?.trim() ?? "";
          if (!text) {
            return;
          }
          finalReplyParts.push(text);
        },
      });

      let agentRunStarted = false;
      void dispatchInboundMessage({
        ctx,
        cfg,
        dispatcher,
        replyOptions: {
          runId: clientRunId,
          abortSignal: abortController.signal,
          disableBlockStreaming: true,
          onAgentRunStart: () => {
            agentRunStarted = true;
          },
          onModelSelected: (modelCtx) => {
            prefixContext.provider = modelCtx.provider;
            prefixContext.model = extractShortModelName(modelCtx.model);
            prefixContext.modelFull = `${modelCtx.provider}/${modelCtx.model}`;
            prefixContext.thinkingLevel = modelCtx.thinkLevel ?? "off";
          },
        },
      })
        .then(() => {
          if (!agentRunStarted) {
            const combinedReply = finalReplyParts
              .map((part) => part.trim())
              .filter(Boolean)
              .join("\n\n")
              .trim();
            let message: Record<string, unknown> | undefined;
            if (combinedReply) {
              const { storePath: latestStorePath, entry: latestEntry } =
                loadSessionEntry(sessionKey);
              const sid = latestEntry?.sessionId ?? entry?.sessionId ?? clientRunId;
              const appended = appendAssistantTranscriptMessage({
                message: combinedReply,
                sessionId: sid,
                storePath: latestStorePath,
                sessionFile: latestEntry?.sessionFile,
                createIfMissing: true,
              });
              if (appended.ok) {
                message = appended.message;
              } else {
                context.logGateway.warn(
                  `webchat edit+rerun transcript append failed: ${appended.error ?? "unknown error"}`,
                );
                message = {
                  role: "assistant",
                  content: [{ type: "text", text: combinedReply }],
                  timestamp: Date.now(),
                  stopReason: "injected",
                  usage: { input: 0, output: 0, totalTokens: 0 },
                };
              }
            }
            broadcastChatFinal({
              context,
              runId: clientRunId,
              sessionKey,
              message,
            });
          }
          context.dedupe.set(`chat:${clientRunId}`, {
            ts: Date.now(),
            ok: true,
            payload: { runId: clientRunId, status: "ok" as const },
          });
        })
        .catch((err) => {
          const error = errorShape(ErrorCodes.UNAVAILABLE, String(err));
          context.dedupe.set(`chat:${clientRunId}`, {
            ts: Date.now(),
            ok: false,
            payload: {
              runId: clientRunId,
              status: "error" as const,
              summary: String(err),
            },
            error,
          });
          broadcastChatError({
            context,
            runId: clientRunId,
            sessionKey,
            errorMessage: String(err),
          });
        })
        .finally(() => {
          context.chatAbortControllers.delete(clientRunId);
        });

      return;
    }

    respond(true, { ok: true, edited: true, rerun: false });
  },
};
