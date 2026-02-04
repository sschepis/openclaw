#!/bin/bash
# Send a message to the Sentient Observer and get a response
# Usage: ./chat.sh "message"

SENTIENT_URL="${SENTIENT_URL:-http://localhost:3000}"
MESSAGE="$*"

if [ -z "$MESSAGE" ]; then
  echo "Usage: chat.sh \"message\""
  exit 1
fi

# Check if server is running
if ! curl -s "$SENTIENT_URL/status" > /dev/null 2>&1; then
  echo "Error: Sentient Observer is not running at $SENTIENT_URL"
  echo "Start it first with: start.sh"
  exit 1
fi

# Send message
response=$(curl -s -X POST "$SENTIENT_URL/chat" \
  -H "Content-Type: application/json" \
  -d "{\"message\": \"$MESSAGE\"}")

if [ $? -ne 0 ]; then
  echo "Error: Failed to send message"
  exit 1
fi

echo "$response" | jq -r '
  "Response: \(.response // .message // .text // .)",
  "",
  "Coherence: \(.coherence // "N/A")",
  "Entropy: \(.entropy // "N/A")",
  "Moment ID: \(.momentId // "N/A")"
' 2>/dev/null || echo "$response"
