#!/usr/bin/env python3
"""
eval-cases-append.py — eval-rubric 채점 결과(및 선택적 pass@k 신뢰성)를
스킬별 eval_cases.jsonl에 append.

SSoT: ${FORGE_ROOT:-$HOME/forge}/.claude/skills/eval-rubric/scripts/eval-cases-append.py
배포: forge-sync가 미러($HOME/.claude/skills/eval-rubric/scripts/)로 전파.
⚠️ 이 스크립트는 eval-rubric SKILL.md 절차(§4/§5)에 내장된 실행 스텝이다 —
신규 PostToolUse hook이 아니며 settings.json에 등록하지 않는다(AD-168 준수).

Usage — 단일 채점 결과 append:
  python3 eval-cases-append.py --skill qa --target docs/reviews/qa/2026-07-06-x.json \\
    --verdict PASS --scores '{"clarity":2,"consistency":2,"completeness":2,"safety":2}' \\
    --rationale '{"clarity":"...","consistency":"...","completeness":"...","safety":"..."}'

Usage — pass@k 신뢰성 동반 append (CLEAR pass@k Reliability, arXiv:2511.14136):
  python3 eval-cases-append.py --skill qa --target ... --verdict PASS --scores '...' \\
    --rationale '...' --pass-at-k-verdicts '["PASS","PASS","WARN","PASS","PASS"]'
  → k=5, pass_count=PASS만 카운트=4, pass_rate=0.8 → reliability="RELIABLE"(advisory, threshold 0.8)

기록 대상 경로 override (테스트/SSoT 데모용, 기본은 런타임 미러 표준 경로):
  --base-dir ${FORGE_ROOT:-$HOME/forge}/.claude/skills   (기본값: $HOME/.claude/skills)

Kill-switch: EVAL_RUBRIC_AUTO=off 환경변수 시 append 생략(exit 0, fail-open).
"""
import argparse
import hashlib
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

# CLEAR pass@k Reliability 미션크리티컬 기준(axis-harness.md "핵심 지표" 정렬) — advisory만, 하드 게이트 아님
PASS_AT_K_THRESHOLD = 0.8


def split_decision(case_id: str) -> str:
    """결정적 holdout 분리: hash(case_id) % 100 < 20 = holdout."""
    h = int(hashlib.sha256(case_id.encode()).hexdigest(), 16) % 100
    return "holdout" if h < 20 else "sample"


def dedupe_key(skill: str, input_context: str) -> str:
    """sha256(skill + normalized input)."""
    normalized = (skill + "|" + (input_context or "")).strip()
    return hashlib.sha256(normalized.encode()).hexdigest()[:32]


def find_dedupe(jsonl_path: Path, key: str):
    if not jsonl_path.exists():
        return None
    with open(jsonl_path) as f:
        for line in f:
            try:
                obj = json.loads(line)
                if obj.get("dedupe_key") == key:
                    return obj
            except Exception:
                continue
    return None


def next_case_id(jsonl_path: Path, skill: str) -> str:
    """auto-increment EC-{skill}-{N} (obs 서브ID는 카운트에서 제외)."""
    if not jsonl_path.exists():
        return f"EC-{skill}-1"
    n = 0
    with open(jsonl_path) as f:
        for line in f:
            try:
                obj = json.loads(line)
                cid = obj.get("case_id", "")
                if cid.startswith(f"EC-{skill}-"):
                    n = max(n, int(cid.split("-")[-1].split("obs")[0].rstrip("-") or 0))
            except Exception:
                continue
    return f"EC-{skill}-{n + 1}"


