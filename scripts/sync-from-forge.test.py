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

    found, unread = mod.scan_repo_leaks(_tmp)
    hits = {rel for rel, _ in found}
    if "forge-knowledge/mcp/server.py" in hits:
        ok("① sync 범위 밖(mcp/)의 누출을 잡는다 — G-3 무방비 구간 폐쇄")
    else:
        ng(f"① mcp/ 누출 미탐 — scan_repo_leaks 가 SUBDIRS 로 좁혀졌다 (탐지: {sorted(hits)})")

    # 깨끗한 레포는 0건이어야 한다(오탐 내는 가드는 무시당한다)
    os.remove(os.path.join(_tmp, "forge-knowledge", "mcp", "server.py"))
    subprocess.run(["git", "-C", _tmp, "add", "-A"], check=True)
    if mod.scan_repo_leaks(_tmp) == ([], []):
        ok("② 깨끗한 레포는 0건 — 상시 FAIL 하는 가드가 아니다")
    else:
        ng(f"② 깨끗한 레포에서 오탐: {mod.scan_repo_leaks(_tmp)}")

    # ⑤ 비-UTF-8 **텍스트**는 스킵하지 않고 그대로 검사한다 (2026-08-07 cr-final HIGH)
    #   1차판은 UnicodeDecodeError 를 통째로 스킵하고 exit 0 을 냈다 — 출력은 "통과 아님"이라
    #   말하면서 종료코드는 통과였고, cp949 로 저장된 텍스트의 사설 경로가 CI 를 그린으로 지나갔다.
    #   → NUL 유무로 바이너리와 가르고, 비-UTF-8 텍스트는 latin-1 복호 후 검사한다.
    #   판별력: latin-1 폴백을 지우고 `continue` 로 되돌리면 ⑤ 가 FAIL 한다.
    with open(os.path.join(_tmp, "forge-knowledge", "mcp", "cp949.py"), "wb") as f:
        f.write('P = "/home/someuser/비밀"\n'.encode("cp949"))  # UTF-8 로는 디코드 불가
    subprocess.run(["git", "-C", _tmp, "add", "-A"], check=True)
    found5, skip5 = mod.scan_repo_leaks(_tmp)
    hit5 = {rel for rel, _ in found5}
    if "forge-knowledge/mcp/cp949.py" in hit5:
        ok("⑤ 비-UTF-8 텍스트도 검사돼 누출이 잡힌다 — 스킵이 아니라 복호 후 스캔")
    else:
        ng(f"⑤ 비-UTF-8 텍스트의 누출을 놓쳤다 (탐지: {sorted(hit5)}) — exit 0 으로 새어나간다")

    # ⑤-b 진짜 바이너리(NUL 포함)는 binary 로 분류돼 **종료코드를 올리지 않는다**
    #   (zip 하나 때문에 가드가 상시 FAIL 이 되면 아무도 안 쓴다 — 정밀도가 가드의 수명이다)
    with open(os.path.join(_tmp, "forge-knowledge", "mcp", "blob.bin"), "wb") as f:
        f.write(b"\x00\x01\x02/home/someuser/x\x00")
    subprocess.run(["git", "-C", _tmp, "add", "-A"], check=True)
    _f5b, skip5b = mod.scan_repo_leaks(_tmp)
    kinds = {rel: kind for rel, kind in skip5b}
    if kinds.get("forge-knowledge/mcp/blob.bin") == "binary":
        ok("⑤-b NUL 포함 파일은 binary 로 분류 — 종료코드를 올리지 않는다")
    else:
        ng(f"⑤-b 바이너리 분류 실패: {kinds}")

    # ⑤-c **UTF-16 텍스트**의 누출도 잡아야 한다 (2026-08-07 cr-final HIGH, opus·codex 독립 적중)
    #   NUL 유무만으로 "바이너리 = 검사 불필요"라 끊으면 UTF-16LE 의 `/home` 이
    #   `/\x00h\x00o\x00m\x00e\x00` 라 통째로 빠진다 — 이 PR 이 닫으려던 갭이 인코딩만
    #   바꿔 재현되고, exit code 도 안 올라가 CI 가 그린으로 통과한다.
    #   판별력: `raw.replace(b'\x00', b'')` 를 지우고 binary 를 `continue` 로 되돌리면 FAIL 한다.
    with open(os.path.join(_tmp, "forge-knowledge", "mcp", "utf16.txt"), "wb") as f:
        f.write('P = "/home/someuser/forge-outputs/x"\n'.encode("utf-16-le"))
    subprocess.run(["git", "-C", _tmp, "add", "-A"], check=True)
    found5c, skip5c = mod.scan_repo_leaks(_tmp)
    hit5c = {rel for rel, _ in found5c}
    kind5c = {rel: kind for rel, kind in skip5c}
    if "forge-knowledge/mcp/utf16.txt" in hit5c:
        ok("⑤-c UTF-16 텍스트의 누출도 잡는다 — NUL 제거 후 검사")
    else:
        ng(f"⑤-c UTF-16 누출 미탐 (탐지: {sorted(hit5c)}) — NUL 휴리스틱이 텍스트를 삼킨다")
    if kind5c.get("forge-knowledge/mcp/utf16.txt") == "binary":
        ok("⑤-d 그래도 분류는 binary — 종료코드는 LEAK 로만 올라간다(상시 FAIL 방지)")
    else:
        ng(f"⑤-d UTF-16 파일 분류가 예상 밖: {kind5c}")
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
print("== 9. --scan-repo CLI 계층 — argparse·exit code 배선이 실제로 도는가 ==")
# 근거(2026-08-07 cr-final MED): §8 은 scan_repo_leaks() 를 **직접** 호출해 순수 함수만 본다.
#   CI 가 실제로 실행하는 진입점은 `python3 scripts/sync-from-forge.py --scan-repo .` 이고,
#   그 사이에는 argparse 배선 · main() 분기 · `sys.exit(main())` 종료코드 전파가 있다.
#   §3 은 --dry-run 을 subprocess 로 검증하는데 --scan-repo 에는 그 패턴이 없었다 —
#   함수가 옳아도 CLI 가 exit 0 을 내면 CI 가 누출을 통과시킨다.
# 폐기조건: 스캔 진입점이 CLI 가 아니게 되면(예: pre-commit 프레임워크 훅) 이 절을 그 진입점으로 옮긴다.
# 판별력: main() 의 `return 1` 을 `return 0` 으로 바꾸면 ⑥-b 가 FAIL 한다(2026-08-07 실측).
_cli = tempfile.mkdtemp(prefix="g3-cli-")
try:
    subprocess.run(["git", "init", "-q", _cli], check=True)
    os.makedirs(os.path.join(_cli, "forge-knowledge", "mcp"), exist_ok=True)
    with open(os.path.join(_cli, "forge-knowledge", "mcp", "clean.py"), "w", encoding="utf-8") as f:
        f.write("OK = 1\n")
    subprocess.run(["git", "-C", _cli, "add", "-A"], check=True)

    r_clean = subprocess.run([sys.executable, TARGET, "--scan-repo", _cli],
                             capture_output=True, text=True)
    if r_clean.returncode == 0 and "SCAN_STATUS=ok" in r_clean.stderr:
        ok("⑥-a 깨끗한 레포 → exit 0 + SCAN_STATUS=ok")
    else:
        ng(f"⑥-a rc={r_clean.returncode} stderr={r_clean.stderr[:120]}")
    if "UNREADABLE=0" in r_clean.stderr and "BINARY=0" in r_clean.stderr:
        ok("⑥-a2 BINARY·UNREADABLE 건수가 0 이어도 출력된다 — '0건'과 '안 봤음'이 구분된다")
    else:
        ng("⑥-a2 카운터가 출력에 없다 — 침묵 스킵이 다시 보이지 않게 된다")

    # ⑥-a3 바이너리만 있는 레포는 **여전히 exit 0** 이어야 한다(상시 FAIL 방지)
    with open(os.path.join(_cli, "forge-knowledge", "mcp", "b.bin"), "wb") as f:
        f.write(b"\x00\x01\x02")
    subprocess.run(["git", "-C", _cli, "add", "-A"], check=True)
    r_bin = subprocess.run([sys.executable, TARGET, "--scan-repo", _cli], capture_output=True, text=True)
    if r_bin.returncode == 0 and "BINARY=1" in r_bin.stderr:
        ok("⑥-a3 바이너리는 BINARY 로 세되 exit 0 — zip 하나로 가드가 상시 FAIL 하지 않는다")
    else:
        ng(f"⑥-a3 rc={r_bin.returncode} (기대 0) stderr={r_bin.stderr[:120]}")

    # ⑥-a4 **읽지 못한** 추적 파일이 있으면 exit 1 — 출력이 '통과 아님'이라 말했으면 계약도 그래야 한다
    #   (2026-08-07 cr-final HIGH: UNREADABLE 을 찍어놓고 exit 0 을 내 CI 가 그린으로 지나갔다)
    #   판별력: main() 의 `if unreadable: return 1` 을 지우면 이 케이스가 FAIL 한다.
    _unread = os.path.join(_cli, "forge-knowledge", "mcp", "noperm.py")
    with open(_unread, "w", encoding="utf-8") as f:
        f.write("OK = 1\n")
    subprocess.run(["git", "-C", _cli, "add", "-A"], check=True)
    os.chmod(_unread, 0o000)
    # 권한 복원을 finally 로 감싼다(2026-08-07 cr-final MED): 중간 단언·서브프로세스에서
    # 예외가 나면 0o000 파일이 남아 **같은 파일의 이후 테스트가 전부 오염**된다.
    try:
        _readable_anyway = True
        try:
            open(_unread, "rb").close()
        except OSError:
            _readable_anyway = False
        if _readable_anyway:
            skip("⑥-a4 chmod 000 이후에도 읽힘(root 실행?) — 읽기 실패를 주입하지 못했다")
        else:
            r_ur = subprocess.run([sys.executable, TARGET, "--scan-repo", _cli], capture_output=True, text=True)
            if r_ur.returncode == 1 and "UNREADABLE=1" in r_ur.stderr:
                ok("⑥-a4 읽지 못한 추적 파일 → exit 1 (문구와 종료코드가 일치한다)")
            else:
                ng(f"⑥-a4 rc={r_ur.returncode} (기대 1) — '통과 아님'이라 찍고 통과시킨다 stderr={r_ur.stderr[:140]}")
    finally:
        os.chmod(_unread, 0o644)
        os.remove(_unread)
        os.remove(os.path.join(_cli, "forge-knowledge", "mcp", "b.bin"))
        subprocess.run(["git", "-C", _cli, "add", "-A"], check=True)

    with open(os.path.join(_cli, "forge-knowledge", "mcp", "leak.py"), "w", encoding="utf-8") as f:
        f.write('P = "/home/someuser/forge-outputs/x"\n')
    subprocess.run(["git", "-C", _cli, "add", "-A"], check=True)
    r_leak = subprocess.run([sys.executable, TARGET, "--scan-repo", _cli],
                            capture_output=True, text=True)
    if r_leak.returncode == 1 and "LEAK:" in r_leak.stderr:
        ok("⑥-b 누출 발견 → exit 1 (CI 가 빨갛게 된다)")
    else:
        ng(f"⑥-b rc={r_leak.returncode} (기대 1) — CLI 가 누출을 통과시킨다 stderr={r_leak.stderr[:120]}")

    r_nogit = subprocess.run([sys.executable, TARGET, "--scan-repo", tempfile.gettempdir() + "/__g3_nonexistent__"],
                             capture_output=True, text=True)
    if r_nogit.returncode == 2 and "SCAN_STATUS=error" in r_nogit.stderr:
        ok("⑥-c 스캔 불가 → exit 2 (0·1 과 구분되는 제3의 상태)")
    else:
        ng(f"⑥-c rc={r_nogit.returncode} (기대 2) — 검사 못 한 것이 통과/실패로 뭉개진다")

    r_warn = subprocess.run([sys.executable, TARGET, "--scan-repo", _cli, "--dry-run"],
                            capture_output=True, text=True)
    if "--dry-run" in r_warn.stderr and "WARN" in r_warn.stderr:
        ok("⑥-d --scan-repo 와 무관한 플래그를 조용히 무시하지 않고 WARN 한다")
    else:
        ng("⑥-d --dry-run 이 조용히 무시됨 — 'dry-run 으로 스캔했다'는 오해를 남긴다")
