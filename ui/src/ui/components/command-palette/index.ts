/**
 * Command Palette Module
 *
 * Exports all public types and components for the command palette.
 */

// Types
export type {
  Command,
  CommandSection,
  CommandSearchResult,
  CommandSearchGroup,
  CommandPaletteState,
  CommandPaletteOptions,
} from "./command-types";

export {
  CommandPriority,
  DEFAULT_SECTIONS,
  matchesShortcut,
  formatShortcut,
} from "./command-types";

// Registry
export {
  CommandRegistry,
  commandRegistry,
  registerCommands,
  createCommand,
  createSectionCommands,
} from "./command-registry";

// Default commands
export type { CommandContext } from "./default-commands";
export {
  initializeCommands,
  updateCommandContext,
  getRegisteredCommands,
} from "./default-commands";

// Component
export { CommandPalette } from "./command-palette";
