#!/bin/bash
# Get full introspection report from the Sentient Observer
# Usage: ./introspect.sh

SENTIENT_URL="${SENTIENT_URL:-http://localhost:3000}"

# Check if server is running
if ! curl -s "$SENTIENT_URL/status" > /dev/null 2>&1; then
  echo "Error: Sentient Observer is not running at $SENTIENT_URL"
  echo "Start it first with: start.sh"
  exit 1
fi

# Get introspection
response=$(curl -s "$SENTIENT_URL/introspect")

if [ $? -ne 0 ]; then
  echo "Error: Failed to get introspection"
  exit 1
fi

# Format output
echo "$response" | jq '
{
  status: {
    running: .running // true,
    tickRate: .tickRate,
    uptime: .uptime
  },
  prsc: {
    oscillatorCount: (.oscillators | length) // .prsc.count,
    coherence: .prsc.coherence // .coherence,
    entropy: .prsc.entropy // .entropy
  },
  smf: {
    dominantAxis: (
      if .smf.orientation then
        (.smf.orientation | to_entries | max_by(.value) | .key)
      else null end
    ),
    axes: .smf.orientation
  },
  temporal: {
    momentCount: (.moments | length) // .temporal.momentCount,
    recentMoments: ((.moments // [])[:3] | map(.id // .))
  },
  agency: {
    attentionFocus: .agency.attention // .attention,
    activeGoals: (.agency.goals // .goals // []) | length
  },
  safety: {
    violations: .safety.violations // 0,
    status: (if (.safety.violations // 0) > 0 then "warning" else "ok" end)
  },
  memory: {
    traceCount: .memory.traceCount // .memory.count,
    utilizationPercent: .memory.utilization
  }
}
' 2>/dev/null || echo "$response"
