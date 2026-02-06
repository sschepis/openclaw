export type ChatAttachment = {
  id: string;
  dataUrl: string;
  mimeType: string;
};

export type ChatQueueItem = {
  id: string;
  text: string;
  createdAt: number;
  attachments?: ChatAttachment[];
  refreshSessions?: boolean;
};

export const CRON_CHANNEL_LAST = "last";

/**
 * State for session deletion confirmation modal.
 * Tracks the session being deleted and any child sessions that will also be deleted.
 */
export type SessionDeleteConfirmState = {
  /** The session key being deleted */
  sessionKey: string;
  /** Display name of the session being deleted */
  displayName: string;
  /** Whether we're loading child sessions */
  loading: boolean;
  /** Child sessions that will also be deleted (spawned by this session) */
  childSessions: Array<{
    key: string;
    displayName: string;
  }>;
  /** Whether deletion is in progress */
  deleting: boolean;
  /** Error message if deletion failed */
  error: string | null;
};

/**
 * Conversation status indicates the current state of the conversation.
 * - idle: No active processing or scheduled tasks
 * - busy: Agent is currently processing/generating a response
 * - sleeping: A task is scheduled to run in the future
 */
export type ConversationStatus =
  | { kind: "idle" }
  | { kind: "busy" }
  | { kind: "sleeping"; nextRunAtMs: number };

export type CronFormState = {
  name: string;
  description: string;
  agentId: string;
  enabled: boolean;
  scheduleKind: "at" | "every" | "cron";
  scheduleAt: string;
  everyAmount: string;
  everyUnit: "minutes" | "hours" | "days";
  cronExpr: string;
  cronTz: string;
  sessionTarget: "main" | "isolated";
  wakeMode: "next-heartbeat" | "now";
  payloadKind: "systemEvent" | "agentTurn";
  payloadText: string;
  deliver: boolean;
  channel: string;
  to: string;
  timeoutSeconds: string;
  postToMainPrefix: string;
};
