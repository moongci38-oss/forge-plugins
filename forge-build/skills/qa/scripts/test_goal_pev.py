#!/usr/bin/env python3
"""goal-pev.py orphan-wiring 검증 — same_issue / plateau 발화 + cross-process 계약(E) + 결함 회귀.

실행: python3 test_goal_pev.py   (exit 0 = ALL PASS)
대상 결함(cr-double P4c-3): same_issue (1) 누적-vs-연속 혼동 + collision-inflation, (2) run간 stale 누수.
call-budget: goal-pev STOP_CALL_CAP 제거됨(SID 비대칭, payload 없는 스크립트라 불가) → hook check_call_cap
WARN-only로 단일화. E3 = payload-SID 우선 정렬 / E8 = no-payload-SID(unknown 버킷) WARN 발화·비차단(SID-unset
실패 class 커버). E6 = resume stale-result 클리어 / E7 = backstop를 goal-pev state.cycle에서 읽음.
"""
import json
import os
import subprocess
import sys
import tempfile
from pathlib import Path

PEV = str(Path(__file__).resolve().parent / "goal-pev.py")
# legacy: 현 goal-pev는 in-process state['same_issue_count']를 쓰고 이 /tmp tracker를 사용하지 않음.
# 동일 머신에 구 코드경로가 남긴 stale tracker가 same-issue-key.py 로드 시 영향 주지 않도록 방어 정리만.
LEGACY_TRACKER = "/tmp/qa-same-issue-tracker.json"


def run_pev(workdir, env_extra):
    # goal-pev은 STOP_CALL_CAP 제거 후 SID 의존 코드가 전무 → drop_sid 파라미터 불요(제거).
    # SID-unset 회귀는 hook 경로(run_hook drop_sid=True, E8)에서 검증.
    env = dict(os.environ)
    env.update(env_extra)
    p = subprocess.run([sys.executable, PEV, "--condition", "test", "--scope", "full"],
                       cwd=workdir, env=env, capture_output=True, text=True, timeout=60)
    if "Traceback" in p.stderr:  # crash가 stale state로 가짜 PASS 내는 것 방지
        raise RuntimeError(f"goal-pev CRASHED:\n{p.stderr[-600:]}")
    return json.loads(Path(workdir, "docs/qa/goal-loop-state.json").read_text())


def setup(workdir, state, qa_report="Scenario 1: FAIL\n", bug_report=None):
    qa = Path(workdir, "docs/qa")
    qa.mkdir(parents=True, exist_ok=True)
    (qa / "2026-test-qa-report.md").write_text("# QA Report\n" + qa_report)
    if bug_report is not None:
        (qa / "2026-test-bug-report.md").write_text(bug_report)
    (qa / "goal-loop-state.json").write_text(json.dumps(state))


def fresh_state():
    return {"cycle": 0, "same_issue_count": {}, "history": []}


def rm_tracker():
    # legacy-file cleanup only (현 코드는 in-process — LEGACY_TRACKER 참조 주석)
    if os.path.exists(LEGACY_TRACKER):
        os.remove(LEGACY_TRACKER)


results = {}

# (A 제거) goal-pev STOP_CALL_CAP 폐지 — call-budget는 hook check_call_cap(WARN-only)으로 단일화. E3가 검증.

# ── B: same_issue 3연속 사이클 → STOP (정상 경로) ──
rm_tracker()
with tempfile.TemporaryDirectory() as d:
    bug = ("# Bug Report\n## Bug #1\nWhere: src/auth/login.ts\n"
           "function validateToken throws AuthError\nHTTP 401\n")
    setup(d, fresh_state(), bug_report=bug)
    seq = []
    for _ in range(3):
        st = run_pev(d, {"CLAUDE_SESSION_ID": "pevtestB", "QA_PLATEAU_EPSILON": "999"})
        seq.append((st.get("result"), max(st.get("same_issue_count", {}).values(), default=0)))
    results["B same_issue 3연속→STOP"] = (st.get("result") == "STOP_SAME_ISSUE" and not seq[0][0], seq)

