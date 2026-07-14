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

# ── E (cross-process 계약): qa-event-router consumer ↔ goal-pev/producer 계약 검증 ──
# parents: [0]=scripts [1]=qa [2]=skills [3]=.claude → hooks는 .claude/hooks = parents[3]
HOOK = str(Path(__file__).resolve().parents[3] / "hooks" / "qa-event-router.sh")
ACCUM = str(Path(__file__).resolve().parents[3] / "hooks" / "loop-call-accum.sh")


def run_hook(workdir, event, payload, env_extra, drop_sid=False):
    env = dict(os.environ)
    if drop_sid:
        env.pop("CLAUDE_SESSION_ID", None)
    env.update(env_extra)
    # 테스트 격리: QA_HOOK_DEPTH 카운터(/tmp/qa-hook-depth-${SID}.txt)를 호출 전 리셋
    # (반복 호출 시 depth 누적으로 false BLOCK 방지 — 실제 세션에선 dispatch 끝에 reset됨)
    sid = env.get("CLAUDE_SESSION_ID", "")
    for cand in {sid, str(os.getpid())}:
        try:
            os.remove(f"/tmp/qa-hook-depth-{cand}.txt")
        except OSError:
            pass
    p = subprocess.run(["bash", HOOK, event], cwd=workdir, input=payload,
                       env=env, capture_output=True, text=True, timeout=30)
    return p.stderr


# E1: goal-pev result=STOP_PLATEAU → ralph가 판정 존중(halt, 재주입 안 함)
with tempfile.TemporaryDirectory() as d:
    Path(d, "docs/qa").mkdir(parents=True)
    Path(d, "docs/qa/goal-loop-state.json").write_text(json.dumps(
        {"cycle": 2, "same_issue_count": {}, "history": [], "result": "STOP_PLATEAU"}))
    Path(d, "docs/qa/2026-bug-report.md").write_text("# Bug\n## Bug #1\nFAIL\n")
    err = run_hook(d, "SubagentStop", "{}", {"CLAUDE_SESSION_ID": "e1"})
    results["E1 ralph respects goal-pev STOP"] = ("STOP_PLATEAU" in err and "queue append" not in err, err.strip()[-90:])

# E2: goal-pev result=STOP_SAME_ISSUE → ralph가 result 단일소스로 STOP (legacy /tmp tracker 미참조)
with tempfile.TemporaryDirectory() as d:
    Path(d, "docs/qa").mkdir(parents=True)
    Path(d, "docs/qa/goal-loop-state.json").write_text(json.dumps(
        {"cycle": 3, "same_issue_count": {"x": 3}, "history": [], "result": "STOP_SAME_ISSUE"}))
    Path(d, "docs/qa/2026-bug-report.md").write_text("# Bug\n## Bug #1\nFAIL\n")
    err = run_hook(d, "SubagentStop", "{}", {"CLAUDE_SESSION_ID": "e2"})
    results["E2 ralph respects STOP_SAME_ISSUE"] = ("STOP_SAME_ISSUE" in err and "queue append" not in err, err.strip()[-90:])

# (E4 제거) foreign-kill 방지 테스트 — goal-pev read_call_count 폐지로 moot. hook check_call_cap은
# payload SID를 우선 사용하므로 타 세션 오살 위험 없음(E3가 payload-SID 우선 도출을 검증).

# E3: SID 정렬 — producer/consumer 모두 payload .session_id 사용(CLAUDE_SESSION_ID env 달라도 같은 파일)
with tempfile.TemporaryDirectory() as d:
    Path(d, ".claude").mkdir()
    payload = '{"session_id":"sidmatch","tool_name":"Bash"}'
    for _ in range(3):  # producer 3회
        subprocess.run(["bash", ACCUM], cwd=d, input=payload, capture_output=True, text=True)
    cnt = int(Path(d, ".claude/agent-budget/sidmatch.calls").read_text().strip())
    # consumer: env CLAUDE_SESSION_ID는 일부러 다른 값 — payload 우선 도출이면 sidmatch.calls(=3) 읽어 WARN
    err = run_hook(d, "PostToolUse", payload, {"QA_CALL_CAP": "2", "CLAUDE_SESSION_ID": "WRONGSID"})
    results["E3 SID align (payload 우선)"] = (cnt == 3 and "tool-call 3/2" in err, (cnt, "WARN" if "tool-call 3" in err else "no-warn(theater!)"))

