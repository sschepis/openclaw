/**
 * Schedule Parsing - Convert natural language schedules to CronSchedule objects.
 *
 * Examples:
 * - "every morning at 9am" → { kind: "cron", expr: "0 9 * * *" }
 * - "every 30 minutes" → { kind: "every", everyMs: 1800000 }
 * - "once a week on Monday" → { kind: "cron", expr: "0 0 * * 1" }
 * - "in 2 hours" → { kind: "at", atMs: now + 7200000 }
 * - "at 3:30pm tomorrow" → { kind: "at", atMs: <computed> }
 */

import type { CronSchedule } from "../cron/types.js";

// ============================================================================
// Time Constants
// ============================================================================

const MS_SECOND = 1000;
const MS_MINUTE = 60 * MS_SECOND;
const MS_HOUR = 60 * MS_MINUTE;
const MS_DAY = 24 * MS_HOUR;
const MS_WEEK = 7 * MS_DAY;

// ============================================================================
// Parsing Result
// ============================================================================

export type ScheduleParseResult = {
  schedule: CronSchedule | null;
  confidence: number; // 0-1, how confident we are in the parse
  interpretation: string; // Human-readable description of what we parsed
  error?: string;
};

// ============================================================================
// Pattern Matchers
// ============================================================================

// Day names to cron day-of-week (0 = Sunday)
const DAY_MAP: Record<string, number> = {
  sunday: 0,
  sun: 0,
  monday: 1,
  mon: 1,
  tuesday: 2,
  tue: 2,
  tues: 2,
  wednesday: 3,
  wed: 3,
  thursday: 4,
  thu: 4,
  thur: 4,
  thurs: 4,
  friday: 5,
  fri: 5,
  saturday: 6,
  sat: 6,
};

// Month names to cron month (1-12)
const MONTH_MAP: Record<string, number> = {
  january: 1,
  jan: 1,
  february: 2,
  feb: 2,
  march: 3,
  mar: 3,
  april: 4,
  apr: 4,
  may: 5,
  june: 6,
  jun: 6,
  july: 7,
  jul: 7,
  august: 8,
  aug: 8,
  september: 9,
  sep: 9,
  sept: 9,
  october: 10,
  oct: 10,
  november: 11,
  nov: 11,
  december: 12,
  dec: 12,
};

// Time period names to milliseconds
const PERIOD_MAP: Record<string, number> = {
  second: MS_SECOND,
  seconds: MS_SECOND,
  sec: MS_SECOND,
  secs: MS_SECOND,
  s: MS_SECOND,
  minute: MS_MINUTE,
  minutes: MS_MINUTE,
  min: MS_MINUTE,
  mins: MS_MINUTE,
  m: MS_MINUTE,
  hour: MS_HOUR,
  hours: MS_HOUR,
  hr: MS_HOUR,
  hrs: MS_HOUR,
  h: MS_HOUR,
  day: MS_DAY,
  days: MS_DAY,
  d: MS_DAY,
  week: MS_WEEK,
  weeks: MS_WEEK,
  wk: MS_WEEK,
  wks: MS_WEEK,
  w: MS_WEEK,
};

// ============================================================================
// Time Parsing Helpers
// ============================================================================

/**
 * Parse a time string like "9am", "3:30pm", "14:00", "9:00 AM".
 * Returns { hour, minute } or null if unparseable.
 */
function parseTime(input: string): { hour: number; minute: number } | null {
  const cleaned = input.toLowerCase().trim();

  // Match patterns like "9am", "9:30am", "9:30 am", "14:00"
  const patterns = [
    // 12-hour with optional minutes: "9am", "9:30am", "9:30 am"
    /^(\d{1,2})(?::(\d{2}))?\s*(am|pm)$/i,
    // 24-hour: "14:00", "9:00"
    /^(\d{1,2}):(\d{2})$/,
    // Just hour with am/pm: "9 am"
    /^(\d{1,2})\s+(am|pm)$/i,
  ];

  for (const pattern of patterns) {
    const match = cleaned.match(pattern);
    if (!match) continue;

    let hour = parseInt(match[1], 10);
    const minute = parseInt(match[2] || "0", 10);
    const meridiem = match[3]?.toLowerCase();

    if (meridiem === "pm" && hour < 12) {
      hour += 12;
    } else if (meridiem === "am" && hour === 12) {
      hour = 0;
    }

    if (hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59) {
      return { hour, minute };
    }
  }

  return null;
}