def compute_pass_at_k(verdicts):
    """CLEAR pass@k Reliability: k회 독립 재채점 verdict 리스트 → pass_rate.
    advisory 판정만(하드 게이트 아님) — pass_rate ≥ 0.8 RELIABLE, 미만 UNSTABLE."""
    k = len(verdicts)
    if k == 0:
        return None
    pass_count = sum(1 for v in verdicts if str(v).upper() == "PASS")
    pass_rate = round(pass_count / k, 4)
    return {
        "k": k,
        "verdicts": verdicts,
        "pass_count": pass_count,
        "pass_rate": pass_rate,
        "threshold": PASS_AT_K_THRESHOLD,
        "reliability": "RELIABLE" if pass_rate >= PASS_AT_K_THRESHOLD else "UNSTABLE",
        "gate": "advisory",  # 하드 차단 아님 — 권고만
    }


def main():
    ap = argparse.ArgumentParser(description="eval-rubric 결과를 skill별 eval_cases.jsonl에 append")
    ap.add_argument("--skill", required=True, help="스킬 이름 (예: qa, codex-review)")
    ap.add_argument("--target", required=True, help="평가 대상 파일 경로 또는 식별자")
    ap.add_argument("--verdict", required=True, choices=["PASS", "WARN", "FAIL"], help="1회 채점 최종 판정")
    ap.add_argument("--scores", default="{}", help="JSON 점수 맵 (clarity/consistency/completeness/safety)")
    # v1.1 — negative_constraint 는 **scores 와 분리해서 받는다.**
    #   scores 안에 넣으면 평균 분모가 4→5 가 되어 같은 산출물의 판정이 이동한다(E-3).
    #   별도 필드로 받아 기록만 하고 verdict 계산에는 절대 넣지 않는다.
    ap.add_argument(
        "--negative-constraint",
        default=None,
        help='JSON, 예: \'{"level":1,"evidence":"...","prohibitions_checked":["git stash 금지"]}\' '
             "— 명시적 금지사항 준수 축(0 위반 / 1 인지흔적 없음 / 2 인지하고 지킴). "
             "scores 와 분리 기록되며 verdict 계산에 들어가지 않는다.",
    )
    ap.add_argument("--rationale", default="{}", help="JSON 근거 맵")
    ap.add_argument("--input-context", default="", help="입력 컨텍스트 (dedupe key 산출용)")
    ap.add_argument("--added-by", default="auto", choices=["auto", "manual"], help="추가 주체")
    ap.add_argument(
        "--mode",
        default="graded",
        choices=["graded", "binary"],
        help="채점 모드 — graded(0-2 다축 점수, 기본) | binary(PASS/FAIL만). additive: 레코드에 grade_mode로만 기록, 기존 채점 로직 불변",
    )
    ap.add_argument(
        "--pass-at-k-verdicts",
        default=None,
        help='JSON 배열, 예: \'["PASS","PASS","WARN"]\' — 동일 target을 k회 독립 재채점한 verdict 리스트',
    )
    ap.add_argument(
        "--base-dir",
        default=None,
        help="eval_cases.jsonl 상위 디렉토리 override (기본: $HOME/.claude/skills 런타임 미러 경로)",
    )
    args = ap.parse_args()

    if os.environ.get("EVAL_RUBRIC_AUTO", "").lower() == "off":
        print("EVAL_RUBRIC_AUTO=off → skip", file=sys.stderr)
        return 0

    base = Path(args.base_dir).expanduser() if args.base_dir else (Path.home() / ".claude" / "skills")
    skill_dir = base / args.skill
    skill_dir.mkdir(parents=True, exist_ok=True)
    jsonl = skill_dir / "eval_cases.jsonl"

    # v1.1 negative_constraint — **dedupe 분기보다 먼저** 해석·검증·고지한다.
    #   왜 여기인가(2026-08-09 행동 테스트가 잡은 결함): 종전 판에서는 이 처리를 신규
    #   레코드 조립부에 뒀는데, dedupe 히트 시 그 위에서 `return 0` 으로 빠져나가
    #   ①잘못된 level 이 검증 없이 통과하고 ②금지사항 위반이 **조용히 사라졌다.**
    #   위반 고지는 어느 경로로 들어와도 나와야 한다.
    nc = None
    if args.negative_constraint:
        nc = json.loads(args.negative_constraint)
        if nc.get("level") not in (0, 1, 2):
            raise SystemExit(
                "--negative-constraint 의 level 은 0/1/2 여야 한다 (받은 값: %r)" % (nc.get("level"),))
        # 침묵 금지 — 채점(verdict)에 안 들어가는 대신 반드시 보이게 한다.
        if nc["level"] == 0:
            print("[금지사항 위반] %s — %s" % (args.target, nc.get("evidence", "근거 미기재")),
                  file=sys.stderr)
        elif nc["level"] == 1:
            print("[금지사항 인지 흔적 없음] %s" % args.target, file=sys.stderr)

    key = dedupe_key(args.skill, args.input_context)
    existing = find_dedupe(jsonl, key)

    pass_at_k = None
    if args.pass_at_k_verdicts:
        pass_at_k = compute_pass_at_k(json.loads(args.pass_at_k_verdicts))

    if existing:
        # observed_count++ 만 append (별도 라인, 빈도 추적 전용 — split 통계에서 제외)
        existing["observed_count"] = existing.get("observed_count", 1) + 1
        existing["last_seen"] = datetime.now(timezone.utc).isoformat()
        existing["supersedes"] = existing.get("case_id")
        existing["case_id"] = existing["case_id"] + f"-obs{existing['observed_count']}"
        existing.pop("split", None)
        existing["record_type"] = "observation"
        if pass_at_k:
            existing["pass_at_k"] = pass_at_k
        # 관측 레코드에도 이번 회차의 금지사항 판정을 싣는다 — 안 실으면 재발 사례가
        #   최초 1회 기록에 묻혀 "몇 번째 관측에서 위반했는지"를 사후에 못 센다.
        if nc is not None:
            existing["negative_constraint"] = nc
            if nc["level"] == 0:
                existing["tags"] = sorted(set(existing.get("tags", []) + ["negative"]))
        with open(jsonl, "a") as f:
            f.write(json.dumps(existing, ensure_ascii=False) + "\n")
        print(f"DEDUPE_HIT: observed_count={existing['observed_count']} (record_type=observation)")
        return 0

    case_id = next_case_id(jsonl, args.skill)
    record = {
        "case_id": case_id,
        "record_type": "case",
        "date": datetime.now(timezone.utc).strftime("%Y-%m-%d"),
        "ts": datetime.now(timezone.utc).isoformat(),
        "skill": args.skill,
        "target": args.target,
        "verdict": args.verdict,
        "scores": json.loads(args.scores),
        "rationale": json.loads(args.rationale),
        "split": split_decision(case_id),
        "dedupe_key": key,
        "observed_count": 1,
        "supersedes": None,
        "added_by": args.added_by,
        "grade_mode": args.mode,
    }
    if pass_at_k:
        record["pass_at_k"] = pass_at_k

    # 기록 전용 — verdict·scores 를 건드리지 않는다. 해석·검증·고지는 위(dedupe 앞)에서 끝냈다.
    #   level 0(위반)이면 골든셋에서 찾아낼 수 있게 tags 에 negative 를 자동으로 단다
    #   — 사람이 태그를 잊어도 위반 사례는 반드시 추적 가능해야 한다.
    if nc is not None:
        record["negative_constraint"] = nc
        if nc["level"] == 0:
            record["tags"] = sorted(set(record.get("tags", []) + ["negative"]))

    with open(jsonl, "a") as f:
        f.write(json.dumps(record, ensure_ascii=False) + "\n")
    # E-4 (2026-07-29): 분모 명시 — pass_rate 단독표기는 k(재채점 횟수)를 숨긴다
    suffix = (f", pass_at_k={pass_at_k['pass_rate']}"
              f"({pass_at_k['pass_count']}/{pass_at_k['k']}, {pass_at_k['reliability']})"
              if pass_at_k else "")
    print(f"APPENDED: {case_id} (split={record['split']}{suffix})")
    return 0


if __name__ == "__main__":
    sys.exit(main())
