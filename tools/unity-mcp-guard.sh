#!/bin/bash
# Singleton launcher for Unity AI relay MCP server (unity-mcp)
# 
# Why: Unity Editor's relay only tolerates ONE MCP client session at a time.
# Each Claude Code/OpenCode session spawns its own relay client; second one
# makes relay drop both connections, shows up as unity-mcp "randomly disconnecting".
# 
# First session wins; later sessions get clear error instead of silently killing
# the first one.

RELAY="$HOME/.unity/relay/relay_linux"

if [ ! -x "$RELAY" ]; then
    echo "unity-mcp guard: relay binary not found or not executable at $RELAY" >&2
    exit 1
fi

# Get all relay_linux processes with --mcp flag (not --mcp-client-port or --relay)
get_mcp_relay_pids() {
    ps aux | grep '[r]elay_linux' | grep -E -- '--mcp(\s|$)' | awk '{print $2}'
}

# Check if process exists
process_exists() {
    kill -0 "$1" 2>/dev/null
}

# Get parent PID of a process
get_parent_pid() {
    ps -o ppid= -p "$1" 2>/dev/null | tr -d ' '
}

# Reap orphans (processes whose owning session is gone)
# Also ride out window where same session is restarting MCP server
# and old process hasn't exited yet.
DEADLINE=$(($(date +%s) + 10))

while true; do
    LIVE_PIDS=()
    
    while IFS= read -r pid; do
        [ -z "$pid" ] && continue
        
        PARENT_PID=$(get_parent_pid "$pid")
        
        if [ -n "$PARENT_PID" ] && process_exists "$PARENT_PID"; then
            # Parent alive, this is a live session
            LIVE_PIDS+=("$pid")
        else
            # Parent dead, kill orphan
            kill -9 "$pid" 2>/dev/null || true
        fi
    done < <(get_mcp_relay_pids)
    
    if [ ${#LIVE_PIDS[@]} -eq 0 ]; then
        break
    fi
    
    if [ $(date +%s) -gt $DEADLINE ]; then
        PIDS_STR=$(IFS=','; echo "${LIVE_PIDS[*]}")
        echo "unity-mcp guard: another session already holds Unity MCP relay (relay_linux PID $PIDS_STR). Unity allows only one MCP session at a time - do Unity work from that session, or close it and run /mcp reconnect here." >&2
        exit 1
    fi
    
    sleep 0.5
done

# All clear, start relay with passed-through arguments
exec "$RELAY" --mcp "$@"
