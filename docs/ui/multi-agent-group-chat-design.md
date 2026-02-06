# Multi-Agent Group Chat Design

## Overview

This document describes the design for adding multi-agent group chat capability to OpenClaw, enabling multiple agent instances to run simultaneously, communicate asynchronously, and coordinate via a shared conversation. The feature includes a command palette (Ctrl+K) and slash commands for managing agents within conversations.

## Goals

1. **Parallel Agent Execution**: Multiple agents working asynchronously on subtasks
2. **Coordinated Communication**: Agents can communicate with each other and the user via the group chat
3. **@ Targeting**: Direct messages to specific agents using @mentions
4. **Agent Management**: Add, remove, and rename agents within conversations
5. **Project Manager Role**: The implicit conversation agent acts as coordinator by default
6. **Command System**: Slash commands and Ctrl+K command palette for quick actions

## Architecture

### Conceptual Model

```
┌──────────────────────────────────────────────────────────────┐
│                    Group Chat Session                        │
│  sessionKey: agent:main:group:<uuid>                         │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│   ┌─────────────┐   ┌─────────────┐   ┌─────────────┐       │
│   │  Primary    │   │  Worker     │   │  Worker     │       │
│   │  Agent      │   │  Agent 1    │   │  Agent 2    │       │
│   │  @pm        │   │  @coder     │   │  @researcher│       │
│   │             │   │             │   │             │       │
│   │ Coordinator │   │ Async Task  │   │ Async Task  │       │
│   │ Default     │   │ Execution   │   │ Execution   │       │
│   └─────────────┘   └─────────────┘   └─────────────┘       │
│         │                  │                  │              │
│         └──────────────────┴──────────────────┘              │
│                           │                                  │
│                    Shared Transcript                         │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

### Session Key Format

Group chat sessions use a new session key format:

```
agent:<agentId>:group:<groupId>
```

Example: `agent:main:group:abc123`

### Agent Membership Structure

```typescript
interface GroupChatAgent {
  // Unique identifier within the group
  agentHandle: string;  // e.g., "coder", "researcher", "pm"
  
  // Underlying agent configuration
  agentId: string;  // The agent definition to use
  
  // Display information
  displayName: string;
  avatar?: string;
  
  // Role in the group
  role: "primary" | "worker";
  
  // Current status
  status: "idle" | "thinking" | "working" | "error";
  
  // Active run information
  currentRunId?: string;
  currentTask?: string;
  
  // Timestamps
  addedAt: number;
  lastActiveAt?: number;
}

interface GroupChatSession {
  sessionKey: string;
  kind: "group";
  
  // The primary agent (implicit, cannot be removed)
  primaryAgentHandle: string;
  
  // All agents in the group
  agents: Record<string, GroupChatAgent>;
  
  // Group metadata
  displayName: string;
  createdAt: number;
  updatedAt: number;
}
```

### Message Format Extensions

Messages in group chats include agent targeting:

```typescript
interface GroupChatMessage {
  // Existing message fields
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: number;
  
  // Group chat extensions
  fromAgent?: string;      // Which agent sent this (handle)
  targetAgents?: string[]; // @mentions for specific agents
  isCoordination?: boolean; // Agent-to-agent coordination message
}
```

## UI Components

### 1. Command Palette (Ctrl+K)

Since the UI uses Lit (not React), we'll build a custom command palette component rather than using kbar or cmdk. The design follows their patterns but is implemented as a Lit component.

#### Component Structure

```
ui/src/ui/components/
  command-palette/
    index.ts           # Export barrel
    command-palette.ts # Main LitElement component
    command-types.ts   # Command type definitions
    command-registry.ts # Command registration and matching
    command-palette.css # Scoped styles
```

#### Command Types

```typescript
interface Command {
  id: string;
  name: string;
  description?: string;
  icon?: string;
  shortcut?: string[];
  keywords?: string[];
  section?: string;
  priority?: number;
  