# ── B2 (회귀): 한 사이클 내 동일 known fingerprint 2 bug = dedup → count 1 (NOT 2) ──
rm_tracker()
with tempfile.TemporaryDirectory() as d:
    same = "Where: src/auth/login.ts\nfunction validateToken throws AuthError\nHTTP 401\n"
    bug = f"# Bug Report\n## Bug #1\n{same}## Bug #2\n{same}"  # 동일 triple → 1 fingerprint
    setup(d, fresh_state(), bug_report=bug)
    st = run_pev(d, {"CLAUDE_SESSION_ID": "pevtestB2", "QA_PLATEAU_EPSILON": "999"})
    mx = max(st.get("same_issue_count", {}).values(), default=0)
    results["B2 known-collision dedup count1"] = (st.get("result") != "STOP_SAME_ISSUE" and mx == 1, (st.get("result"), mx))

# ── B5 (회귀): 전부-unknown vague bug = 신뢰불가 fingerprint skip → same_issue 미카운트 ──
rm_tracker()
with tempfile.TemporaryDirectory() as d:
    bug = "# Bug Report\n## Bug #1\nvague\n## Bug #2\nblah\n## Bug #3\nhmm\n"  # 전부 unknown → skip
    setup(d, fresh_state(), bug_report=bug)
    seq = []
    for _ in range(3):
        st = run_pev(d, {"CLAUDE_SESSION_ID": "pevtestB5", "QA_PLATEAU_EPSILON": "0"})
        seq.append(max(st.get("same_issue_count", {}).values(), default=0))
    # 3사이클 모두 unknown → skip → count 0 유지 → STOP_SAME_ISSUE 영구 미발화(가짜 same_issue 방지)
    results["B5 unknown skip NOT counted"] = (st.get("result") != "STOP_SAME_ISSUE" and max(seq) == 0, seq)

# ── B6 (회귀, HIGH): 인라인 'Bug #2' 언급은 섹션 아님 → fingerprint 대상 제외(full-report collapse 차단) ──
rm_tracker()
with tempfile.TemporaryDirectory() as d:
    bug = ("# Bug Report\n## Bug #1\nWhere: src/a.ts\nfunction f1 throws TypeError\n"
           "관련: see Bug #2 for context (인라인 언급 — 섹션 아님)\n")
    setup(d, fresh_state(), bug_report=bug)
    st = run_pev(d, {"CLAUDE_SESSION_ID": "pevtestB6", "QA_PLATEAU_EPSILON": "999"})
    # 섹션 헤더는 Bug #1 하나뿐 → fingerprint 1개. 인라인 #2가 full-report로 collapse하지 않음
    results["B6 inline-mention 제외"] = (len(st.get("same_issue_count", {})) == 1, st.get("same_issue_count"))

# ── B3 (회귀): bug 부재 사이클 → 연속카운트 reset ──
rm_tracker()
with tempfile.TemporaryDirectory() as d:
    bug = ("# Bug Report\n## Bug #1\nWhere: src/x.ts\nfunction foo throws TypeError\n")
    setup(d, fresh_state(), bug_report=bug)
    run_pev(d, {"CLAUDE_SESSION_ID": "pevtestB3", "QA_PLATEAU_EPSILON": "999"})  # cycle1: count 1
    # bug-report 제거 → 다음 사이클 present 비어 → reset
    os.remove(Path(d, "docs/qa", "2026-test-bug-report.md"))
    st = run_pev(d, {"CLAUDE_SESSION_ID": "pevtestB3", "QA_PLATEAU_EPSILON": "999"})
    mx = max(st.get("same_issue_count", {}).values(), default=0)
    results["B3 reset-on-absence"] = (mx == 0, ("count", mx))

# ── D (회귀): run간 stale 누수 → 사이클1 reset ──
rm_tracker()
with tempfile.TemporaryDirectory() as d:
    bug = ("# Bug Report\n## Bug #1\nWhere: src/y.ts\nfunction bar throws ValueError\n")
    # stale state: 이전 run에서 어떤 fp가 5연속이었다고 가정 (cycle 0 = fresh run)
    stale = fresh_state()
    stale["same_issue_count"] = {"deadbeef" * 8: 5}
    setup(d, stale, bug_report=bug)
    st = run_pev(d, {"CLAUDE_SESSION_ID": "pevtestD", "QA_PLATEAU_EPSILON": "999"})
    # cycle1 reset → stale 5 제거, 현 bug만 count 1 → STOP 아님
    results["D cross-run stale reset"] = (st.get("result") != "STOP_SAME_ISSUE", (st.get("result"), st.get("same_issue_count")))

