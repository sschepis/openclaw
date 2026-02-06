# Activities Page Design

> **Status**: Draft  
> **Author**: Architecture Mode  
> **Date**: 2025-02-03

## Overview

The `/activities` page provides a dashboard view of active agent sessions, treating each session as a **process** with observable state and actionable controls. This design enables users to monitor, understand, and interact with running agent sessions through dynamically generated visualizations and action interfaces.

## Core Concepts

### Sessions as Processes

Each agent session represents a running "process" with:

- **Current State**: Extracted from conversation history via AI analysis
- **Available Actions**: Context-appropriate operations that translate to chat prompts
- **Visualization**: Task-specific UI components showing progress, status, or data

### AI-Powered State Extraction

A dedicated AI process analyzes session transcripts to extract:

1. **State Values**: Key metrics, progress indicators, and status information
2. **Relevant Actions**: Context-appropriate commands the user can invoke
3. **Visualization Type**: The most suitable UI representation for the current task

---

## Architecture

### System Flow

```mermaid
flowchart TB
    subgraph Gateway
        SessionStore[Session Store]
        Transcripts[Session Transcripts]
        ChatSend[chat.send RPC]
    end

    subgraph ActivitiesBackend
        ActivitiesRPC[activities.* RPC handlers]
        StateExtractor[Activity State Extractor]
        ActionRouter[Action Router]
    end

    subgraph UI
        ActivitiesPage[/activities Page]
        ActivityPanel[Activity Panel Component]
        ActionButtons[Action Buttons]
        Visualization[Dynamic Visualization]
    end

    SessionStore --> ActivitiesRPC
    Transcripts --> StateExtractor
    StateExtractor --> ActivitiesRPC
    ActivitiesRPC --> ActivitiesPage
    ActivitiesPage --> ActivityPanel
    ActivityPanel --> Visualization
    ActivityPanel --> ActionButtons
    ActionButtons --> ActionRouter
    ActionRouter --> ChatSend
    ChatSend --> Transcripts
```

---

## Data Model

### Activity State

```typescript
interface ActivityState {
  sessionKey: string;
  sessionId: string;

  // Core metadata
  label: string;
  displayName: string;
  updatedAt: number;
  isActive: boolean;

  // AI-extracted state
  taskType: ActivityTaskType;
  phase: string; // e.g., "researching", "coding", "reviewing"
  progress: number | null; // 0-100 if determinable
  summary: string; // Brief description of current state
  stateValues: Record<string, StateValue>;

  // Available actions
  actions: ActivityAction[];

  // Visualization hints
  visualization: VisualizationType;
  visualizationData: Record<string, unknown>;
}

interface StateValue {
  key: string;
  label: string;
  value: string | number | boolean;
  type: "text" | "number" | "boolean" | "progress" | "list" | "code";
  unit?: string;
}

interface ActivityAction {
  id: string;
  label: string;
  description: string;
  icon?: string;
  variant: "primary" | "secondary" | "danger";
  promptTemplate: string; // Template to inject into chat
  confirmRequired?: boolean;
  parameters?: ActionParameter[];
}

interface ActionParameter {
  name: string;
  label: string;
  type: "text" | "number" | "select" | "boolean";
  options?: Array<{ value: string; label: string }>;
  default?: string | number | boolean;
}

type ActivityTaskType =
  | "coding"
  | "research"
  | "writing"
  | "analysis"
  | "conversation"
  | "automation"
  | "unknown";

type VisualizationType =
  | "progress-bar"
  | "file-tree"
  | "code-diff"
  | "checklist"
  | "timeline"
  | "metrics"
  | "conversation"
  | "generic";
```

---

## Gateway Integration

### New RPC Methods

Add to [`src/gateway/server-methods/`](src/gateway/server-methods/):

#### `activities.list`

Lists all active sessions with their extracted activity state.