/**
 * Get the next occurrence of a specific day of week at a given time.
 */
function getNextDayOfWeek(dayOfWeek: number, hour: number, minute: number, nowMs: number): number {
  const now = new Date(nowMs);
  const result = new Date(nowMs);

  result.setHours(hour, minute, 0, 0);

  const currentDay = now.getDay();
  let daysToAdd = dayOfWeek - currentDay;

  if (daysToAdd < 0) {
    daysToAdd += 7;
  } else if (daysToAdd === 0 && result.getTime() <= nowMs) {
    daysToAdd = 7;
  }

  result.setDate(result.getDate() + daysToAdd);
  return result.getTime();
}

// ============================================================================
// Main Parsing Functions
// ============================================================================

/**
 * Parse "every X minutes/hours/days" patterns.
 */
function parseEveryInterval(input: string): ScheduleParseResult | null {
  const patterns = [
    // "every 30 minutes", "every 2 hours"
    /every\s+(\d+)\s+(second|seconds|sec|secs|s|minute|minutes|min|mins|m|hour|hours|hr|hrs|h|day|days|d|week|weeks|wk|wks|w)\b/i,
    // "every minute", "every hour", "every day"
    /every\s+(second|minute|hour|day|week)\b/i,
  ];

  for (const pattern of patterns) {
    const match = input.match(pattern);
    if (!match) continue;

    let amount = 1;
    let unit: string;

    if (match[2]) {
      amount = parseInt(match[1], 10);
      unit = match[2].toLowerCase();
    } else {
      unit = match[1].toLowerCase();
    }

    const msPerUnit = PERIOD_MAP[unit];
    if (!msPerUnit) continue;

    const everyMs = amount * msPerUnit;

    return {
      schedule: { kind: "every", everyMs },
      confidence: 0.9,
      interpretation: `Every ${amount} ${unit}`,
    };
  }

  return null;
}

/**
 * Parse "every <day> at <time>" patterns.
 */
function parseEveryDayAtTime(input: string): ScheduleParseResult | null {
  // "every monday at 9am", "every friday at 3:30pm"
  const dayPattern =
    /every\s+(sunday|sun|monday|mon|tuesday|tue|tues|wednesday|wed|thursday|thu|thur|thurs|friday|fri|saturday|sat)\s+at\s+(.+)/i;

  const match = input.match(dayPattern);
  if (!match) return null;

  const dayName = match[1].toLowerCase();
  const timeStr = match[2].trim();

  const dayOfWeek = DAY_MAP[dayName];
  if (dayOfWeek === undefined) return null;

  const time = parseTime(timeStr);
  if (!time) return null;

  const expr = `${time.minute} ${time.hour} * * ${dayOfWeek}`;

  return {
    schedule: { kind: "cron", expr },
    confidence: 0.9,
    interpretation: `Every ${dayName} at ${time.hour}:${String(time.minute).padStart(2, "0")}`,
  };
}

/**
 * Parse "every morning/afternoon/evening at <time>" patterns.
 */
function parseEveryTimeOfDay(input: string): ScheduleParseResult | null {
  // "every morning at 9am", "every day at 3pm"
  const patterns = [
    /every\s+(morning|afternoon|evening|night|day)\s+at\s+(.+)/i,
    /daily\s+at\s+(.+)/i,
    /every\s+day\s+at\s+(.+)/i,
  ];

  for (const pattern of patterns) {
    const match = input.match(pattern);
    if (!match) continue;

    let timeStr: string;
    if (match[2]) {
      timeStr = match[2].trim();
    } else {
      timeStr = match[1].trim();
    }

    const time = parseTime(timeStr);
    if (!time) continue;

    const expr = `${time.minute} ${time.hour} * * *`;

    return {
      schedule: { kind: "cron", expr },
      confidence: 0.85,
      interpretation: `Daily at ${time.hour}:${String(time.minute).padStart(2, "0")}`,
    };
  }

  return null;
}

