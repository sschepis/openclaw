import type { GatewayRequestHandlers } from "./types.js";
import { loadConfig } from "../../config/config.js";
import {
  ErrorCodes,
  errorShape,
  formatValidationErrors,
  validateActivitiesListParams,
  validateActivitiesExecuteParams,
} from "../protocol/index.js";
import {
  listSessionsFromStore,
  loadCombinedSessionStoreForGateway,
  type GatewaySessionRow,
} from "../session-utils.js";

/**
 * Task type classification based on session label and metadata.
 */
type ActivityTaskType =
  | "general"
  | "coding"
  | "research"
  | "writing"
  | "data-analysis"
  | "automation"
  | "unknown";

/**
 * Visualization type for the activity panel.
 */
type VisualizationType = "text" | "progress" | "timeline" | "code" | "chart";

/**
 * State value extracted from session context.
 */
interface StateValue {
  key: string;
  label: string;
  value: string | number | boolean;
  type: "string" | "number" | "boolean" | "status";
}

/**
 * Action parameter for action buttons.
 */
interface ActionParameter {
  name: string;
  type: "string" | "number" | "boolean" | "select";
  label: string;
  required?: boolean;
  defaultValue?: string | number | boolean;
  options?: { value: string; label: string }[];
}

/**
 * Activity action that can be executed.
 */
interface ActivityAction {
  id: string;
  label: string;
  icon?: string;
  variant?: "primary" | "secondary" | "danger";
  promptTemplate: string;
  parameters?: ActionParameter[];
}

/**
 * Activity state representing a session as a process.
 */
interface ActivityState {
  sessionKey: string;
  sessionId: string;
  label?: string;
  displayName: string;
  updatedAt: number | null;
  isActive: boolean;
  taskType: ActivityTaskType;
  phase: string;
  progress: number | null;
  summary: string;
  stateValues: Record<string, StateValue>;
  actions: ActivityAction[];
  visualization: VisualizationType;
  visualizationData: Record<string, unknown>;
}

/**
 * Result from activities.list RPC.
 */
interface ActivitiesListResult {
  ts: number;
  count: number;
  activities: ActivityState[];
}

/**
 * Result from activities.execute RPC.
 */
interface ActivitiesExecuteResult {
  ok: boolean;
  sessionKey: string;
  actionId: string;
  promptSent: string;
}

/**
 * Infer task type from session label and metadata.
 */
function inferTaskType(session: GatewaySessionRow): ActivityTaskType {
  const label = session.label?.toLowerCase() ?? "";
  const displayName = session.displayName?.toLowerCase() ?? "";
  const combined = `${label} ${displayName}`;

  if (combined.includes("code") || combined.includes("dev") || combined.includes("programming")) {
    return "coding";
  }
  if (combined.includes("research") || combined.includes("search") || combined.includes("find")) {
    return "research";
  }
  if (combined.includes("writ") || combined.includes("draft") || combined.includes("doc")) {
    return "writing";
  }
  if (combined.includes("data") || combined.includes("analyz") || combined.includes("report")) {
    return "data-analysis";
  }
  if (combined.includes("auto") || combined.includes("schedule") || combined.includes("cron")) {
    return "automation";
  }
  if (label || displayName) {
    return "general";
  }
  return "unknown";
}

/**
 * Determine visualization type based on task type.
 */
function inferVisualization(taskType: ActivityTaskType): VisualizationType {
  switch (taskType) {
    case "coding":
      return "code";
    case "data-analysis":
      return "chart";
    case "automation":
      return "timeline";
    default:
      return "text";
  }
}

/**
 * Generate default state values from session metadata.
 * Phase 2 will use AI to extract more relevant state.
 */
function extractStateValues(session: GatewaySessionRow): Record<string, StateValue> {
  const values: Record<string, StateValue> = {};

  // Token usage
  if (session.totalTokens) {
    values.tokens = {
      key: "tokens",
      label: "Tokens Used",
      value: session.totalTokens,
      type: "number",
    };
  }

  // Model info
  if (session.model) {
    values.model = {
      key: "model",
      label: "Model",
      value: session.model,
      type: "string",
    };
  }

  // Thinking level
  if (session.thinkingLevel) {
    values.thinking = {
      key: "thinking",
      label: "Thinking",
      value: session.thinkingLevel,
      type: "string",
    };
  }

  // Session state
  values.status = {
    key: "status",
    label: "Status",
    value: session.abortedLastRun ? "paused" : "active",
    type: "status",
  };

  return values;
}

/**
 * Generate default actions based on task type.
 * Phase 2 will use AI to generate context-aware actions.
 */
