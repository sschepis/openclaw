/**
 * Default Slash Commands
 *
 * These are the built-in slash commands available in the chat input.
 * Commands can trigger actions, switch modes, or invoke special behaviors.
 */

import type { SlashCommand } from "./slash-autocomplete";

/**
 * Built-in slash commands available in all sessions
 */
export const DEFAULT_SLASH_COMMANDS: SlashCommand[] = [
  {
    id: "add",
    name: "add",
    description: "Add a new agent to the conversation",
    icon: "userPlus",
    category: "command",
  },
  {
    id: "stop",
    name: "stop",
    description: "Stop the current agent run",
    icon: "x",
    category: "command",
  },
  {
    id: "new",
    name: "new",
    description: "Start a new session",
    icon: "plus",
    category: "command",
  },
  {
    id: "agents",
    name: "agents",
    description: "List agents in this conversation",
    icon: "users",
    category: "command",
  },
  {
    id: "clear",
    name: "clear",
    description: "Clear conversation history",
    icon: "trash",
    category: "command",
  },
  {
    id: "export",
    name: "export",
    description: "Export conversation to file",
    icon: "download",
    category: "command",
  },
  {
    id: "help",
    name: "help",
    description: "Show available commands and shortcuts",
    icon: "helpCircle",
    category: "command",
  },
  {
    id: "settings",
    name: "settings",
    description: "Open session settings",
    icon: "settings",
    category: "command",
  },
  {
    id: "thinking",
    name: "thinking",
    description: "Toggle thinking/tool visibility",
    icon: "eye",
    category: "command",
  },
  {
    id: "focus",
    name: "focus",
    description: "Toggle focus mode",
    icon: "maximize",
    category: "command",
  },
];

/**
 * Group chat specific slash commands
 */
export const GROUP_CHAT_SLASH_COMMANDS: SlashCommand[] = [
  {
    id: "add-agent",
    name: "add-agent",
    description: "Add a new agent to this conversation",
    icon: "userPlus",
    category: "action",
  },
  {
    id: "remove-agent",
    name: "remove-agent",
    description: "Remove an agent from this conversation",
    icon: "userMinus",
    category: "action",
  },
  {
    id: "rename-agent",
    name: "rename-agent",
    description: "Rename an agent in this conversation",
    icon: "edit",
    category: "action",
  },
  {
    id: "status",
    name: "status",
    description: "Show status of all agents",
    icon: "activity",
    category: "action",
  },
  {
    id: "assign",
    name: "assign",
    description: "Assign a task to a specific agent",
    icon: "userCheck",
    category: "action",
  },
  {
    id: "broadcast",
    name: "broadcast",
    description: "Send message to all agents",
    icon: "radio",
    category: "action",
  },
];

/**
 * Get all available slash commands for a session
 */
export function getSlashCommands(isGroupChat: boolean): SlashCommand[] {
  if (isGroupChat) {
    return [...DEFAULT_SLASH_COMMANDS, ...GROUP_CHAT_SLASH_COMMANDS];
  }
  return DEFAULT_SLASH_COMMANDS;
}