```typescript
// Request
interface ActivitiesListParams {
  activeMinutes?: number; // Filter by recent activity
  limit?: number;
  includeInactive?: boolean;
  agentId?: string;
}

// Response
interface ActivitiesListResult {
  ts: number;
  activities: ActivityState[];
}
```

#### `activities.analyze`

Triggers AI analysis of a specific session to extract/refresh state.

```typescript
// Request
interface ActivitiesAnalyzeParams {
  sessionKey: string;
  forceRefresh?: boolean; // Re-analyze even if recently done
}

// Response
interface ActivitiesAnalyzeResult {
  ok: boolean;
  activity: ActivityState;
  analyzedAt: number;
}
```

#### `activities.action`

Executes an action by injecting the appropriate prompt into the session.

```typescript
// Request
interface ActivitiesActionParams {
  sessionKey: string;
  actionId: string;
  parameters?: Record<string, unknown>;
}

// Response
interface ActivitiesActionResult {
  ok: boolean;
  runId: string; // Chat run ID for tracking
  promptSent: string; // The actual prompt injected
}
```

### Implementation Location

Create new file: [`src/gateway/server-methods/activities.ts`](src/gateway/server-methods/activities.ts)

```typescript
import type { GatewayRequestHandlers } from "./types.js";
import { loadCombinedSessionStoreForGateway } from "../session-utils.js";
import { extractActivityState } from "../activity-state-extractor.js";

export const activitiesHandlers: GatewayRequestHandlers = {
  "activities.list": async ({ params, respond, context }) => {
    // Implementation
  },
  "activities.analyze": async ({ params, respond, context }) => {
    // Implementation
  },
  "activities.action": async ({ params, respond, context }) => {
    // Implementation
  },
};
```

Register in [`src/gateway/server-methods.ts`](src/gateway/server-methods.ts):

```typescript
import { activitiesHandlers } from "./server-methods/activities.js";

// Add to handlers list
```

---

## Activity State Extraction

### Extractor Service

Create [`src/gateway/activity-state-extractor.ts`](src/gateway/activity-state-extractor.ts):

```typescript
import { readSessionMessages } from "./session-utils.fs.js";

interface ExtractionContext {
  sessionKey: string;
  sessionId: string;
  messages: unknown[];
  entry: SessionEntry;
}

interface ExtractionResult {
  taskType: ActivityTaskType;
  phase: string;
  progress: number | null;
  summary: string;
  stateValues: Record<string, StateValue>;
  actions: ActivityAction[];
  visualization: VisualizationType;
  visualizationData: Record<string, unknown>;
}

export async function extractActivityState(ctx: ExtractionContext): Promise<ExtractionResult> {
  // 1. Read recent messages from transcript
  // 2. Build extraction prompt
  // 3. Call AI model for structured extraction
  // 4. Parse and validate response
  // 5. Return activity state
}
```

### Extraction Prompt Template

```typescript
const EXTRACTION_PROMPT = `
Analyze this conversation transcript and extract the current activity state.

Transcript (last N messages):
{transcript}

Extract the following in JSON format:
{
  "taskType": "coding|research|writing|analysis|conversation|automation|unknown",
  "phase": "brief description of current phase",
  "progress": null or 0-100 if determinable,
  "summary": "2-3 sentence summary of current state",
  "stateValues": [
    { "key": "...", "label": "...", "value": "...", "type": "..." }
  ],
  "actions": [
    {
      "id": "unique-id",
      "label": "Button Label",
      "description": "What this action does",
      "promptTemplate": "The exact prompt to send",
      "variant": "primary|secondary|danger"
    }
  ],
  "visualization": "progress-bar|file-tree|checklist|timeline|metrics|conversation|generic",
  "visualizationData": {}
}

Focus on:
1. What is the agent currently working on?
2. What meaningful actions can the user take?
3. What state values would help the user understand progress?
`;
```

### Caching Strategy