  // Action
  perform: () => void | Promise<void>;
  
  // Conditional availability
  when?: () => boolean;
  
  // Dynamic subcommands
  children?: () => Command[] | Promise<Command[]>;
}

// Example commands
const commands: Command[] = [
  {
    id: "agent.add",
    name: "Add Agent to Conversation",
    description: "Add a new agent worker to this group chat",
    icon: "user-plus",
    shortcut: ["$mod+shift+a"],
    section: "Agents",
    perform: () => openAgentPicker(),
  },
  {
    id: "agent.remove",
    name: "Remove Agent",
    description: "Remove an agent from this group chat",
    icon: "user-minus",
    section: "Agents",
    when: () => hasRemovableAgents(),
    children: () => getRemovableAgents().map(agent => ({
      id: `agent.remove.${agent.agentHandle}`,
      name: `Remove @${agent.agentHandle}`,
      perform: () => removeAgent(agent.agentHandle),
    })),
  },
  // ... more commands
];
```

#### Visual Design

```
┌─────────────────────────────────────────────────────────┐
│  ⌘K  Search commands...                              ✕  │
├─────────────────────────────────────────────────────────┤
│  AGENTS                                                 │
│  ┌─────────────────────────────────────────────────────┐│
│  │ 👤+ Add Agent to Conversation        Cmd+Shift+A   ││
│  └─────────────────────────────────────────────────────┘│
│  ┌─────────────────────────────────────────────────────┐│
│  │ 👤- Remove Agent                                   ││
│  └─────────────────────────────────────────────────────┘│
│  ┌─────────────────────────────────────────────────────┐│
│  │ ✏️  Rename Agent                                   ││
│  └─────────────────────────────────────────────────────┘│
│                                                         │
│  SESSIONS                                               │
│  ┌─────────────────────────────────────────────────────┐│
│  │ 📝 New Session                            Cmd+N    ││
│  └─────────────────────────────────────────────────────┘│
│  ┌─────────────────────────────────────────────────────┐│
│  │ 🔄 Switch Session                         Cmd+O    ││
│  └─────────────────────────────────────────────────────┘│
│                                                         │
│  TOOLS                                                  │
│  ┌─────────────────────────────────────────────────────┐│
│  │ ⚙️  Session Settings                      Cmd+,    ││
│  └─────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────┘
```

### 2. Slash Commands Enhancement

Extend the existing slash command system with group chat commands:

#### New Slash Commands

| Command | Description | Example |
|---------|-------------|---------|
| `/agents` | List all agents in the current group | `/agents` |
| `/agents add <agentId> [handle]` | Add an agent to the group | `/agents add researcher @research` |
| `/agents remove <handle>` | Remove an agent from the group | `/agents remove @research` |
| `/agents rename <handle> <newHandle>` | Rename an agent | `/agents rename @research @r` |
| `/agents status` | Show status of all agents | `/agents status` |
| `@<handle> <message>` | Send message to specific agent | `@coder implement the auth module` |
| `@all <message>` | Broadcast to all agents | `@all stop current tasks` |
| `/stop @<handle>` | Stop a specific agent | `/stop @coder` |
| `/stop @all` | Stop all agents | `/stop @all` |

### 3. Chat UI Modifications

#### Agent Status Bar

Add an agent status bar to group chat sessions:

```
┌────────────────────────────────────────────────────────────┐
│ Group Chat: Project Planning                          ⚙️   │
├────────────────────────────────────────────────────────────┤
│ Agents:                                                    │
│  ┌──────┐  ┌──────┐  ┌──────┐  ┌──────┐                   │
│  │ 🟢   │  │ 🟡   │  │ 🔵   │  │ ➕   │                   │
│  │ @pm  │  │@coder│  │@rsrch│  │ Add  │                   │
│  │idle  │  │think │  │work  │  │      │                   │
│  └──────┘  └──────┘  └──────┘  └──────┘                   │
├────────────────────────────────────────────────────────────┤
```

#### Message Attribution

Messages show which agent they're from and to:

```
┌────────────────────────────────────────────────────────────┐
│ 👤 You                                           10:30 AM  │
│ @coder Please implement the authentication module         │
├────────────────────────────────────────────────────────────┤
│ 🤖 @coder                                        10:30 AM  │
│ I'll start working on the authentication module...        │
│ ┌──────────────────────────────────────────────┐          │
│ │ 🔵 Working: Implementing auth module...       │          │
│ └──────────────────────────────────────────────┘          │
├────────────────────────────────────────────────────────────┤
│ 🤖 @pm                                           10:31 AM  │
│ @researcher While @coder works on auth, please research   │
│ OAuth2 best practices for our use case.                   │
├────────────────────────────────────────────────────────────┤
│ 🤖 @researcher                                   10:31 AM  │
│ I'll look into OAuth2 patterns and report back.           │
└────────────────────────────────────────────────────────────┘
```

#### @ Mention Autocomplete

When typing `@` in the message input, show autocomplete for available agents:

```
┌─────────────────────────────────────┐
│ @pm - Primary Agent (Project Manager) │
│ @coder - Code Implementation         │
│ @researcher - Research Assistant     │
│ @all - All Agents                   │
└─────────────────────────────────────┘
```

## Backend Changes

### Gateway Protocol Extensions

New gateway methods:

```typescript
// Group chat management
"group.create": {
  params: { displayName?: string; agents?: AgentSpec[] };
  result: { sessionKey: string; agents: GroupChatAgent[] };
}

