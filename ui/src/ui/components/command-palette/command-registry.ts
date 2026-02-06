/**
 * Command Registry
 *
 * Manages the registration and search of commands for the command palette.
 * Implements fuzzy search for matching user queries against command names
 * and keywords.
 */

import type {
  Command,
  CommandSearchResult,
  CommandSearchGroup,
  CommandSection,
  CommandPriority,
} from "./command-types";
import { DEFAULT_SECTIONS } from "./command-types";

/**
 * Simple fuzzy match implementation.
 * Returns a score (higher = better match) and the matched character indices.
 */
function fuzzyMatch(
  query: string,
  target: string,
): { score: number; matches: number[] } | null {
  const queryLower = query.toLowerCase();
  const targetLower = target.toLowerCase();

  if (!query) {
    return { score: 0, matches: [] };
  }

  const matches: number[] = [];
  let queryIdx = 0;
  let lastMatchIdx = -1;
  let score = 0;

  for (let i = 0; i < targetLower.length && queryIdx < queryLower.length; i++) {
    if (targetLower[i] === queryLower[queryIdx]) {
      matches.push(i);

      // Bonus for consecutive matches
      if (lastMatchIdx === i - 1) {
        score += 5;
      }

      // Bonus for matching at word boundaries
      if (i === 0 || /\s/.test(target[i - 1]) || /[A-Z]/.test(target[i])) {
        score += 3;
      }

      // Base score for match
      score += 1;

      lastMatchIdx = i;
      queryIdx++;
    }
  }

  // Only return if all query characters were matched
  if (queryIdx === queryLower.length) {
    // Bonus for shorter targets (more specific matches)
    score += Math.max(0, 10 - target.length / 5);

    // Bonus for exact prefix match
    if (targetLower.startsWith(queryLower)) {
      score += 10;
    }

    return { score, matches };
  }

  return null;
}

/**
 * Resolve a section from either a string ID or section object.
 */
function resolveSection(
  section: string | CommandSection | undefined,
): CommandSection {
  if (!section) {
    return DEFAULT_SECTIONS.TOOLS;
  }

  if (typeof section === "string") {
    return (
      Object.values(DEFAULT_SECTIONS).find((s) => s.id === section) ?? {
        id: section,
        name: section.charAt(0).toUpperCase() + section.slice(1),
        priority: 0,
      }
    );
  }

  return section;
}

/**
 * Command Registry class for managing and searching commands.
 */
export class CommandRegistry {
  private commands: Map<string, Command> = new Map();
  private listeners: Set<() => void> = new Set();

  /**
   * Register one or more commands.
   */
  register(...commands: Command[]): void {
    for (const command of commands) {
      this.commands.set(command.id, command);
    }
    this.notifyListeners();
  }

  /**
   * Unregister a command by ID.
   */
  unregister(id: string): void {
    this.commands.delete(id);
    this.notifyListeners();
  }

  /**
   * Get a command by ID.
   */
  get(id: string): Command | undefined {
    return this.commands.get(id);
  }

  /**
   * Get all registered commands.
   */
  getAll(): Command[] {
    return Array.from(this.commands.values());
  }

  /**
   * Clear all registered commands.
   */
  clear(): void {
    this.commands.clear();
    this.notifyListeners();
  }

  /**
   * Search commands by query.
   * Returns results sorted by relevance score, grouped by section.
   */
  search(query: string, maxResults = 10): CommandSearchGroup[] {
    const results: CommandSearchResult[] = [];

    for (const command of this.commands.values()) {
      // Skip commands that shouldn't be shown
      if (command.when && !command.when()) {
        continue;
      }

      let bestScore = 0;
      let nameMatches: number[] | undefined;
      let keywordMatches: number[] | undefined;

      // Match against name
      const nameMatch = fuzzyMatch(query, command.name);
      if (nameMatch) {
        bestScore = nameMatch.score;
        nameMatches = nameMatch.matches;
      }

      // Match against keywords
      if (command.keywords) {
        for (const keyword of command.keywords) {
          const keywordMatch = fuzzyMatch(query, keyword);
          if (keywordMatch && keywordMatch.score > bestScore) {
            bestScore = keywordMatch.score;
            keywordMatches = keywordMatch.matches;
          }
        }
      }

      // Match against description
      if (command.description) {
        const descMatch = fuzzyMatch(query, command.description);
        if (descMatch && descMatch.score > bestScore) {
          bestScore = descMatch.score * 0.8; // Lower weight for description matches
        }
      }

      // Include if there's a match (or empty query shows all)
      if (bestScore > 0 || !query) {
        // Adjust score by command priority
        const priorityBonus =
          ((command.priority ?? 0) as CommandPriority) * 5;
        bestScore += priorityBonus;

        results.push({
          command,
          score: bestScore,
          nameMatches,
          keywordMatches,
        });
      }
    }

    // Sort by score (descending)
    results.sort((a, b) => b.score - a.score);

    // Limit total results
    const limitedResults = results.slice(0, maxResults);

    // Group by section
    const groups = new Map<string, CommandSearchGroup>();

    for (const result of limitedResults) {
      const section = resolveSection(result.command.section);
      let group = groups.get(section.id);

      if (!group) {
        group = { section, results: [] };
        groups.set(section.id, group);
      }

      group.results.push(result);
    }

    // Sort groups by section priority
    const sortedGroups = Array.from(groups.values()).sort((a, b) => {
      const aPriority = (a.section.priority ?? 0) as CommandPriority;
      const bPriority = (b.section.priority ?? 0) as CommandPriority;
      return bPriority - aPriority;
    });

    return sortedGroups;
  }

  /**
   * Subscribe to registry changes.
   */
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notifyListeners(): void {
    for (const listener of this.listeners) {
      try {
        listener();
      } catch (e) {
        console.error("[CommandRegistry] Listener error:", e);
      }
    }
  }
}

/**
 * Global command registry instance.
 */
export const commandRegistry = new CommandRegistry();

/**
 * Helper to register commands using a hook-like pattern.
 * Returns an unregister function.
 */
export function registerCommands(...commands: Command[]): () => void {
  commandRegistry.register(...commands);
  return () => {
    for (const command of commands) {
      commandRegistry.unregister(command.id);
    }
  };
}

/**
 * Helper to create a command with proper typing.
 */
export function createCommand(command: Command): Command {
  return command;
}

/**
 * Helper to create multiple commands for a section.
 */
export function createSectionCommands(
  section: string | CommandSection,
  commands: Omit<Command, "section">[],
): Command[] {
  return commands.map((cmd) => ({
    ...cmd,
    section,
  }));
}
