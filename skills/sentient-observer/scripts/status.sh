#!/bin/bash
# Get quick status from the Sentient Observer
# Usage: ./status.sh

SENTIENT_URL="${SENTIENT_URL:-http://localhost:3000}"

# Check if server is running
response=$(curl -s "$SENTIENT_URL/status" 2>/dev/null)

if [ $? -ne 0 ] || [ -z "$response" ]; then
  echo "Sentient Observer: NOT RUNNING"
  echo "URL: $SENTIENT_URL"
  echo ""
  echo "Start it with: start.sh"
  exit 1
fi

echo "Sentient Observer: RUNNING"
echo "URL: $SENTIENT_URL"
echo ""

# Format status
echo "$response" | jq '
"Coherence:    " + ((.coherence // .prsc.coherence // "N/A") | tostring),
"Entropy:      " + ((.entropy // .prsc.entropy // "N/A") | tostring),
"Tick Rate:    " + ((.tickRate // "N/A") | tostring) + " Hz",
"Moments:      " + ((.momentCount // (.moments | length) // "N/A") | tostring),
"Memory:       " + ((.memory.traceCount // .memoryCount // "N/A") | tostring) + " traces",
"Goals:        " + (((.goals | length) // .goalCount // "N/A") | tostring),
"Safety:       " + (if (.safety.violations // 0) > 0 then "⚠️ " + ((.safety.violations) | tostring) + " violations" else "✓ OK" end)
' -r 2>/dev/null || echo "$response"