"group.agents.list": {
  params: { sessionKey: string };
  result: { agents: GroupChatAgent[] };
}

"group.agents.add": {
  params: { sessionKey: string; agentId: string; handle?: string; displayName?: string };
  result: { agent: GroupChatAgent };
}

"group.agents.remove": {
  params: { sessionKey: string; handle: string };
  result: { ok: true };
}

"group.agents.rename": {
  params: { sessionKey: string; handle: string; newHandle: string };
  result: { agent: GroupChatAgent };
}

"group.agents.status": {
  params: { sessionKey: string };
  result: { agents: Record<string, AgentStatus> };
}
```

### Agent Execution Model

Worker agents in a group chat:

1. **Run Isolation**: Each worker agent gets its own run context within the group session
2. **Shared Transcript**: All agents see the shared conversation history
3. **@ Targeting**: Agents only respond when explicitly @mentioned (except primary)
4. **Coordination Protocol**: Agents can @mention each other for coordination
5. **Status Reporting**: Agents post status updates to the shared transcript

```typescript
interface AgentRunContext {
  sessionKey: string;        // Group session key
  agentHandle: string;       // This agent's handle
  targetedMessage?: string;  // The @mention that triggered this run
  fullTranscript: Message[]; // Shared conversation history
  
  // Coordination helpers
  mentionAgent: (handle: string, message: string) => Promise<void>;
  reportStatus: (status: string) => Promise<void>;
  requestCoordination: (handles: string[], message: string) => Promise<void>;
}
```

### Event Streaming

New events for group chat status updates:

```typescript
interface GroupAgentStatusEvent {
  type: "group.agent.status";
  sessionKey: string;
  agentHandle: string;
  status: "idle" | "thinking" | "working" | "error";
  task?: string;
  progress?: number;
}

