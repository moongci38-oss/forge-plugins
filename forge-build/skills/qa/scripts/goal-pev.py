#!/usr/bin/env python3
"""
goal-pev.py — AD-93 §갭 9 (PEV 자율 루프)
Usage: python3 goal-pev.py --condition "scope=auth 모든 시나리오 PASS" [--scope auth] [--max-cycles 6]

PEV (Plan → Execute → Verify) 루프 오케스트레이터.
종료 조건 5종 중 하나 충족 시 즉시 종료.
"""

import argparse
# root-cause: hashlib·subprocess import 제거 — same_issue를 same-issue-key.py 서브프로세스(단조
# --increment, 누수·collision-inflation 결함)에서 in-process fingerprint import로 전환하며 불필요해짐.
# glob·re·importlib는 함수-지역 import를 상단으로 이동(가독성, cr-double Gemini 지적).
import glob
import importlib.util
import json
import os
import re
import sys
from datetime import datetime
from pathlib import Path


MAX_CYCLES = int(os.environ.get("QA_MAX_CYCLES", "6"))
# root-cause: call-count cap(STOP_CALL_CAP)을 goal-pev에서 제거 — producer(loop-call-accum.sh)는 payload
# .session_id로 .calls를 키잉하나 goal-pev은 payload 없는 스크립트라 그 SID를 신뢰성있게 얻지 못함
# (CLAUDE_SESSION_ID는 자주 unset → 0=inert이거나 newest-mtime fallback은 타세션 오살). 4라운드 cr-double이
# 반복 지적한 SID 비대칭의 근본 해소 = call-budget 가드는 payload SID를 가진 hook check_call_cap(WARN-only)에
# 단일화. goal-pev은 SID 불요 결정론 bound만 유지(max_cycles 1순위 + same_issue + plateau). enforcement-theater
# 2단계(WARN-first → 1주 메트릭 → BLOCK 승격)와 정합.
STATE_FILE = "docs/qa/goal-loop-state.json"
# root-cause: SAME_ISSUE_FILE(/tmp/qa-same-issue-tracker.json) 상수 제거 — same_issue를 공유 /tmp
# tracker(단조·run간 누수) 대신 in-process fingerprint + state["same_issue_count"] 연속카운트로 전환해
# 미사용. (qa-event-router.sh의 별도 tracker 소비는 본 P4c-3 범위 밖 — 그쪽은 여전히 producer 부재.)

# ── ralph-loop hook 배선 검증 ──────────────────────────────────────────────────
# goal-pev.py는 사이클당 1회 실행 후 break한다 (단일-pass-by-design).
# 자동 재주입은 SubagentStop "ralph-loop" 훅이 담당한다.
# 훅이 배선되지 않으면 루프가 silently single-pass로 끝난다.

def _check_ralph_hook() -> bool:
    """Returns True if the ralph-loop SubagentStop hook appears to be wired.
    # root-cause: F4 — replaced unbounded recursive glob+read_text of all hook files with a
    # bounded check: read only settings.json files (SubagentStop registration location) +
    # check top-level hook filenames only (no file content reads for hook dirs).
    """
    # 방법 1: 환경변수 마커 (훅이 RALPH_LOOP_ACTIVE=1 세팅하도록 설계된 경우)
    if os.environ.get("RALPH_LOOP_ACTIVE") == "1":
        return True
    # 방법 2: settings.json 파일만 체크 (SubagentStop hook registration 위치)
    settings_files = [
        os.path.expanduser("~/.claude/settings.json"),
        os.path.expanduser("~/forge/.claude/settings.json"),
    ]
    for p in settings_files:
        if os.path.isfile(p):
            try:
                if "ralph" in Path(p).read_text(encoding="utf-8", errors="ignore").lower():
                    return True
            except Exception:
                pass
    # 방법 3: hooks 디렉토리의 top-level *.sh / *.json 파일명만 확인 (recursive 금지)
    import glob as _glob
    hook_dirs = [
        os.path.expanduser("~/.claude/hooks"),
        os.path.expanduser("~/forge/.claude/hooks"),
    ]
    for hook_dir in hook_dirs:
        for pattern in ("*.sh", "*.json"):
            for f in _glob.glob(os.path.join(hook_dir, pattern)):
                if "ralph" in os.path.basename(f).lower():
                    return True
    return False

