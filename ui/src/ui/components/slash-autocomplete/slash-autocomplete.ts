/**
 * Slash Command Autocomplete Component
 *
 * A dropdown autocomplete that appears when the user types "/" at the start
 * of their message or "@" anywhere in the message. Provides quick access to
 * slash commands and agent mentions.
 */

import { LitElement, html, css, nothing } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { icons } from "../../icons";

export interface SlashCommand {
  id: string;
  name: string;
  description: string;
  icon?: string;
  category?: "command" | "agent" | "action";
}

export interface AgentMention {
  id: string;
  name: string;
  displayName: string;
  status?: "active" | "idle" | "offline";
  avatar?: string;
}

export type AutocompleteSuggestion =
  | { type: "command"; command: SlashCommand }
  | { type: "agent"; agent: AgentMention };

@customElement("slash-autocomplete")
export class SlashAutocomplete extends LitElement {
  static styles = css`
    :host {
      display: block;
      position: absolute;
      bottom: 100%;
      left: 0;
      right: 0;
      z-index: 1000;
      pointer-events: none;
    }
    
    .autocomplete {
      pointer-events: auto;
      background: var(--bg-secondary, #1e1e1e);
      border: 1px solid var(--border, #333);
      border-radius: 8px;
      box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3);
      max-height: 280px;
      overflow-y: auto;
      margin-bottom: 8px;
    }
    
    .autocomplete__header {
      padding: 8px 12px;
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: var(--text-muted, #888);
      border-bottom: 1px solid var(--border, #333);
      position: sticky;
      top: 0;
      background: var(--bg-secondary, #1e1e1e);
    }
    
    .autocomplete__list {
      list-style: none;
      margin: 0;
      padding: 4px;
    }
    
    .autocomplete__item {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 8px 12px;
      cursor: pointer;
      border-radius: 6px;
      transition: background 0.1s ease;
    }
    
    .autocomplete__item:hover,
    .autocomplete__item--selected {
      background: var(--bg-hover, #2a2a2a);
    }
    
    .autocomplete__item--selected {
      background: var(--accent-bg, rgba(0, 122, 255, 0.15));
    }
    
    .autocomplete__icon {
      width: 20px;
      height: 20px;
      display: flex;
      align-items: center;
      justify-content: center;
      color: var(--text-muted, #888);
      flex-shrink: 0;
    }
    
    .autocomplete__icon svg {
      width: 16px;
      height: 16px;
    }
    
    .autocomplete__avatar {
      width: 24px;
      height: 24px;
      border-radius: 50%;
      background: var(--accent, #007aff);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 12px;
      font-weight: 600;
      color: white;
      flex-shrink: 0;
    }
    
    .autocomplete__avatar img {
      width: 100%;
      height: 100%;
      border-radius: 50%;
      object-fit: cover;
    }
    
    .autocomplete__content {
      flex: 1;
      min-width: 0;
    }
    
    .autocomplete__name {
      font-weight: 500;
      color: var(--text-primary, #fff);
      font-size: 14px;
    }
    
    .autocomplete__description {
      font-size: 12px;
      color: var(--text-muted, #888);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    
    .autocomplete__status {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      flex-shrink: 0;
    }
    
    .autocomplete__status--active {
      background: #34c759;
    }
    
    .autocomplete__status--idle {
      background: #ff9f0a;
    }
    
    .autocomplete__status--offline {
      background: #666;
    }
    
    .autocomplete__kbd {
      font-size: 11px;
      padding: 2px 6px;
      background: var(--bg-tertiary, #333);
      border-radius: 4px;
      color: var(--text-muted, #888);
    }
    
    .autocomplete__empty {
      padding: 16px;
      text-align: center;
      color: var(--text-muted, #888);
      font-size: 13px;
    }
  `;

  @property({ type: Boolean }) open = false;
  @property({ type: String }) query = "";
  @property({ type: String }) mode: "slash" | "mention" = "slash";
  @property({ type: Array }) commands: SlashCommand[] = [];
  @property({ type: Array }) agents: AgentMention[] = [];

  @state() private selectedIndex = 0;

  private get suggestions(): AutocompleteSuggestion[] {
    const q = this.query.toLowerCase();

    if (this.mode === "mention") {
      // Filter agents by query
      const filtered = this.agents.filter(
        (agent) =>
          agent.name.toLowerCase().includes(q) || agent.displayName.toLowerCase().includes(q),
      );
      return filtered.map((agent) => ({ type: "agent" as const, agent }));
    }

    // Filter commands by query
    const filtered = this.commands.filter(
      (cmd) => cmd.name.toLowerCase().includes(q) || cmd.description.toLowerCase().includes(q),
    );
    return filtered.map((command) => ({ type: "command" as const, command }));
  }

