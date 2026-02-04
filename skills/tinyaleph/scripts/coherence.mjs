#!/usr/bin/env node
/**
 * Calculate semantic coherence between two concepts
 * Usage: ./coherence.mjs "concept1" "concept2"
 */

const TINYALEPH_PATH = process.env.TINYALEPH_PATH || '/Users/sschepis/Development/tinyaleph';

async function main() {
  const args = process.argv.slice(2);
  
  if (args.length < 2) {
    console.error('Usage: coherence.mjs "concept1" "concept2"');
    process.exit(1);
  }

  const concept1 = args[0];
  const concept2 = args[1];

  try {
    const tinyaleph = await import(`${TINYALEPH_PATH}/index.js`);
    const config = await import(`${TINYALEPH_PATH}/data.json`, { assert: { type: 'json' } });
    
    const { SemanticBackend, calculateResonance } = tinyaleph;
    const backend = new SemanticBackend(config.default);
    
    // Encode both concepts
    const primes1 = backend.encode(concept1);
    const primes2 = backend.encode(concept2);
    
    // Get text-ordered states for coherence calculation
    const state1 = backend.textToOrderedState(concept1);
    const state2 = backend.textToOrderedState(concept2);
    
    // Calculate coherence
    const coherence = state1.coherence(state2);
    
    // Calculate resonance for prime pairs (golden ratio proximity)
    let resonanceSum = 0;
    let resonancePairs = 0;
    for (let i = 0; i < Math.min(primes1.length, 3); i++) {
      for (let j = 0; j < Math.min(primes2.length, 3); j++) {
        if (typeof calculateResonance === 'function') {
          resonanceSum += calculateResonance(primes1[i], primes2[j]);
          resonancePairs++;
        }
      }
    }
    const avgResonance = resonancePairs > 0 ? resonanceSum / resonancePairs : null;
    
    console.log(JSON.stringify({
      concept1,
      concept2,
      coherence: coherence,
      isCoherent: coherence > 0.7,
      resonance: avgResonance,
      primes1: primes1.slice(0, 5),
      primes2: primes2.slice(0, 5),
      interpretation: coherence > 0.8 ? 'strongly related' :
                      coherence > 0.6 ? 'moderately related' :
                      coherence > 0.4 ? 'weakly related' : 'distinct concepts'
    }, null, 2));
  } catch (err) {
    console.error('Error:', err.message);
    console.error('Make sure tinyaleph is installed at:', TINYALEPH_PATH);
    process.exit(1);
  }
}

main();
