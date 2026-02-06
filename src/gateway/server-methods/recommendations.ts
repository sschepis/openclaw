import { Ajv } from "ajv";
import type { GatewayRequestHandlers } from "./types.js";
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
  /** Confidence score (0-1) for how relevant this recommendation is */
  confidence?: number;
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
 * Check if the assistant is explicitly asking a question or seeking confirmation.
 * Returns true if there's a clear question that warrants a yes/no or similar response.
 */
function hasExplicitQuestion(text: string): boolean {
  // Look for explicit question patterns (not just any sentence ending in ?)
  const questionPatterns = [
    /\bwould you like\b/i,
    /\bdo you want\b/i,
    /\bshould i\b/i,
    /\bshall i\b/i,
    /\bwant me to\b/i,
    /\bwould you prefer\b/i,
    /\bis that ok\b/i,
    /\bdoes that work\b/i,
    /\bwhich (?:one|option|approach)\b.*\?/i,
    /\bwhat would you like\b/i,
    /\blet me know if\b/i,
    /\bready to (?:proceed|continue)\b/i,
  ];
  return questionPatterns.some((p) => p.test(text));
}

/**
 * Check if the response indicates incomplete work or clear next steps.
 */
function hasInProgressWork(text: string): boolean {
  const patterns = [
    /\bnext,?\s+(?:i'll|we'll|i will|we will|let's)\b/i,
    /\bstep \d+\b/i,
    /\bfirst,?\s+(?:i'll|we'll|let's)\b/i,
    /\bthen,?\s+(?:i'll|we'll)\b/i,
    /\bafter that,?\s+(?:i'll|we'll)\b/i,
    /\bcontinuing with\b/i,
    /\bmoving on to\b/i,
    /\bto complete this\b/i,
    /\bremaining (?:steps|tasks|items)\b/i,
  ];
  return patterns.some((p) => p.test(text));
}

/**
 * Check if the response contains actionable code that could be run or applied.
 */
function hasActionableCode(text: string): boolean {
  // Look for code blocks with executable content
  const codeBlockMatch = text.match(/```[\s\S]*?```/g);
  if (!codeBlockMatch) {
    return false;
  }
  // Check if there's substantial code (not just config/examples)
  for (const block of codeBlockMatch) {
    const content = block.replace(/```\w*\n?/g, "").replace(/```/g, "");
    // Heuristic: code with function definitions, imports, or executable statements
    if (
      content.length > 50 &&
      (content.includes("function") ||
        content.includes("const ") ||
        content.includes("let ") ||
        content.includes("import ") ||
        content.includes("export ") ||
        content.includes("class ") ||
        content.includes("def ") ||
        content.includes("async "))
    ) {
      return true;
    }
  }
  return false;
}

/**
 * Check if the response indicates an error or problem that needs fixing.
 */
function hasErrorContext(text: string, userText: string): boolean {
  const errorPatterns = [
    /\berror:?\s/i,
    /\bexception\b/i,
    /\bfailed\b/i,
    /\bnot working\b/i,
    /\bissue\b/i,
    /\bproblem\b/i,
    /\bbug\b/i,
    /\bbroken\b/i,
    /\bunexpected\b/i,
    /\binvalid\b/i,
  ];
  return errorPatterns.some((p) => p.test(text) || p.test(userText));
}

/**
 * Check if the response presents multiple options or alternatives.
 */
function hasOptions(text: string): boolean {
  // Look for numbered lists with actual options or explicit option language
  const hasNumberedList =
    /(?:^|\n)\s*(?:1\.|•|-)\s*\S/.test(text) && /(?:^|\n)\s*(?:2\.|•|-)\s*\S/.test(text);
  const hasOptionLanguage = /\b(?:option|alternative|approach|choice|either|or you could)\b/i.test(
    text,
  );
  return hasNumberedList && hasOptionLanguage;
}

/**
 * Analyze conversation context and generate recommendations.
 *
 * Design principles:
 * 1. Only show recommendations when there's high confidence they're useful
 * 2. Recommendations must be specific to the current conversation state
 * 3. No recommendations for empty conversations or generic states
 * 4. Prefer fewer, highly relevant recommendations over many generic ones
 */
function generateRecommendations(params: {
  messages: unknown[];
  limit: number;
}): TaskRecommendation[] {
  const { messages, limit } = params;

  // No recommendations for empty conversations - user should initiate
  if (messages.length === 0) {
    return [];
  }

  // Get the last few messages for context analysis
  const recentMessages = messages.slice(-10);
  const lastAssistantMessage = recentMessages
    .toReversed()
    .find((m) => extractMessageRole(m) === "assistant");
  const lastUserMessage = recentMessages.toReversed().find((m) => extractMessageRole(m) === "user");

  // No recommendations if there's no assistant response yet
  if (!lastAssistantMessage) {
    return [];
  }

  const lastAssistantText = extractMessageText(lastAssistantMessage);
  const lastUserText = lastUserMessage ? extractMessageText(lastUserMessage) : "";
  const lowerAssistantText = lastAssistantText.toLowerCase();
  const lowerUserText = lastUserText.toLowerCase();

  const recommendations: TaskRecommendation[] = [];

  // High-confidence: Assistant asked an explicit question requiring a response
  if (hasExplicitQuestion(lastAssistantText)) {
    recommendations.push(
      {
        id: "rec-yes",
        label: "Yes, proceed",
        prompt: "Yes, please proceed",
        category: "followup",
        priority: 100,
        icon: "check",
        confidence: 0.95,
      },
      {
        id: "rec-no",
        label: "Try different approach",
        prompt: "Let's try a different approach instead",
        category: "followup",
        priority: 95,
        icon: "x",
        confidence: 0.9,
      },
    );
  }

  // High-confidence: Work is in progress with clear continuation
  if (hasInProgressWork(lastAssistantText)) {
    recommendations.push({
      id: "rec-continue",
      label: "Continue",
      prompt: "Continue with the next step",
      category: "action",
      priority: 90,
      icon: "arrow-right",
      confidence: 0.85,
    });
  }

  // Medium-high confidence: Actionable code present
  if (hasActionableCode(lastAssistantText)) {
    recommendations.push({
      id: "rec-apply-code",
      label: "Apply changes",
      prompt: "Apply these changes to the codebase",
      category: "action",
      priority: 88,
      icon: "play",
      confidence: 0.8,
    });
  }

  // Medium-high confidence: Error context detected
  if (hasErrorContext(lowerAssistantText, lowerUserText)) {
    // Only add if we don't already have high-confidence recommendations
    if (recommendations.length < 2) {
      recommendations.push({
        id: "rec-fix",
        label: "Fix this",
        prompt: "Please fix this issue",
        category: "action",
        priority: 85,
        icon: "wrench",
        confidence: 0.75,
      });
    }
  }

  // Medium confidence: Multiple options presented
  if (hasOptions(lastAssistantText) && recommendations.length < 2) {
    recommendations.push({
      id: "rec-compare",
      label: "Compare & recommend",
      prompt: "Compare these options and recommend the best one for my use case",
      category: "explore",
      priority: 80,
      icon: "scale",
      confidence: 0.7,
    });
  }

  // Sort by confidence then priority, limit results
  recommendations.sort((a, b) => {
    const confDiff = (b.confidence ?? 0) - (a.confidence ?? 0);
    if (Math.abs(confDiff) > 0.05) {
      return confDiff;
    }
    return b.priority - a.priority;
  });

  // Only return recommendations with sufficient confidence (>= 0.7)
  const highConfidenceRecs = recommendations.filter((r) => (r.confidence ?? 0) >= 0.7);

  // Cap at limit
  return highConfidenceRecs.slice(0, limit);
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
