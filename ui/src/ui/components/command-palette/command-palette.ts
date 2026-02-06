/**
 * Command Palette Component
 *
 * A keyboard-driven command palette inspired by VS Code, Raycast, and kbar.
 * Built as a Lit web component for the OpenClaw UI.
 */

import { LitElement, html, css, nothing, type PropertyValues } from "lit";
import { customElement, property, state, query } from "lit/decorators.js";
import { repeat } from "lit/directives/repeat.js";
import { classMap } from "lit/directives/class-map.js";

import type {
  Command,
  CommandSearchGroup,
  CommandSearchResult,
  CommandPaletteOptions,
} from "./command-types";
import { formatShortcut, matchesShortcut } from "./command-types";
import { commandRegistry } from "./command-registry";
import { icons } from "../../icons";

/**
 * Command Palette Web Component
 *
 * Usage:
 * ```html
 * <command-palette
 *   .open=${true}
 *   @close=${() => this.open = false}
 * ></command-palette>
 * ```
 */
@customElement("command-palette")
export class CommandPalette extends LitElement {
  /**
   * Whether the palette is currently open.
   */
  @property({ type: Boolean, reflect: true })
  open = false;

  /**
   * Configuration options.
   */
  @property({ type: Object })
  options: CommandPaletteOptions = {};

  /**
   * Current search query.
   */
  @state()
  private query = "";

  /**
   * Search results grouped by section.
   */
  @state()
  private results: CommandSearchGroup[] = [];

  /**
   * Currently selected result index (flat index across all groups).
   */
  @state()
  private selectedIndex = 0;

  /**
   * Breadcrumb trail for nested commands.
   */
  @state()
  private breadcrumbs: Command[] = [];

  /**
   * Whether we're loading child commands.
   */
  @state()
  private isLoading = false;

  /**
   * Reference to the search input element.
   */
  @query(".command-palette__input")
  private inputEl!: HTMLInputElement;

  /**
   * Reference to the results container for scrolling.
   */
  @query(".command-palette__results")
  private resultsEl!: HTMLElement;

  private unsubscribe: (() => void) | null = null;
  private keydownHandler: ((e: KeyboardEvent) => void) | null = null;