# E5: result="" + fail>0 → 정상 재주입(queue append) — rewrite 후 정상 경로 보존 확인
with tempfile.TemporaryDirectory() as d:
    Path(d, "docs/qa").mkdir(parents=True)
    Path(d, "docs/qa/goal-loop-state.json").write_text(json.dumps(
        {"cycle": 1, "same_issue_count": {"x": 1}, "history": [], "result": ""}))
    Path(d, "docs/qa/2026-bug-report.md").write_text("# Bug\n## Bug #1\nFAIL\n## Bug #2\nFAIL\n")
    err = run_hook(d, "SubagentStop", "{}", {"CLAUDE_SESSION_ID": "e5"})
    queue = Path(d, "docs/qa/cr-trigger-queue.jsonl")
    results["E5 정상 재주입(queue append)"] = ("queue append" in err and queue.exists() and "STOP" not in err, err.strip()[-80:])

# E6 (r5 MED#2 회귀): resume(cycle>1)에서 persisted stale STOP_*가 사이클 시작 시 클리어 — cycle==1만 리셋이던 갭
with tempfile.TemporaryDirectory() as d:
    # 이전 사이클 terminal(STOP_PLATEAU) 잔류 + cycle=2 → goal-pev resume은 cycle=3(>1)이라 옛 cycle1-only 리셋
    # 로는 안 지워졌음. 현재 fix는 매 사이클 result="" → 새 terminal 미발화 시 ""로 클리어돼야.
    bug = "# Bug Report\n## Bug #1\nWhere: src/r.ts\nfunction qq throws IOError\n"
    stale = {"cycle": 2, "same_issue_count": {}, "history": [], "result": "STOP_PLATEAU"}
    setup(d, stale, bug_report=bug)  # qa-report=FAIL 1건(기본) → not-pass, 단일 bug → same_issue<3
    st = run_pev(d, {"CLAUDE_SESSION_ID": "pevtestE6", "QA_PLATEAU_EPSILON": "999"})
    # cycle 3: stale STOP_PLATEAU 클리어 → terminal 미발화 → result="" (재주입 가능 상태). NOT 잔류 STOP_PLATEAU.
    results["E6 resume stale-result 클리어"] = (st.get("result") == "" and st.get("cycle") == 3, (st.get("result"), st.get("cycle")))

# E7 (r5 MED#1 회귀): ralph backstop이 /tmp 독립카운터 아닌 goal-pev state.cycle을 읽어 ≥6 halt
with tempfile.TemporaryDirectory() as d:
    Path(d, "docs/qa").mkdir(parents=True)
    # result는 terminal 아님("") 이지만 state.cycle=6 → backstop 발화해야. (/tmp 카운터는 부재 = 0)
    Path(d, "docs/qa/goal-loop-state.json").write_text(json.dumps(
        {"cycle": 6, "same_issue_count": {}, "history": [], "result": ""}))
    Path(d, "docs/qa/2026-bug-report.md").write_text("# Bug\n## Bug #1\nFAIL\n")
    err = run_hook(d, "SubagentStop", "{}", {"CLAUDE_SESSION_ID": "e7"})
    results["E7 backstop reads state.cycle"] = ("6사이클 초과(backstop" in err and "queue append" not in err, err.strip()[-90:])

