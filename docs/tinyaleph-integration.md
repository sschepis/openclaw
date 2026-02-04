# TinyAleph Integration for OpenClaw

This document outlines the integration of the `@aleph-ai/tinyaleph` library into OpenClaw to provide advanced semantic computing and "sentient" agent capabilities.

## Overview

[TinyAleph](https://github.com/aleph-ai/tinyaleph) is a "Prime-resonant semantic computing framework" that uses prime number signatures, sedenion algebra, and oscillator dynamics to model meaning and agency.

We will integrate TinyAleph as an **OpenClaw Skill** (`skills/sentient-observer`) that allows agents to:
1.  **Analyze Semantic Resonance**: Measure the "harmony" between concepts or messages.
2.  **Maintain an Inner State**: A continuous "stream of consciousness" using the Sentient Observer architecture.
3.  **Form Goals and Agency**: Use the Agency Layer to generate autonomous goals based on internal state.

## Architecture

We will create a `TinyAlephObserver` class within the skill that composes the core components from `tinyaleph/observer`. This avoids depending on the internal `sentient-core.js` file which has module compatibility issues.

### Components

The `TinyAlephObserver` will orchestrate:
-   **SemanticBackend**: For converting text to prime signatures.
-   **PRSCLayer**: Prime Resonance Semantic Coherence oscillator bank.
-   **SedenionMemoryField (SMF)**: 16-dimensional semantic orientation field.
-   **TemporalLayer**: For detecting "moments" based on coherence peaks.
-   **AgencyLayer**: For managing attention and goals.

### Skill Tools

The skill will expose the following tools to the agent:

1.  `observer_init(config)`: Initialize a new observer session.
2.  `observer_process(text)`: Feed text input into the observer. Returns the cognitive response (coherence, entropy, thoughts).
3.  `observer_introspect()`: Get a report of the internal state (current goals, emotional valence, active memories).
4.  `observer_resonance(text1, text2)`: Calculate the semantic resonance between two texts.

## Implementation Details

### Dependency Management

Since `@aleph-ai/tinyaleph` is a local package at `/Users/sschepis/Development/tinyaleph`, we will use dynamic imports to load it.

### The Observer Loop

The `TinyAlephObserver` will implement a `tick()` method that advances the physics engine (oscillators). This can be called:
-   On every interaction (synchronous mode).
-   Or via a background loop (if OpenClaw supports persistent background processes for skills).

For now, we will use **synchronous ticking** during `observer_process`, simulating a burst of cognitive activity ("thinking") in response to input.

## Usage Example

```typescript
// Agent initializes their "soul"
await client.useTool('observer_init', { name: "AgentSoul" });

// Agent processes a user message
const result = await client.useTool('observer_process', { 
  text: "The user seems frustrated with the delay." 
});

// Agent checks their internal state
const introspection = await client.useTool('observer_introspect', {});
if (introspection.coherence < 0.5) {
  // Agent decides to pause and reflect
}
```