/**
 * Parse "in X minutes/hours" patterns (relative time).
 */
function parseInDuration(input: string, nowMs: number): ScheduleParseResult | null {
  const pattern =
    /in\s+(\d+)\s+(second|seconds|sec|secs|minute|minutes|min|mins|hour|hours|hr|hrs|day|days|week|weeks)\b/i;

  const match = input.match(pattern);
  if (!match) return null;

  const amount = parseInt(match[1], 10);
  const unit = match[2].toLowerCase();
  const msPerUnit = PERIOD_MAP[unit];

  if (!msPerUnit) return null;

  const atMs = nowMs + amount * msPerUnit;

  return {
    schedule: { kind: "at", atMs },
    confidence: 0.95,
    interpretation: `In ${amount} ${unit} (at ${new Date(atMs).toISOString()})`,
  };
}

/**
 * Parse "at <time> tomorrow/today" patterns.
 */
function parseAtTimeRelative(input: string, nowMs: number): ScheduleParseResult | null {
  const patterns = [
    // "at 3pm tomorrow", "tomorrow at 3pm"
    /(?:at\s+)?(.+?)\s+tomorrow|tomorrow\s+at\s+(.+)/i,
    // "at 3pm today", "today at 3pm"
    /(?:at\s+)?(.+?)\s+today|today\s+at\s+(.+)/i,
    // "at 3pm" (assume today or next occurrence)
    /^at\s+(.+)$/i,
  ];

  for (let i = 0; i < patterns.length; i++) {
    const match = input.match(patterns[i]);
    if (!match) continue;

    const timeStr = (match[1] || match[2]).trim();
    const time = parseTime(timeStr);
    if (!time) continue;

    const now = new Date(nowMs);
    const target = new Date(nowMs);
    target.setHours(time.hour, time.minute, 0, 0);

    // Check which pattern matched
    if (i === 0) {
      // Tomorrow
      target.setDate(target.getDate() + 1);
    } else if (i === 1) {
      // Today - keep as is
    } else {
      // Just "at <time>" - use next occurrence
      if (target.getTime() <= nowMs) {
        target.setDate(target.getDate() + 1);
      }
    }

    return {
      schedule: { kind: "at", atMs: target.getTime() },
      confidence: 0.85,
      interpretation: `At ${time.hour}:${String(time.minute).padStart(2, "0")} on ${target.toDateString()}`,
    };
  }

  return null;
}

/**
 * Parse "once a week on <day>" patterns.
 */
function parseOnceAWeek(input: string): ScheduleParseResult | null {
  const patterns = [
    /(?:once\s+a\s+week|weekly)\s+on\s+(sunday|sun|monday|mon|tuesday|tue|tues|wednesday|wed|thursday|thu|thur|thurs|friday|fri|saturday|sat)(?:\s+at\s+(.+))?/i,
    /every\s+week\s+on\s+(sunday|sun|monday|mon|tuesday|tue|tues|wednesday|wed|thursday|thu|thur|thurs|friday|fri|saturday|sat)(?:\s+at\s+(.+))?/i,
  ];

  for (const pattern of patterns) {
    const match = input.match(pattern);
    if (!match) continue;

    const dayName = match[1].toLowerCase();
    const timeStr = match[2];

    const dayOfWeek = DAY_MAP[dayName];
    if (dayOfWeek === undefined) continue;

    let hour = 9; // Default to 9am
    let minute = 0;

    if (timeStr) {
      const time = parseTime(timeStr);
      if (time) {
        hour = time.hour;
        minute = time.minute;
      }
    }

    const expr = `${minute} ${hour} * * ${dayOfWeek}`;

    return {
      schedule: { kind: "cron", expr },
      confidence: 0.9,
      interpretation: `Weekly on ${dayName} at ${hour}:${String(minute).padStart(2, "0")}`,
    };
  }

  return null;
}

/**
 * Parse "twice a day" / "three times a day" patterns.
 */
