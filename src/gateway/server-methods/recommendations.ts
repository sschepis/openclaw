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
 * Analyze conversation context and derive contextually relevant next-step recommendations.
 *
 * Design principles:
 * 1. Analyze the user's request and AI's response to understand task context
 * 2. Generate specific, actionable next steps based on current progress
 * 3. Recommendations must be relevant to completing the overall task
 * 4. No generic recommendations - each must be derived from conversation state
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

  const recommendations: TaskRecommendation[] = [];

  // Extract task-specific context from the conversation
  const taskContext = deriveTaskContext(lastUserText, lastAssistantText);

  // Generate recommendations based on task context
  const contextualRecs = generateContextualRecommendations(
    taskContext,
    lastAssistantText,
    lastUserText,
  );
  recommendations.push(...contextualRecs);

  // Sort by confidence then priority
  recommendations.sort((a, b) => {
    const confDiff = (b.confidence ?? 0) - (a.confidence ?? 0);
    if (Math.abs(confDiff) > 0.05) {
      return confDiff;
    }
    return b.priority - a.priority;
  });

  // Only return high-confidence recommendations (>= 0.7)
  const highConfidenceRecs = recommendations.filter((r) => (r.confidence ?? 0) >= 0.7);

  // Cap at limit
  return highConfidenceRecs.slice(0, limit);
}

/**
 * Derive task context by analyzing user request and AI response.
 * This determines what kind of task is being worked on and its current state.
 */
