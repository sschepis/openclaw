#!/bin/bash
# Stop the Sentient Observer server
# Usage: ./stop.sh

SENTIENT_PATH="${SENTIENT_PATH:-/Users/sschepis/Development/tinyaleph/apps/sentient}"
PID_FILE="${SENTIENT_PATH}/sentient.pid"

if [ ! -f "$PID_FILE" ]; then
  echo "Sentient Observer is not running (no PID file found)"
  exit 0
fi

PID=$(cat "$PID_FILE")

if ! kill -0 "$PID" 2>/dev/null; then
  echo "Sentient Observer is not running (stale PID file)"
  rm -f "$PID_FILE"
  exit 0
fi

echo "Stopping Sentient Observer (PID: $PID)..."
kill "$PID"

# Wait for graceful shutdown
for i in {1..10}; do
  if ! kill -0 "$PID" 2>/dev/null; then
    echo "Sentient Observer stopped"
    rm -f "$PID_FILE"
    exit 0
  fi
  sleep 0.5
done

# Force kill if still running
echo "Force killing..."
kill -9 "$PID" 2>/dev/null
rm -f "$PID_FILE"
echo "Sentient Observer stopped (forced)"