# ── C: plateau 발화 ──
rm_tracker()
with tempfile.TemporaryDirectory() as d:
    state = fresh_state()
    state["cycle"] = 2
    state["history"] = [{"cycle": 1, "result": "fail", "fail": 7, "ts": "t"},
                        {"cycle": 2, "result": "fail", "fail": 6, "ts": "t"}]
    setup(d, state, qa_report="FAIL\nFAIL\nFAIL\nFAIL\nFAIL\n")  # fail=5 → [7,6,5] Δ1,1<ε5
    st = run_pev(d, {"CLAUDE_SESSION_ID": "pevtestC"})
    results["C plateau→STOP"] = (st.get("result") == "STOP_PLATEAU", st.get("result"), [h.get("fail") for h in st.get("history", [])])

# ── B4 (회귀): present→absent→present transition은 3연속 아님 → STOP 금지 ──
rm_tracker()
with tempfile.TemporaryDirectory() as d:
    bugfile = Path(d, "docs/qa", "2026-test-bug-report.md")
    bug = ("# Bug Report\n## Bug #1\nWhere: src/z.ts\nfunction baz throws KeyError\n")
    setup(d, fresh_state(), bug_report=bug)
    # QA_PLATEAU_EPSILON=0 → constant fail(Δ=0)은 회귀(Δ<0) 아니라 plateau 비발화 → same_issue transition만 격리 검증
    env = {"CLAUDE_SESSION_ID": "pevtestB4", "QA_PLATEAU_EPSILON": "0"}
    run_pev(d, env)                       # cycle1: count 1
    run_pev(d, env)                       # cycle2: count 2
    bugfile.unlink()                      # cycle3: bug 부재 → reset(0)
    run_pev(d, env)
    bugfile.write_text(bug)               # cycle4: 재출현 → count 1 (NOT 3-consecutive)
    st = run_pev(d, env)
    mx = max(st.get("same_issue_count", {}).values(), default=0)
    results["B4 transition NOT 3-consec"] = (st.get("result") != "STOP_SAME_ISSUE" and mx == 1, (st.get("result"), mx))

# ── C2 (회귀): 새 run이 stale history 물려받아도 cycle1 reset → false plateau 금지 ──
rm_tracker()
with tempfile.TemporaryDirectory() as d:
    stale = fresh_state()  # cycle 0 = fresh run
    stale["history"] = [{"cycle": 1, "result": "fail", "fail": 7, "ts": "t"},
                        {"cycle": 2, "result": "fail", "fail": 6, "ts": "t"},
                        {"cycle": 3, "result": "fail", "fail": 5, "ts": "t"}]  # Δ<ε라면 plateau 유발했을 stale
    setup(d, stale, qa_report="FAIL\nFAIL\nFAIL\nFAIL\n")
    st = run_pev(d, {"CLAUDE_SESSION_ID": "pevtestC2"})
    # cycle1 history reset → 데이터포인트 1개 → plateau 미발화
    results["C2 plateau cross-run reset"] = (st.get("result") != "STOP_PLATEAU", (st.get("result"), [h.get("fail") for h in st.get("history", [])]))

# (E 절 삭제 2026-10-15 #2692) 소비자 훅 qa-event-router.sh 가 파일째 지워져 E1~E13 이 돌릴 대상이 없다.

rm_tracker()
print("=== goal-pev orphan-wiring + 결함 회귀 ===")
allpass = True
for k, v in results.items():
    ok = v[0]
    allpass = allpass and ok
    print(f"  [{'PASS' if ok else 'FAIL'}] {k}: {v[1:]}")
print("ALL PASS" if allpass else "SOME FAILED")
sys.exit(0 if allpass else 1)