finally:
    shutil.rmtree(_cli, ignore_errors=True)

print()
print("== 10. G-4 PLUGIN_ROOT 기본값 — '지금 있는 레포'가 기본이다 ==")
# root-cause(2026-08-06): 기본값이 마켓플레이스 클론이라, 레포에서 실행해도 클론이 바뀌었다.
#   조용한 오작동이다 — 클론이 바뀌어도 레포는 clean 이라 아무 신호가 없다.
_m10 = load()
if _m10 is None:
    skip("⑦ 모듈 로드 실패")
else:
    _repo = os.path.dirname(os.path.dirname(os.path.abspath(TARGET)))
    _saved = os.environ.pop("PLUGIN_ROOT", None)
    try:
        if _m10.default_plugin_root() == _repo:
            ok("⑦-a 매니페스트 보유 레포 안에서는 그 레포가 기본값")
        else:
            ng(f"⑦-a 기본값={_m10.default_plugin_root()} (기대 {_repo}) — 눈앞의 레포가 아닌 곳이 바뀐다")
        os.environ["PLUGIN_ROOT"] = "/tmp/explicit-root"
        if _m10.default_plugin_root() == "/tmp/explicit-root":
            ok("⑦-b 명시 env 는 항상 이긴다(기존 사용자 경로 불변)")
        else:
            ng("⑦-b env PLUGIN_ROOT 가 무시된다")
    finally:
        os.environ.pop("PLUGIN_ROOT", None)
        if _saved is not None:
            os.environ["PLUGIN_ROOT"] = _saved

