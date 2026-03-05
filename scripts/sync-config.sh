#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BASE_CONFIG_PATH="${BASE_CONFIG_PATH:-$ROOT_DIR/config/openclaw.base.json}"
LOCAL_PATCH_PATH="${LOCAL_PATCH_PATH:-$ROOT_DIR/config/openclaw.local.patch.json}"
CATALOG_PATH="${CATALOG_PATH:-$ROOT_DIR/skills/catalog.yaml}"
ENV_FILE="${OPENCLAW_ENV_FILE:-$ROOT_DIR/.env.local}"
TARGET_CONFIG="${OPENCLAW_CONFIG_TARGET:-$HOME/.openclaw/openclaw.json}"
BACKUP_ROOT="${OPENCLAW_BACKUP_DIR:-$HOME/.openclaw/backup}"

[[ -f "$BASE_CONFIG_PATH" ]] || { echo "[sync-config] missing base config: $BASE_CONFIG_PATH" >&2; exit 1; }
[[ -f "$CATALOG_PATH" ]] || { echo "[sync-config] missing catalog: $CATALOG_PATH" >&2; exit 1; }
[[ -f "$ENV_FILE" ]] || { echo "[sync-config] missing env file: $ENV_FILE" >&2; exit 1; }

tmp_empty_json="$(mktemp)"
echo '{}' > "$tmp_empty_json"

if [[ -f "$LOCAL_PATCH_PATH" ]]; then
  PATCH_PATH="$LOCAL_PATCH_PATH"
else
  PATCH_PATH="$tmp_empty_json"
fi

set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

llm_mode="${OPENCLAW_LLM_MODE:-openai-codex}"
openai_model="${OPENCLAW_OPENAI_MODEL:-openai-codex/gpt-5.3-codex}"
openai_model_params_json="${OPENCLAW_OPENAI_MODEL_PARAMS_JSON:-}"
local_provider="${OPENCLAW_LOCAL_PROVIDER:-local}"
local_model_id="${OPENCLAW_LOCAL_MODEL_ID:-my-local-model}"
local_model_name="${OPENCLAW_LOCAL_MODEL_NAME:-Local Model}"
local_base_url="${OPENCLAW_LOCAL_BASE_URL:-http://127.0.0.1:1234/v1}"
local_api="${OPENCLAW_LOCAL_API:-openai-responses}"
local_api_key="${OPENCLAW_LOCAL_API_KEY:-local-noauth}"
local_context_window="${OPENCLAW_LOCAL_CONTEXT_WINDOW:-128000}"
local_max_tokens="${OPENCLAW_LOCAL_MAX_TOKENS:-8192}"
local_reasoning="${OPENCLAW_LOCAL_REASONING:-false}"
local_model_params_json="${OPENCLAW_LOCAL_MODEL_PARAMS_JSON:-}"
local_toolcall_adapter="${OPENCLAW_LOCAL_TOOLCALL_ADAPTER:-off}"
local_toolcall_adapter_base_url="${OPENCLAW_LOCAL_TOOLCALL_ADAPTER_BASE_URL:-http://127.0.0.1:31001/v1}"
memory_flush_enabled="${OPENCLAW_MEMORY_FLUSH_ENABLED:-}"
thinking_default="${OPENCLAW_THINKING_DEFAULT:-off}"
telegram_stream_mode="${OPENCLAW_TELEGRAM_STREAM_MODE:-keep}"
web_search_mode="${OPENCLAW_WEB_SEARCH_MODE:-auto}"
web_search_provider="brave"
web_search_api_key="${OPENCLAW_WEB_SEARCH_API_KEY:-${BRAVE_API_KEY:-}}"

case "$llm_mode" in
  openai-codex|local) ;;
  *)
    echo "[sync-config] invalid OPENCLAW_LLM_MODE: $llm_mode (expected: openai-codex or local)" >&2
    exit 1
    ;;
esac

