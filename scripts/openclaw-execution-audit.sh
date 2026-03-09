#!/usr/bin/env bash
set -euo pipefail

SESSIONS_DIR="${OPENCLAW_SESSIONS_DIR:-$HOME/.openclaw/agents/main/sessions}"
LIMIT="${OPENCLAW_AUDIT_LIMIT:-20}"

usage() {
  cat <<'EOF'
Usage:
  openclaw-execution-audit.sh [--limit N] [--sessions-dir PATH]

Detect "promise-only" execution turns:
- user clearly asks to execute/continue/apply a plan
- assistant replies with "已开工/我会去做/继续执行..." style text
- no toolCall appears before the next user/system message
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --limit)
      LIMIT="${2:-}"
      shift 2
      ;;
    --sessions-dir)
      SESSIONS_DIR="${2:-}"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "[execution-audit] unknown argument: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
done

[[ -d "$SESSIONS_DIR" ]] || {
  echo "[execution-audit] sessions dir not found: $SESSIONS_DIR" >&2
  exit 1
}

if ! [[ "$LIMIT" =~ ^[0-9]+$ ]] || (( LIMIT <= 0 )); then
  echo "[execution-audit] --limit must be a positive integer" >&2
  exit 1
fi

export SESSIONS_DIR LIMIT

ruby <<'RUBY'
require "json"
require "time"

sessions_dir = ENV.fetch("SESSIONS_DIR")
limit = ENV.fetch("LIMIT").to_i

trigger_re = /
  (就按照这个方案来|按上面的方案|按照上面的方案|直接落地|开始执行|继续执行|开工|落实)
/x

promise_re = /
  (已开工|我会按这个方案|我会直接落地|我这就去做|我继续推进|我会继续执行|我会按这个方案直接落地并启用)
/x

violations = []

session_files = Dir.glob(File.join(sessions_dir, "*.jsonl"))
  .sort_by { |path| File.mtime(path) }
  .reverse
  .first(limit)

session_files.each do |path|
  rows = File.readlines(path, chomp: true).map do |line|
    next if line.strip.empty?
    JSON.parse(line)
  rescue JSON::ParserError
    nil
  end.compact

  rows.each_with_index do |row, idx|
    msg = row["message"]
    next unless msg.is_a?(Hash)
    next unless msg["role"] == "user"

    user_text = Array(msg["content"]).map { |part| part["text"] if part.is_a?(Hash) }.compact.join("\n")
    next unless user_text.match?(trigger_re)

    j = idx + 1
    saw_tool = false
    assistant_reply = nil

    while j < rows.length
      next_row = rows[j]
      next_msg = next_row["message"]
      break unless next_msg.is_a?(Hash)

      role = next_msg["role"]

      if role == "assistant"
        contents = Array(next_msg["content"])
        if contents.any? { |part| part.is_a?(Hash) && part["type"] == "toolCall" }
          saw_tool = true
          break
        end

        text = contents.map { |part| part["text"] if part.is_a?(Hash) }.compact.join("\n")
        if !text.empty?
          assistant_reply = {
            text: text,
            timestamp: next_row["timestamp"],
            row: next_row
          }
          break
        end
      elsif role == "toolResult"
        saw_tool = true
        break
      elsif role == "user"
        break
      end

      j += 1
    end

    next if saw_tool
    next if assistant_reply.nil?
    next unless assistant_reply[:text].match?(promise_re)

    violations << {
      file: path,
      session_id: rows.find { |r| r["type"] == "session" }&.dig("id"),
      user_text: user_text,
      assistant_text: assistant_reply[:text],
      assistant_timestamp: assistant_reply[:timestamp]
    }
  end
end

out = {
  scannedSessions: session_files.length,
  scannedDir: sessions_dir,
  violations: violations
}

puts JSON.pretty_generate(out)
exit(violations.empty? ? 0 : 2)
RUBY
