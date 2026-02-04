---
name: tinyaleph
description: Prime-resonant semantic computing framework. Use for encoding concepts as prime signatures, hypercomplex algebra (sedenion) operations, oscillator-based coherence detection, entropy-minimized reasoning, and semantic similarity calculations.
homepage: https://github.com/sschepis/tinyaleph
metadata: { "openclaw": { "emoji": "🔢", "requires": { "bins": ["node"] } } }
---

# TinyAleph - Prime Resonant Semantic Computing

A novel computational paradigm that encodes meaning as prime number signatures, embeds them in hypercomplex space, and performs reasoning through entropy minimization and oscillator synchronization.

## Core Concepts

### Prime Encoding
Every concept maps to a unique set of prime numbers. This enables semantic computation through number-theoretic operations.

### Hypercomplex States (Sedenions)
16-dimensional non-commutative algebra for representing semantic orientation:
- Axes: coherence, identity, duality, structure, change, life, harmony, wisdom, infinity, creation, truth, love, power, time, space, consciousness

### Kuramoto Oscillators
Phase-coupled oscillators that synchronize to represent conceptual coherence. High coherence (order parameter > 0.7) indicates semantic alignment.

### Entropy Minimization
Reasoning reduces uncertainty through semantic transforms. Lower entropy = more crystallized meaning.

## Scripts

### `scripts/encode.mjs`
Encode text to prime signature:
```bash
./scripts/encode.mjs "wisdom and truth"
```

### `scripts/coherence.mjs`
Calculate coherence between concepts:
```bash
./scripts/coherence.mjs "love" "compassion"
```

### `scripts/entropy.mjs`
Measure semantic entropy of a text:
```bash
./scripts/entropy.mjs "The answer is clear"
```

### `scripts/reason.mjs`
Run entropy-minimizing reasoning on a query:
```bash
./scripts/reason.mjs "What connects wisdom and power?"
```

## API Quick Reference

```javascript
const { createEngine, SemanticBackend, Hypercomplex, KuramotoModel } = require('@aleph-ai/tinyaleph');

// Create semantic engine
const config = require('@aleph-ai/tinyaleph/data.json');
const engine = createEngine('semantic', config);

// Encode concepts to primes
const backend = new SemanticBackend(config);
const primes = backend.encode('love and wisdom');

// Create hypercomplex state
const state = new Hypercomplex(16);
state.excite([2, 3, 5]);  // Excite with primes

// Kuramoto synchronization
const { OscillatorBank, KuramotoModel } = require('@aleph-ai/tinyaleph');
const bank = new OscillatorBank(16);
bank.excite([2, 3, 5, 7]);
const kuramoto = new KuramotoModel(bank, { coupling: 0.3 });
kuramoto.step(0.01);
console.log('Order parameter:', kuramoto.orderParameter());

// Run reasoning
const result = engine.run('What is truth?');
console.log('Output:', result.output);
console.log('Final entropy:', result.entropy);
```

## Integration Use Cases

### 1. Semantic Memory Indexing
Use prime signatures to index and retrieve memories by semantic similarity rather than keyword matching.

### 2. Coherence-Based Validation
Measure coherence of reasoning chains to detect drift or contradiction.

### 3. Entropy Monitoring
Track reasoning entropy over conversation to detect confusion or hallucination risk.

### 4. Concept Binding
Use entanglement to link related concepts across temporal boundaries.

## Configuration

| Option | Default | Description |
|--------|---------|-------------|
| `primeCount` | 64 | Number of prime oscillators |
| `coupling` | 0.3 | Kuramoto coupling strength K |
| `damping` | 0.02 | Amplitude damping rate |
| `coherenceThreshold` | 0.7 | Coherence detection threshold |

## Local Installation Path

If installed locally, the tinyaleph library is at:
```
/Users/sschepis/Development/tinyaleph
```

To use locally without npm:
```javascript
const tinyaleph = require('/Users/sschepis/Development/tinyaleph');
```

## References

- TinyAleph README: `/Users/sschepis/Development/tinyaleph/README.md`
- Theory Documentation: `/Users/sschepis/Development/tinyaleph/docs/theory/README.md`
- API Reference: `/Users/sschepis/Development/tinyaleph/docs/reference/README.md`