case "$local_toolcall_adapter" in
  off|sglang) ;;
  *)
    echo "[sync-config] invalid OPENCLAW_LOCAL_TOOLCALL_ADAPTER: $local_toolcall_adapter (expected: off or sglang)" >&2
    exit 1
    ;;
esac

case "$web_search_mode" in
  auto|off|brave) ;;
  *)
    echo "[sync-config] invalid OPENCLAW_WEB_SEARCH_MODE: $web_search_mode (expected: auto, off, or brave)" >&2
    exit 1
    ;;
esac

case "$thinking_default" in
  off|minimal|low|medium|high|xhigh) ;;
  *)
    echo "[sync-config] invalid OPENCLAW_THINKING_DEFAULT: $thinking_default (expected: off|minimal|low|medium|high|xhigh)" >&2
    exit 1
    ;;
esac

case "$telegram_stream_mode" in
  keep|off|partial|block) ;;
  *)
    echo "[sync-config] invalid OPENCLAW_TELEGRAM_STREAM_MODE: $telegram_stream_mode (expected: keep|off|partial|block)" >&2
    exit 1
    ;;
esac

if [[ "$llm_mode" == "local" && "$local_toolcall_adapter" == "sglang" ]]; then
  local_base_url="$local_toolcall_adapter_base_url"
  if [[ -z "$memory_flush_enabled" ]]; then
    memory_flush_enabled="false"
  fi
  echo "[sync-config] local toolcall adapter enabled (sglang): $local_base_url"
fi

if [[ -z "$memory_flush_enabled" ]]; then
  memory_flush_enabled="true"
fi

if [[ -z "$openai_model" || -z "$local_provider" || -z "$local_model_id" || -z "$local_base_url" || -z "$local_api" || -z "$local_api_key" ]]; then
  echo "[sync-config] local/openai model settings contain empty required values" >&2
  exit 1
fi

if ! [[ "$local_context_window" =~ ^[0-9]+$ && "$local_max_tokens" =~ ^[0-9]+$ ]]; then
  echo "[sync-config] OPENCLAW_LOCAL_CONTEXT_WINDOW and OPENCLAW_LOCAL_MAX_TOKENS must be positive integers" >&2
  exit 1
fi

if [[ "$local_reasoning" != "true" && "$local_reasoning" != "false" ]]; then
  echo "[sync-config] OPENCLAW_LOCAL_REASONING must be true or false" >&2
  exit 1
fi

if [[ "$memory_flush_enabled" != "true" && "$memory_flush_enabled" != "false" ]]; then
  echo "[sync-config] OPENCLAW_MEMORY_FLUSH_ENABLED must be true or false" >&2
  exit 1
fi

effective_web_search_mode="$web_search_mode"
if [[ "$effective_web_search_mode" == "auto" ]]; then
  if [[ -n "$web_search_api_key" ]]; then
    effective_web_search_mode="brave"
  else
    effective_web_search_mode="off"
  fi
fi

web_search_enabled="false"
if [[ "$effective_web_search_mode" == "brave" ]]; then
  if [[ -z "$web_search_api_key" ]]; then
    echo "[sync-config] OPENCLAW_WEB_SEARCH_MODE=brave but API key is missing; disabling web_search" >&2
    effective_web_search_mode="off"
  else
    web_search_enabled="true"
  fi
fi

