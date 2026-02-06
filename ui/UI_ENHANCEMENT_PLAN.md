# UI Enhancement Plan for OpenClaw

## Executive Summary

This document outlines a comprehensive UI enhancement plan based on analysis of the existing codebase, the GAP_ANALYSIS.md findings, and implementation of initial improvements. The goal is to improve user experience through better accessibility, visual polish, and interaction patterns.

---

## Current State Analysis

### Strengths

1. **Solid Foundation**: Lit-based component architecture with good separation of concerns
2. **Design System**: Comprehensive CSS variables for colors, spacing, shadows, and transitions
3. **Dark/Light Theme**: Full theme support with `[data-theme="light"]` selectors
4. **Component Library**: Modular views in `ui/src/ui/views/`, reusable components in `ui/src/ui/components/`
5. **Toast System**: Already implemented notification system at `ui/src/ui/components/toast/toast.ts`
6. **Skeleton Loading**: Loading states with skeleton UI patterns

### Areas for Improvement

Based on GAP_ANALYSIS.md and code review:

1. **Accessibility**: Missing ARIA labels on icon buttons, focus trapping in modals
2. **Micro-interactions**: Code blocks lack copy buttons
3. **State Management**: Monolithic state in `app.ts` (130+ `@state()` properties)
4. **Mobile Experience**: Touch targets may be too small on some buttons
5. **Visual Polish**: Missing subtle animations and transitions

---

## Implemented Enhancements

### 1. ARIA Labels for Icon Buttons (COMPLETED)

**Files Modified:**
- [`ui/src/ui/views/chat.ts`](ui/src/ui/views/chat.ts:663-679)

**Changes:**
- Added `aria-label` attributes to New Session, Settings, Attach File, and Microphone toggle buttons
- Ensures screen readers can announce button purposes

**Example:**
```typescript
<button
  class="btn--icon"
  @click=${props.onNewSession}
  title="New Session"
  aria-label="New Session"
>
  ${icons.plus}
</button>
```

### 2. Copy Button Component (CREATED)

**Files Created:**
- [`ui/src/ui/components/copy-button.ts`](ui/src/ui/components/copy-button.ts)
- [`ui/src/styles/copy-button.css`](ui/src/styles/copy-button.css)

**Features:**
- `copyToClipboard(text)` - Async function with clipboard API fallback
- `renderCopyButton(text, options)` - Lit template for copy button
- `createCopyButtonElement(text)` - Vanilla DOM creation for integration with markdown renderer
- Visual feedback states: idle, copying, success, error
- Positioned variant for code blocks with hover-to-reveal

### 3. Focus Trap Utility (CREATED)

**Files Created:**
- [`ui/src/ui/utils/focus-trap.ts`](ui/src/ui/utils/focus-trap.ts)

**Features:**
- `createFocusTrap(container)` - Returns activate/deactivate methods
- `trapFocus(container, onClose)` - One-liner with cleanup
- Handles Tab cycling, Shift+Tab reverse cycling
- Escape key to close
- Returns focus to original element on deactivate

### 4. Design Tokens Extension (CREATED)

**Files Modified:**
- [`ui/src/styles/base.css`](ui/src/styles/base.css)

**New Variables:**
```css
/* Spacing scale */
--space-1 through --space-16

/* Typography scale */
--text-xs through --text-3xl
--font-weight-normal/medium/semibold/bold
--line-height-tight/normal/relaxed

/* Touch targets */
--touch-target-min: 44px
```

---

## Recommended Next Steps

### Phase 1: Core UX Improvements (Priority: High)

#### 1.1 Integrate Copy Buttons into Code Blocks

**Goal:** Add copy-to-clipboard functionality to all code blocks in chat

**Files to Modify:**
- `ui/src/ui/markdown.ts` - Inject copy button into `<pre>` elements during markdown rendering
- `ui/src/ui/chat/grouped-render.ts` - Ensure copy buttons work in streamed content

**Implementation:**
```typescript
import { createCopyButtonElement } from "../components/copy-button";

// In markdown renderer, after creating <pre> element:
const copyBtn = createCopyButtonElement(codeText);
preElement.style.position = "relative";
preElement.appendChild(copyBtn);
```

#### 1.2 Focus Trap for Modals

**Goal:** Ensure keyboard users cannot tab out of modal dialogs

**Files to Modify:**
- `ui/src/ui/views/exec-approval.ts`
- `ui/src/ui/views/session-delete-confirm.ts`
- `ui/src/ui/views/add-agent-modal.ts`
- `ui/src/ui/components/command-palette/command-palette.ts`

