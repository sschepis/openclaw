import { Type, type Static } from "@sinclair/typebox";
import { NonEmptyString, SessionLabelString } from "./primitives.js";

/**
 * Schema for activities.list RPC params.
 * Activities wrap sessions as observable "processes" with state and actions.
 */
export const ActivitiesListParamsSchema = Type.Object(
  {
    /** Maximum number of activities to return. */
    limit: Type.Optional(Type.Integer({ minimum: 1 })),
    /** Only include sessions updated within the last N minutes. */
    activeMinutes: Type.Optional(Type.Integer({ minimum: 1 })),
    /** Include global sessions. */
    includeGlobal: Type.Optional(Type.Boolean()),
    /** Include unknown sessions (orphaned). */
    includeUnknown: Type.Optional(Type.Boolean()),
    /** Filter by label. */
    label: Type.Optional(SessionLabelString),
    /** Filter by spawnedBy. */
    spawnedBy: Type.Optional(NonEmptyString),
    /** Filter by agentId. */
    agentId: Type.Optional(NonEmptyString),
    /** Text search across session data. */
    search: Type.Optional(Type.String()),
  },
  { additionalProperties: false },
);

export type ActivitiesListParams = Static<typeof ActivitiesListParamsSchema>;

/**
 * Schema for activities.execute RPC params.
 * Executes an action by injecting a prompt into the session.
 */
export const ActivitiesExecuteParamsSchema = Type.Object(
  {
    /** Session key to execute action on. */
    key: NonEmptyString,
    /** Action ID to execute. */
    actionId: NonEmptyString,
    /** Parameters for the action. */
    parameters: Type.Optional(Type.Record(Type.String(), Type.Unknown())),
  },
  { additionalProperties: false },
);

export type ActivitiesExecuteParams = Static<typeof ActivitiesExecuteParamsSchema>;

/**
 * Schema for activities.analyze RPC params.
 * Triggers AI analysis to extract state and actions from a session.
 */
export const ActivitiesAnalyzeParamsSchema = Type.Object(
  {
    /** Session key to analyze. */
    key: NonEmptyString,
    /** Maximum transcript chars to analyze (default: 16000). */
    maxChars: Type.Optional(Type.Integer({ minimum: 100 })),
  },
  { additionalProperties: false },
);

export type ActivitiesAnalyzeParams = Static<typeof ActivitiesAnalyzeParamsSchema>;