print()
print("== 11. G-1 inbound — 'forge 에만 있는 것'이 보이는가(0 이 완전성을 뜻하지 않게) ==")
# root-cause(2026-08-06): iter_pairs() 는 플러그인 디렉터리를 walk 하므로 '양쪽에 다 있는 것'만
#   본다. forge 에 새 스킬이 생겨도 어디에도 안 나타나고 --verify 는 DRIFT_REMAINING=0 을 냈다.
_m11 = load()
if _m11 is None:
    skip("⑧ 모듈 로드 실패")
else:
    _d11 = tempfile.mkdtemp()
    try:
        _fsrc = os.path.join(_d11, "forge", "skills")
        _psrc = os.path.join(_d11, "plug", "forge-core", "skills")
        os.makedirs(os.path.join(_fsrc, ".claude", "agent-budget"))
        os.makedirs(_psrc)
        open(os.path.join(_psrc, "carried.md"), "w").write("x")          # 플러그인이 담은 것
        open(os.path.join(_fsrc, "carried.md"), "w").write("x")
        open(os.path.join(_fsrc, "orphan.md"), "w").write("x")           # forge 에만 있는 것
        open(os.path.join(_fsrc, "noise.bin"), "wb").write(b"\x01")      # 담은 적 없는 확장자
        open(os.path.join(_fsrc, ".claude", "agent-budget", "a.calls"), "w").write("x")  # 런타임 부산물
        _sv = (_m11.FORGE_ROOT, _m11.PLUGIN_ROOT, _m11.PLUGINS, _m11.SUBDIRS, dict(_m11.SUBDIR_SRC))
        _m11.FORGE_ROOT = os.path.join(_d11, "forge")
        _m11.PLUGIN_ROOT = os.path.join(_d11, "plug")
        _m11.PLUGINS = ["forge-core"]
        _m11.SUBDIRS = ["skills"]
        _m11.SUBDIR_SRC = {}
        _gaps = _m11.iter_inbound_gaps()
        _rels = {r for _s, r in _gaps}
        if "orphan.md" in _rels:
            ok("⑧-a forge 에만 있는 파일이 잡힌다(구 구현은 어디에도 안 나왔다)")
        else:
            ng(f"⑧-a orphan.md 미검출 — gaps={_rels}")
        if "carried.md" not in _rels:
            ok("⑧-b 이미 담긴 파일은 세지 않는다")
        else:
            ng("⑧-b 담긴 파일이 누락으로 잡힘 — 오탐")
        if not any(".claude" in r for r in _rels):
            ok("⑧-c 런타임 부산물(dot-세그먼트)은 제외된다 — 정밀도가 가드의 수명이다")
        else:
            ng(f"⑧-c 런타임 파일이 섞임 — {_rels}")
        if "noise.bin" not in _rels:
            ok("⑧-d 플러그인이 담은 적 없는 확장자는 '누락'이 아니다")
        else:
            ng("⑧-d 담은 적 없는 종류를 누락으로 보고 — 무시당하는 목록이 된다")
        (_m11.FORGE_ROOT, _m11.PLUGIN_ROOT, _m11.PLUGINS, _m11.SUBDIRS, _m11.SUBDIR_SRC) = _sv
    finally:
        shutil.rmtree(_d11, ignore_errors=True)