**Implementation Pattern:**
```typescript
import { trapFocus } from "../utils/focus-trap";

// In modal open handler:
private cleanup: (() => void) | null = null;

openModal() {
  this.cleanup = trapFocus(this.modalElement, () => this.closeModal());
}

closeModal() {
  this.cleanup?.();
  this.cleanup = null;
}
```

#### 1.3 Toast Notifications for User Feedback

**Goal:** Provide visual feedback for async operations

**Files to Modify:**
- `ui/src/ui/controllers/sessions.ts` - Session rename success/error
- `ui/src/ui/controllers/files.ts` - File save success/error
- `ui/src/ui/controllers/skills.ts` - Skill enable/disable feedback

**Implementation:**
```typescript
import { toast } from "../components/toast/toast";

// After successful operation:
toast.success("Session renamed successfully");

// After error:
toast.error("Failed to save file");
```

### Phase 2: Visual Polish (Priority: Medium)

#### 2.1 Button Hover/Active States

**Goal:** Add micro-interactions to buttons

**Files to Modify:**
- `ui/src/styles/components.css`

**Additions:**
```css
.btn {
  transition: transform 100ms ease, box-shadow 100ms ease;
}

.btn:active:not(:disabled) {
  transform: scale(0.98);
}

.btn--icon:hover:not(:disabled) {
  background: var(--surface-hover);
}
```

#### 2.2 Skeleton Loading Improvements

**Goal:** More accurate skeleton shapes matching final content

**Files to Modify:**
- `ui/src/ui/views/chat.ts` - Chat message skeletons
- `ui/src/styles/components.css` - Skeleton animation refinements

#### 2.3 Scroll Shadows

**Goal:** Indicate scrollable content

**Implementation:**
```css
.chat-thread {
  mask-image: linear-gradient(
    to bottom,
    transparent 0,
    black 20px,
    black calc(100% - 20px),
    transparent 100%
  );
}
```

### Phase 3: Accessibility Deep Dive (Priority: High)

#### 3.1 Keyboard Navigation Audit

**Files to Review:**
- All interactive components for proper `tabindex`
- Command palette keyboard handling
- Chat compose area shortcuts

#### 3.2 Screen Reader Testing

**Actions:**
- Test with VoiceOver (macOS) and NVDA (Windows)
- Ensure all dynamic content has `aria-live` regions
- Verify form labels and descriptions

#### 3.3 Color Contrast Verification

**Tool:** Use axe-core or similar to audit contrast ratios

### Phase 4: State Management Refactor (Priority: Medium-Low)

#### 4.1 Extract Domain Slices

**Goal:** Reduce monolithic `app.ts` state

**Proposed Structure:**
```
ui/src/ui/state/
├── chat-state.ts      # Chat-specific state
├── sessions-state.ts  # Sessions management
├── channels-state.ts  # Channels/connections
├── skills-state.ts    # Skills configuration
└── ui-state.ts        # UI-only state (modals, navigation)
```

---

## Implementation Checklist

### Immediate (This Sprint)

- [x] Add ARIA labels to icon buttons
- [x] Create copy button component
- [x] Create focus trap utility
- [x] Add spacing/typography tokens
- [ ] Integrate copy buttons into code blocks
- [ ] Add focus trap to exec approval modal
- [ ] Add toast notifications for session operations

### Short-term (Next 2 Sprints)

- [ ] Focus trap for all modals
- [ ] Toast notifications for all async operations
- [ ] Button micro-interactions
- [ ] Keyboard navigation audit
- [ ] Screen reader testing

### Medium-term (Next Quarter)

- [ ] State management refactor
- [ ] Performance optimization (virtualized lists)
- [ ] Mobile-specific touch improvements
- [ ] Animation polish

---

## Technical Debt to Address

1. **Type Safety**: Many `any` casts in view files (see GAP_ANALYSIS.md)
2. **Test Coverage**: UI components lack unit tests
3. **Documentation**: Component API documentation needed
4. **Bundle Size**: Consider code-splitting for large views

---

## Metrics to Track

1. **Lighthouse Accessibility Score**: Target 95+
2. **Time to Interactive**: Track initial load performance
3. **User Error Rate**: Monitor toast error frequency
4. **Mobile Usability**: Touch target hit rates

---

## Conclusion

This enhancement plan prioritizes accessibility and UX improvements while building reusable infrastructure (copy button, focus trap, design tokens) that can be leveraged across the application. The phased approach allows for incremental delivery while maintaining code quality.

Files created during this analysis:
- `ui/src/ui/components/copy-button.ts`
- `ui/src/styles/copy-button.css`
- `ui/src/ui/utils/focus-trap.ts`
- Modified `ui/src/styles/base.css` with design tokens
- Modified `ui/src/ui/views/chat.ts` with ARIA labels