function deriveTaskContext(
  userText: string,
  assistantText: string,
): {
  type: string;
  state: string;
  details: string[];
} {
  const userLower = userText.toLowerCase();
  const assistantLower = assistantText.toLowerCase();

  // Determine task type
  let type = "general";
  if (userLower.match(/\b(fix|debug|error|issue|problem|bug)\b/)) {
    type = "debugging";
  } else if (userLower.match(/\b(create|add|implement|build|make|write)\b/)) {
    type = "creation";
  } else if (userLower.match(/\b(update|modify|change|refactor|improve)\b/)) {
    type = "modification";
  } else if (userLower.match(/\b(explain|how|what|why|understand|learn)\b/)) {
    type = "learning";
  } else if (userLower.match(/\b(test|verify|check|validate)\b/)) {
    type = "testing";
  }

  // Determine task state
  let state = "initial";
  if (hasExplicitQuestion(assistantText)) {
    state = "awaiting_decision";
  } else if (hasInProgressWork(assistantText)) {
    state = "in_progress";
  } else if (assistantLower.match(/\b(completed|done|finished|ready)\b/)) {
    state = "completed";
  } else if (hasErrorContext(assistantText, userText)) {
    state = "blocked";
  }

  // Extract specific details
  const details: string[] = [];

  // Extract mentioned files/paths
  const fileMatches = assistantText.match(
    /`[^`]+\.(ts|js|tsx|jsx|py|java|go|rs|cpp|c|h|css|html|json|yaml|yml|md|txt)`/g,
  );
  if (fileMatches) {
    details.push(...fileMatches.map((f) => f.replace(/`/g, "")));
  }

  // Extract mentioned commands
  const commandMatches = assistantText.match(
    /`(npm|pnpm|yarn|bun|git|cargo|go|python|pip|docker|kubectl)\s+[^`]+`/g,
  );
  if (commandMatches) {
    details.push(...commandMatches.map((c) => c.replace(/`/g, "")));
  }

  // Extract mentioned functions/components
  const codeMatches = assistantText.match(/`[A-Z][a-zA-Z0-9]+`/g);
  if (codeMatches) {
    details.push(...codeMatches.slice(0, 3).map((c) => c.replace(/`/g, "")));
  }

  return { type, state, details };
}

/**
 * Generate contextually relevant recommendations based on task analysis.
 */
function generateContextualRecommendations(
  context: { type: string; state: string; details: string[] },
  assistantText: string,
  userText: string,
): TaskRecommendation[] {
  const recs: TaskRecommendation[] = [];

  // State-based recommendations
  if (context.state === "awaiting_decision") {
    recs.push(
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
    return recs; // High confidence, return immediately
  }

  if (context.state === "in_progress") {
    recs.push({
      id: "rec-continue",
      label: "Continue",
      prompt: "Continue with the next step",
      category: "action",
      priority: 95,
      icon: "arrow-right",
      confidence: 0.9,
    });
  }

  // Task-type-based recommendations
  if (context.type === "creation") {
    // For creation tasks, suggest testing or documentation
    if (hasActionableCode(assistantText)) {
      recs.push({
        id: "rec-test",
        label: "Add tests",
        prompt: "Add unit tests for this implementation",
        category: "action",
        priority: 85,
        icon: "check-circle",
        confidence: 0.85,
      });
      if (context.state !== "in_progress") {
        recs.push({
          id: "rec-docs",
          label: "Add documentation",
          prompt: "Add documentation and usage examples",
          category: "action",
          priority: 80,
          icon: "book",
          confidence: 0.8,
        });
      }
    }
  }

  if (context.type === "debugging") {
    // For debugging tasks, suggest verification or related fixes
    if (context.state === "completed") {
      recs.push({
        id: "rec-verify",
        label: "Verify fix",
        prompt: "Verify that the fix works correctly",
        category: "action",
        priority: 90,
        icon: "check-circle",
        confidence: 0.85,
      });
    } else {
      recs.push({
        id: "rec-investigate",
        label: "Investigate further",
        prompt: "Investigate the root cause more deeply",
        category: "explore",
        priority: 85,
        icon: "search",
        confidence: 0.8,
      });
    }
  }

  if (context.type === "modification") {
    // For modification tasks, suggest testing changes
    if (hasActionableCode(assistantText)) {
      recs.push({
        id: "rec-test-changes",
        label: "Test changes",
        prompt: "Test the modifications to ensure they work correctly",
        category: "action",
        priority: 88,
        icon: "play",
        confidence: 0.85,
      });
    }
  }

  if (context.type === "learning") {
    // For learning tasks, suggest practical application or deeper exploration
    recs.push({
      id: "rec-example",
      label: "Show example",
      prompt: "Show me a practical example of using this",
      category: "explore",
      priority: 85,
      icon: "code",
      confidence: 0.8,
    });
    if (hasActionableCode(assistantText)) {
      recs.push({
        id: "rec-try",
        label: "Try it out",
        prompt: "Help me try this out in my project",
        category: "action",
        priority: 82,
        icon: "play",
        confidence: 0.78,
      });
    }
  }

  // Content-based recommendations
  if (hasActionableCode(assistantText) && context.type !== "learning") {
    // Only add if not already added
    if (!recs.some((r) => r.id === "rec-test" || r.id === "rec-test-changes")) {
      recs.push({
        id: "rec-apply",
        label: "Apply changes",
        prompt: "Apply these changes to the codebase",
        category: "action",
        priority: 87,
        icon: "play",
        confidence: 0.82,
      });
    }
  }

  // If multiple options were presented
  if (hasOptions(assistantText) && recs.length < 2) {
    recs.push({
      id: "rec-recommend",
      label: "Recommend best option",
      prompt: "Which option would you recommend for my use case and why?",
      category: "explore",
      priority: 83,
      icon: "scale",
      confidence: 0.75,
    });
  }

  // Detail-based recommendations (file-specific next steps)
  if (context.details.length > 0 && recs.length < 3) {
    const hasFiles = context.details.some((d) => d.match(/\.(ts|js|tsx|jsx|py|java|go|rs|cpp)/));
    if (hasFiles && context.type === "modification") {
      recs.push({
        id: "rec-related",
        label: "Check related files",
        prompt: "Check if any related files need similar updates",
        category: "explore",
        priority: 75,
        icon: "files",
        confidence: 0.72,
      });
    }
  }

  return recs;
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