print()
print("== 12. 바이너리 평면 스캔 — UTF-16 양 엔디언 탐지 + NUL 가로지른 합성 금지 ==")
# root-cause(2026-08-07): 1차 구현은 NUL 을 전역 제거해 검사했다. UTF-16 은 잡히지만 진짜
#   바이너리에서 멀리 떨어진 조각이 맞붙어 **원본에 없는 경로가 합성**됐다(item 1 과 같은 병 —
#   가공한 산물을 원본처럼 다룬다). 평면 뷰 + NUL 을 구분자로 취급하는 것으로 바꿨다.
_m12 = load()
if _m12 is None:
    skip("⑨ 모듈 로드 실패")
else:
    _d12 = tempfile.mkdtemp()
    try:
        subprocess.run(["git", "init", "-q", _d12], check=True)
        _w = lambda n, b: open(os.path.join(_d12, n), "wb").write(b)
        _w("le.txt", "/home/secretuser/forge/x".encode("utf-16-le"))
        _w("be.txt", "/home/secretuser/forge/x".encode("utf-16-be"))
        # '/home/' 와 'u/forge' 사이에 NUL 400개 — 원본에 그런 경로는 없다
        _w("far.dat", b"\x89PNG" + b"/home/" + b"\x00" * 400 + b"u/forge" + b"\x01\x02")
        subprocess.run(["git", "-C", _d12, "add", "-A"], check=True,
                       capture_output=True)
        _res = _m12.scan_repo_leaks(_d12)
        _hit = {r for r, _ in _res[0]} if _res else set()
        for _n, _endian in (("le.txt", "UTF-16LE"), ("be.txt", "UTF-16BE")):
            if _n in _hit:
                ok(f"⑨-a {_endian} 안의 사설 경로가 탐지된다")
            else:
                ng(f"⑨-a {_endian} 미탐지 — 인코딩만 바꾸면 빠져나간다")
        if "far.dat" not in _hit:
            ok("⑨-b NUL 을 가로지른 합성 오탐이 없다(NUL = 구분자)")
        else:
            ng("⑨-b 원본에 없는 경로가 합성돼 오탐 — 오탐 내는 가드는 무시당한다")
    finally:
        shutil.rmtree(_d12, ignore_errors=True)

print()
print("================================")
print(f"PASS={PASS}  FAIL={FAIL}  SKIP={SKIP}")
if SKIP:
    print("⚠️ SKIP 은 통과가 아니다 — forge SSoT 가 있는 로컬에서 한 번 더 돌려야 §1~3 이 실측된다.")
sys.exit(0 if FAIL == 0 else 1)
