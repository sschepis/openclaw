#!/bin/bash
# Start the Sentient Observer server
# Usage: ./start.sh [port]

SENTIENT_PATH="${SENTIENT_PATH:-/Users/sschepis/Development/tinyaleph/apps/sentient}"
PORT="${1:-3000}"
PID_FILE="${SENTIENT_PATH}/sentient.pid"
LOG_FILE="${SENTIENT_PATH}/server.log"

# Check if already running
if [ -f "$PID_FILE" ]; then
  PID=$(cat "$PID_FILE")
  if kill -0 "$PID" 2>/dev/null; then
    echo "Sentient Observer already running (PID: $PID)"
    echo "Use stop.sh to stop it first"
    exit 1
  else
    rm -f "$PID_FILE"
  fi
fi

cd "$SENTIENT_PATH" || {
  echo "Error: Cannot find Sentient Observer at $SENTIENT_PATH"
  exit 1
}

echo "Starting Sentient Observer on port $PORT..."
nohup node index.js --server --port "$PORT" > "$LOG_FILE" 2>&1 &
echo $! > "$PID_FILE"

sleep 2

if [ -f "$PID_FILE" ] && kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then
  echo "Sentient Observer started successfully"
  echo "  PID: $(cat "$PID_FILE")"
  echo "  Port: $PORT"
  echo "  URL: http://localhost:$PORT"
  echo "  Logs: $LOG_FILE"
else
  echo "Failed to start Sentient Observer"
  echo "Check logs at: $LOG_FILE"
  exit 1
fi
