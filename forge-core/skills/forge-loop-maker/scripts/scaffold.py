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
    [--trigger "<TRIGGER_DESC>"] \\
    [--gates "<GATE_LIST>"] \\
    [--project-cwd <CWD>]

# root-cause: scaffold = forge-loop-maker Phase 4b 구현체. blueprint [STOP] 승인 후에만 실행.
"""
import argparse
import os
import re
import sys
from datetime import datetime
from pathlib import Path

FORGE_ROOT = Path(os.environ.get("FORGE_ROOT", Path.home() / "forge"))
SKILLS_DIR = FORGE_ROOT / ".claude" / "skills"
TMPL_DIR   = Path(__file__).resolve().parent.parent / "templates"


def read_tmpl(name: str) -> str:
    p = TMPL_DIR / name
    if not p.exists():
        sys.exit(f"[scaffold] template not found: {p}")
    return p.read_text(encoding="utf-8")


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
    ap.add_argument("--trigger",      default="manual")
    ap.add_argument("--gates",        default="G1 첫 실행 전, G2 verifier 이상")
    ap.add_argument("--project-cwd",  default=os.getcwd())
    args = ap.parse_args()

    loop_name  = re.sub(r"[^a-z0-9\-]", "-", args.name.lower()).strip("-")
    state_path = args.state or f"loops/{loop_name}/STATE.md"
    cwd        = Path(args.project_cwd).resolve()
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
    scripts_dir = skill_dir / "scripts"
    scripts_dir.mkdir(exist_ok=True)
    (scripts_dir / "workflow.js").write_text(render(read_tmpl("workflow.js.tmpl"), ctx), encoding="utf-8")
    print(f"[scaffold] CREATED: {scripts_dir}/workflow.js")

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
    print("  1. forge-sync 실행: node ~/forge/dev/scripts/forge-sync.mjs sync")
    print("  2. HUMAN-GATES.md wall-clock 상한 구체적 수치 확인")
    print("  3. G1 pre-run sign-off 후 첫 실행")


if __name__ == "__main__":
    main()
