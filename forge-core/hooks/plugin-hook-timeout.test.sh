#!/usr/bin/env bash
# plugin-hook-timeout.test.sh — 판정 상한(hook_deadline_guard|hook_entry <이름> <N>)을 쓰는 훅은 plugin.json 등록 timeout 이 N 이상이어야 한다.
#   왜: 상한은 등록 timeout 의 절반을 자기 몫으로 잡는다 — 등록이 더 짧으면 Claude Code 가 먼저 끊어 fail-closed exit 2 가 오지 않는다
#   (forge-plugins PR #110 검수 HIGH · main-write-guard 등록 10 ↔ 상한 60).
set -u
HERE="$(cd "$(dirname "$0")" && pwd)"; ROOT="$(cd "$HERE/.." && pwd)"
python3 - "$ROOT" <<'PY'
import json, os, re, sys
root = sys.argv[1]; p = json.load(open(os.path.join(root, ".claude-plugin", "plugin.json")))
reg = {}
for ev in (p.get("hooks") or {}).values():
    for grp in ev:
        for h in grp.get("hooks", []):
            m = re.search(r"/hooks/([\w.-]+\.sh)", h.get("command", ""))
            if m: reg.setdefault(m.group(1), []).append(h.get("timeout", 60))
F = n = 0
for name, outs in sorted(reg.items()):
    path = os.path.join(root, "hooks", name)
    if not os.path.isfile(path): continue
    m = re.search(r"(?:hook_deadline_guard|hook_entry)(?:_input)?\s+\S+\s+(\d+)", open(path, encoding="utf-8", errors="replace").read())
    if not m: continue
    need = int(m.group(1))
    for t in outs:
        n += 1
        if t < need: F += 1; print("  FAIL  %s — 등록 timeout %s < 상한 인자 %d" % (name, t, need))
        else: print("  PASS  %s — 등록 timeout %s ≥ 상한 인자 %d" % (name, t, need))
if n == 0: F += 1; print("  FAIL  상한을 쓰는 등록 훅 0개 — 이 검사가 헛돈다")
print("결과: PASS=%d FAIL=%d" % (n - (F if n else 0), F)); sys.exit(1 if F else 0)
PY
