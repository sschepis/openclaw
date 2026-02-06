# Activities View UI/UX Improvement Plan

## Current Problems (From Screenshots)

### 1. **Summary Text is Unreadable**

- Raw markdown content displayed as a wall of text
- No truncation or "read more" functionality
- Long summaries dominate the entire card
- Markdown syntax (\*\*, ##, ```) shown as raw text instead of rendered

### 2. **Lack of Visual Hierarchy**

- No clear separation between activity cards
- All information presented at the same visual weight
- No distinction between critical info and supplementary details

### 3. **Missing Activity-Type-Specific UIs**

- The `visualization` field supports: `progress-bar`, `file-tree`, `code-diff`, `checklist`, `timeline`, `metrics`, `conversation`, `generic`
- Currently only `progress-bar`, `checklist`, and `metrics` have basic implementations
- Most activities show no specialized visualization

### 4. **Poor Information Density**

- Token usage, model info, and status are buried in text
- Key metadata not surfaced prominently
- No quick-scan capability for multiple activities

### 5. **Action Buttons Lack Context**

- Actions are generic buttons without visual feedback
- No loading states or progress indication
- Confirm dialogs are native browser alerts

---

## Proposed Improvements

### Phase 1: Card Restructure (High Priority)

#### 1.1 Activity Card Layout Redesign

```
┌─────────────────────────────────────────────────────────────┐
│ ┌─────┐  Task Title                        🟢 active  19m  │
│ │ 🎯  │  taskType • phase                                  │
│ └─────┘                                                    │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  [Visualization Area - Progress/Checklist/Timeline/etc]    │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│  Summary (truncated to 3 lines, expandable)                 │
│  "The Moltbook Skill has been successfully built and..."   │
│                                               [Show more ▼] │
├─────────────────────────────────────────────────────────────┤
│  ┌──────────┐ ┌──────────┐ ┌──────────┐                    │
│  │ 🎟 104k  │ │ ⚡ gemini │ │ 📊 active│                    │
│  │  tokens  │ │  -3-pro  │ │  status  │                    │
│  └──────────┘ └──────────┘ └──────────┘                    │
├─────────────────────────────────────────────────────────────┤
│  [Check Status] [Continue] [Pause] [Open Chat →]           │
└─────────────────────────────────────────────────────────────┘
```

#### 1.2 New CSS Classes Needed

```css
/* Activity Panel - Redesigned */
.activity-panel {
  border: 1px solid var(--border);
  background: var(--card);
  border-radius: var(--radius-lg);
  overflow: hidden;
  transition:
    border-color 0.2s,
    box-shadow 0.2s;
}

.activity-panel:hover {
  border-color: var(--border-strong);
  box-shadow: var(--shadow-sm);
}

.activity-panel--active {
  border-left: 3px solid var(--ok);
}

/* Header with icon, title, status */
.activity-panel__header {
  display: grid;
  grid-template-columns: 48px 1fr auto;
  gap: 12px;
  padding: 16px;
  border-bottom: 1px solid var(--border);
  align-items: center;
}

.activity-panel__icon {
  width: 48px;
  height: 48px;
  border-radius: var(--radius-md);
  background: var(--secondary);
  display: grid;
  place-items: center;
  font-size: 24px;
}

.activity-panel__title-group {
  min-width: 0;
}

.activity-panel__title {
  font-size: 15px;
  font-weight: 600;
  color: var(--text-strong);
  text-decoration: none;
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.activity-panel__subtitle {
  font-size: 12px;
  color: var(--muted);
  margin-top: 2px;
}

.activity-panel__status-badge {
  display: flex;
  align-items: center;
  gap: 8px;
}

/* Visualization Area */
.activity-panel__visualization {
  padding: 16px;
  background: var(--bg-elevated);
  border-bottom: 1px solid var(--border);
}

/* Summary Section with Expand/Collapse */
.activity-panel__summary-section {
  padding: 16px;
  border-bottom: 1px solid var(--border);
}

.activity-panel__summary {
  font-size: 13px;
  line-height: 1.55;
  color: var(--text);
  overflow: hidden;
}

.activity-panel__summary--collapsed {
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
}

.activity-panel__summary--expanded {
  max-height: 400px;
  overflow-y: auto;
}

.activity-panel__toggle {
  margin-top: 8px;
  font-size: 12px;
  color: var(--accent);
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 4px;
}

/* Metrics Row */
.activity-panel__metrics {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding: 12px 16px;
  border-bottom: 1px solid var(--border);
}

.activity-metric-chip {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  background: var(--secondary);
  border-radius: var(--radius-sm);
  font-size: 12px;
}

.activity-metric-chip__icon {
  font-size: 14px;
}

.activity-metric-chip__value {
  font-weight: 600;
  font-family: var(--mono);
}

.activity-metric-chip__label {
  color: var(--muted);
}

/* Actions Row */
.activity-panel__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding: 12px 16px;
  background: var(--bg-elevated);
}
```

---

### Phase 2: Summary Rendering (High Priority)

#### 2.1 Markdown-to-HTML Rendering

- Parse markdown in summaries (headings, bold, code, lists)
- Sanitize HTML output for security
- Render inline code and code blocks with syntax highlighting

#### 2.2 Smart Truncation

- Show first 3 lines by default
- "Show more" expands to full content
- Track expanded/collapsed state per activity

#### 2.3 Implementation in `activities.ts`

```typescript
function renderSummary(summary: string, isExpanded: boolean, onToggle: () => void) {
  // Convert markdown to safe HTML
  const html = markdownToHtml(summary);

  return html`
    <div class="activity-panel__summary-section">
      <div
        class="activity-panel__summary ${isExpanded
          ? "activity-panel__summary--expanded"
          : "activity-panel__summary--collapsed"}"
      >
        ${unsafeHTML(html)}
      </div>
      ${summary.length > 200
        ? html`
            <button class="activity-panel__toggle" @click=${onToggle}>
              ${isExpanded ? "Show less ▲" : "Show more ▼"}
            </button>
          `
        : nothing}
    </div>
  `;
}
```

