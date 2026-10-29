#!/usr/bin/env bash
# Run a command while recording, once a second, the signals that tell a stalled
# machine apart from a slow test: PSI (/proc/pressure/{cpu,io,memory}),
# /proc/loadavg, the run queue and CPU time split (incl. steal) from /proc/stat,
# and `vmstat 1` when it is installed. On failure it prints the peak `some
# avg10` per resource, the peak load and the longest gap between samples.
#
# The sampler never fails the step: the exit status is the command's. Where
# /proc/pressure is missing (no PSI, or not Linux) it says so once and samples
# what it can.
#
# Usage: scripts/ci/with-stall-sampler.sh <out-dir> <command> [args...]
# Writes <out-dir>/pressure.tsv and, with vmstat, <out-dir>/vmstat.txt.

set -uo pipefail

if [ $# -lt 2 ]; then
  echo "usage: $0 <out-dir> <command> [args...]" >&2
  exit 2
fi
out_dir=$1
shift

note() { printf 'stall-sampler: %s\n' "$*"; }

cols='cpu_some_avg10 cpu_some_total io_some_avg10 io_some_total io_full_avg10 io_full_total memory_some_avg10 memory_some_total memory_full_avg10 memory_full_total load1 load5 procs_running procs_blocked user nice system idle iowait steal'

# One line per sample: time, epoch, then $cols; "-" where a source is missing.
# PSI totals are cumulative stall microseconds; /proc/stat CPU times are
# cumulative ticks. Diff consecutive rows for per-second values.
# shellcheck disable=SC2016 # an awk program, not shell
sample_awk='
FILENAME ~ /\/pressure\/[a-z]+$/ {
  res = FILENAME; sub(/.*\//, "", res)
  for (i = 2; i <= NF; i++) { split($i, kv, "="); v[res "_" $1 "_" kv[1]] = kv[2] }
  next
}
FILENAME ~ /\/loadavg$/ { v["load1"] = $1; v["load5"] = $2; next }
FILENAME ~ /\/stat$/ {
  if ($1 == "cpu") {
    v["user"] = $2; v["nice"] = $3; v["system"] = $4; v["idle"] = $5; v["iowait"] = $6; v["steal"] = $9
  } else if ($1 == "procs_running" || $1 == "procs_blocked") v[$1] = $2
  next
}
END {
  n = split(cols, c, " ")
  line = t "\t" e
  for (i = 1; i <= n; i++) line = line "\t" ((c[i] in v) ? v[c[i]] : "-")
  print line
}'

sources=''
for f in /proc/pressure/cpu /proc/pressure/io /proc/pressure/memory /proc/loadavg /proc/stat; do
  # `cat` rather than `-r`: with PSI compiled in but disabled, the files
  # exist and reading them fails.
  if cat "$f" >/dev/null 2>&1; then sources="$sources $f"; fi
done

sampler_pids=''
samples="$out_dir/pressure.tsv"

start_sampler() {
  if ! mkdir -p "$out_dir" 2>/dev/null; then
    note "cannot create $out_dir; not sampling"
    return
  fi
  case "$sources" in
    '') note "no /proc here; not sampling PSI, load or CPU times" ;;
    *pressure*) ;;
    *) note "/proc/pressure is not readable here (no PSI); sampling load and CPU times only" ;;
  esac
  if [ -n "$sources" ]; then
    {
      printf 'time\tepoch'
      for c in $cols; do printf '\t%s' "$c"; done
      printf '\n'
      while :; do
        now=$(date -u '+%Y-%m-%dT%H:%M:%SZ %s')
        # shellcheck disable=SC2086 # $sources is a space-separated file list
        awk -v t="${now% *}" -v e="${now#* }" -v cols="$cols" "$sample_awk" $sources
        sleep 1
      done
    } >"$samples" 2>/dev/null </dev/null &
    sampler_pids="$sampler_pids $!"
  fi
  if command -v vmstat >/dev/null 2>&1; then
    vmstat_args='-n 1'
    if vmstat -t 1 1 >/dev/null 2>&1; then vmstat_args='-n -t 1'; fi
    # shellcheck disable=SC2086 # word-split flags on purpose
    vmstat $vmstat_args >"$out_dir/vmstat.txt" 2>&1 </dev/null &
    sampler_pids="$sampler_pids $!"
  else
    note "vmstat is not installed; skipping it"
  fi
}

# shellcheck disable=SC2329 # called from the EXIT trap
stop_sampler() {
  for pid in $sampler_pids; do
    kill "$pid" 2>/dev/null
    wait "$pid" 2>/dev/null
  done
  sampler_pids=''
}

# shellcheck disable=SC2329 # called from the EXIT trap
summarize() {
  [ -s "$samples" ] || return 0
  awk -F '\t' -v file="$samples" '
    NR == 1 { for (i = 1; i <= NF; i++) col[$i] = i; next }
    {
      n++
      if (n == 1) first = $1
      last = $1
      split("cpu io memory", res, " ")
      for (r = 1; r <= 3; r++) {
        k = col[res[r] "_some_avg10"]
        if ($k != "-" && (!(res[r] in peak) || $k + 0 > peak[res[r]])) { peak[res[r]] = $k + 0; at[res[r]] = $1 }
      }
      k = col["load1"]
      if ($k != "-" && (loadat == "" || $k + 0 > load)) { load = $k + 0; loadat = $1 }
      if (prev != "" && $2 - prev > gap) { gap = $2 - prev; gapat = $1 }
      prev = $2
    }
    END {
      printf "stall-sampler: %d samples, %s to %s (UTC)\n", n, first, last
      split("cpu io memory", res, " ")
      for (r = 1; r <= 3; r++) {
        if (res[r] in peak) printf "stall-sampler: peak %s some avg10 = %.2f%% at %s\n", res[r], peak[res[r]], at[res[r]]
        else printf "stall-sampler: peak %s some avg10 = n/a (no PSI)\n", res[r]
      }
      if (loadat != "") printf "stall-sampler: peak load1 = %.2f at %s\n", load, loadat
      if (gapat != "") printf "stall-sampler: longest gap between samples = %d s, ending %s\n", gap, gapat
      printf "stall-sampler: raw samples in %s\n", file
    }' "$samples" 2>/dev/null || true
}

# shellcheck disable=SC2329 # the EXIT trap
finish() {
  rc=$?
  stop_sampler
  if [ "$rc" -ne 0 ]; then summarize; fi
}
trap finish EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

start_sampler
"$@"
exit $?
