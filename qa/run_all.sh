#!/bin/sh
# Re-run every recorded comparison: indicator dumps against the independent reference.
cd "$(dirname "$0")" || exit 1
fail=0
for f in dumps/run1_live.txt dumps/run2_past_15m.txt dumps/run3_past_1h.txt dumps/run4_past_5m.txt dumps/run6_day_modes.txt; do
  echo "== $f"; python3 compare.py "$f" || fail=1
done
echo "== dumps/run5_focus.txt"; python3 focus_check.py dumps/run5_focus.txt || fail=1
[ $fail = 0 ] && echo "ALL CHECKS PASS" || echo "SOME CHECKS FAILED"
exit $fail