_ralph_wired = _check_ralph_hook()
if not _ralph_wired:
    print(
        "⚠️  [goal-pev] ralph-loop hook 미배선 — goal-pev는 single-pass로 동작, 자동 재시도 안 됨.\n"
        "    배선 방법: SubagentStop 훅에 ralph-loop 재주입 스크립트 등록.\n"
        "    또는 RALPH_LOOP_ACTIVE=1 환경변수로 이 경고를 억제 (훅 대체 배선 확인 후).",
        file=sys.stderr,
    )


def load_state() -> dict:
    if os.path.exists(STATE_FILE):
        try:
            return json.loads(Path(STATE_FILE).read_text())
        except Exception:
            pass
    # root-cause: call_count 제거 — STOP_CALL_CAP가 goal-pev에서 빠지며 미사용(call-budget는 hook으로 단일화).
    return {"cycle": 0, "same_issue_count": {}, "history": []}


def save_state(state: dict) -> None:
    os.makedirs("docs/qa", exist_ok=True)
    Path(STATE_FILE).write_text(json.dumps(state, indent=2))


def log(msg: str, log_file: str) -> None:
    ts = datetime.utcnow().isoformat() + "Z"
    line = f"[{ts}] {msg}"
    print(line)
    with open(log_file, "a") as f:
        f.write(line + "\n")


def check_qa_report(scope: str) -> dict:
    """Parse qa-report for PASS/FAIL summary."""
    import glob
    reports = sorted(glob.glob(f"docs/qa/*qa-report*.md"), reverse=True)
    if not reports:
        return {"status": "no-report", "pass": 0, "fail": 0}
    report = Path(reports[0]).read_text(encoding="utf-8")
    fail_count = report.count("FAIL") + report.count("❌")
    pass_count = report.count("PASS") + report.count("✅")
    return {
        "status": "pass" if fail_count == 0 else "fail",
        "pass": pass_count,
        "fail": fail_count,
        "report": reports[0],
    }


def check_regression(baseline_path: str = "docs/qa/baseline.json") -> bool:
    """True if regression detected."""
    if not os.path.exists(baseline_path):
        return False
    try:
        baseline = json.loads(Path(baseline_path).read_text())
        fails = [s for s in baseline.get("scenarios", []) if s.get("status") == "FAIL"]
        return len(fails) > 0
    except Exception:
        return False


def check_security_critical(report_path: str = "docs/qa/security-report.md") -> bool:
    """True if security CRITICAL found."""
    if not os.path.exists(report_path):
        return False
    content = Path(report_path).read_text(encoding="utf-8")
    import re
    return bool(re.search(r"^\*\*CRITICAL\*\*|^CRITICAL", content, re.MULTILINE))


PLATEAU_EPSILON = int(os.environ.get("QA_PLATEAU_EPSILON", "5"))
SAME_ISSUE_THRESHOLD = int(os.environ.get("QA_SAME_ISSUE_THRESHOLD", "3"))


# root-cause: read_call_count() 제거 — goal-pev은 payload 없는 스크립트라 producer가 키잉한 payload SID로
# .calls를 신뢰성있게 못 읽음(CLAUDE_SESSION_ID unset 빈번). call-budget 가드는 payload SID를 가진 hook
# check_call_cap(WARN-only)에 단일화. goal-pev은 SID 불요 bound(max_cycles/same_issue/plateau)만 유지.
def find_latest_bug_report() -> str:
    """Latest docs/qa/*bug-report*.md (fingerprint input), or '' if none."""
    reports = sorted(glob.glob("docs/qa/*bug-report*.md"), reverse=True)
    return reports[0] if reports else ""


def extract_bug_numbers(report_path: str) -> list:
    """Section-header 'Bug/버그 #N' only → sorted unique ints.

    # root-cause: 이전엔 인라인 언급('see Bug #5')까지 매칭 → 해당 N에 실제 섹션이 없어
    # extract_bug_section이 full-report fallback 반환 → distinct bug들이 동일 full-content
    # fingerprint로 collapse(false STOP). extract_bug_section의 섹션 패턴과 동일하게 line-start +
    # 선택적 ## 헤더 form만 매칭하도록 제한해 실제 섹션이 있는 bug만 fingerprint 대상으로 삼는다.
    """
    try:
        content = Path(report_path).read_text(encoding="utf-8", errors="ignore")
    except Exception:
        return []
    nums = set()
    for m in re.finditer(r"(?m)^\s*#{0,3}\s*(?:Bug|버그)\s+#(\d+)", content, re.IGNORECASE):
        nums.add(int(m.group(1)))
    return sorted(nums)


