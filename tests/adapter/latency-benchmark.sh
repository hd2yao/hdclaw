#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SAMPLES="${SAMPLES:-20}"
ADAPTER_URL="${ADAPTER_URL:-http://127.0.0.1:31001/v1/chat/completions}"
OUT_ROOT="${BENCH_OUT_ROOT:-$ROOT_DIR/.runtime/benchmarks}"
BASELINE_SUMMARY="${BASELINE_SUMMARY:-}"

if ! [[ "$SAMPLES" =~ ^[0-9]+$ ]] || [[ "$SAMPLES" -lt 1 ]]; then
  echo "[latency-benchmark] SAMPLES must be a positive integer" >&2
  exit 1
fi

run_id="$(date +%Y%m%d-%H%M%S)"
out_dir="$OUT_ROOT/$run_id"
mkdir -p "$out_dir"

raw_file="$out_dir/raw-times.txt"
sorted_file="$out_dir/sorted-times.txt"
summary_file="$out_dir/summary.json"

REQ='{"model":"mock-model","stream":false,"messages":[{"role":"user","content":"benchmark run"}]}'

for i in $(seq 1 "$SAMPLES"); do
  t="$(curl --max-time 15 -sS -o /dev/null -w '%{time_total}' \
    -H 'content-type: application/json' \
    -d "$REQ" \
    "$ADAPTER_URL")"
  echo "$t" >> "$raw_file"
done

sort -n "$raw_file" > "$sorted_file"

idx50=$(( (SAMPLES * 50 + 99) / 100 ))
idx90=$(( (SAMPLES * 90 + 99) / 100 ))
p50="$(sed -n "${idx50}p" "$sorted_file")"
p90="$(sed -n "${idx90}p" "$sorted_file")"
mean="$(awk '{sum+=$1} END {if (NR==0) print 0; else printf "%.6f", sum/NR}' "$raw_file")"

if [[ -n "$BASELINE_SUMMARY" ]] && [[ -f "$BASELINE_SUMMARY" ]]; then
  baseline_p50="$(jq -r '.p50 // 0' "$BASELINE_SUMMARY")"
  improvement="$(awk -v b="$baseline_p50" -v n="$p50" 'BEGIN {if (b==0) {print 0} else {printf "%.4f", (b-n)/b}}')"
else
  baseline_p50=""
  improvement=""
fi

jq -n \
  --arg runId "$run_id" \
  --arg adapterUrl "$ADAPTER_URL" \
  --argjson samples "$SAMPLES" \
  --arg p50 "$p50" \
  --arg p90 "$p90" \
  --arg mean "$mean" \
  --arg baselineP50 "$baseline_p50" \
  --arg improvement "$improvement" \
  '{
    runId: $runId,
    adapterUrl: $adapterUrl,
    samples: $samples,
    p50: ($p50|tonumber),
    p90: ($p90|tonumber),
    mean: ($mean|tonumber),
    baselineP50: (if $baselineP50 == "" then null else ($baselineP50|tonumber) end),
    improvementRatio: (if $improvement == "" then null else ($improvement|tonumber) end)
  }' > "$summary_file"

echo "[latency-benchmark] summary: $summary_file"
cat "$summary_file"
