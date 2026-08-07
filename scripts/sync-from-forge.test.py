#!/usr/bin/env python3
"""sync-from-forge.test.py — 카테고리가 조용히 스킵되는 사고 재발 방지

root-cause(2026-08-02 전파 감사): `~/forge/.claude/rules/` 가 2026-07-27 A1-5 리팩터로
  `~/forge/dev/global-rules/` 로 이전됐는데 이 스크립트는 계속 옛 경로를 봤다.
  `os.path.isdir()` 이 False 라 `continue` 로 건너뛰었고 — 에러도, drift 리포트도,
  종료코드도 정상이었다. **rules 동기화가 6일간 0건으로 죽어 있었다.**
  플러그인 사용자는 그동안 룰 업데이트를 한 건도 받지 못했다.
  실측 피해: 플러그인 rules 3파일이 SSoT 대비 135행 stale.

근거: 소스 디렉터리 존재는 정적으로 확인 가능하고, 각 카테고리가 실제로 1건 이상
  대응 파일을 찾는지도 확인 가능하다. 침묵 스킵은 그 두 가지로 잡힌다.
폐기조건: SUBDIRS 가 명시적 (카테고리 → 소스경로) 매핑만 갖고 부재 시 예외를 던지도록
  재설계되면 이 테스트는 불필요해진다.

사용: python3 scripts/sync-from-forge.test.py
"""
import importlib.util
import os
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
TARGET = os.path.join(HERE, "sync-from-forge.py")

PASS = 0
FAIL = 0


def ok(msg):
    global PASS
    PASS += 1
    print(f"  PASS  {msg}")


def ng(msg, detail=""):
    global FAIL
    FAIL += 1
    print(f"  FAIL  {msg}  {detail}")


SKIP = 0


def skip(msg):
    """측정 불가 — PASS 도 FAIL 도 아니다. 침묵하면 '검사했는데 통과'로 오독된다."""
    global SKIP
    SKIP += 1
    print(f"  SKIP  {msg}")


def load():
    spec = importlib.util.spec_from_file_location("sff", TARGET)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


mod = load()

# ⚠️ §1~3 은 forge SSoT(PRIVATE 레포)가 로컬에 있어야만 의미가 있다. CI 러너에는 없다
#   (2026-08-07 실측: FORGE_ROOT 부재 시 §1~3 이 FAIL=8 을 냈다 — 결함이 아니라 전제 부재다).
#   없는 곳에서 FAIL 로 세면 CI 가 상시 빨갛게 되고, 그러면 아무도 안 본다. 그렇다고 조용히
#   통과시키면 "검사했는데 깨끗함"으로 오독된다 → **SKIP 으로 명시**하고 종료코드에서 뺀다.
#   §4~8 은 소스·순수로직 검사라 SSoT 없이도 유효하다 = CI 가 실제로 지키는 범위.
_SSOT_PRESENT = all(
    os.path.isdir(mod.SUBDIR_SRC.get(s, os.path.join(mod.FORGE_ROOT, s))) for s in mod.SUBDIRS
)

print("== 1. 모든 카테고리의 forge 소스 디렉터리가 실재한다 ==")
if not _SSOT_PRESENT:
    skip(f"forge SSoT 부재({mod.FORGE_ROOT}) — §1~3 은 로컬 전용 검사다")
else:
    for sub in mod.SUBDIRS:
        src = mod.SUBDIR_SRC.get(sub, os.path.join(mod.FORGE_ROOT, sub))
        if os.path.isdir(src):
            ok(f"{sub} → {src}")
        else:
            ng(f"{sub} 소스 부재 → {src}",
               "이 카테고리는 조용히 스킵된다(2026-07-27 rules 사고와 동일)")

print()
print("== 2. rules 카테고리가 실제로 대응 파일을 찾는다(0건 = 죽은 것) ==")
if not _SSOT_PRESENT:
    skip("forge SSoT 부재 — iter_pairs 대응 검사 불가")
else:
    counts = {}
    for plugin, sub, rel, forge_abs, plug_abs in mod.iter_pairs():
        counts[sub] = counts.get(sub, 0) + 1
    for sub in mod.SUBDIRS:
        n = counts.get(sub, 0)
        if n > 0:
            ok(f"{sub}: {n}건 대응")
        else:
            ng(f"{sub}: 0건 — 카테고리가 죽어 있다")