# E8 (r6, Codex HIGH 회귀): no-payload-SID 경로 커버 — STOP_CALL_CAP 제거를 정당화한 'SID 신뢰불가' 실패 class.
# payload에 session_id 없음 + CLAUDE_SESSION_ID env 없음 → producer/consumer 모두 'unknown' 버킷 fallback.
# 검증: 공유 unknown 버킷에서 check_call_cap WARN이 **발화**(theater 아님 — 같은 버킷 정렬) + **WARN-only(비차단)**.
with tempfile.TemporaryDirectory() as d:
    cb = Path(d, ".claude/agent-budget"); cb.mkdir(parents=True)
    (cb / "unknown.calls").write_text("5")  # producer가 SID 없을 때 누적하는 동일 fallback 버킷
    # drop_sid=True → CLAUDE_SESSION_ID 제거, payload="{}" → session_id 부재 → consumer도 'unknown'
    err = run_hook(d, "PostToolUse", "{}", {"QA_CALL_CAP": "2"}, drop_sid=True)
    # WARN 발화(공유 unknown 버킷 = no-SID에서도 정렬) + 비차단(STOP/halt 아님). cap=2, current=5 → 5/2.
    results["E8 no-SID unknown-버킷 WARN(비차단)"] = ("tool-call 5/2" in err and "STOP" not in err, err.strip()[-90:])

# E9 (r7, Gemini MED 회귀): backstop 한계값이 QA_MAX_CYCLES 단일소스 — 하드코딩 6 아님.
# state.cycle=6 + QA_MAX_CYCLES=10 → backstop 미발화(6<10)여야(옛 하드코딩 6이면 여기서 잘못 STOP).
with tempfile.TemporaryDirectory() as d:
    Path(d, "docs/qa").mkdir(parents=True)
    Path(d, "docs/qa/goal-loop-state.json").write_text(json.dumps(
        {"cycle": 6, "same_issue_count": {}, "history": [], "result": ""}))
    Path(d, "docs/qa/2026-bug-report.md").write_text("# Bug\n## Bug #1\nFAIL\n")
    err = run_hook(d, "SubagentStop", "{}", {"CLAUDE_SESSION_ID": "e9", "QA_MAX_CYCLES": "10"})
    # 6<10 → backstop STOP 아님 → fail>0이라 재주입(queue append)이 정상
    results["E9 backstop 한계 QA_MAX_CYCLES 단일소스"] = ("초과(backstop" not in err and "queue append" in err, err.strip()[-90:])

# E10 (회귀, HIGH): zero-FAIL(QA통과 정상경로)에서 set -e abort 금지 — fail_count grep no-match 가드.
# 이전 r4~r7 리뷰/테스트가 못 잡은 이유: E1/E2/E7은 terminal/backstop으로 fail_count 라인 도달 전 return,
# E5는 bug-report에 FAIL 있어 grep 매치. zero-FAIL이 fail_count 라인까지 가는 경로가 미커버였음.
with tempfile.TemporaryDirectory() as d:
    Path(d, "docs/qa").mkdir(parents=True)
    # non-terminal(result="" cycle=2) → stop_reason 없음 → fail_count 라인 도달. bug-report에 FAIL/❌ 0건.
    Path(d, "docs/qa/goal-loop-state.json").write_text(json.dumps(
        {"cycle": 2, "same_issue_count": {}, "history": [], "result": ""}))
    Path(d, "docs/qa/2026-bug-report.md").write_text("# Bug\n## Bug #1\nAll scenarios PASS. Resolved.\n")
    sid = "e10"
    for cand in {sid, str(os.getpid())}:
        try: os.remove(f"/tmp/qa-hook-depth-{cand}.txt")
        except OSError: pass
    env = dict(os.environ); env["CLAUDE_SESSION_ID"] = sid
    p = subprocess.run(["bash", HOOK, "SubagentStop"], cwd=d, input="{}",
                       env=env, capture_output=True, text=True, timeout=30)
    # set -e abort면 exit≠0 + 완료로그 부재. 가드 정상이면 exit0 + 'QA 완료'.
    results["E10 zero-FAIL set -e abort 금지"] = (p.returncode == 0 and "QA 완료" in p.stderr, (p.returncode, p.stderr.strip()[-70:]))

