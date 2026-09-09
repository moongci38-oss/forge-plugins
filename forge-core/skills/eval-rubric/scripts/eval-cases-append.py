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


# ── E3·E4 (2026-09-07): 판정자 건강 분리 + 이견 신호 ────────────────────────────────
# 왜: 0 점은 "나쁘다"이고 결측은 "모른다"인데, 종전엔 둘 다 `scores` 의 같은 칸에 떨어졌다.
#   축 하나가 빠진 채 3축 평균이 4축 평균 행세를 해도 아무도 몰랐다.
# ⚠️ 무력화되는 입력: 판정자가 결측 축을 **직접 0 으로 채워 보내면** 여기서는 구별할 방법이 없다
#   (그건 진짜 0 점과 비트 단위로 같다). 그래서 SKILL.md §축 결측·파싱 실패 처리가
#   "0 으로 채우지 말라"를 판정자 쪽 규약으로 못박는다 — 이 함수는 그 규약의 뒷문 잠금장치다.
AXIS_HEALTH_VALUES = ("OK", "MISSING", "PARSE_FAILED")
# 0~2 척도에서 편차 2 = 한 축 만점 + 다른 축 0점. 평균이 그 둘을 대표하지 못하는 지점이다.
DISSENT_SPREAD = 2


def normalize_axis_health(scores, declared):
    """선언된 axis_health + scores 의 비숫자 값을 합쳐 축별 건강표를 만든다.

    반환: (health dict, 유효 점수 dict). 유효 점수만 평균·이견 계산에 쓴다.
    ⚠️ **점수를 고쳐 쓰지 않는다** — 결측을 0 으로 환산하지도, 채워 넣지도 않는다.
    """
    health = {}
    for axis, status in (declared or {}).items():
        s = str(status).upper()
        if s not in AXIS_HEALTH_VALUES:
            raise SystemExit(
                "--axis-health 값은 %s 중 하나여야 한다 (받은 값: %r)" % ("/".join(AXIS_HEALTH_VALUES), status))
        if s != "OK":
            health[axis] = s
    numeric = {}
    for axis, v in (scores or {}).items():
        if isinstance(v, bool) or not isinstance(v, (int, float)):
            # 값이 숫자가 아니다 = 채점된 적이 없다. 0 으로 세지 않고 결측으로 분리한다.
            health.setdefault(axis, "PARSE_FAILED" if v is not None else "MISSING")
        else:
            numeric[axis] = v
    return health, numeric


def compute_dissent(numeric_scores):
    """축 간 이견 — **표시 전용. verdict 를 바꾸지 않는다**(E-3 지표·기준 분리)."""
    vals = list(numeric_scores.values())
    if len(vals) < 2:
        return {"dissent": False, "spread": None, "min": None, "max": None,
                "threshold": DISSENT_SPREAD, "n": len(vals), "gate": "display-only"}
    spread = max(vals) - min(vals)
    return {"dissent": spread >= DISSENT_SPREAD, "spread": spread, "min": min(vals), "max": max(vals),
            "threshold": DISSENT_SPREAD, "n": len(vals), "gate": "display-only"}


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
    # E3 — 채점 못 한 축을 0 점과 분리해 기록한다(scores 를 건드리지 않는다).
    ap.add_argument(
        "--axis-health",
        default=None,
        help='JSON, 예: \'{"safety":"MISSING"}\' — 값은 OK/MISSING/PARSE_FAILED. '
             "채점 못 한 축만 적는다. 0 점(나쁘다)과 결측(모른다)을 같은 칸에 넣지 않기 위한 필드다.",
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

    # 재현: `--input-context` 없이 --skill yt 로 두 번 호출(서로 다른 --target) →
    # 둘 다 dedupe_key = sha256(skill + "|")[:32] 로 동일해져 두 번째 호출이 첫 번째
    # target 밑에 observation 으로 병합된다(실측: EC-yt-5 가 이후 다른 영상의 채점을
    # 전부 흡수). 문서(reference.md/SKILL.md)의 호출 예시가 --input-context 를 아예
    # 언급하지 않아 상시 재발하는 결함이었다 — target 을 기본 컨텍스트로 채워 막는다.
    if not args.input_context:
        args.input_context = args.target

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

    # E3·E4 — negative_constraint 와 같은 이유로 **dedupe 분기보다 먼저** 계산·고지한다.
    #   dedupe 히트로 위에서 빠져나가면 결측·이견이 조용히 사라진다(2026-08-09에 같은 구멍을 한 번 메웠다).
    scores_map = json.loads(args.scores)
    axis_health, numeric_scores = normalize_axis_health(
        scores_map, json.loads(args.axis_health) if args.axis_health else None)
    dissent = compute_dissent(numeric_scores)
    if axis_health:
        # 침묵 금지 — 결측은 판정을 바꾸지 않는 대신 반드시 보이게 한다.
        print("[축 결측] %s — %s | 유효 축 %d/%d. 결측은 0점이 아니다(모름) — 평균 분모에서 빠졌다."
              % (args.target, json.dumps(axis_health, ensure_ascii=False),
                 len(numeric_scores), len(numeric_scores) + len(axis_health)),
              file=sys.stderr)
        if args.verdict == "PASS":
            # 기존 PASS 조건("모든 채점축 ≥ 1")은 결측 축에서 충족을 **증명할 수 없다**.
            # 새 임계값이 아니라 기존 조건의 귀결이다 — 판정을 바꾸지 않고 모순만 지적한다.
            print("[경고] 축이 결측인데 verdict=PASS 다 — 기존 PASS 조건(모든 채점축 ≥ 1)을 "
                  "충족했다는 증거가 없다. SKILL.md §축 결측·파싱 실패 처리 3항 참조(WARN 이 맞다).",
                  file=sys.stderr)
    if dissent["dissent"]:
        print("[이견] %s — 축 편차 %s (min=%s max=%s, 임계 %s). 평균 하나로 읽지 말 것. "
              "판정에는 반영하지 않는다(표시 전용)."
              % (args.target, dissent["spread"], dissent["min"], dissent["max"], dissent["threshold"]),
              file=sys.stderr)

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
        # 관측 레코드에도 이번 회차의 건강·이견을 싣는다 — 안 실으면 "몇 번째 관측에서
        # 축이 죽었는지"를 사후에 못 센다(negative_constraint 와 같은 이유).
        existing["axis_health"] = axis_health
        existing["dissent"] = dissent
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
        # ⚠️ scores 는 받은 그대로 기록한다 — 결측을 0 으로 채워 넣지 않는다.
        "scores": scores_map,
        "axis_health": axis_health,   # E3: 채점 못 한 축만(빈 dict = 전부 채점됨)
        "score_denominator": len(numeric_scores),  # E3: 평균의 분모 — 4 미만이면 부분 채점이다
        "dissent": dissent,           # E4: 축 간 이견(표시 전용 — verdict 미반영)
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