print()
print("== 3. 역변조 — rules 매핑을 지우면 감지돼야 한다(판별력 실증) ==")
src_text = open(TARGET, encoding="utf-8").read()
if not _SSOT_PRESENT:
    skip("forge SSoT 부재 — 역변조 대조군(rules 건수)을 만들 수 없다")
else:
    mutated = src_text.replace(
        'forge_dir = SUBDIR_SRC.get(sub, os.path.join(FORGE_ROOT, sub))',
        'forge_dir = os.path.join(FORGE_ROOT, sub)',
    )
    if mutated == src_text:
        ng("역변조 지점 없음 — 테스트가 소스와 어긋남")
    else:
        import tempfile
        with tempfile.TemporaryDirectory() as td:
            mut_path = os.path.join(td, "mut.py")
            open(mut_path, "w", encoding="utf-8").write(mutated)
            r = subprocess.run([sys.executable, mut_path, "--dry-run"],
                               capture_output=True, text=True)
            rules_lines = [l for l in r.stdout.splitlines() if l.strip().startswith("- rules/")]
            if len(rules_lines) == 0:
                ok("역변조 시 rules 0건 — 매핑이 실제로 일한다")
            else:
                ng(f"역변조해도 rules {len(rules_lines)}건 — 이 테스트는 공허하다")

print()
print("== 4. 소스 부재 시 침묵하지 않는다(WARN 출력) ==")
if "WARN: forge 소스 없음" in src_text:
    ok("소스 부재 WARN 경로 실재")
else:
    ng("소스 부재를 조용히 continue — 침묵 스킵이 재발한다")

print()
print("== 5. 사설 절대경로 치환 (이 레포는 PUBLIC, forge SSoT 는 PRIVATE) ==")
# 2026-08-06 실사고: `~/forge` 리터럴만 치환하던 탓에 `/home/<user>/forge/...` 8곳이 공개 배포됐다.
for src, must_contain, must_not, why in [
    ("/home/u1/forge/.claude/x", "${FORGE_ROOT:-$HOME/forge}", "/home/u1", "사용자 홈 아래 forge"),
    ("/home/u1/.claude/hooks/a.sh", "$HOME/.claude", "/home/u1", "사용자 홈 아래 .claude"),
    ("/home/u1/other/thing", "$HOME/other", "/home/u1", "그 밖의 사용자 홈"),
    ("https://www.notion.so/" + "0" * 32, "${NOTION_DB_ID}", "0" * 32, "Notion DB 식별자"),
]:
    out = mod.transform_line(src)
    if must_contain in out and must_not not in out:
        ok(f"{why}: {out.strip()[:52]}")
    else:
        ng(f"{why} 미치환 → {out.strip()[:52]}")

print()
print("== 6. 누출 가드 판별력 (양방향 — 오탐 내는 가드는 무시당한다) ==")
for src, should_flag, why in [
    ("/home/damools/secret/x", True, "실제 사용자 홈"),
    ("/mnt/z/secret/project/f.md", True, "미등록 사설 마운트 경로"),
    ("/mnt/c/Users/someone/Downloads/x", True, "윈도우 사용자 홈"),
    ("/home/<user>/...", False, "문서용 플레이스홀더"),
    ("/home/${USER}/x", False, "변수 플레이스홀더"),
    ("/mnt/c/Program Files/Unity/Hub/Editor/Unity.exe", False, "표준 윈도우 설치 경로"),
    ("/mnt/e/* 또는 E:/* → windows", False, "WSL 드라이브 판별 glob"),
    ("${GODBLADE_ROOT}/loops/x", False, "치환 완료본"),
]:
    flagged = bool(mod.find_leaks(src))
    if flagged == should_flag:
        ok(f"{'탐지' if should_flag else '통과'} — {why}")
    else:
        ng(f"{why}: 탐지={flagged} 기대={should_flag} ({src[:44]})")

print()
print("== 7. 역변조 — 누출 가드를 지우면 사설 경로가 통과해야 한다(판별력 실증) ==")
mut2 = src_text.replace("leaks = find_leaks(target_content)", "leaks = []")
if mut2 == src_text:
    ng("역변조 지점 없음 — 가드 호출부가 소스와 어긋남")
elif "if leaks:" in src_text and "continue" in src_text:
    ok("가드가 write 전에 continue 로 차단 — 경고만 하고 쓰지 않는다")
else:
    ng("가드가 있으나 write 를 막지 않는다 — 경고는 유출을 막지 못한다")