function parseTimesPerDay(input: string): ScheduleParseResult | null {
  const patterns = [
    { regex: /twice\s+(?:a|per)\s+day/i, times: 2 },
    { regex: /three\s+times\s+(?:a|per)\s+day/i, times: 3 },
    { regex: /(\d+)\s+times\s+(?:a|per)\s+day/i, times: 0 },
  ];

  for (const { regex, times: defaultTimes } of patterns) {
    const match = input.match(regex);
    if (!match) continue;

    const times = defaultTimes || parseInt(match[1], 10);
    if (times < 1 || times > 24) continue;

    // Calculate evenly spaced intervals
    const intervalMs = MS_DAY / times;

    return {
      schedule: { kind: "every", everyMs: intervalMs },
      confidence: 0.8,
      interpretation: `${times} times per day (every ${Math.round(intervalMs / MS_HOUR)} hours)`,
    };
  }

  return null;
}

/**
 * Parse cron expression directly.
 */
function parseCronExpr(input: string): ScheduleParseResult | null {
  // Check if it looks like a cron expression (5 or 6 space-separated parts)
  const cleaned = input.trim();
  const parts = cleaned.split(/\s+/);

  if (parts.length !== 5 && parts.length !== 6) {
    return null;
  }

  // Basic validation - each part should be numbers, *, /, or -
  const cronPartPattern = /^[\d\*\-\/,]+$/;
  const allValid = parts.every((part) => cronPartPattern.test(part));

  if (!allValid) {
    return null;
  }

  return {
    schedule: { kind: "cron", expr: cleaned },
    confidence: 1.0,
    interpretation: `Cron expression: ${cleaned}`,
  };
}

// ============================================================================
// Main Entry Point
// ============================================================================

/**
 * Parse a natural language schedule description into a CronSchedule.
 *
 * @param input - Natural language schedule description
 * @param nowMs - Current timestamp for relative time calculations (default: Date.now())
 * @returns Parse result with schedule, confidence, and interpretation
 */
export function parseSchedule(input: string, nowMs: number = Date.now()): ScheduleParseResult {
  const cleaned = input.toLowerCase().trim();

  if (!cleaned) {
    return {
      schedule: null,
      confidence: 0,
      interpretation: "Empty input",
      error: "No schedule description provided",
    };
  }

  // Try each parser in order of specificity
  const parsers = [
    () => parseCronExpr(cleaned),
    () => parseEveryDayAtTime(cleaned),
    () => parseOnceAWeek(cleaned),
    () => parseEveryTimeOfDay(cleaned),
    () => parseEveryInterval(cleaned),
    () => parseTimesPerDay(cleaned),
    () => parseInDuration(cleaned, nowMs),
    () => parseAtTimeRelative(cleaned, nowMs),
  ];

  for (const parser of parsers) {
    const result = parser();
    if (result) {
      return result;
    }
  }

  return {
    schedule: null,
    confidence: 0,
    interpretation: "Could not parse schedule",
    error: `Unrecognized schedule format: "${input}"`,
  };
}

/**
 * Validate a cron expression.
 */
export function validateCronExpr(expr: string): boolean {
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5 && parts.length !== 6) {
    return false;
  }

  const cronPartPattern = /^[\d\*\-\/,]+$/;
  return parts.every((part) => cronPartPattern.test(part));
}

/**
 * Format a CronSchedule for display.
 */
export function formatScheduleDescription(schedule: CronSchedule): string {
  switch (schedule.kind) {
    case "at":
      return `Once at ${new Date(schedule.atMs).toLocaleString()}`;
    case "every": {
      const ms = schedule.everyMs;
      if (ms >= MS_DAY) {
        const days = Math.round(ms / MS_DAY);
        return `Every ${days} day${days > 1 ? "s" : ""}`;
      }
      if (ms >= MS_HOUR) {
        const hours = Math.round(ms / MS_HOUR);
        return `Every ${hours} hour${hours > 1 ? "s" : ""}`;
      }
      const minutes = Math.round(ms / MS_MINUTE);
      return `Every ${minutes} minute${minutes > 1 ? "s" : ""}`;
    }
    case "cron":
      return `Cron: ${schedule.expr}${schedule.tz ? ` (${schedule.tz})` : ""}`;
    default:
      return "Unknown schedule";
  }
}