---

### Phase 3: Visualization Components (Medium Priority)

#### 3.1 Task-Type Icons

Map `taskType` to relevant emoji/icon:

- `coding` → 💻 or code icon
- `research` → 🔍 or search icon
- `writing` → ✍️ or pen icon
- `analysis` → 📊 or chart icon
- `conversation` → 💬 or chat icon
- `automation` → ⚙️ or gear icon
- `unknown` → 📋 or generic icon

#### 3.2 Enhanced Progress Bar

```typescript
function renderProgressBar(progress: number, phase: string) {
  return html`
    <div class="activity-progress-enhanced">
      <div class="activity-progress-enhanced__header">
        <span class="activity-progress-enhanced__phase">${phase}</span>
        <span class="activity-progress-enhanced__value">${progress}%</span>
      </div>
      <div class="activity-progress-enhanced__track">
        <div class="activity-progress-enhanced__fill" style="width: ${progress}%"></div>
      </div>
    </div>
  `;
}
```

#### 3.3 Checklist Component (Enhanced)

```typescript
function renderChecklist(items: { label: string; done: boolean }[]) {
  const done = items.filter((i) => i.done).length;
  const total = items.length;

  return html`
    <div class="activity-checklist-enhanced">
      <div class="activity-checklist-enhanced__header">
        <span>Checklist</span>
        <span class="activity-checklist-enhanced__count">${done}/${total}</span>
      </div>
      <div class="activity-checklist-enhanced__items">
        ${items.map(
          (item) => html`
            <div class="activity-checklist-enhanced__item ${item.done ? "done" : ""}">
              ${item.done ? icons.checkCircle : icons.circle}
              <span>${item.label}</span>
            </div>
          `,
        )}
      </div>
    </div>
  `;
}
```

#### 3.4 Timeline Visualization (New)

For activities that have phases/steps:

```
● Step 1: Analyzing requirements      ✓ Complete
○ Step 2: Implementing core logic     ⏳ In progress
○ Step 3: Writing tests               ○ Pending
○ Step 4: Documentation               ○ Pending
```

#### 3.5 Code Diff Visualization (New)

For coding tasks, show:

- Files modified (collapsible)
- Line counts (+added, -removed)
- Quick preview of changes

#### 3.6 File Tree Visualization (New)

For file-related activities:

```
📁 project/
  ├── 📄 src/main.ts (modified)
  ├── 📄 src/utils.ts (added)
  └── 📁 tests/
      └── 📄 main.test.ts (added)
```

---

### Phase 4: Metrics Display (Medium Priority)

#### 4.1 Key Metrics Chips

Extract and display prominently:

- **Tokens Used**: Format as "104k tokens"
- **Model**: Show as "gemini-3-pro"
- **Status**: Visual indicator (active/paused/idle)
- **Duration**: Time since start or last update

#### 4.2 Token Usage Visualization

