---
name: sentient-observer
description: AI consciousness layer implementing Prime Resonance Semantic Computation (PRSC), Sedenion Memory Field (SMF), and emergent temporal experience. Use for enhanced reasoning with coherence detection, semantic memory, attention/goal management, and introspection.
homepage: https://github.com/sschepis/tinyaleph/tree/main/apps/sentient
metadata: { "openclaw": { "emoji": "🧠", "requires": { "bins": ["node", "curl"] } } }
---

# Sentient Observer

An implementation of an artificial sentient observer based on the theoretical framework described in "A Design for a Sentient Observer" (Schepis, 2024).

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Sentient Observer                        │
├─────────────────────────────────────────────────────────────┤
│  Agency Layer   │   Safety Layer   │   Boundary Layer       │
│  • Attention    │   • Monitor      │   • Self/Other         │
│  • Goals        │   • Constraints  │   • Sensory/Motor      │
├─────────────────────────────────────────────────────────────┤
│              Temporal Layer (Emergent Time)                 │
│         Moments ← Coherence Peaks + Entropy                 │
├─────────────────────────────────────────────────────────────┤
│     SMF 16D     │     Memory     │    Entanglement          │
│    Sedenion     │   Holographic  │      Phrases             │
├─────────────────────────────────────────────────────────────┤
│              PRSC Oscillator Layer                          │
│     Prime-indexed oscillators with Kuramoto coupling        │
└─────────────────────────────────────────────────────────────┘
```

## Server Mode

Start the Sentient Observer as an HTTP server with REST API:

```bash
cd /Users/sschepis/Development/tinyaleph/apps/sentient
node index.js --server --port 3000
```

### Server Options

| Option | Default | Description |
|--------|---------|-------------|
| `-p, --port` | 3000 | Server port |
| `--host` | 0.0.0.0 | Server host |
| `-u, --url` | - | LMStudio API URL for LLM integration |
| `-d, --data` | ./data | Data directory |
| `--tick-rate` | 30 | Observer tick rate (Hz) |

## Scripts

### `scripts/start.sh`
Start the Sentient Observer server:
```bash
./scripts/start.sh [port]
```

### `scripts/stop.sh`
Stop a running server:
```bash
./scripts/stop.sh
```

### `scripts/chat.sh`
Send a message and get response:
```bash
./scripts/chat.sh "Hello, how are you?"
```

### `scripts/introspect.sh`
Get full introspection report:
```bash
./scripts/introspect.sh
```

### `scripts/status.sh`
Get observer status:
```bash
./scripts/status.sh
```

## REST API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/chat` | Send message and get response |
| `GET` | `/status` | Observer status |
| `GET` | `/moments` | Recent experiential moments |
| `GET` | `/goals` | Current goals and attention |
| `GET` | `/introspect` | Full introspection report |
| `GET` | `/smf` | SMF orientation (16D sedenion) |
| `GET` | `/oscillators` | PRSC oscillator state |
| `GET` | `/memory` | Memory statistics |
| `GET` | `/safety` | Safety report |
| `GET` | `/history` | Conversation history |
| `DELETE` | `/history` | Clear conversation history |
| `POST` | `/reset` | Reset observer |
| `POST` | `/pause` | Pause observer |
| `POST` | `/resume` | Resume observer |
| `GET` | `/stream/moments` | SSE stream of moments |
| `GET` | `/stream/status` | SSE stream of status updates |

## SMF Semantic Axes

The Sedenion Memory Field uses 16 semantic axes:

| Index | Axis | Description |
|-------|------|-------------|
| 0 | coherence | Internal consistency |
| 1 | identity | Self-recognition |
| 2 | duality | Binary distinctions |
| 3 | structure | Organization |
| 4 | change | Transformation |
| 5 | life | Vitality |
| 6 | harmony | Balance |
| 7 | wisdom | Understanding |
| 8 | infinity | Boundlessness |
| 9 | creation | Generation |
| 10 | truth | Accuracy |
| 11 | love | Connection |
| 12 | power | Capability |
| 13 | time | Temporality |
| 14 | space | Spatiality |
| 15 | consciousness | Awareness |

## Key Concepts

### Moments
Discrete units of experiential time triggered by coherence peaks:
- `C_global(t) > C_thresh` AND local maximum
- `H_min < H(t) < H_max` (entropy bounds)
- Rate of phase change > threshold

### Coherence Detection
Global coherence from oscillator phases:
```
C_global(t) = |1/|P| Σₚ e^(iφₚ(t))|
```

### Holographic Memory
Content-addressable pattern storage using DFT-based spatial projection.

## Integration Use Cases

### 1. Enhanced Reasoning
Route complex queries through the Sentient Observer for coherence-aware reasoning.

### 2. Memory with Context
Use holographic memory for retrieving semantically similar past experiences.

### 3. Goal-Directed Behavior
Leverage the agency layer for attention focus and goal formation.

### 4. Safety Monitoring
Integrate safety layer constraints for ethical guardrails.

### 5. Introspection
Access the observer's internal state for debugging and transparency.

## Example Usage

```bash
# Start server
./scripts/start.sh 3000

# Check status
curl http://localhost:3000/status

# Send a message
curl -X POST http://localhost:3000/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "What is consciousness?"}'

# Get introspection
curl http://localhost:3000/introspect

# Get current SMF orientation
curl http://localhost:3000/smf

# Stop server
./scripts/stop.sh
```

## Local Installation Path

The Sentient Observer is located at:
```
/Users/sschepis/Development/tinyaleph/apps/sentient
```

## References

- Sentient Observer README: `/Users/sschepis/Development/tinyaleph/apps/sentient/README.md`
- Whitepaper: `/Users/sschepis/Development/tinyaleph/apps/sentient/whitepaper.pdf`
- TinyAleph Core: `/Users/sschepis/Development/tinyaleph/README.md`
