const path = require('path');
const { SentientServer } = require('./lib/app/server.js');
const { gasStation } = require('./lib/aleph-token/gas-station.js');
const { calculateTier } = require('./lib/aleph-token/staking.js');

// Adapter for OpenClaw Skill Interface
module.exports = {
  name: 'alephnet-node',
  description: 'Aleph Network Node - Prime-Resonant Semantic Compute Node',
  
  // Skill Actions
  actions: {
    // Node Management
    start: async (args) => {
      const server = new SentientServer({
        port: args.port || 31337,
        dataPath: args.dataPath || path.join(process.cwd(), 'data'),
        ...args
      });
      await server.start();
      return { status: 'running', port: server.port, nodeId: server.nodeId || 'local-node' };
    },
    
    status: async () => {
      // Mock status for now - real status would come from running server instance
      return { 
        status: 'active', 
        coherence: 0.95,
        peers: 12,
        uptime: process.uptime()
      };
    },
    
    register: async (args) => {
      return { id: 'node_' + Date.now(), key: 'generated_key_mock' };
    },

    // Tokenomics & Metering
    estimate_cost: async (args) => {
      const { operation, complexity = 1, coherence = 0.5 } = args;
      const estimate = gasStation.estimate(operation, complexity, coherence);
      return estimate;
    },

    get_tier: async (args) => {
      const { stakeAmount, lockDurationDays } = args;
      const tier = calculateTier(stakeAmount, lockDurationDays);
      return tier;
    }
  }
};

// Standalone CLI support
if (require.main === module) {
  const server = new SentientServer({ port: 31337 });
  server.start().catch(console.error);
}
