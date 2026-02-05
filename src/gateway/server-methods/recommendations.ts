import { Ajv } from "ajv";
import type { GatewayRequestHandlers } from "./types.js";
import { loadConfig } from "../../config/config.js";
import { ErrorCodes, errorShape, formatValidationErrors } from "../protocol/index.js";
import { loadSessionEntry, readSessionMessages } from "../session-utils.js";

/**
 * Task Recommendation System
 *
 * Generates contextual task recommendations based on:
 * 1. Recent conversation history
 * 2. Last assistant response content
 * 3. Session context and state
 *
 * Recommendations are returned as clickable "pills" in the UI
 * that populate the chat input when clicked.
 */

export type TaskRecommendation = {
  /** Unique identifier for the recommendation */
  id: string;
  /** Display text shown on the pill */
  label: string;
  /** Full prompt text to insert into chat input */
  prompt: string;
  /** Category of the recommendation */
  category: "followup" | "action" | "clarify" | "explore" | "command";
  /** Priority for display ordering (higher = more prominent) */
  priority: number;
  /** Optional icon identifier */
  icon?: string;
};

export type RecommendationsResult = {
  sessionKey: string;
  recommendations: TaskRecommendation[];
  generatedAt: number;
};

const chatRecommendationsParamsSchema = {
  type: "object",
  properties: {
    sessionKey: { type: "string" },
    limit: { type: "number" },
  },
  required: ["sessionKey"],
  additionalProperties: false,
};

const ajv = new Ajv();
const validateChatRecommendationsParams = ajv.compile(chatRecommendationsParamsSchema);

/**
 * Extract text content from a message's content field
 */
function extractMessageText(message: unknown): string {
  if (!message || typeof message !== "object") {
    return "";
  }
  const msg = message as Record<string, unknown>;
  const content = msg.content;

  if (typeof content === "string") {
    return content;
  }

  if (Array.isArray(content)) {
    return content
      .map((block) => {
        if (typeof block === "string") {
          return block;
        }
        if (block && typeof block === "object" && "text" in block) {
          return String(block.text ?? "");
        }
        return "";
      })
      .filter(Boolean)
      .join("\n");
  }

  return "";
}

/**
 * Extract the role from a message
 */
function extractMessageRole(message: unknown): string {
  if (!message || typeof message !== "object") {
    return "";
  }
  const msg = message as Record<string, unknown>;
  return typeof msg.role === "string" ? msg.role.toLowerCase() : "";
}

/**
 * Analyze conversation context and generate recommendations
 */