- Cache extracted state in session entry metadata
- TTL: 30 seconds for active sessions, 5 minutes for idle
- Invalidate on new messages
- Store `lastAnalyzedAt` timestamp

```typescript
interface SessionEntry {
  // ... existing fields ...

  // Activity state cache
  activityState?: {
    extractedAt: number;
    taskType: ActivityTaskType;
    phase: string;
    progress: number | null;
    summary: string;
    stateValues: Record<string, StateValue>;
    actions: ActivityAction[];
    visualization: VisualizationType;
    visualizationData: Record<string, unknown>;
  };
}
```

---

## UI Implementation

### Navigation

Update [`ui/src/ui/navigation.ts`](ui/src/ui/navigation.ts):

```typescript
export const TAB_GROUPS = [
  { label: "Chat", tabs: ["chat"] },
  {
    label: "Control",
    tabs: ["overview", "channels", "instances", "sessions", "activities", "cron"],
  },
  // ...
] as const;

export type Tab =
  | "overview"
  | "channels"
  | "instances"
  | "sessions"
  | "activities" // NEW
  | "cron";
// ...

const TAB_PATHS: Record<Tab, string> = {
  // ...
  activities: "/activities", // NEW
  // ...
};

export function iconForTab(tab: Tab): IconName {
  switch (tab) {
    // ...
    case "activities":
      return "activity"; // or "layers", "grid"
    // ...
  }
}

export function titleForTab(tab: Tab) {
  switch (tab) {
    // ...
    case "activities":
      return "Activities";
    // ...
  }
}

export function subtitleForTab(tab: Tab) {
  switch (tab) {
    // ...
    case "activities":
      return "Monitor and interact with active agent sessions.";
    // ...
  }
}
```

### View Component

Create [`ui/src/ui/views/activities.ts`](ui/src/ui/views/activities.ts):

```typescript
import { html, nothing } from "lit";
import type { ActivityState, ActivityAction } from "../types";
import { formatAgo } from "../format";

export type ActivitiesProps = {
  loading: boolean;
  activities: ActivityState[];
  error: string | null;
  onRefresh: () => void;
  onAction: (sessionKey: string, actionId: string, params?: Record<string, unknown>) => void;
  onOpenChat: (sessionKey: string) => void;
};

export function renderActivities(props: ActivitiesProps) {
  return html`
    <section class="card">
      <div class="row" style="justify-content: space-between;">
        <div>
          <div class="card-title">Activities</div>
          <div class="card-sub">Active agent sessions and their current state.</div>
        </div>
        <button class="btn" ?disabled=${props.loading} @click=${props.onRefresh}>
          ${props.loading ? "Loading…" : "Refresh"}
        </button>
      </div>

      ${props.error ? html`<div class="callout danger">${props.error}</div>` : nothing}

      <div class="activities-grid">
        ${props.activities.length === 0
          ? html`<div class="muted">No active sessions.</div>`
          : props.activities.map((activity) => renderActivityPanel(activity, props))}
      </div>
    </section>
  `;
}

function renderActivityPanel(activity: ActivityState, props: ActivitiesProps) {
  return html`
    <div class="activity-panel ${activity.isActive ? "activity-panel--active" : ""}">
      <div class="activity-panel__header">
        <div class="activity-panel__title">${activity.displayName}</div>
        <div class="activity-panel__meta">
          <span class="pill">${activity.taskType}</span>
          <span class="muted">Updated ${formatAgo(activity.updatedAt)}</span>
        </div>
      </div>

      <div class="activity-panel__phase">${activity.phase}</div>
      <div class="activity-panel__summary">${activity.summary}</div>

      ${renderVisualization(activity)} ${renderStateValues(activity.stateValues)}
      ${renderActions(activity, props)}
    </div>
  `;
}

function renderVisualization(activity: ActivityState) {
  switch (activity.visualization) {
    case "progress-bar":
      return renderProgressBar(activity.progress, activity.visualizationData);
    case "checklist":
      return renderChecklist(activity.visualizationData);
    case "file-tree":
      return renderFileTree(activity.visualizationData);
    case "metrics":
      return renderMetrics(activity.visualizationData);
    case "timeline":
      return renderTimeline(activity.visualizationData);
    default:
      return nothing;
  }
}

function renderProgressBar(progress: number | null, data: Record<string, unknown>) {
  if (progress === null) return nothing;
  return html`
    <div class="activity-progress">
      <div class="activity-progress__bar" style="width: ${progress}%"></div>
      <span class="activity-progress__label">${progress}%</span>
    </div>
  `;
}

function renderStateValues(stateValues: Record<string, StateValue>) {
  const values = Object.values(stateValues);
  if (values.length === 0) return nothing;

  return html`
    <div class="activity-state-values">
      ${values.map(
        (sv) => html`
          <div class="activity-state-value">
            <span class="activity-state-value__label">${sv.label}</span>
            <span class="activity-state-value__value">${sv.value}${sv.unit ?? ""}</span>
          </div>
        `,
      )}
    </div>
  `;
}

function renderActions(activity: ActivityState, props: ActivitiesProps) {
  if (activity.actions.length === 0) return nothing;

  return html`
    <div class="activity-actions">
      ${activity.actions.map(
        (action) => html`
          <button
            class="btn ${action.variant === "primary" ? "primary" : ""} ${action.variant ===
            "danger"
              ? "danger"
              : ""}"
            title=${action.description}
            @click=${() => props.onAction(activity.sessionKey, action.id)}
          >
            ${action.label}
          </button>
        `,
      )}
      <button class="btn" @click=${() => props.onOpenChat(activity.sessionKey)}>Open Chat</button>
    </div>
  `;
}
```

