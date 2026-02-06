/**
 * Default Commands for Command Palette
 *
 * Registers the built-in commands for sessions, navigation, and settings.
 * These are registered when the app initializes.
 */

import type { Command } from "./command-types";
import { commandRegistry } from "./command-registry";
import { DEFAULT_SECTIONS, CommandPriority } from "./command-types";

/**
 * Context interface for commands that need app state.
 */
export interface CommandContext {
  // Session operations
  onNewSession: () => void;
  onSwitchSession: (sessionKey: string) => void;

  // Navigation
  onNavigate: (tab: string) => void;

  // Settings
  onOpenSettings: () => void;
  onToggleTheme: () => void;

  // Agents (for group chat)
  onAddAgent?: () => void;
  onRemoveAgent?: (handle: string) => void;
  onRenameAgent?: (handle: string) => void;

  // Current state
  getCurrentTab: () => string;
  getSessionKeys: () => Array<{ key: string; displayName: string }>;
  getGroupAgents?: () => Array<{ handle: string; displayName: string }>;
  isGroupChat?: () => boolean;
}

let currentContext: CommandContext | null = null;

/**
 * Initialize commands with the app context.
 */
export function initializeCommands(context: CommandContext): void {
  currentContext = context;
  registerDefaultCommands();
}

/**
 * Update the command context (e.g., when sessions change).
 */
export function updateCommandContext(partial: Partial<CommandContext>): void {
  if (currentContext) {
    currentContext = { ...currentContext, ...partial };
  }
}

/**
 * Register all default commands.
 */