  updated(changed: Map<PropertyKey, unknown>) {
    if (changed.has("query") || changed.has("mode")) {
      this.selectedIndex = 0;
    }
  }

  /**
   * Handle keyboard navigation from parent
   */
  handleKeydown(e: KeyboardEvent): boolean {
    if (!this.open || this.suggestions.length === 0) {
      return false;
    }

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        this.selectedIndex = (this.selectedIndex + 1) % this.suggestions.length;
        return true;

      case "ArrowUp":
        e.preventDefault();
        this.selectedIndex =
          (this.selectedIndex - 1 + this.suggestions.length) % this.suggestions.length;
        return true;

      case "Tab":
      case "Enter":
        e.preventDefault();
        this.selectCurrent();
        return true;

      case "Escape":
        e.preventDefault();
        this.dispatchEvent(new CustomEvent("close"));
        return true;

      default:
        return false;
    }
  }

  private selectCurrent() {
    const suggestion = this.suggestions[this.selectedIndex];
    if (suggestion) {
      this.dispatchEvent(
        new CustomEvent("select", {
          detail: suggestion,
          bubbles: true,
          composed: true,
        }),
      );
    }
  }

  private handleItemClick(suggestion: AutocompleteSuggestion) {
    this.dispatchEvent(
      new CustomEvent("select", {
        detail: suggestion,
        bubbles: true,
        composed: true,
      }),
    );
  }

  private getIcon(iconName?: string) {
    if (!iconName) {
      return icons.zap;
    }
    return icons[iconName as keyof typeof icons] || icons.zap;
  }

  private renderAgentAvatar(agent: AgentMention) {
    if (agent.avatar) {
      return html`<img src=${agent.avatar} alt=${agent.displayName} />`;
    }
    // Show first letter of display name
    return agent.displayName.charAt(0).toUpperCase();
  }

  render() {
    if (!this.open) {
      return nothing;
    }

    const suggestions = this.suggestions;

    if (suggestions.length === 0) {
      return html`
        <div class="autocomplete">
          <div class="autocomplete__empty">
            ${this.mode === "mention" ? "No agents found" : "No commands found"}
          </div>
        </div>
      `;
    }

    const headerText = this.mode === "mention" ? "Mention Agent" : "Commands";

    return html`
      <div class="autocomplete">
        <div class="autocomplete__header">${headerText}</div>
        <ul class="autocomplete__list" role="listbox">
          ${suggestions.map((suggestion, index) => {
            const isSelected = index === this.selectedIndex;

            if (suggestion.type === "agent") {
              const agent = suggestion.agent;
              return html`
                <li
                  class="autocomplete__item ${isSelected ? "autocomplete__item--selected" : ""}"
                  role="option"
                  aria-selected=${isSelected}
                  @click=${() => this.handleItemClick(suggestion)}
                  @mouseenter=${() => (this.selectedIndex = index)}
                >
                  <div class="autocomplete__avatar">
                    ${this.renderAgentAvatar(agent)}
                  </div>
                  <div class="autocomplete__content">
                    <div class="autocomplete__name">@${agent.name}</div>
                    <div class="autocomplete__description">
                      ${agent.displayName}
                    </div>
                  </div>
                  ${
                    agent.status
                      ? html`<div
                        class="autocomplete__status autocomplete__status--${agent.status}"
                      ></div>`
                      : nothing
                  }
                </li>
              `;
            }

            const cmd = suggestion.command;
            return html`
              <li
                class="autocomplete__item ${isSelected ? "autocomplete__item--selected" : ""}"
                role="option"
                aria-selected=${isSelected}
                @click=${() => this.handleItemClick(suggestion)}
                @mouseenter=${() => (this.selectedIndex = index)}
              >
                <div class="autocomplete__icon">${this.getIcon(cmd.icon)}</div>
                <div class="autocomplete__content">
                  <div class="autocomplete__name">/${cmd.name}</div>
                  <div class="autocomplete__description">${cmd.description}</div>
                </div>
                <span class="autocomplete__kbd">Tab</span>
              </li>
            `;
          })}
        </ul>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "slash-autocomplete": SlashAutocomplete;
  }
}