### Controller

Create [`ui/src/ui/controllers/activities.ts`](ui/src/ui/controllers/activities.ts):

```typescript
import type { GatewayBrowserClient } from "../gateway";
import type { ActivityState } from "../types";

export type ActivitiesState = {
  client: GatewayBrowserClient | null;
  connected: boolean;
  activitiesLoading: boolean;
  activitiesList: ActivityState[];
  activitiesError: string | null;
};

export async function loadActivities(
  state: ActivitiesState,
  options?: { activeMinutes?: number; limit?: number },
) {
  if (!state.client || !state.connected) return;
  if (state.activitiesLoading) return;

  state.activitiesLoading = true;
  state.activitiesError = null;

  try {
    const res = await state.client.request("activities.list", {
      activeMinutes: options?.activeMinutes ?? 60,
      limit: options?.limit ?? 50,
    });
    if (res?.activities) {
      state.activitiesList = res.activities;
    }
  } catch (err) {
    state.activitiesError = String(err);
  } finally {
    state.activitiesLoading = false;
  }
}

export async function executeAction(
  state: ActivitiesState,
  sessionKey: string,
  actionId: string,
  parameters?: Record<string, unknown>,
) {
  if (!state.client || !state.connected) return;

  try {
    const res = await state.client.request("activities.action", {
      sessionKey,
      actionId,
      parameters,
    });

    // Optionally refresh activities after action
    await loadActivities(state);

    return res;
  } catch (err) {
    state.activitiesError = String(err);
  }
}
```

### Styles

Add to [`ui/src/styles/components.css`](ui/src/styles/components.css):

