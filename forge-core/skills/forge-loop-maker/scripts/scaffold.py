#!/usr/bin/env python3
"""forge-loop-maker scaffold.py — blueprint 승인 후 루프 파일 6종 생성.

Usage:
  python3 scaffold.py \\
    --name <LOOP_NAME> \\
    --goal "<EXIT_PREDICATE>" \\
    --pattern <pev|evaluator-optimizer|orchestrator-workers|ralph> \\
    --state <STATE_PATH> \\
    --max-iter <N> \\
    --call-budget <N> \\
    --wall-clock "<e.g. 2시간>" \\
    [--verify-cmd "<VERIFIER_CMD>"] \\
    [--trigger "<TRIGGER_DESC>"] \\
    [--gates "<GATE_LIST>"] \\
    [--project-cwd <CWD>]

# root-cause: scaffold = forge-loop-maker Phase 4b 구현체. blueprint [STOP] 승인 후에만 실행.
"""
import argparse
import json
import os
import re
import sys
from datetime import datetime
from pathlib import Path

FORGE_ROOT = Path(os.environ.get("FORGE_ROOT", Path.home() / "forge"))
TMPL_DIR   = Path(__file__).resolve().parent.parent / "templates"
# root-cause(2026-08-06 워크트리 격리 파괴, 옵션A 채택): SKILLS_DIR 이 FORGE_ROOT 고정이면
#   워크트리 격리 세션(--project-cwd = 워크트리 경로)에서도 공유 체크아웃에 써서 격리가 깨진다.
#   --project-cwd(미지정 시 os.getcwd())로부터 파생 — main() 에서 cwd 계산 직후 설정한다.

# workflow.js.tmpl(골격) 안에서 패턴 본문이 주입되는 자리표시자.
PATTERN_BODY_SLOT = "{{PATTERN_BODY}}"

# root-cause(2026-08-06 항목2): 템플릿 상단의 "이 템플릿을 고칠 때 주의" 개발자 메모(HTML 주석)가
#   생성물(SKILL.md 등) 본문에 그대로 복사돼 독자에게 노이즈를 준다. 마커 문구가 있는 주석 블록만
#   걷어낸다 — 독자용 경고 주석(예: HUMAN-GATES.md.tmpl 의 wall-clock 안내)은 마커가 없어 보존된다.
_DEV_COMMENT_RE = re.compile(
    r"<!--\s*(?:root-cause:\s*)?forge-loop-maker scaffold 템플릿.*?-->\n?",
    re.DOTALL,
)


def read_tmpl(name: str) -> str:
    p = TMPL_DIR / name
    if not p.exists():
        sys.exit(f"[scaffold] template not found: {p}")
    text = p.read_text(encoding="utf-8")
    return _DEV_COMMENT_RE.sub("", text, count=1)