_SIK_MOD = None


def _load_same_issue_key():
    """Import same-issue-key.py (SSoT fingerprint fns) in-process. Cached. Returns module or None."""
    global _SIK_MOD
    if _SIK_MOD is not None:
        return _SIK_MOD
    path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "same-issue-key.py")
    try:
        spec = importlib.util.spec_from_file_location("same_issue_key", path)
        mod = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(mod)
        _SIK_MOD = mod
        return mod
    except Exception as e:
        sys.stderr.write(f"[goal-pev WARN] same-issue-key.py 로드 실패 — same_issue 비활성: {e}\n")
        return None


def cycle_fingerprints() -> set:
    """Deduped structured fingerprints for the current bug-report (sha256 file:symbol:error_class)."""
    report = find_latest_bug_report()
    if not report:
        return set()
    sik = _load_same_issue_key()
    if sik is None:
        return set()
    fps = set()
    for n in extract_bug_numbers(report):
        try:
            section = sik.extract_bug_section(report, n)
            file_p = sik.extract_file_path(section)
            symbol = sik.extract_symbol_or_line(section)
            err = sik.extract_error_class(section)
            # root-cause: 세 추출기가 모두 unknown_* fallback이면 fingerprint가 신뢰불가 —
            # 서로 다른 vague bug들이 동일 'unknown:unknown:unknown'으로 aliasing되어 cross-cycle
            # 가짜 same_issue를 유발. 신뢰불가 fingerprint는 카운트에서 제외(skip).
            if file_p == "unknown_file" and symbol == "unknown_symbol" and err == "unknown_error":
                continue
            fps.add(sik.sha256(f"{file_p}:{symbol}:{err}"))
        except SystemExit:
            # extract_bug_section sys.exit on FileNotFound — report已확인존재라 예외적; 건너뜀
            continue
        except Exception as e:
            sys.stderr.write(f"[goal-pev WARN] bug #{n} fingerprint 실패: {e}\n")
    return fps


def update_same_issue(state: dict) -> int:
    """Consecutive-cycle same-fingerprint tracking (kernel §1/§2). Returns max consecutive count.

    # root-cause: 이전 배선은 same-issue-key.py --increment(단조 누적)을 bug마다 매사이클 호출 →
    # count가 '연속 사이클 지속'이 아니라 '누적 출현'을 셈 + extractor의 unknown_* fallback로 한
    # 리포트 내 distinct bug들이 동일 fingerprint로 collapse → 사이클1 false STOP. + /tmp tracker가
    # run 간 미리셋이라 stale 누수. 수정: (a) fingerprint 계산만 SSoT 함수 in-process 사용(단조 tracker
    # 미사용), (b) **사이클별 deduped present set**(collision-inflation 차단), (c) present는 +1·absent는
    # drop(연속 의미·reset-on-absence로 stale 자가소거). 3연속 동일 fingerprint → STOP.
    """
    counts = state.get("same_issue_count")
    if not isinstance(counts, dict):
        counts = {}
    present = cycle_fingerprints()
    new_counts = {fp: counts.get(fp, 0) + 1 for fp in present}  # present++ / absent는 자동 reset(drop)
    state["same_issue_count"] = new_counts
    return max(new_counts.values(), default=0)


def check_plateau(history: list, epsilon: int = PLATEAU_EPSILON) -> bool:
    """True if fail_count progress < epsilon for 2 consecutive cycles (단조 미개선, kernel §1).

    # root-cause: plateau is declared in goal.md/kernel §1 but had NO code in goal-pev → a loop
    # making marginal-but-nonzero progress would spin until max_cycles instead of stopping early.
    # Score here = fail_count reduction; plateau = two consecutive deltas below epsilon while
    # failures remain (f>0; f==0 is SUCCESS, handled earlier). Needs 3 fail-count data points.
    # Note: delta < epsilon also captures fail-count INCREASE (regression, delta<0) — 진전 없음으로 보고
    # plateau STOP. 회귀가 baseline.json으로 별도 감지되지 않는 경우의 안전망(중복 STOP은 무해).
    """
    fails = [h.get("fail") for h in history if isinstance(h.get("fail"), int)]
    if len(fails) < 3:
        return False
    f3, f2, f1 = fails[-3], fails[-2], fails[-1]
    return f1 > 0 and (f3 - f2) < epsilon and (f2 - f1) < epsilon