```css
/* Activities Page */
.activities-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(400px, 1fr));
  gap: 16px;
  margin-top: 16px;
}

.activity-panel {
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.activity-panel--active {
  border-color: var(--accent);
  box-shadow: 0 0 0 1px var(--accent-dim);
}

.activity-panel__header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
}

.activity-panel__title {
  font-weight: 600;
  font-size: 1.1em;
}

.activity-panel__meta {
  display: flex;
  gap: 8px;
  align-items: center;
}

.activity-panel__phase {
  color: var(--accent);
  font-weight: 500;
}

.activity-panel__summary {
  color: var(--text-secondary);
  font-size: 0.9em;
  line-height: 1.4;
}

.activity-progress {
  height: 8px;
  background: var(--bg-tertiary);
  border-radius: 4px;
  overflow: hidden;
  position: relative;
}

.activity-progress__bar {
  height: 100%;
  background: var(--accent);
  transition: width 0.3s ease;
}

.activity-progress__label {
  position: absolute;
  right: 0;
  top: -20px;
  font-size: 0.8em;
  color: var(--text-secondary);
}

.activity-state-values {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: 8px;
}

.activity-state-value {
  display: flex;
  flex-direction: column;
  background: var(--bg-tertiary);
  padding: 8px;
  border-radius: 4px;
}

.activity-state-value__label {
  font-size: 0.75em;
  color: var(--text-secondary);
  text-transform: uppercase;
}

.activity-state-value__value {
  font-weight: 600;
  font-size: 1.1em;
}

.activity-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  margin-top: auto;
  padding-top: 12px;
  border-top: 1px solid var(--border);
}
```

---

## Action Execution Flow

When a user clicks an action button:

1. **UI Triggers Action**

   ```typescript
   onAction(sessionKey, actionId, parameters);
   ```

2. **RPC to Gateway**

   ```typescript
   client.request("activities.action", { sessionKey, actionId, parameters });
   ```

3. **Gateway Resolves Prompt**

   ```typescript
   const action = activity.actions.find((a) => a.id === actionId);
   const prompt = interpolateTemplate(action.promptTemplate, parameters);
   ```

4. **Inject into Chat**
   Leverage existing [`chat.send`](src/gateway/server-methods/chat.ts:304) infrastructure:

   ```typescript
   await dispatchInboundMessage({
     ctx: {
       Body: prompt,
       SessionKey: sessionKey,
       Provider: "activities-dashboard",
       // ...
     },
     cfg,
     dispatcher,
     replyOptions: {
       /* ... */
     },
   });
   ```

5. **Refresh State**
   After the action completes (or immediately), re-analyze the session to update the activity state.

---

## Action Templates

### Coding Task Actions

```typescript
const CODING_ACTIONS: ActivityAction[] = [
  {
    id: "continue",
    label: "Continue",
    description: "Continue working on the current task",
    promptTemplate: "Please continue with the implementation.",
    variant: "primary",
  },
  {
    id: "explain",
    label: "Explain",
    description: "Explain the current approach",
    promptTemplate: "Can you explain your current approach and next steps?",
    variant: "secondary",
  },
  {
    id: "test",
    label: "Run Tests",
    description: "Run tests for the current changes",
    promptTemplate: "Please run the tests for the current changes.",
    variant: "secondary",
  },
  {
    id: "commit",
    label: "Commit",
    description: "Commit the current changes",
    promptTemplate: "Please commit the current changes with an appropriate message.",
    variant: "secondary",
  },
  {
    id: "abort",
    label: "Stop",
    description: "Stop the current task",
    promptTemplate: "/stop",
    variant: "danger",
    confirmRequired: true,
  },
];
```

### Research Task Actions

```typescript
const RESEARCH_ACTIONS: ActivityAction[] = [
  {
    id: "summarize",
    label: "Summarize",
    description: "Summarize findings so far",
    promptTemplate: "Please summarize your research findings so far.",
    variant: "primary",
  },
  {
    id: "dig-deeper",
    label: "Dig Deeper",
    description: "Investigate further",
    promptTemplate: "Please investigate this topic in more depth.",
    variant: "secondary",
  },
  {
    id: "sources",
    label: "List Sources",
    description: "List all sources used",
    promptTemplate: "Please list all the sources you've referenced.",
    variant: "secondary",
  },
];
```

---

## Real-time Updates

