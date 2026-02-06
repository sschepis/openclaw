/**
 * Command Palette Type Definitions
 *
 * This module defines the core types for the command palette system,
 * including commands, sections, and search results.
 */

/**
 * Priority levels for commands and sections.
 * Higher priority items appear first in search results.
 */
export enum CommandPriority {
  LOW = -1,
  NORMAL = 0,
  HIGH = 1,
}

/**
 * A section groups related commands together in the palette UI.
 */
export interface CommandSection {
  /** Unique identifier for this section */
  id: string;

  /** Display name shown in the UI */
  name: string;

  /** Optional priority for ordering sections (higher = first) */
  priority?: CommandPriority;
}

/**
 * A command represents an action that can be executed from the palette.
 */
export interface Command {
  /** Unique identifier for this command */
  id: string;

  /** Display name shown in the UI */
  name: string;

  /** Optional description/subtitle */
  description?: string;

  /** Icon name from the icons registry */
  icon?: string;

  /**
   * Keyboard shortcut(s) to trigger this command.
   * Format: ["key"] for single key, ["$mod+key"] for Cmd/Ctrl+key
   * Multiple keys = key sequence (press in order)
   */
  shortcut?: string[];

  /**
   * Additional search keywords that match this command.
   * Useful for aliases and related terms.
   */
  keywords?: string[];

  /**
   * Section this command belongs to.
   * Can be a section ID string or full section object.
   */
  section?: string | CommandSection;

  /** Priority within the section (higher = first) */
  priority?: CommandPriority;

  /**
   * The action to perform when this command is executed.
   * Can be sync or async.
   * Optional if the command has children (navigates to children instead).
   */
  perform?: () => void | Promise<void>;

  /**
   * Condition for when this command is available.
   * If returns false, command is hidden from results.
   */
  when?: () => boolean;

  /**
   * If true, the command palette stays open after execution.
   * Default: false (closes after execution)
   */
  keepOpen?: boolean;

  /**
   * Dynamic child commands (for nested command palettes).
   * When selected, these become the new command list.
   */
  children?: () => Command[] | Promise<Command[]>;

  /**
   * If true, this command has children that should be loaded.
   * Used when children() is async and we want to show a loading state.
   */
  hasChildren?: boolean;
}

/**
 * A search result wraps a command with match metadata.
 */
export interface CommandSearchResult {
  /** The matched command */
  command: Command;

  /** Relevance score (higher = better match) */
  score: number;

  /** Indices of matched characters in the name */
  nameMatches?: number[];

  /** Indices of matched characters in keywords */
  keywordMatches?: number[];
}

/**
 * Grouped search results by section.
 */
export interface CommandSearchGroup {
  /** The section for this group */
  section: CommandSection;

  /** Commands in this section that match */
  results: CommandSearchResult[];
}

/**
 * State of the command palette.
 */
export interface CommandPaletteState {
  /** Whether the palette is currently open */
  isOpen: boolean;

  /** Current search query */
  query: string;

  /** Currently selected result index (for keyboard navigation) */
  selectedIndex: number;

  /** Breadcrumb trail for nested commands */
  breadcrumbs: Command[];

  /** Whether we're loading child commands */
  isLoading: boolean;
}

/**
 * Options for configuring the command palette.
 */
export interface CommandPaletteOptions {
  /** Keyboard shortcut to open the palette (default: "$mod+k") */
  toggleShortcut?: string;

  /** Maximum number of results to show (default: 10) */
  maxResults?: number;

  /** Placeholder text for the search input */
  placeholder?: string;

  /** Animation duration in ms (default: 150) */
  animationDuration?: number;

  /** Callbacks for lifecycle events */
  callbacks?: {
    onOpen?: () => void;
    onClose?: () => void;
    onQueryChange?: (query: string) => void;
    onSelectCommand?: (command: Command) => void;
  };
}

/**
 * Default sections used by built-in commands.
 */
export const DEFAULT_SECTIONS: Record<string, CommandSection> = {
  AGENTS: {
    id: "agents",
    name: "Agents",
    priority: CommandPriority.HIGH,
  },
  SESSIONS: {
    id: "sessions",
    name: "Sessions",
    priority: CommandPriority.HIGH,
  },
  NAVIGATION: {
    id: "navigation",
    name: "Navigation",
    priority: CommandPriority.NORMAL,
  },
  SETTINGS: {
    id: "settings",
    name: "Settings",
    priority: CommandPriority.NORMAL,
  },
  TOOLS: {
    id: "tools",
    name: "Tools",
    priority: CommandPriority.LOW,
  },
};

/**
 * Helper to check if a key event matches a shortcut.
 * Handles $mod for cross-platform Cmd/Ctrl.
 */
export function matchesShortcut(event: KeyboardEvent, shortcut: string): boolean {
  const parts = shortcut.toLowerCase().split("+");
  const key = parts[parts.length - 1];

  // Check modifiers
  const needsMod = parts.includes("$mod");
  const needsShift = parts.includes("shift");
  const needsAlt = parts.includes("alt");

  // $mod = Cmd on Mac, Ctrl elsewhere
  const isMac = navigator.platform.toLowerCase().includes("mac");
  const modKey = isMac ? event.metaKey : event.ctrlKey;

  if (needsMod && !modKey) return false;
  if (needsShift && !event.shiftKey) return false;
  if (needsAlt && !event.altKey) return false;

  // Check the actual key
  return event.key.toLowerCase() === key;
}

/**
 * Format a shortcut for display.
 * Converts $mod to ⌘ on Mac, Ctrl elsewhere.
 */
export function formatShortcut(shortcut: string[]): string {
  const isMac = navigator.platform.toLowerCase().includes("mac");

  return shortcut
    .map((key) => {
      return key
        .replace("$mod", isMac ? "⌘" : "Ctrl")
        .replace("shift", isMac ? "⇧" : "Shift")
        .replace("alt", isMac ? "⌥" : "Alt")
        .replace("enter", "↵")
        .replace("escape", "Esc")
        .replace("backspace", "⌫")
        .replace("arrowup", "↑")
        .replace("arrowdown", "↓")
        .replace("arrowleft", "←")
        .replace("arrowright", "→");
    })
    .join(" ");
}