```typescript
function renderTokenUsage(tokens: number, contextLimit?: number) {
  const formattedTokens = formatNumber(tokens); // "104,107" or "104k"
  const percentage = contextLimit ? (tokens / contextLimit) * 100 : null;

  return html`
    <div class="activity-tokens">
      <span class="activity-tokens__value">${formattedTokens}</span>
      <span class="activity-tokens__label">tokens</span>
      ${percentage !== null
        ? html`
            <div class="activity-tokens__bar">
              <div
                class="activity-tokens__fill ${percentage > 80 ? "warning" : ""}"
                style="width: ${Math.min(percentage, 100)}%"
              ></div>
            </div>
          `
        : nothing}
    </div>
  `;
}
```

---

### Phase 5: Actions & Interactions (Medium Priority)

#### 5.1 Custom Confirm Dialog

Replace `window.confirm()` with styled modal:

```typescript
function renderConfirmDialog(action: ActivityAction, onConfirm: () => void, onCancel: () => void) {
  return html`
    <div class="activity-confirm-overlay">
      <div class="activity-confirm-dialog">
        <div class="activity-confirm-dialog__header">
          <span class="activity-confirm-dialog__title">Confirm Action</span>
        </div>
        <div class="activity-confirm-dialog__body">
          <p>Are you sure you want to: <strong>${action.description}</strong>?</p>
        </div>
        <div class="activity-confirm-dialog__actions">
          <button class="btn" @click=${onCancel}>Cancel</button>
          <button class="btn ${action.variant}" @click=${onConfirm}>${action.label}</button>
        </div>
      </div>
    </div>
  `;
}
```

#### 5.2 Action Button States

- Loading spinner when action is executing
- Disabled state during execution
- Success/error feedback after completion

#### 5.3 Quick Actions

- "Copy summary" button
- "Export to markdown" button
- Keyboard shortcuts for common actions

---

### Phase 6: Grid Layout & Responsiveness (Lower Priority)

#### 6.1 Improved Grid

```css
.activities-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(400px, 1fr));
  gap: 16px;
  margin-top: 16px;
}

@media (max-width: 768px) {
  .activities-grid {
    grid-template-columns: 1fr;
  }
}
```

#### 6.2 Card Size Variations

- Compact mode for list view
- Expanded mode for detail view
- Option to switch between views

#### 6.3 Sorting & Filtering

- Sort by: Updated time, Task type, Status
- Filter by: Active only, Task type

---

### Phase 7: State Management (Lower Priority)

#### 7.1 Props Extension

```typescript
export type ActivitiesProps = {
  loading: boolean;
  activities: ActivityState[];
  error: string | null;
  basePath: string;
  onRefresh: () => void;
  onAction: (sessionKey: string, actionId: string, params?: Record<string, unknown>) => void;
  onOpenChat: (sessionKey: string) => void;
  // New props
  expandedSummaries: Set<string>; // Track which summaries are expanded
  onToggleSummary: (sessionKey: string) => void;
  actionInProgress: Map<string, string>; // sessionKey -> actionId
  confirmDialog: { sessionKey: string; action: ActivityAction } | null;
  onConfirmAction: () => void;
  onCancelAction: () => void;
};
```

---

## Implementation Priorities

### Sprint 1 (Immediate - 1-2 days)

1. ✅ Card structure redesign with header/body/actions sections
2. ✅ Summary truncation with expand/collapse
3. ✅ Task-type icons
4. ✅ CSS styling for new layout

### Sprint 2 (Short-term - 2-3 days)

1. Markdown rendering for summaries
2. Enhanced metrics display (token chips)
3. Improved progress bar
4. Status badge styling

### Sprint 3 (Medium-term - 3-5 days)

1. Enhanced checklist component
2. Timeline visualization
3. Custom confirm dialog
4. Action loading states

### Sprint 4 (Longer-term)

1. File tree visualization
2. Code diff preview
3. Sorting and filtering
4. Compact/expanded view toggle

---

## Files to Modify

1. **`ui/src/ui/views/activities.ts`** - Main view component
2. **`ui/src/styles/components.css`** - Add activity-specific styles
3. **`ui/src/ui/types.ts`** - Extend props types
4. **`ui/src/ui/controllers/activities.ts`** - Add state management
5. **`ui/src/ui/app.ts`** - Wire up new state
6. **`ui/src/ui/format.ts`** - Add token formatting helpers

---

## Success Metrics

- [ ] Summary text is readable with proper truncation
- [ ] Key metrics (tokens, model, status) visible at a glance
- [ ] Task types visually distinguishable
- [ ] Actions provide feedback during execution
- [ ] Mobile-friendly layout
- [ ] Performance: <50ms render time for 10 activities