function registerDefaultCommands(): void {
  commandRegistry.clear();

  // Session commands
  commandRegistry.register(
    {
      id: "session.new",
      name: "New Session",
      description: "Create a new chat session",
      icon: "plus",
      shortcut: ["$mod+n"],
      keywords: ["create", "start", "fresh"],
      section: DEFAULT_SECTIONS.SESSIONS,
      priority: CommandPriority.HIGH,
      perform: () => {
        currentContext?.onNewSession();
      },
    },
    {
      id: "session.switch",
      name: "Switch Session",
      description: "Switch to another chat session",
      icon: "messageSquare",
      shortcut: ["$mod+o"],
      keywords: ["open", "goto", "change"],
      section: DEFAULT_SECTIONS.SESSIONS,
      priority: CommandPriority.HIGH,
      hasChildren: true,
      children: () => {
        const sessions = currentContext?.getSessionKeys() ?? [];
        return sessions.map((session) => ({
          id: `session.switch.${session.key}`,
          name: session.displayName || session.key,
          icon: "messageSquare",
          section: DEFAULT_SECTIONS.SESSIONS,
          perform: () => {
            currentContext?.onSwitchSession(session.key);
          },
        }));
      },
    },
  );

  // Navigation commands
  commandRegistry.register(
    {
      id: "nav.chat",
      name: "Go to Chat",
      description: "Open the chat view",
      icon: "messageSquare",
      keywords: ["conversation", "talk"],
      section: DEFAULT_SECTIONS.NAVIGATION,
      perform: () => {
        currentContext?.onNavigate("chat");
      },
      when: () => currentContext?.getCurrentTab() !== "chat",
    },
    {
      id: "nav.sessions",
      name: "Go to Sessions",
      description: "View all sessions",
      icon: "layers",
      keywords: ["history", "list"],
      section: DEFAULT_SECTIONS.NAVIGATION,
      perform: () => {
        currentContext?.onNavigate("sessions");
      },
      when: () => currentContext?.getCurrentTab() !== "sessions",
    },
    {
      id: "nav.channels",
      name: "Go to Channels",
      description: "View messaging channels",
      icon: "radio",
      keywords: ["telegram", "discord", "slack", "whatsapp"],
      section: DEFAULT_SECTIONS.NAVIGATION,
      perform: () => {
        currentContext?.onNavigate("channels");
      },
      when: () => currentContext?.getCurrentTab() !== "channels",
    },
    {
      id: "nav.config",
      name: "Go to Configuration",
      description: "Open configuration settings",
      icon: "settings",
      shortcut: ["$mod+,"],
      keywords: ["preferences", "options"],
      section: DEFAULT_SECTIONS.NAVIGATION,
      perform: () => {
        currentContext?.onNavigate("config");
      },
      when: () => currentContext?.getCurrentTab() !== "config",
    },
    {
      id: "nav.skills",
      name: "Go to Skills",
      description: "View installed skills",
      icon: "puzzle",
      keywords: ["plugins", "extensions"],
      section: DEFAULT_SECTIONS.NAVIGATION,
      perform: () => {
        currentContext?.onNavigate("skills");
      },
      when: () => currentContext?.getCurrentTab() !== "skills",
    },
    {
      id: "nav.debug",
      name: "Go to Debug",
      description: "Open debug tools",
      icon: "bug",
      keywords: ["troubleshoot", "inspect"],
      section: DEFAULT_SECTIONS.NAVIGATION,
      perform: () => {
        currentContext?.onNavigate("debug");
      },
      when: () => currentContext?.getCurrentTab() !== "debug",
    },
    {
      id: "nav.logs",
      name: "Go to Logs",
      description: "View system logs",
      icon: "scrollText",
      keywords: ["console", "output"],
      section: DEFAULT_SECTIONS.NAVIGATION,
      perform: () => {
        currentContext?.onNavigate("logs");
      },
      when: () => currentContext?.getCurrentTab() !== "logs",
    },
  );

  // Settings/Tools commands
  commandRegistry.register(
    {
      id: "settings.open",
      name: "Open Settings",
      description: "Open session settings",
      icon: "settings",
      keywords: ["preferences", "configure"],
      section: DEFAULT_SECTIONS.SETTINGS,
      perform: () => {
        currentContext?.onOpenSettings();
      },
    },
    {
      id: "settings.theme",
      name: "Toggle Theme",
      description: "Switch between light and dark mode",
      icon: "monitor",
      keywords: ["dark", "light", "appearance"],
      section: DEFAULT_SECTIONS.SETTINGS,
      perform: () => {
        currentContext?.onToggleTheme();
      },
    },
  );

  // Agent commands (only shown in group chat)
  commandRegistry.register(
    {
      id: "agent.add",
      name: "Add Agent to Conversation",
      description: "Add a new agent worker to this group chat",
      icon: "userPlus",
      shortcut: ["$mod+shift+a"],
      keywords: ["spawn", "create", "worker"],
      section: DEFAULT_SECTIONS.AGENTS,
      priority: CommandPriority.HIGH,
      perform: () => {
        currentContext?.onAddAgent?.();
      },
      when: () => Boolean(currentContext?.isGroupChat?.() && currentContext?.onAddAgent),
    },
    {
      id: "agent.remove",
      name: "Remove Agent",
      description: "Remove an agent from this group chat",
      icon: "userMinus",
      keywords: ["delete", "dismiss"],
      section: DEFAULT_SECTIONS.AGENTS,
      hasChildren: true,
      children: () => {
        const agents = currentContext?.getGroupAgents?.() ?? [];
        return agents.map((agent) => ({
          id: `agent.remove.${agent.handle}`,
          name: `Remove @${agent.handle}`,
          description: agent.displayName,
          icon: "userMinus",
          section: DEFAULT_SECTIONS.AGENTS,
          perform: () => {
            currentContext?.onRemoveAgent?.(agent.handle);
          },
        }));
      },
      when: () => {
        const agents = currentContext?.getGroupAgents?.() ?? [];
        return agents.length > 0 && Boolean(currentContext?.onRemoveAgent);
      },
    },
    {
      id: "agent.list",
      name: "List Agents",
      description: "Show all agents in this group chat",
      icon: "users",
      keywords: ["view", "show", "members"],
      section: DEFAULT_SECTIONS.AGENTS,
      hasChildren: true,
      children: () => {
        const agents = currentContext?.getGroupAgents?.() ?? [];
        return agents.map((agent) => ({
          id: `agent.info.${agent.handle}`,
          name: `@${agent.handle}`,
          description: agent.displayName,
          icon: "users",
          section: DEFAULT_SECTIONS.AGENTS,
          perform: () => {
            // Just close the palette - could show agent details in future
          },
        }));
      },
      when: () => Boolean(currentContext?.isGroupChat?.()),
    },
  );
}

/**
 * Get all registered commands (for testing/debugging).
 */
export function getRegisteredCommands(): Command[] {
  return commandRegistry.getAll();
}
