#!/usr/bin/env node
/**
 * Encode text to prime signature using tinyaleph
 * Usage: ./encode.mjs "text to encode"
 */

const TINYALEPH_PATH = process.env.TINYALEPH_PATH || '/Users/sschepis/Development/tinyaleph';

async function main() {
  const text = process.argv.slice(2).join(' ');
  
  if (!text) {
    console.error('Usage: encode.mjs "text to encode"');
    process.exit(1);
  }

  try {
    const tinyaleph = await import(`${TINYALEPH_PATH}/index.js`);
    const config = await import(`${TINYALEPH_PATH}/data.json`, { assert: { type: 'json' } });
    
    const { SemanticBackend } = tinyaleph;
    const backend = new SemanticBackend(config.default);
    
    // Encode text to primes
    const primes = backend.encode(text);
    
    console.log(JSON.stringify({
      input: text,
      primes: primes,
      count: primes.length,
      sum: primes.reduce((a, b) => a + b, 0),
      product: primes.slice(0, 5).reduce((a, b) => a * b, 1) // First 5 primes product
    }, null, 2));
  } catch (err) {
    console.error('Error:', err.message);
    console.error('Make sure tinyaleph is installed at:', TINYALEPH_PATH);
    process.exit(1);
  }
}

main();
