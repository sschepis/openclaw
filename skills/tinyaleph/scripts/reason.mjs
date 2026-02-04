#!/usr/bin/env node
/**
 * Run entropy-minimizing reasoning on a query
 * Usage: ./reason.mjs "query"
 */

const TINYALEPH_PATH = process.env.TINYALEPH_PATH || '/Users/sschepis/Development/tinyaleph';

async function main() {
  const query = process.argv.slice(2).join(' ');
  
  if (!query) {
    console.error('Usage: reason.mjs "query"');
    process.exit(1);
  }

  try {
    const tinyaleph = await import(`${TINYALEPH_PATH}/index.js`);
    const config = await import(`${TINYALEPH_PATH}/data.json`, { assert: { type: 'json' } });
    
    const { createEngine } = tinyaleph;
    const engine = createEngine('semantic', config.default);
    
    // Run entropy-minimizing reasoning
    const result = engine.run(query);
    
    console.log(JSON.stringify({
      query,
      output: result.output,
      entropy: {
        initial: result.steps[0]?.entropyBefore ?? null,
        final: result.entropy,
        reduction: result.steps[0]?.entropyBefore ? 
          (result.steps[0].entropyBefore - result.entropy) : null
      },
      steps: result.steps.length,
      stepDetails: result.steps.slice(0, 5).map(s => ({
        step: s.step,
        transform: s.transform,
        entropyBefore: s.entropyBefore,
        entropyAfter: s.entropyAfter
      })),
      stability: result.entropy < 1.0 ? 'collapsed' :
                 result.entropy < 2.0 ? 'stable' : 'unstable'
    }, null, 2));
  } catch (err) {
    console.error('Error:', err.message);
    console.error('Make sure tinyaleph is installed at:', TINYALEPH_PATH);
    process.exit(1);
  }
}

main();