llm_json_file="$(mktemp)"
ruby -rjson -e '
  mode = ARGV[0]
  openai_model = ARGV[1]
  local_provider = ARGV[2]
  local_model_id = ARGV[3]
  local_model_name = ARGV[4]
  local_base_url = ARGV[5]
  local_api = ARGV[6]
  local_api_key = ARGV[7]
  local_context_window = ARGV[8].to_i
  local_max_tokens = ARGV[9].to_i
  local_reasoning = ARGV[10] == "true"
  memory_flush_enabled = ARGV[11] == "true"
  thinking_default = ARGV[12]
  openai_model_params_raw = ARGV[13]
  local_model_params_raw = ARGV[14]

  openai_model_params = nil
  unless openai_model_params_raw.to_s.strip.empty?
    begin
      parsed = JSON.parse(openai_model_params_raw)
    rescue JSON::ParserError => e
      warn "[sync-config] invalid OPENCLAW_OPENAI_MODEL_PARAMS_JSON: #{e.message}"
      exit 1
    end
    unless parsed.is_a?(Hash)
      warn "[sync-config] OPENCLAW_OPENAI_MODEL_PARAMS_JSON must be a JSON object"
      exit 1
    end
    openai_model_params = parsed
  end

  local_model_params = nil
  unless local_model_params_raw.to_s.strip.empty?
    begin
      parsed = JSON.parse(local_model_params_raw)
    rescue JSON::ParserError => e
      warn "[sync-config] invalid OPENCLAW_LOCAL_MODEL_PARAMS_JSON: #{e.message}"
      exit 1
    end
    unless parsed.is_a?(Hash)
      warn "[sync-config] OPENCLAW_LOCAL_MODEL_PARAMS_JSON must be a JSON object"
      exit 1
    end
    local_model_params = parsed
  end

  local_key = "#{local_provider}/#{local_model_id}"
  primary = mode == "local" ? local_key : openai_model
  openai_model_entry = {}
  openai_model_entry["params"] = openai_model_params unless openai_model_params.nil?
  local_model_entry = {}
  local_model_entry["params"] = local_model_params unless local_model_params.nil?

  out = {
    "agents" => {
      "defaults" => {
        "thinkingDefault" => thinking_default,
        "model" => { "primary" => primary },
        "compaction" => {
          "memoryFlush" => {
            "enabled" => memory_flush_enabled
          }
        },
        "models" => {
          openai_model => openai_model_entry,
          local_key => local_model_entry
        }
      }
    },
    "models" => {
      "mode" => "merge",
      "providers" => {
        local_provider => {
          "baseUrl" => local_base_url,
          "apiKey" => local_api_key,
          "api" => local_api,
          "models" => [
            {
              "id" => local_model_id,
              "name" => local_model_name,
              "reasoning" => local_reasoning,
              "input" => ["text"],
              "cost" => {
                "input" => 0,
                "output" => 0,
                "cacheRead" => 0,
                "cacheWrite" => 0
              },
              "contextWindow" => local_context_window,
              "maxTokens" => local_max_tokens
            }
          ]
        }
      }
    }
  }

  puts JSON.pretty_generate(out)
' \
  "$llm_mode" \
  "$openai_model" \
  "$local_provider" \
  "$local_model_id" \
  "$local_model_name" \
  "$local_base_url" \
  "$local_api" \
  "$local_api_key" \
  "$local_context_window" \
  "$local_max_tokens" \
  "$local_reasoning" \
  "$memory_flush_enabled" \
  "$thinking_default" \
  "$openai_model_params_json" \
  "$local_model_params_json" > "$llm_json_file"

web_json_file="$(mktemp)"
ruby -rjson -e '
  mode = ARGV[0]
  provider = ARGV[1]
  api_key = ARGV[2]
  enabled = mode == "brave"

  search = {
    "enabled" => enabled,
    "provider" => (enabled ? provider : nil),
    "apiKey" => (enabled && !api_key.to_s.empty? ? api_key : nil)
  }

  out = {
    "tools" => {
      "web" => {
        "search" => search,
        "fetch" => {
          "enabled" => true
        }
      }
    }
  }

  puts JSON.pretty_generate(out)
' \
  "$effective_web_search_mode" \
  "$web_search_provider" \
  "$web_search_api_key" > "$web_json_file"