def render(tmpl: str, ctx: dict) -> str:
    for k, v in ctx.items():
        tmpl = tmpl.replace("{{" + k + "}}", str(v))
    return tmpl


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--name",         required=True)
    ap.add_argument("--goal",         required=True)
    ap.add_argument("--pattern",      required=True,
                    choices=["pev", "evaluator-optimizer", "orchestrator-workers", "ralph"])
    ap.add_argument("--state",        default="")
    ap.add_argument("--max-iter",     default="6")
    ap.add_argument("--call-budget",  default="600")
    ap.add_argument("--wall-clock",   default="미설정(필수 — 수동 채워넣기)")
    # blueprint 의 VERIFY 필드(Q5 verifier). pev/orchestrator-workers/ralph 본문이
    # 이 명령의 exit code 로 종료를 판정한다. 미지정이면 실행 시 verifyCmd 인자로 받는다.
    ap.add_argument("--verify-cmd",   default="")
    ap.add_argument("--trigger",      default="manual")
    ap.add_argument("--gates",        default="G1 첫 실행 전, G2 verifier 이상")
    ap.add_argument("--project-cwd",  default=os.getcwd())
    args = ap.parse_args()

    loop_name  = re.sub(r"[^a-z0-9\-]", "-", args.name.lower()).strip("-")
    state_path = args.state or f"loops/{loop_name}/STATE.md"
    # root-cause: S-6 — pathlib 규약상 Path(cwd) / <절대경로> 는 cwd 를 버리고 절대경로를 그대로 쓴다.
    #   그래서 --state 에 절대경로를 주면 --project-cwd 가 **조용히 무시**된다(사용자 입력 무언 폐기).
    #   blueprint 의 STATE_PATH 는 절대경로로 렌더되므로 정상 사용 경로에서 걸린다(2026-07-31 실측:
    #   임시 프로젝트 밖 절대경로를 주자 그 경로에 그대로 생성됐다). 중단시키지 않고 경고만 낸다.
    if Path(state_path).is_absolute():
        print(f"[scaffold] 경고: --state 가 절대경로입니다 — --project-cwd({args.project_cwd}) 는 "
              f"무시되고 {state_path} 에 그대로 생성됩니다. 프로젝트 하위에 두려면 상대경로를 주세요.",
              file=sys.stderr)
    cwd        = Path(args.project_cwd).resolve()
    SKILLS_DIR = cwd / ".claude" / "skills"
    skill_dir  = SKILLS_DIR / loop_name
    state_file = cwd / state_path
    ts         = datetime.now().strftime("%Y-%m-%d %H:%M")

    ctx = {
        "LOOP_NAME":    loop_name,
        "GOAL":         args.goal,
        "PATTERN":      args.pattern,
        "TRIGGER":      args.trigger,
        "STATE_PATH":   state_path,
        "GATES":        args.gates,
        "MAX_ITER":     args.max_iter,
        "CALL_BUDGET":  args.call_budget,
        "WALL_CLOCK":   args.wall_clock,
        "TIMESTAMP":    ts,
    }

    # ── verifier 명령 = JS 문자열 리터럴로 안전 직렬화 ─────────────────────────
    # root-cause: verify 명령에는 따옴표가 흔하다(예: grep -c '^workflow.*tmpl$').
    #   템플릿에 '{{VERIFY_CMD}}' 처럼 수기 따옴표로 적으면 생성된 workflow.js 가 깨진다.
    # ⚠️ 이 방어가 무력화되는 입력: 값 쪽에는 없다. 무력화되는 것은 *템플릿* 쪽이다 —
    #   본문 템플릿이 {{VERIFY_CMD_JS}} 를 따옴표로 다시 감싸면 직렬화가 무효가 된다.
    #   반드시 `_a?.verifyCmd || {{VERIFY_CMD_JS}}` 처럼 따옴표 없이 배치할 것.
    ctx["VERIFY_CMD_JS"] = json.dumps(args.verify_cmd, ensure_ascii=False)

    # ── frontmatter description = YAML 안전 직렬화 ────────────────────────────
    # root-cause: goal 에 " 가 들어오면 템플릿에 수기로 적힌 double-quoted 스칼라가
    #   조기 종료돼 frontmatter 파싱이 실패한다 → 스킬 미인식.
    #   (loop-SKILL.md.tmpl 주석이 경고한 2026-07-14 '루프 스킬 4종 전부 미인식'과 동일 실패 모드)
    # json.dumps 출력은 항상 단일 행 double-quoted 스칼라이며, YAML 이 그대로 받아들이는
    #   이스케이프만 사용한다 — 표준 라이브러리만으로 성립(PyYAML 의존 없음).
    # ⚠️ 이 방어가 무력화되는 입력: 값 쪽에는 없다(따옴표·역슬래시·개행·제어문자 전부 이스케이프).
    #   무력화되는 것은 *템플릿* 쪽이다 — loop-SKILL.md.tmpl 이 {{DESCRIPTION}} 을 따옴표로 다시
    #   감싸거나 다른 스칼라 안에 끼워 넣으면 직렬화가 무효가 된다.
    #   반드시 `description: {{DESCRIPTION}}` 형태로 단독 배치할 것.
    # NOTE: DESCRIPTION 은 ctx 의 *마지막* 키여야 한다 — render() 가 삽입 순서대로 치환하므로
    #   마지막에 주입돼야 goal 안의 {{...}} 문자열이 뒤이어 재치환되지 않는다.
    ctx["DESCRIPTION"] = json.dumps(
        f"{loop_name} 루프를 실행한다. 트리거: 사용자가 /{loop_name} 를 호출할 때만. "
        f"종료조건 — {args.goal}",
        ensure_ascii=False,
    )

    print(f"[scaffold] 루프 이름: {loop_name}")
    print(f"[scaffold] 스킬 경로: {skill_dir}")
    print(f"[scaffold] 상태 경로: {state_file}")

    # ── 1. Durable: SKILL.md ──────────────────────────────────────────────────
    skill_dir.mkdir(parents=True, exist_ok=True)
    (skill_dir / "SKILL.md").write_text(render(read_tmpl("loop-SKILL.md.tmpl"), ctx), encoding="utf-8")
    print(f"[scaffold] CREATED: {skill_dir}/SKILL.md")

    # ── 2. Durable: HUMAN-GATES.md ────────────────────────────────────────────
    (skill_dir / "HUMAN-GATES.md").write_text(render(read_tmpl("HUMAN-GATES.md.tmpl"), ctx), encoding="utf-8")
    print(f"[scaffold] CREATED: {skill_dir}/HUMAN-GATES.md")

    # ── 3. Durable: TRIGGER.md ────────────────────────────────────────────────
    (skill_dir / "TRIGGER.md").write_text(render(read_tmpl("TRIGGER.md.tmpl"), ctx), encoding="utf-8")
    print(f"[scaffold] CREATED: {skill_dir}/TRIGGER.md")

    # ── 4. Durable: scripts/workflow.js ──────────────────────────────────────
    # root-cause: 템플릿이 workflow.js.tmpl 하나뿐이라 --pattern 이 헤더 주석에만 남았다.
    #   pev 를 골라도 결정론 verifier 가 아니라 LLM 루브릭 평가자(0~100점) 본문이 나왔다
    #   (백로그 P0-8). → 골격(workflow.js.tmpl) + 패턴 본문(workflow.body.{pattern}.js.tmpl)
    #   으로 분리하고, 여기서 --pattern 값으로 본문 템플릿을 고른다.
    # ⚠️ 이 분기가 무력화되는 입력: 골격의 자리표시자 개수가 1이 아닌 경우.
    #   0개 → --pattern 을 무엇으로 줘도 본문 없는 workflow.js 가 *조용히* 나온다.
    #   2개 이상 → 주석에 한 번 더 적힌 자리에도 본문이 통째로 주입된다(실측 발생).
    #   → 아래에서 개수를 세어 fail-loud 로 막는다.
    body_tmpl_name = f"workflow.body.{args.pattern}.js.tmpl"
    skeleton = read_tmpl("workflow.js.tmpl")
    slot_count = skeleton.count(PATTERN_BODY_SLOT)
    if slot_count != 1:
        sys.exit(
            f"[scaffold] workflow.js.tmpl 의 {PATTERN_BODY_SLOT} 자리표시자가 {slot_count}개입니다 "
            f"(정확히 1개여야 함) — 패턴 본문({body_tmpl_name}) 주입 중단."
        )
    body = read_tmpl(body_tmpl_name)

    # 본문을 **치환 전에** 끼워 넣고 render 는 한 번만 돈다.
    #   두 번 나눠 render 하면 먼저 삽입된 사용자 입력(GOAL 등) 안의 {{...}} 가
    #   2차 치환돼 오염된다 — DESCRIPTION 을 ctx 마지막에 두는 것과 같은 이유.
    combined = skeleton.replace(PATTERN_BODY_SLOT, body)

    scripts_dir = skill_dir / "scripts"
    scripts_dir.mkdir(exist_ok=True)
    (scripts_dir / "workflow.js").write_text(render(combined, ctx), encoding="utf-8")
    print(f"[scaffold] CREATED: {scripts_dir}/workflow.js  (pattern body: {body_tmpl_name})")

    # ── 5. Changing: STATE.md ─────────────────────────────────────────────────
    state_file.parent.mkdir(parents=True, exist_ok=True)
    (state_file).write_text(render(read_tmpl("STATE.md.tmpl"), ctx), encoding="utf-8")
    print(f"[scaffold] CREATED: {state_file}")

    # ── Tree ──────────────────────────────────────────────────────────────────
    print("\n[scaffold] 생성 완료 파일 트리:")
    print(f"  {skill_dir}/")
    print(f"  ├── SKILL.md")
    print(f"  ├── HUMAN-GATES.md")
    print(f"  ├── TRIGGER.md")
    print(f"  └── scripts/")
    print(f"      └── workflow.js")
    print(f"  {state_file}  (changing — project cwd)")

    print("\n[scaffold] 다음 단계:")
    print("  1. forge-sync 실행: node ${FORGE_ROOT:-$HOME/forge}/dev/scripts/forge-sync.mjs sync")
    print("  2. HUMAN-GATES.md wall-clock 상한 구체적 수치 확인")
    print("  3. G1 pre-run sign-off 후 첫 실행")


if __name__ == "__main__":
    main()