function generateRecommendations(params: {
  messages: unknown[];
  limit: number;
}): TaskRecommendation[] {
  const { messages, limit } = params;
  const recommendations: TaskRecommendation[] = [];

  // Get the last few messages for context analysis
  const recentMessages = messages.slice(-10);
  const lastAssistantMessage = [...recentMessages]
    .reverse()
    .find((m) => extractMessageRole(m) === "assistant");
  const lastUserMessage = [...recentMessages]
    .reverse()
    .find((m) => extractMessageRole(m) === "user");

  const lastAssistantText = lastAssistantMessage
    ? extractMessageText(lastAssistantMessage).toLowerCase()
    : "";
  const lastUserText = lastUserMessage ? extractMessageText(lastUserMessage).toLowerCase() : "";

  // Always useful general actions
  const generalActions: TaskRecommendation[] = [
    {
      id: "rec-continue",
      label: "Continue",
      prompt: "Continue with the next step",
      category: "action",
      priority: 90,
      icon: "arrow-right",
    },
    {
      id: "rec-explain",
      label: "Explain more",
      prompt: "Can you explain that in more detail?",
      category: "clarify",
      priority: 70,
      icon: "help-circle",
    },
    {
      id: "rec-summarize",
      label: "Summarize",
      prompt: "Please summarize what we've discussed so far",
      category: "action",
      priority: 60,
      icon: "list",
    },
  ];

  // Context-specific recommendations based on last assistant response
  const contextActions: TaskRecommendation[] = [];

  // Detect code-related context
  if (
    lastAssistantText.includes("```") ||
    lastAssistantText.includes("function") ||
    lastAssistantText.includes("const ") ||
    lastAssistantText.includes("class ") ||
    lastAssistantText.includes("import ")
  ) {
    contextActions.push(
      {
        id: "rec-run-code",
        label: "Run this code",
        prompt: "Run this code and show me the output",
        category: "action",
        priority: 95,
        icon: "play",
      },
      {
        id: "rec-explain-code",
        label: "Explain code",
        prompt: "Explain how this code works step by step",
        category: "clarify",
        priority: 85,
        icon: "code",
      },
      {
        id: "rec-improve-code",
        label: "Improve code",
        prompt: "How can this code be improved?",
        category: "explore",
        priority: 75,
        icon: "sparkles",
      },
      {
        id: "rec-add-tests",
        label: "Add tests",
        prompt: "Write unit tests for this code",
        category: "action",
        priority: 70,
        icon: "check-circle",
      },
    );
  }

  // Detect error/debugging context
  if (
    lastAssistantText.includes("error") ||
    lastAssistantText.includes("exception") ||
    lastAssistantText.includes("failed") ||
    lastAssistantText.includes("bug") ||
    lastUserText.includes("error") ||
    lastUserText.includes("not working")
  ) {
    contextActions.push(
      {
        id: "rec-fix-error",
        label: "Fix this error",
        prompt: "How do I fix this error?",
        category: "action",
        priority: 98,
        icon: "wrench",
      },
      {
        id: "rec-debug",
        label: "Debug steps",
        prompt: "What debugging steps should I take?",
        category: "explore",
        priority: 85,
        icon: "bug",
      },
    );
  }

  // Detect question/explanation context
  if (
    lastAssistantText.includes("?") ||
    lastAssistantText.includes("would you like") ||
    lastAssistantText.includes("do you want") ||
    lastAssistantText.includes("should i")
  ) {
    contextActions.push(
      {
        id: "rec-yes",
        label: "Yes, proceed",
        prompt: "Yes, please proceed",
        category: "followup",
        priority: 100,
        icon: "check",
      },
      {
        id: "rec-no",
        label: "No, try different approach",
        prompt: "No, let's try a different approach",
        category: "followup",
        priority: 95,
        icon: "x",
      },
    );
  }

  // Detect list/options context
  if (
    lastAssistantText.includes("1.") ||
    lastAssistantText.includes("option") ||
    lastAssistantText.includes("choice") ||
    lastAssistantText.includes("alternative")
  ) {
    contextActions.push({
      id: "rec-compare",
      label: "Compare options",
      prompt: "Can you compare these options and recommend the best one?",
      category: "explore",
      priority: 80,
      icon: "scale",
    });
  }

  // Detect file/project context
  if (
    lastAssistantText.includes("file") ||
    lastAssistantText.includes("directory") ||
    lastAssistantText.includes("folder") ||
    lastAssistantText.includes("project")
  ) {
    contextActions.push(
      {
        id: "rec-show-files",
        label: "Show file structure",
        prompt: "Show me the file structure",
        category: "explore",
        priority: 75,
        icon: "folder",
      },
      {
        id: "rec-create-file",
        label: "Create file",
        prompt: "Create this file for me",
        category: "action",
        priority: 80,
        icon: "file-plus",
      },
    );
  }

  // Detect incomplete/continuing work
  if (
    lastAssistantText.includes("next") ||
    lastAssistantText.includes("step") ||
    lastAssistantText.includes("then") ||
    lastAssistantText.includes("after that")
  ) {
    contextActions.push({
      id: "rec-next-step",
      label: "Next step",
      prompt: "What's the next step?",
      category: "followup",
      priority: 92,
      icon: "arrow-right",
    });
  }

  // Empty conversation - show starter recommendations
  if (messages.length === 0) {
    return [
      {
        id: "rec-help",
        label: "What can you help with?",
        prompt: "What can you help me with?",
        category: "explore",
        priority: 100,
        icon: "help-circle",
      },
      {
        id: "rec-project",
        label: "Explore project",
        prompt: "Help me understand the current project structure",
        category: "explore",
        priority: 90,
        icon: "folder",
      },
      {
        id: "rec-task",
        label: "Start a task",
        prompt: "I want to work on a new task",
        category: "action",
        priority: 85,
        icon: "plus",
      },
    ];
  }

  // Combine and deduplicate recommendations
  const allRecs = [...contextActions, ...generalActions];

  // Sort by priority and limit
  allRecs.sort((a, b) => b.priority - a.priority);

  // Remove duplicates by id
  const seen = new Set<string>();
  for (const rec of allRecs) {
    if (!seen.has(rec.id) && recommendations.length < limit) {
      seen.add(rec.id);
      recommendations.push(rec);
    }
  }

  return recommendations;
}

export const recommendationsHandlers: GatewayRequestHandlers = {
  "chat.recommendations": async ({ params, respond }) => {
    if (!validateChatRecommendationsParams(params)) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.INVALID_REQUEST,
          `invalid chat.recommendations params: ${formatValidationErrors(validateChatRecommendationsParams.errors)}`,
        ),
      );
      return;
    }
    const { sessionKey, limit: rawLimit } = params as {
      sessionKey: string;
      limit?: number;
    };

    const limit = typeof rawLimit === "number" && rawLimit > 0 ? Math.min(rawLimit, 10) : 5;

    // Load session and messages
    const { storePath, entry } = loadSessionEntry(sessionKey);
    const sessionId = entry?.sessionId;
    const messages =
      sessionId && storePath ? readSessionMessages(sessionId, storePath, entry?.sessionFile) : [];

    // Generate recommendations based on context
    const recommendations = generateRecommendations({
      messages,
      limit,
    });

    const result: RecommendationsResult = {
      sessionKey,
      recommendations,
      generatedAt: Date.now(),
    };

    respond(true, result);
  },
};