function generateDefaultActions(taskType: ActivityTaskType): ActivityAction[] {
  const commonActions: ActivityAction[] = [
    {
      id: "status",
      label: "Check Status",
      icon: "info",
      variant: "secondary",
      promptTemplate: "What is the current status of this task?",
    },
    {
      id: "continue",
      label: "Continue",
      icon: "play",
      variant: "primary",
      promptTemplate: "Please continue with the current task.",
    },
    {
      id: "pause",
      label: "Pause",
      icon: "pause",
      variant: "secondary",
      promptTemplate: "/pause",
    },
  ];

  const typeSpecificActions: Record<ActivityTaskType, ActivityAction[]> = {
    coding: [
      {
        id: "run-tests",
        label: "Run Tests",
        icon: "test",
        variant: "primary",
        promptTemplate: "Run the tests for the current implementation.",
      },
      {
        id: "review-code",
        label: "Review Code",
        icon: "code",
        variant: "secondary",
        promptTemplate: "Review the code changes and suggest improvements.",
      },
    ],
    research: [
      {
        id: "summarize",
        label: "Summarize",
        icon: "document",
        variant: "primary",
        promptTemplate: "Summarize the research findings so far.",
      },
      {
        id: "expand",
        label: "Expand Research",
        icon: "search",
        variant: "secondary",
        promptTemplate: "Expand the research to cover additional aspects.",
      },
    ],
    writing: [
      {
        id: "review-draft",
        label: "Review Draft",
        icon: "document",
        variant: "primary",
        promptTemplate: "Review the current draft and suggest edits.",
      },
      {
        id: "expand-section",
        label: "Expand Section",
        icon: "expand",
        variant: "secondary",
        promptTemplate: "Expand the current section with more detail.",
        parameters: [
          {
            name: "section",
            type: "string",
            label: "Section Name",
            required: true,
          },
        ],
      },
    ],
    "data-analysis": [
      {
        id: "generate-chart",
        label: "Generate Chart",
        icon: "chart",
        variant: "primary",
        promptTemplate: "Generate a visualization for the current data analysis.",
      },
      {
        id: "export-results",
        label: "Export Results",
        icon: "download",
        variant: "secondary",
        promptTemplate: "Export the analysis results to a file.",
      },
    ],
    automation: [
      {
        id: "run-now",
        label: "Run Now",
        icon: "play",
        variant: "primary",
        promptTemplate: "Execute the automation task immediately.",
      },
      {
        id: "view-schedule",
        label: "View Schedule",
        icon: "calendar",
        variant: "secondary",
        promptTemplate: "Show the current automation schedule.",
      },
    ],
    general: [],
    unknown: [],
  };

  return [...commonActions, ...(typeSpecificActions[taskType] ?? [])];
}

/**
 * Convert a session row to an activity state.
 */
function sessionToActivity(session: GatewaySessionRow): ActivityState {
  const taskType = inferTaskType(session);
  const isActive = Boolean(session.updatedAt && Date.now() - session.updatedAt < 5 * 60 * 1000);

  return {
    sessionKey: session.key,
    sessionId: session.sessionId ?? "",
    label: session.label,
    displayName: session.displayName ?? session.key,
    updatedAt: session.updatedAt,
    isActive,
    taskType,
    phase: "active", // Phase 2 will extract from AI analysis
    progress: null, // Phase 2 will extract from AI analysis
    summary: session.lastMessagePreview ?? session.derivedTitle ?? "Session in progress",
    stateValues: extractStateValues(session),
    actions: generateDefaultActions(taskType),
    visualization: inferVisualization(taskType),
    visualizationData: {}, // Phase 2 will populate with AI-extracted data
  };
}

export const activitiesHandlers: GatewayRequestHandlers = {
  "activities.list": async ({ params, respond, context }) => {
    if (!validateActivitiesListParams(params)) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.INVALID_REQUEST,
          `invalid activities.list params: ${formatValidationErrors(validateActivitiesListParams.errors)}`,
        ),
      );
      return;
    }

    const p = params;
    const cfg = loadConfig();
    const { storePath, store } = loadCombinedSessionStoreForGateway(cfg);

    let cronJobs;
    try {
      const cronResult = await context.cron.list({ includeDisabled: true });
      cronJobs = cronResult;
    } catch {
      // Ignore cron errors
    }

    // Use existing sessions list infrastructure
    const sessionsResult = listSessionsFromStore({
      cfg,
      storePath,
      store,
      opts: {
        ...p,
        includeDerivedTitles: true,
        includeLastMessage: true,
      },
      cronJobs,
    });

    // Transform sessions to activities
    const activities = sessionsResult.sessions.map(sessionToActivity);

    const result: ActivitiesListResult = {
      ts: sessionsResult.ts,
      count: activities.length,
      activities,
    };

    respond(true, result, undefined);
  },

  "activities.execute": async ({ params, respond }) => {
    if (!validateActivitiesExecuteParams(params)) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.INVALID_REQUEST,
          `invalid activities.execute params: ${formatValidationErrors(validateActivitiesExecuteParams.errors)}`,
        ),
      );
      return;
    }

    const p = params;
    const key = String(p.key ?? "").trim();
    const actionId = String(p.actionId ?? "").trim();

    if (!key) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "key required"));
      return;
    }
    if (!actionId) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "actionId required"));
      return;
    }

    // For Phase 1, we use a simplified action lookup
    // Phase 2 will have proper action resolution
    const defaultActions = [
      ...generateDefaultActions("general"),
      ...generateDefaultActions("coding"),
      ...generateDefaultActions("research"),
      ...generateDefaultActions("writing"),
      ...generateDefaultActions("data-analysis"),
      ...generateDefaultActions("automation"),
    ];

    const action = defaultActions.find((a) => a.id === actionId);
    if (!action) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, `unknown action: ${actionId}`),
      );
      return;
    }

    // Build prompt from template and parameters
    let prompt = action.promptTemplate;
    const actionParams = (p.parameters ?? {}) as Record<string, unknown>;
    for (const [paramName, paramValue] of Object.entries(actionParams)) {
      prompt = prompt.replace(`{${paramName}}`, String(paramValue));
    }

    // For Phase 1, we return the prompt that should be sent
    // The UI will call chat.send separately with this prompt
    // Phase 2 will integrate directly with the chat service
    const result: ActivitiesExecuteResult = {
      ok: true,
      sessionKey: key,
      actionId,
      promptSent: prompt,
    };

    respond(true, result, undefined);
  },
};
