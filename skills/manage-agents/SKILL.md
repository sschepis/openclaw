---
name: manage-agents
description: Add, remove, and coordinate secondary agents (sub-agents) for multi-agent tasks. Use when you need parallel execution, specialized roles, or long-running background tasks.
metadata:
  openclaw:
    emoji: "🤖"
    skillKey: "manage-agents"
---

# Manage Agents

You can spawn secondary agents (sub-agents) to perform tasks in parallel or in the background.

## Capabilities

- **Spawn**: Start a new sub-agent with a specific task (`sessions_spawn`).
- **Stop**: Stop a running sub-agent or all sub-agents (`sessions_stop`).
- **List**: View active sub-agents (`sessions_list`).
- **Communicate**: Send messages to sub-agents (`sessions_send`).

## Tools

### sessions_spawn

Spawn a new sub-agent.

- `task` (required): The instruction for the sub-agent.
- `label` (optional): A short label for the sub-agent.
- `model` (optional): Override the model for the sub-agent.
- `thinking` (optional): Set thinking level ("low", "medium", "high").
- `cleanup` (optional): "delete" (remove session after finish) or "keep" (default).

Example:
```javascript
sessions_spawn({
  task: "Research the history of the internet and summarize key events.",
  label: "researcher",
  cleanup: "keep"
})
```

### sessions_stop

Stop a running sub-agent.

- `target` (required): The `runId`, `sessionKey`, or "all"/"*" to stop all.

Example:
```javascript
sessions_stop({ target: "run-12345678" })
```

### sessions_list

List active and recent sub-agents.

- `filter` (optional): Filter by "active", "done", or "all" (default).

### sessions_send

Send a message to a sub-agent.

- `target` (required): The `runId` or `sessionKey`.
- `message` (required): The message content.

## Workflow

1.  **Spawn**: Use `sessions_spawn` to start a task.
2.  **Monitor**: The sub-agent runs in the background. You can check `sessions_list` or `session_status`.
3.  **Interact**: Use `sessions_send` to give new instructions or ask for updates.
4.  **Stop**: Use `sessions_stop` if you need to cancel the task or clean up.

## Best Practices

- **Clear Tasks**: Give sub-agents specific, self-contained tasks.
- **Labels**: Use labels to keep track of multiple agents (e.g., "researcher", "coder").
- **Cleanup**: Use `cleanup: "delete"` for temporary tasks to keep the session list clean.