  static styles = css`
    :host {
      display: contents;
    }

    .command-palette__backdrop {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.5);
      z-index: 9999;
      opacity: 0;
      transition: opacity 150ms ease-out;
      pointer-events: none;
    }

    .command-palette__backdrop--open {
      opacity: 1;
      pointer-events: auto;
    }

    .command-palette__container {
      position: fixed;
      top: 20%;
      left: 50%;
      transform: translateX(-50%) translateY(-10px);
      width: min(560px, calc(100vw - 32px));
      max-height: min(420px, calc(100vh - 100px));
      background: var(--card-bg, #1e1e1e);
      border: 1px solid var(--border, #333);
      border-radius: 12px;
      box-shadow: 0 16px 48px rgba(0, 0, 0, 0.4);
      z-index: 10000;
      display: flex;
      flex-direction: column;
      overflow: hidden;
      opacity: 0;
      transition: opacity 150ms ease-out, transform 150ms ease-out;
      pointer-events: none;
    }

    .command-palette__container--open {
      opacity: 1;
      transform: translateX(-50%) translateY(0);
      pointer-events: auto;
    }

    .command-palette__header {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 12px 16px;
      border-bottom: 1px solid var(--border, #333);
    }

    .command-palette__icon {
      color: var(--muted, #888);
      flex-shrink: 0;
    }

    .command-palette__icon svg {
      width: 18px;
      height: 18px;
    }

    .command-palette__input {
      flex: 1;
      background: transparent;
      border: none;
      outline: none;
      font-size: 15px;
      color: var(--text, #fff);
      font-family: inherit;
    }

    .command-palette__input::placeholder {
      color: var(--muted, #888);
    }

    .command-palette__shortcut {
      font-size: 12px;
      color: var(--muted, #888);
      background: var(--bg-secondary, #2a2a2a);
      padding: 2px 6px;
      border-radius: 4px;
      font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, monospace;
    }

    .command-palette__breadcrumbs {
      display: flex;
      align-items: center;
      gap: 4px;
      padding: 8px 16px;
      border-bottom: 1px solid var(--border, #333);
      font-size: 13px;
      color: var(--muted, #888);
    }

    .command-palette__breadcrumb {
      display: flex;
      align-items: center;
      gap: 4px;
    }

    .command-palette__breadcrumb-link {
      color: var(--accent, #0a84ff);
      cursor: pointer;
    }

    .command-palette__breadcrumb-link:hover {
      text-decoration: underline;
    }

    .command-palette__breadcrumb-separator {
      color: var(--muted, #888);
    }

    .command-palette__results {
      flex: 1;
      overflow-y: auto;
      padding: 8px 0;
    }

    .command-palette__section {
      padding: 4px 0;
    }

    .command-palette__section-label {
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: var(--muted, #888);
      padding: 8px 16px 4px;
    }

    .command-palette__item {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 8px 16px;
      cursor: pointer;
      transition: background 100ms ease;
    }

    .command-palette__item:hover,
    .command-palette__item--selected {
      background: var(--bg-hover, #2a2a2a);
    }

    .command-palette__item--selected {
      background: var(--accent-bg, rgba(10, 132, 255, 0.15));
    }

    .command-palette__item-icon {
      flex-shrink: 0;
      width: 20px;
      height: 20px;
      display: flex;
      align-items: center;
      justify-content: center;
      color: var(--muted, #888);
    }

    .command-palette__item-icon svg {
      width: 16px;
      height: 16px;
    }

    .command-palette__item-content {
      flex: 1;
      min-width: 0;
    }

    .command-palette__item-name {
      font-size: 14px;
      color: var(--text, #fff);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .command-palette__item-name mark {
      background: var(--accent, #0a84ff);
      color: inherit;
      border-radius: 2px;
      padding: 0 1px;
    }

    .command-palette__item-description {
      font-size: 12px;
      color: var(--muted, #888);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      margin-top: 2px;
    }

    .command-palette__item-shortcut {
      flex-shrink: 0;
      font-size: 12px;
      color: var(--muted, #888);
      font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, monospace;
    }

    .command-palette__item-arrow {
      flex-shrink: 0;
      color: var(--muted, #888);
    }

    .command-palette__item-arrow svg {
      width: 14px;
      height: 14px;
    }

    .command-palette__empty {
      padding: 24px 16px;
      text-align: center;
      color: var(--muted, #888);
      font-size: 14px;
    }

    .command-palette__loading {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      padding: 24px 16px;
      color: var(--muted, #888);
      font-size: 14px;
    }

    .command-palette__footer {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 8px 16px;
      border-top: 1px solid var(--border, #333);
      font-size: 12px;
      color: var(--muted, #888);
    }

    .command-palette__footer-hints {
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .command-palette__footer-hint {
      display: flex;
      align-items: center;
      gap: 4px;
    }

    .command-palette__footer-hint kbd {
      background: var(--bg-secondary, #2a2a2a);
      padding: 2px 5px;
      border-radius: 3px;
      font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, monospace;
      font-size: 11px;
    }

    @keyframes spin {
      to {
        transform: rotate(360deg);
      }
    }

    .command-palette__spinner {
      animation: spin 1s linear infinite;
    }
  `;

  connectedCallback(): void {
    super.connectedCallback();

    // Subscribe to registry changes
    this.unsubscribe = commandRegistry.subscribe(() => {
      this.updateResults();
    });

    // Global keydown handler for shortcuts
    this.keydownHandler = (e: KeyboardEvent) => {
      const toggleShortcut = this.options.toggleShortcut ?? "$mod+k";

      if (matchesShortcut(e, toggleShortcut)) {
        e.preventDefault();
        this.toggle();
        return;
      }

      // Handle escape when open
      if (this.open && e.key === "Escape") {
        e.preventDefault();
        this.close();
        return;
      }
    };

    document.addEventListener("keydown", this.keydownHandler);
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();

    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }

    if (this.keydownHandler) {
      document.removeEventListener("keydown", this.keydownHandler);
      this.keydownHandler = null;
    }
  }

  protected updated(changedProperties: PropertyValues): void {
    if (changedProperties.has("open")) {
      if (this.open) {
        this.onOpen();
      } else {
        this.onClose();
      }
    }
  }

  private onOpen(): void {
    this.query = "";
    this.selectedIndex = 0;
    this.breadcrumbs = [];
    this.updateResults();

    // Focus input after render
    requestAnimationFrame(() => {
      this.inputEl?.focus();
    });

    this.options.callbacks?.onOpen?.();
  }

  private onClose(): void {
    this.options.callbacks?.onClose?.();
  }

  /**
   * Open the command palette.
   */
  show(): void {
    this.open = true;
  }

  /**
   * Close the command palette.
   */
  close(): void {
    this.open = false;
    this.dispatchEvent(new CustomEvent("close"));
  }

  /**
   * Toggle the command palette.
   */
  toggle(): void {
    if (this.open) {
      this.close();
    } else {
      this.show();
    }
  }

  private updateResults(): void {
    const maxResults = this.options.maxResults ?? 10;
    this.results = commandRegistry.search(this.query, maxResults);

    // Reset selection if out of bounds
    const totalResults = this.getTotalResultCount();
    if (this.selectedIndex >= totalResults) {
      this.selectedIndex = Math.max(0, totalResults - 1);
    }
  }

  private getTotalResultCount(): number {
    return this.results.reduce((sum, group) => sum + group.results.length, 0);
  }

  private getResultAtIndex(index: number): CommandSearchResult | null {
    let current = 0;
    for (const group of this.results) {
      for (const result of group.results) {
        if (current === index) {
          return result;
        }
        current++;
      }
    }
    return null;
  }

  private handleInput(e: InputEvent): void {
    const target = e.target as HTMLInputElement;
    this.query = target.value;
    this.selectedIndex = 0;
    this.updateResults();
    this.options.callbacks?.onQueryChange?.(this.query);
  }

  private handleKeydown(e: KeyboardEvent): void {
    const totalResults = this.getTotalResultCount();

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        this.selectedIndex = (this.selectedIndex + 1) % Math.max(1, totalResults);
        this.scrollSelectedIntoView();
        break;

      case "ArrowUp":
        e.preventDefault();
        this.selectedIndex =
          (this.selectedIndex - 1 + Math.max(1, totalResults)) %
          Math.max(1, totalResults);
        this.scrollSelectedIntoView();
        break;

      case "Enter":
        e.preventDefault();
        this.executeSelected();
        break;

      case "Backspace":
        if (!this.query && this.breadcrumbs.length > 0) {
          e.preventDefault();
          this.popBreadcrumb();
        }
        break;

      case "Tab":
        e.preventDefault();
        // Tab into children if available
        const selected = this.getResultAtIndex(this.selectedIndex);
        if (selected?.command.children || selected?.command.hasChildren) {
          this.navigateToChildren(selected.command);
        }
        break;
    }
  }

  private scrollSelectedIntoView(): void {
    requestAnimationFrame(() => {
      const selectedEl = this.resultsEl?.querySelector(
        ".command-palette__item--selected",
      );
      if (selectedEl) {
        selectedEl.scrollIntoView({ block: "nearest" });
      }
    });
  }

  private async executeSelected(): Promise<void> {
    const result = this.getResultAtIndex(this.selectedIndex);
    if (!result) return;

    const { command } = result;

    // If command has children, navigate into them
    if (command.children || command.hasChildren) {
      await this.navigateToChildren(command);
      return;
    }

    // Execute the command
    this.options.callbacks?.onSelectCommand?.(command);

    if (command.perform) {
      try {
        await command.perform();
      } catch (e) {
        console.error("[CommandPalette] Command execution error:", e);
      }
    }

    // Close unless keepOpen is set
    if (!command.keepOpen) {
      this.close();
    }
  }

  private async navigateToChildren(command: Command): Promise<void> {
    if (!command.children) return;

    this.isLoading = true;
    this.breadcrumbs = [...this.breadcrumbs, command];

    try {
      const children = await command.children();

      // Temporarily replace registry commands with children
      // (In a more complete implementation, we'd have a separate command stack)
      commandRegistry.clear();
      commandRegistry.register(...children);

      this.query = "";
      this.selectedIndex = 0;
      this.updateResults();
    } finally {
      this.isLoading = false;
    }
  }

  private popBreadcrumb(): void {
    if (this.breadcrumbs.length === 0) return;

    this.breadcrumbs = this.breadcrumbs.slice(0, -1);

    // TODO: Restore previous command set
    // For now, this just clears the breadcrumb
    this.query = "";
    this.selectedIndex = 0;
    this.updateResults();
  }

  private handleBackdropClick(e: MouseEvent): void {
    if (e.target === e.currentTarget) {
      this.close();
    }
  }

  private handleItemClick(index: number): void {
    this.selectedIndex = index;
    this.executeSelected();
  }

  private handleItemMouseEnter(index: number): void {
    this.selectedIndex = index;
  }

  /**
   * Highlight matched characters in text.
   */
  private highlightMatches(
    text: string,
    matches: number[] | undefined,
  ): unknown {
    if (!matches || matches.length === 0) {
      return text;
    }

    const parts: unknown[] = [];
    let lastIndex = 0;

    for (const matchIndex of matches) {
      if (matchIndex > lastIndex) {
        parts.push(text.slice(lastIndex, matchIndex));
      }
      parts.push(html`<mark>${text[matchIndex]}</mark>`);
      lastIndex = matchIndex + 1;
    }

    if (lastIndex < text.length) {
      parts.push(text.slice(lastIndex));
    }

    return parts;
  }

  private renderBreadcrumbs() {
    if (this.breadcrumbs.length === 0) {
      return nothing;
    }

    return html`
      <div class="command-palette__breadcrumbs">
        ${this.breadcrumbs.map(
          (cmd, i) => html`
            <span class="command-palette__breadcrumb">
              <span
                class="command-palette__breadcrumb-link"
                @click=${() => {
                  this.breadcrumbs = this.breadcrumbs.slice(0, i);
                  this.updateResults();
                }}
              >
                ${cmd.name}
              </span>
              <span class="command-palette__breadcrumb-separator">/</span>
            </span>
          `,
        )}
      </div>
    `;
  }

  private renderResults() {
    if (this.isLoading) {
      return html`
        <div class="command-palette__loading">
          <span class="command-palette__spinner">${icons.loader}</span>
          Loading...
        </div>
      `;
    }

    const totalResults = this.getTotalResultCount();

    if (totalResults === 0) {
      return html`
        <div class="command-palette__empty">
          ${this.query
            ? `No commands found for "${this.query}"`
            : "No commands available"}
        </div>
      `;
    }

    let flatIndex = 0;

    return html`
      ${repeat(
        this.results,
        (group) => group.section.id,
        (group) => html`
          <div class="command-palette__section">
            <div class="command-palette__section-label">
              ${group.section.name}
            </div>
            ${repeat(
              group.results,
              (result) => result.command.id,
              (result) => {
                const index = flatIndex++;
                const isSelected = index === this.selectedIndex;

                return html`
                  <div
                    class=${classMap({
                      "command-palette__item": true,
                      "command-palette__item--selected": isSelected,
                    })}
                    @click=${() => this.handleItemClick(index)}
                    @mouseenter=${() => this.handleItemMouseEnter(index)}
                  >
                    ${result.command.icon
                      ? html`
                          <span class="command-palette__item-icon">
                            ${icons[result.command.icon as keyof typeof icons] ??
                            icons.zap}
                          </span>
                        `
                      : nothing}
                    <div class="command-palette__item-content">
                      <div class="command-palette__item-name">
                        ${this.highlightMatches(
                          result.command.name,
                          result.nameMatches,
                        )}
                      </div>
                      ${result.command.description
                        ? html`
                            <div class="command-palette__item-description">
                              ${result.command.description}
                            </div>
                          `
                        : nothing}
                    </div>
                    ${result.command.shortcut
                      ? html`
                          <span class="command-palette__item-shortcut">
                            ${formatShortcut(result.command.shortcut)}
                          </span>
                        `
                      : nothing}
                    ${result.command.children || result.command.hasChildren
                      ? html`
                          <span class="command-palette__item-arrow">
                            ${icons.chevronRight}
                          </span>
                        `
                      : nothing}
                  </div>
                `;
              },
            )}
          </div>
        `,
      )}
    `;
  }

  render() {
    const placeholder =
      this.options.placeholder ?? "Search commands...";

    return html`
      <div
        class=${classMap({
          "command-palette__backdrop": true,
          "command-palette__backdrop--open": this.open,
        })}
        @click=${this.handleBackdropClick}
      >
        <div
          class=${classMap({
            "command-palette__container": true,
            "command-palette__container--open": this.open,
          })}
        >
          <div class="command-palette__header">
            <span class="command-palette__icon">${icons.search}</span>
            <input
              class="command-palette__input"
              type="text"
              .value=${this.query}
              @input=${this.handleInput}
              @keydown=${this.handleKeydown}
              placeholder=${placeholder}
              autocomplete="off"
              autocorrect="off"
              autocapitalize="off"
              spellcheck="false"
            />
            <span class="command-palette__shortcut">Esc</span>
          </div>

          ${this.renderBreadcrumbs()}

          <div class="command-palette__results">
            ${this.renderResults()}
          </div>

          <div class="command-palette__footer">
            <div class="command-palette__footer-hints">
              <span class="command-palette__footer-hint">
                <kbd>↑↓</kbd> navigate
              </span>
              <span class="command-palette__footer-hint">
                <kbd>↵</kbd> select
              </span>
              <span class="command-palette__footer-hint">
                <kbd>Tab</kbd> expand
              </span>
            </div>
          </div>
        </div>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "command-palette": CommandPalette;
  }
}