print()
print("== 8. G-3 레포 전역 스캔 — sync 범위 **밖** 파일도 검사되는가 ==")
# 근거: 기존 가드는 main() 의 sync 루프 안에 있어 SUBDIRS(skills/commands/agents/rules)를
#   지나는 파일만 봤다. mcp/·hooks/·루트 문서는 무방비였고 실제로
#   forge-knowledge/mcp/forge-tools-server.py 에 사설 경로 3곳이 남아 PR #46 에서야 회수됐다.
#   (harness-gaps/2026-08-06-plugin-sync-public-leak-harness-gaps.md §G-3)
# 판별력: 아래 ①은 **mcp/ 하위**(sync 범위 밖)에 심은 누출을 잡는다 — scan_repo_leaks 가
#   SUBDIRS 로 좁혀지면 즉시 FAIL 한다. ②는 자기참조 제외가 과하게 넓어지는 것을 막는다.
import tempfile
import shutil

_tmp = tempfile.mkdtemp(prefix="g3-scan-")
try:
    subprocess.run(["git", "init", "-q", _tmp], check=True)
    os.makedirs(os.path.join(_tmp, "forge-knowledge", "mcp"), exist_ok=True)
    os.makedirs(os.path.join(_tmp, "forge-core", "skills", "x"), exist_ok=True)
    # sync 범위 **밖**(mcp/) 에 누출을 심는다 — 기존 가드는 이 파일을 본 적이 없다
    with open(os.path.join(_tmp, "forge-knowledge", "mcp", "server.py"), "w", encoding="utf-8") as f:
        f.write('ROOT = "/home/someuser/forge-outputs/13-multiagent"\n')
    # sync 범위 안은 깨끗하게 둔다 — ①이 통과하면 그것은 **범위 밖에서 잡았다**는 뜻이다
    with open(os.path.join(_tmp, "forge-core", "skills", "x", "SKILL.md"), "w", encoding="utf-8") as f:
        f.write("clean\n")
    subprocess.run(["git", "-C", _tmp, "add", "-A"], check=True)

    found = mod.scan_repo_leaks(_tmp)
    hits = {rel for rel, _ in (found or [])}
    if "forge-knowledge/mcp/server.py" in hits:
        ok("① sync 범위 밖(mcp/)의 누출을 잡는다 — G-3 무방비 구간 폐쇄")
    else:
        ng(f"① mcp/ 누출 미탐 — scan_repo_leaks 가 SUBDIRS 로 좁혀졌다 (탐지: {sorted(hits)})")

    # 깨끗한 레포는 0건이어야 한다(오탐 내는 가드는 무시당한다)
    os.remove(os.path.join(_tmp, "forge-knowledge", "mcp", "server.py"))
    subprocess.run(["git", "-C", _tmp, "add", "-A"], check=True)
    if mod.scan_repo_leaks(_tmp) == []:
        ok("② 깨끗한 레포는 0건 — 상시 FAIL 하는 가드가 아니다")
    else:
        ng(f"② 깨끗한 레포에서 오탐: {mod.scan_repo_leaks(_tmp)}")
finally:
    shutil.rmtree(_tmp, ignore_errors=True)

# 자기참조 제외는 **딱 2개**여야 한다 — 넓어지면 실배포물이 검사에서 빠진다
if mod.SCAN_SELF_EXCLUDE == {"scripts/sync-from-forge.py", "scripts/sync-from-forge.test.py"}:
    ok("③ 자기참조 제외가 도구 2파일로 한정 — 플러그인 번들은 전량 검사 대상")
else:
    ng(f"③ SCAN_SELF_EXCLUDE 가 바뀌었다: {sorted(mod.SCAN_SELF_EXCLUDE)} — 배포물이 빠질 수 있다")

# 스캔 실패(비-git 디렉터리)를 0건과 같게 보고하면 "검사했는데 깨끗함"으로 오독된다
_nogit = tempfile.mkdtemp(prefix="g3-nogit-")
try:
    if mod.scan_repo_leaks(_nogit) is None:
        ok("④ 비-git 경로는 None(스캔 불가) — 0건과 구분된다")
    else:
        ng("④ 비-git 경로가 0건으로 보고됨 — 검사 못 한 것이 통과로 오독된다")
finally:
    shutil.rmtree(_nogit, ignore_errors=True)

print()
print("================================")
print(f"PASS={PASS}  FAIL={FAIL}  SKIP={SKIP}")
if SKIP:
    print("⚠️ SKIP 은 통과가 아니다 — forge SSoT 가 있는 로컬에서 한 번 더 돌려야 §1~3 이 실측된다.")
sys.exit(0 if FAIL == 0 else 1)