### WebSocket Events

Extend the existing agent event broadcasting to include activity state updates:

```typescript
// On session message or completion
context.broadcast("activity:update", {
  sessionKey,
  activity: updatedActivityState,
});
```

### UI Subscription

```typescript
client.on("activity:update", (payload) => {
  const { sessionKey, activity } = payload;
  // Update local state
  state.activitiesList = state.activitiesList.map((a) =>
    a.sessionKey === sessionKey ? activity : a,
  );
});
```

---

## Implementation Phases

### Phase 1: Foundation

1. Add navigation entry for `/activities`
2. Create basic view with session list (reuse session data)
3. Implement `activities.list` RPC (wrap existing sessions.list)
4. Basic panel display without AI extraction

### Phase 2: State Extraction

1. Implement activity state extractor using existing AI infrastructure
2. Add extraction prompt engineering
3. Implement caching in session store
4. Add `activities.analyze` RPC

### Phase 3: Actions

1. Implement action templates per task type
2. Create `activities.action` RPC
3. Integrate with `dispatchInboundMessage`
4. Add confirmation dialogs for dangerous actions

### Phase 4: Visualizations

1. Implement progress bar visualization
2. Add checklist/todo visualization
3. Add file tree visualization (for coding tasks)
4. Add metrics visualization

### Phase 5: Real-time

1. Add activity update events to WebSocket
2. Implement UI subscription
3. Add optimistic updates
4. Add activity polling fallback

---

## File Changes Summary

### New Files

| File                                                                                   | Purpose                     |
| -------------------------------------------------------------------------------------- | --------------------------- |
| [`src/gateway/server-methods/activities.ts`](src/gateway/server-methods/activities.ts) | RPC handlers for activities |
| [`src/gateway/activity-state-extractor.ts`](src/gateway/activity-state-extractor.ts)   | AI-powered state extraction |
| [`ui/src/ui/views/activities.ts`](ui/src/ui/views/activities.ts)                       | Activities page view        |
| [`ui/src/ui/controllers/activities.ts`](ui/src/ui/controllers/activities.ts)           | Activities state management |

### Modified Files

| File                                                             | Changes                                      |
| ---------------------------------------------------------------- | -------------------------------------------- |
| [`ui/src/ui/navigation.ts`](ui/src/ui/navigation.ts:26)          | Add "activities" tab                         |
| [`ui/src/ui/app.ts`](ui/src/ui/app.ts)                           | Add activities state and handlers            |
| [`ui/src/ui/app-render.ts`](ui/src/ui/app-render.ts)             | Render activities view                       |
| [`src/gateway/server-methods.ts`](src/gateway/server-methods.ts) | Register activities handlers                 |
| [`src/gateway/protocol/index.ts`](src/gateway/protocol/index.ts) | Add activities validation schemas            |
| [`ui/src/styles/components.css`](ui/src/styles/components.css)   | Add activities styles                        |
| [`src/config/sessions.ts`](src/config/sessions.ts)               | Extend SessionEntry with activityState cache |

---

## Testing Strategy

### Unit Tests

- State extractor prompt parsing
- Action template interpolation
- Visualization data mapping

### Integration Tests

- `activities.list` returns correct sessions
- `activities.analyze` extracts valid state
- `activities.action` injects prompts correctly

### E2E Tests

- Navigate to /activities
- View active session panels
- Execute action and verify chat update
- Real-time update propagation

---

## Security Considerations

1. **Action Authorization**: Actions inherit session authorization
2. **Prompt Injection**: Sanitize action parameters before interpolation
3. **Cross-Session Access**: Enforce agent-to-agent policies
4. **Rate Limiting**: Limit analyze requests per session

---

## Open Questions

1. Should we allow custom actions defined per-session via directives?
2. How granular should the visualization types be?
3. Should activities show subagent sessions or parent-only?
4. Should we persist action history for audit trails?