missing_vars="$(ruby -ryaml -e '
  c = YAML.load_file(ARGV[0]) || {}
  miss = []
  (c["skills"] || []).each do |s|
    next unless s["enabled"]
    (s["env"] || {}).each_value do |v|
      v.to_s.scan(/\$\{(\??)([A-Z0-9_]+)\}/).each do |opt, key|
        # ${VAR} => required; ${?VAR} => optional
        miss << key if opt.to_s.empty?
      end
    end
  end
  miss.uniq.each do |k|
    val = ENV[k]
    puts k if val.nil? || val.strip.empty?
  end
' "$CATALOG_PATH")"

if [[ -n "$missing_vars" ]]; then
  echo "[sync-config] missing required env vars:" >&2
  while IFS= read -r k; do
    echo "  - $k" >&2
  done <<< "$missing_vars"
  exit 1
fi

entries_json_file="$(mktemp)"
ruby -ryaml -rjson -e '
  c = YAML.load_file(ARGV[0]) || {}
  out = {}
  (c["skills"] || []).each do |s|
    name = s["name"]
    next if name.nil? || name.empty?

    entry = { "enabled" => !!s["enabled"] }
    env = s["env"] || {}
    unless env.empty?
      rendered = {}
      env.each do |k, v|
        rendered[k] = v.to_s.gsub(/\$\{(\??)([A-Z0-9_]+)\}/) do
          opt = Regexp.last_match(1)
          key = Regexp.last_match(2)
          val = ENV[key]
          if opt == "?"
            val.to_s
          else
            val || ""
          end
        end
      end
      entry["env"] = rendered
    end

    out[name] = entry
  end
  puts JSON.pretty_generate(out)
' "$CATALOG_PATH" > "$entries_json_file"

mkdir -p "$(dirname "$TARGET_CONFIG")"
mkdir -p "$BACKUP_ROOT"

if [[ -f "$TARGET_CONFIG" ]]; then
  ts="$(date +%Y%m%d-%H%M%S)"
  backup_dir="$BACKUP_ROOT/$ts"
  mkdir -p "$backup_dir"
  cp "$TARGET_CONFIG" "$backup_dir/openclaw.json"
  echo "[sync-config] backup created: $backup_dir/openclaw.json"
fi

tmp_target="$(mktemp)"
if [[ -f "$TARGET_CONFIG" ]]; then
  cp "$TARGET_CONFIG" "$tmp_target"
else
  echo '{}' > "$tmp_target"
fi

tmp_out="$(mktemp)"
jq \
  --arg telegramStreamMode "$telegram_stream_mode" \
  --slurpfile base "$BASE_CONFIG_PATH" \
  --slurpfile entries "$entries_json_file" \
  --slurpfile llm "$llm_json_file" \
  --slurpfile web "$web_json_file" \
  --slurpfile patch "$PATCH_PATH" '
  def dmerge(a; b):
    reduce (b | keys_unsorted[]) as $k (a;
      .[$k] = (
        if (a[$k] | type) == "object" and (b[$k] | type) == "object"
        then dmerge(a[$k]; b[$k])
        else b[$k]
        end
      )
    );

  (($base[0] // {}) as $b |
   ($patch[0] // {}) as $p |
   ($llm[0] // {}) as $l |
   ($web[0] // {}) as $w |
   ($entries[0] // {}) as $e |
   (. // {}) as $orig |
   dmerge(dmerge(dmerge(dmerge($orig; $b); $p); $l); $w)
   | .skills = (.skills // {})
   | .skills.entries = ((.skills.entries // {}) + $e)
   | if ($telegramStreamMode != "keep" and (.channels | type) == "object" and (.channels.telegram | type) == "object")
     then .channels.telegram.streamMode = $telegramStreamMode
     else .
     end
  )
' "$tmp_target" > "$tmp_out"

mv "$tmp_out" "$TARGET_CONFIG"
chmod 600 "$TARGET_CONFIG" || true

rm -f "$entries_json_file" "$llm_json_file" "$web_json_file" "$tmp_target" "$tmp_empty_json"
echo "[sync-config] wrote $TARGET_CONFIG"