# E11 (r8, Gemini HIGH 회귀): env-fallback 중간 tier 정렬 — payload SID 없고 CLAUDE_SESSION_ID 있을 때
# producer(loop-call-accum.sh)/consumer(check_call_cap)가 둘 다 CLAUDE_SESSION_ID로 fallback → 같은 .calls 버킷.
# (E3=payload-SID tier, E8=no-SID 'unknown' tier 사이의 미커버 중간 tier — 불일치 시 WARN theater 재발.)
with tempfile.TemporaryDirectory() as d:
    Path(d, ".claude").mkdir()
    payload = '{"tool_name":"Bash"}'   # session_id 없음 → 양측 CLAUDE_SESSION_ID fallback
    penv = dict(os.environ); penv["CLAUDE_SESSION_ID"] = "e11sid"
    for _ in range(3):  # producer 3회 (payload SID 없음)
        subprocess.run(["bash", ACCUM], cwd=d, input=payload, env=penv, capture_output=True, text=True)
    cnt = int(Path(d, ".claude/agent-budget/e11sid.calls").read_text().strip())
    # consumer: 동일 CLAUDE_SESSION_ID fallback → e11sid.calls(=3) 읽어 WARN. 불일치면 다른 버킷→no-warn(theater).
    err = run_hook(d, "PostToolUse", payload, {"QA_CALL_CAP": "2", "CLAUDE_SESSION_ID": "e11sid"})
    results["E11 env-fallback tier 정렬(producer==consumer)"] = (cnt == 3 and "tool-call 3/2" in err, (cnt, "WARN" if "tool-call 3" in err else "no-warn(misalign!)"))

# (E12 미채택) malformed-JSON 전체-hook 내성은 line46 외 다른 함수의 unguarded jq에서 먼저 abort —
# 실무상 PostToolUse INPUT은 항상 valid JSON이라 미발생(Codex LOW '일관성 갭'). line46 `|| sid=""` 가드는
# 검증된 패턴(E10) 동종 방어로 유지하되, 전체 malformed 내성 추적은 범위 밖(별개·이론적·pre-existing).

# E13 (follow-up #1, depth-guard 회귀): 동일 sid로 N 이벤트 연속(reset 없이) → brick 금지(decrement-on-exit).
# 구 코드(increment-only, reset만 SessionStart)는 4번째 이벤트에 depth 4>3 BLOCK. 현재 trap EXIT decrement로 원복.
with tempfile.TemporaryDirectory() as d:
    Path(d, "docs/qa").mkdir(parents=True)
    Path(d, "docs/qa/goal-loop-state.json").write_text(json.dumps(
        {"cycle": 2, "same_issue_count": {}, "history": [], "result": ""}))
    Path(d, "docs/qa/2026-bug-report.md").write_text("# Bug\n## Bug #1\nFAIL\n")
    dsid = "e13depth"
    try: os.remove(f"/tmp/qa-hook-depth-{dsid}.txt")
    except OSError: pass
    env = dict(os.environ); env["CLAUDE_SESSION_ID"] = dsid
    blocked = 0
    for _ in range(6):  # reset 없이 6회 (구 코드면 4회째 BLOCK)
        p = subprocess.run(["bash", HOOK, "SubagentStop"], cwd=d, input="{}",
                           env=env, capture_output=True, text=True, timeout=30)
        if "BLOCKED" in p.stderr: blocked += 1
    final_depth = Path(f"/tmp/qa-hook-depth-{dsid}.txt").read_text().strip() if Path(f"/tmp/qa-hook-depth-{dsid}.txt").exists() else "?"
    # 6회 대칭 inc/dec면 결정론적으로 final=0이어야 함. '1' 허용은 inc-without-dec 비대칭(누수) 마스킹 →
    # 엄격히 '0' 단언(cr-double LOW). brick 금지는 blocked==0으로 충족.
    results["E13 depth decrement (no brick)"] = (blocked == 0 and final_depth == "0", (f"blocked={blocked}", f"depth={final_depth}"))

rm_tracker()
print("=== goal-pev orphan-wiring + 결함 회귀 ===")
allpass = True
for k, v in results.items():
    ok = v[0]
    allpass = allpass and ok
    print(f"  [{'PASS' if ok else 'FAIL'}] {k}: {v[1:]}")
print("ALL PASS" if allpass else "SOME FAILED")
sys.exit(0 if allpass else 1)