def main():
    parser = argparse.ArgumentParser(description="goal-pev.py — PEV 자율 루프")
    parser.add_argument("--condition", required=True, help="종료 조건 문자열")
    parser.add_argument("--scope", default="full", help="QA 스코프")
    parser.add_argument("--max-cycles", type=int, default=MAX_CYCLES)
    args = parser.parse_args()

    ts = datetime.now().strftime("%Y%m%d%H%M%S")
    log_file = f"docs/qa/goal-loop-{ts}.log"
    os.makedirs("docs/qa", exist_ok=True)

    log(f"[/goal] 시작. 종료 조건: {args.condition} | scope={args.scope}", log_file)

    state = load_state()

    while True:
        cycle = state["cycle"] + 1
        state["cycle"] = cycle
        # root-cause: 첫 사이클에 run-scoped 누적 상태(same_issue 연속카운트 + plateau용 history)를 모두
        # 리셋 — /goal 새 run이 이전 run의 stale state(persisted goal-loop-state.json)를 물려받아 사이클1에
        # false STOP_SAME_ISSUE/STOP_PLATEAU 하는 누수 차단. resume(ralph 재주입)는 cycle>1이라 유지.
        # same_issue는 reset-on-absence와 이중 방어. (주의: load_state 파싱실패도 cycle:0→여기 리셋 경로로
        # 합류 — 손상 시 누적상태 소거 = under-STOP(안전방향, max_cycles가 결정론 bound). over-STOP보다 안전.)
        # root-cause: result는 per-cycle verdict(run accumulator 아님) → **매 사이클 시작 시 클리어**.
        # cycle==1(새 run)뿐 아니라 resume(cycle>1)에도 적용해야 이전 사이클/run의 terminal STOP_*/SUCCESS가
        # 잔류해 동시 ralph가 새 사이클에 stale terminal을 읽고 조기 halt하는 race를 차단(cr-double r5 MED#2 —
        # 이전 cycle==1-only 리셋은 resume 경로 미커버). terminal 조건은 아래에서만 set.
        state["result"] = ""
        if cycle == 1:
            # run-scoped 누적 상태(same_issue 연속카운트 + plateau용 history)는 새 run에서만 리셋.
            # resume(ralph 재주입, cycle>1)는 유지해야 연속성 보존. same_issue는 reset-on-absence와 이중 방어.
            # (주의: load_state 파싱실패도 cycle:0→여기 합류 — 손상 시 누적상태 소거 = under-STOP, max_cycles가 bound.)
            state["same_issue_count"] = {}
            state["history"] = []
        # early-save: 클리어된 result(+cycle1 리셋)를 본문 실행 전 disk에 persist → 동시 ralph가 stale
        # terminal을 읽는 타이밍 창 최소화. (사이클 끝 save_state까지 미루면 그 사이 ralph가 옛 STOP_* 읽음.)
        # root-cause: 의도적 trade-off (cr-double r6 Codex MED, 수용) — 이 early-save는 transient result=''를
        # 만든다 → 본문 실행 중(early-save와 아래 terminal save 사이) SubagentStop ralph가 발화하면 result=''로
        # 읽혀 healer 1회 **false 재주입** 가능. 그러나 (a) bounded·self-correcting: 다음 goal-pev 실행이 동일
        # 조건을 재판정해 authoritative STOP을 기록, (b) ralph 재주입은 fail>0 AND gp_cycle<max_cycles에서만 =
        # 추가 1사이클일 뿐 halt 실패 아님. 반대 설계(early-save 생략)는 이전 사이클 stale STOP_*가 잔류 → ralph가
        # **false halt**(계속해야 할 루프를 멈춰 Human 개입 요구) = 더 해로움. 덜 해로운 쪽(자가복구 추가사이클) 택함.
        save_state(state)
        log(f"[PEV 사이클 {cycle}/{args.max_cycles}]", log_file)

        # ─── 종료 조건 1: 사이클 초과
        if cycle > args.max_cycles:
            log(f"[END STOP] 6사이클 초과. Human 개입 필요.", log_file)
            state["result"] = "STOP_CYCLES"
            save_state(state)
            sys.exit(1)

        # ─── 종료 조건 2: 회귀 감지
        if check_regression():
            log("[END STOP] 회귀 감지. 즉시 종료.", log_file)
            state["result"] = "STOP_REGRESSION"
            save_state(state)
            sys.exit(1)

        # ─── 종료 조건 3: 보안 CRITICAL
        if check_security_critical():
            log("[END STOP] 보안 CRITICAL. 즉시 종료.", log_file)
            state["result"] = "STOP_SECURITY"
            save_state(state)
            sys.exit(1)

        # ─── Plan: qa-report 현황 확인
        result = check_qa_report(args.scope)
        log(f"[Plan] qa-report: status={result['status']} pass={result['pass']} fail={result['fail']}", log_file)

        # ─── 종료 조건 4: 모든 시나리오 PASS
        if result["status"] == "pass" and result["fail"] == 0:
            log(f"[END SUCCESS] 모든 시나리오 PASS. 종료 조건 충족: {args.condition}", log_file)
            state["result"] = "SUCCESS"
            save_state(state)
            sys.exit(0)

        # 현 사이클 fail_count를 history에 선기록 (plateau 판정 입력)
        state["history"].append(
            {"cycle": cycle, "result": result["status"], "fail": result["fail"],
             "ts": datetime.utcnow().isoformat()}
        )

        # ─── 종료 조건 5: same-issue (동일 fingerprint 3연속 사이클 — kernel §1/§2, sha256 트리플키)
        # root-cause: 이전엔 여기서 state["same_issue_count"]={"max":N}로 덮어써 연속 카운트({fp:n})를
        # 파괴(매 사이클 1로 리셋)했음. update_same_issue가 직접 {fp:연속카운트} 갱신하므로 덮어쓰기 제거.
        same_issue_max = update_same_issue(state)
        if same_issue_max >= SAME_ISSUE_THRESHOLD:
            log(f"[END STOP] same-issue {same_issue_max}연속 사이클 (≥{SAME_ISSUE_THRESHOLD}). 구현 방식 전환 필요 — Human 검토.", log_file)
            state["result"] = "STOP_SAME_ISSUE"
            save_state(state)
            sys.exit(1)

        # ─── 종료 조건 6: plateau (점수 진전 < ε, 2연속 — kernel §1)
        if check_plateau(state["history"]):
            log(f"[END STOP] plateau — fail_count 진전 < {PLATEAU_EPSILON} 2연속. 접근방식 전환 필요.", log_file)
            state["result"] = "STOP_PLATEAU"
            save_state(state)
            sys.exit(1)

        # ─── Execute: 다음 액션 결정 (healer 재주입 큐 확인)
        queue_file = "docs/qa/cr-trigger-queue.jsonl"
        if os.path.exists(queue_file):
            with open(queue_file) as f:
                pending = [json.loads(l) for l in f if l.strip() and json.loads(l).get("status") == "pending"]
            log(f"[Execute] cr-trigger-queue: {len(pending)} pending entries", log_file)

        # ─── (종료 조건 7 STOP_CALL_CAP 제거됨) call-budget 가드는 hook check_call_cap(WARN-only,
        # payload SID 보유)에 단일화. goal-pev은 SID 불요 결정론 bound(max_cycles 1순위)만 담당.
        # root-cause: goal-pev이 payload SID를 못 얻어 STOP_CALL_CAP이 구조적으로 dead/오살이었음(cr-double 4R).

        save_state(state)
        # root-cause: 사이클 요약 로그 — call_count 제거(STOP_CALL_CAP 폐지, hook으로 단일화).
        log(f"[PEV 사이클 {cycle}] 완료. qa-report 재확인 필요 (fail={result['fail']}건 잔존). same_issue_max={same_issue_max}", log_file)

        # PEV 루프 계속 (메인 컨텍스트가 다음 액션 실행 후 재호출)
        # ── single-pass-by-design: 이 break는 의도적이다. ─────────────────────
        # root-cause: goal-pev.py는 사이클당 1회만 실행하도록 설계되어 있으며,
        # 자동 반복 재주입은 SubagentStop "ralph-loop" 훅이 담당한다.
        # 훅 없이 실행하면 루프가 여기서 종료된다 (스크립트 시작 시 WARN 출력).
        # ─────────────────────────────────────────────────────────────────────
        log("[/goal] 다음 사이클 대기. ralph-loop 훅(SubagentStop) 또는 메인 컨텍스트 재호출 필요.", log_file)
        break  # 단일 실행 후 종료 — 재주입은 ralph-loop SubagentStop hook 담당 (훅 미배선 시 스크립트 시작 WARN 참조)


if __name__ == "__main__":
    main()
