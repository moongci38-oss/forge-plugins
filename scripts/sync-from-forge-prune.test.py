#!/usr/bin/env python3
"""forge#4135 할 일 2 — forge 에서 지운 skill·command·agent 를 플러그인에서도 지운다.

임시 forge(git) 와 임시 플러그인 레포를 만들고:
  ① --verify 가 `STALE: <플러그인>/<칸>/<이름>` 과 `STALE_REMAINING=<n>` 을 낸다(지운 것만 · 플러그인 전용은 아님)
  ② --prune 이 지운 것만 지우고 플러그인 전용·살아 있는 것은 남긴다
재현: python3 scripts/sync-from-forge-prune.test.py
"""
import os, subprocess, sys, tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
SCRIPT = os.path.join(HERE, "sync-from-forge.py")
FAIL = 0


def ok(m):
    print(f"  PASS  {m}")


def ng(m, d=""):
    global FAIL
    FAIL += 1
    print(f"  FAIL  {m}  {d}")


def w(p, s="x\n"):
    os.makedirs(os.path.dirname(p), exist_ok=True)
    open(p, "w", encoding="utf-8").write(s)


def git(repo, *a):
    subprocess.run(["git", "-C", repo, *a], check=True, capture_output=True,
                   env={**os.environ, "GIT_AUTHOR_NAME": "t", "GIT_AUTHOR_EMAIL": "t@t",
                        "GIT_COMMITTER_NAME": "t", "GIT_COMMITTER_EMAIL": "t@t"})


with tempfile.TemporaryDirectory() as t:
    forge = os.path.join(t, "forge")
    plug = os.path.join(t, "plugins")
    # forge: keep·gone 스킬, old 명령, gone-agent 를 커밋한 뒤 gone·old·gone-agent 를 지운다
    w(f"{forge}/.claude/skills/keep/SKILL.md")
    w(f"{forge}/.claude/skills/gone/SKILL.md")
    w(f"{forge}/.claude/commands/old.md")
    w(f"{forge}/.claude/agents/gone-agent.md")
    w(f"{forge}/.claude/commands/live.md")   # 칸 폴더가 통째로 사라지지 않게(실제 forge 와 같게)
    w(f"{forge}/.claude/agents/live.md")
    git(t, "init", "-q", forge)
    git(forge, "add", "-A")
    git(forge, "commit", "-qm", "init")
    git(forge, "rm", "-rq", ".claude/skills/gone", ".claude/commands/old.md", ".claude/agents/gone-agent.md")
    git(forge, "commit", "-qm", "drop")
    # 플러그인: 살아 있는 keep · 지워진 gone/old/gone-agent · 플러그인 전용 mine(forge 기록 없음)
    w(f"{plug}/.claude-plugin/marketplace.json", "{}\n")
    for p in ("skills/keep/SKILL.md", "skills/gone/SKILL.md", "skills/mine/SKILL.md",
              "commands/old.md", "commands/mine.md", "agents/gone-agent.md"):
        w(f"{plug}/forge-core/{p}")

    env = {**os.environ, "FORGE_ROOT": forge, "PLUGIN_ROOT": plug}
    r = subprocess.run([sys.executable, SCRIPT, "--verify"], capture_output=True, text=True, env=env)
    out = r.stdout + r.stderr
    want = {"forge-core/skills/gone", "forge-core/commands/old.md", "forge-core/agents/gone-agent.md"}
    got = {l.split("STALE:", 1)[1].strip() for l in out.splitlines() if "STALE:" in l}
    if got == want and "STALE_REMAINING=3" in out:
        ok("① --verify 가 forge 에서 지운 3개만 STALE 로 낸다")
    else:
        ng("① STALE 목록이 다르다", f"got={sorted(got)} out={out[-400:]}")

    r = subprocess.run([sys.executable, SCRIPT, "--prune"], capture_output=True, text=True, env=env)
    gone = [p for p in want if os.path.exists(f"{plug}/{p}")]
    kept = [p for p in ("skills/keep", "skills/mine", "commands/mine.md") if not os.path.exists(f"{plug}/forge-core/{p}")]
    if r.returncode == 0 and not gone and not kept:
        ok("② --prune 이 지운 것만 지우고 살아 있는 것·플러그인 전용은 남긴다")
    else:
        ng("② --prune 결과가 다르다", f"rc={r.returncode} 남은삭제대상={gone} 사라진보존대상={kept} {(r.stdout + r.stderr)[-300:]}")

print(f"FAIL={FAIL}")
sys.exit(0 if FAIL == 0 else 1)