interface GroupAgentMessageEvent {
  type: "group.agent.message";
  sessionKey: string;
  fromAgent: string;
  targetAgents?: string[];
  messageId: string;
}
```

## Implementation Plan

### Phase 1: Foundation (Week 1-2)

1. **Command Palette Component**
   - Create [`ui/src/ui/components/command-palette/command-palette.ts`](ui/src/ui/components/command-palette/command-palette.ts:1)
   - Implement fuzzy search and keyboard navigation
   - Wire up Ctrl+K shortcut in [`app-input.ts`](ui/src/ui/app-input.ts:78)
   - Basic command registry with session/navigation commands

2. **Slash Command Parser Enhancement**
   - Extend slash command parsing for `/agents` commands
   - Add @ mention detection in message input

### Phase 2: Group Session Infrastructure (Week 2-3)

3. **Backend: Group Session Support**
   - New session kind "group" in session management
   - Gateway protocol methods for group management
   - Agent membership storage and retrieval

4. **Backend: Multi-Agent Execution**
   - Run queue integration for worker agents
   - @ targeting logic in message routing
   - Status event emission

### Phase 3: UI Integration (Week 3-4)

5. **Chat UI Updates**
   - Agent status bar component
   - Message attribution display
   - @ mention autocomplete
   - Real-time status indicators

6. **Command Palette Completion**
   - Agent management commands
   - Dynamic subcommand loading
   - Context-aware command availability

### Phase 4: Coordination Features (Week 4-5)

7. **Agent Coordination Protocol**
   - Primary agent as project manager
   - Agent-to-agent messaging
   - Task delegation and status aggregation

8. **Polish and Testing**
   - E2E tests for multi-agent scenarios
   - Performance optimization
   - Documentation

## File Structure

```
ui/src/
  ui/
    components/
      command-palette/
        index.ts
        command-palette.ts
        command-palette.css
        command-types.ts
        command-registry.ts
    views/
      chat.ts                    # Modified for group chat
      chat-agent-bar.ts          # New: Agent status bar
      chat-mention-picker.ts     # New: @ mention autocomplete
    controllers/
      group-chat.ts              # New: Group chat operations
      command-palette.ts         # New: Command palette state
    types/
      group-chat-types.ts        # New: Group chat type definitions

src/
  sessions/
    group-session.ts             # New: Group session management
  gateway/
    api/
      group.ts                   # New: Group chat API handlers
  agents/
    group-agent-runner.ts        # New: Multi-agent execution
    agent-coordination.ts        # New: Agent-to-agent protocol
```

## Configuration

New configuration options:

```json5
{
  agents: {
    defaults: {
      groups: {
        // Maximum agents per group (excluding primary)
        maxAgents: 8,
        
        // Default model for worker agents
        workerModel: null,  // null = inherit from session
        
        // Auto-archive completed group sessions after N minutes
        archiveAfterMinutes: 1440,
      }
    }
  },
  
  ui: {
    commandPalette: {
      // Shortcut to open command palette
      shortcut: "$mod+k",
      
      // Show command shortcuts in results
      showShortcuts: true,
      
      // Maximum results to display
      maxResults: 10,
    },
    
    groupChat: {
      // Show agent status bar
      showStatusBar: true,
      
      // Show coordination messages between agents
      showCoordinationMessages: true,
      
      // Enable @ mention autocomplete
      mentionAutocomplete: true,
    }
  }
}
```

## Open Questions

1. **Agent Identity**: Should worker agents share the primary agent's identity/system prompt, or have their own?

2. **Concurrency Limits**: How many worker agents can be "thinking" simultaneously? Use existing `maxConcurrent` or a separate limit?

3. **History Visibility**: Do worker agents see the full conversation history or just their own context window?

4. **Persistence**: How long are group sessions persisted? What happens to worker agent states on gateway restart?

5. **Cross-Group Communication**: Can agents in one group chat reference or coordinate with agents in another?

## Security Considerations

1. **Agent Spawning**: Respect existing `subagents.allowAgents` restrictions
2. **Tool Access**: Worker agents follow the same tool policy as subagents
3. **Rate Limiting**: Prevent runaway agent spawning with `maxAgents` limit
4. **Message Validation**: Validate @ mentions against actual group membership
5. **Session Isolation**: Group sessions are fully isolated from other sessions

## Success Metrics

1. **Latency**: Command palette opens in < 100ms
2. **Concurrency**: Support 8+ worker agents without UI lag
3. **Reliability**: Agent status updates within 500ms of state change
4. **Usability**: @ mention autocomplete response < 50ms
