#!/usr/bin/env python3
"""Sync forge SSoT (~/forge/.claude) content into the forge-plugins marketplace repo.

Applies portability transforms (see b8fd94e):
  - literal `~/forge` -> `${FORGE_ROOT:-$HOME/forge}` (in shell-executable contexts)
  - literal `~/.claude` -> `$HOME/.claude` (portability for installed-plugin contexts)

Exclusions (do NOT transform):
  - lines containing a Windows drive letter table marker (e.g. "Z:", "E:/") — these are
    prose tables, not shell-executed paths (see b8fd94e final commit).
  - README.md / ONBOARDING.md style prose docs at plugin root (out of sync scope anyway).

Scope: only files that exist in BOTH forge SSoT and a plugin bundle subdir
(skills/commands/agents/rules). Never deletes plugin-only files. Never adds new files
(reports additions separately, does not create them).
"""
import argparse, os, re, sys, hashlib

_HOME = os.path.expanduser("~")
FORGE_ROOT = os.environ.get("FORGE_ROOT", os.path.join(_HOME, "forge")) + "/.claude"
PLUGIN_ROOT = os.environ.get(
    "PLUGIN_ROOT", os.path.join(_HOME, ".claude/plugins/marketplaces/forge-plugins")
)

PLUGINS = ["forge-core", "forge-build", "forge-knowledge", "forge-design", "forge-game"]

# ⚠️ hooks/ 는 의도적으로 여기 없다 — **플러그인 훅의 SSoT 는 이 repo 다**(forge SSoT 가 아님).
#   forge 에 훅을 만들고 여기로 전파되길 기대하면 영원히 안 온다.
#   실사고(2026-07-25 발견): 615ba01 이 플러그인 내용을 forge SSoT 에서 조립하도록 바꾸면서
#   forge 에 원본이 없는 forge-core/hooks/forge-onboard.sh 가 통째로 유실됐고, plugin.json 의
#   SessionStart 참조만 남아 설치 사용자가 매 세션 존재하지 않는 훅을 실행 시도했다.
#   회귀 감시: forge-core/hooks/forge-onboard.test.sh 가 매니페스트↔파일 실재를 검사한다.
SUBDIRS = ["skills", "commands", "agents", "rules"]

# 카테고리별 forge 소스 디렉터리 — 기본은 FORGE_ROOT(=~/forge/.claude) 하위 동명 폴더.
# ⚠️ rules 는 예외다: 2026-07-27 A1-5 리팩터로 `~/forge/.claude/rules/` 가
#   `~/forge/dev/global-rules/` 로 **이전**됐다. 그런데 이 스크립트는 계속 옛 경로를 봤고,
#   `os.path.isdir()` 이 False 라 `continue` 로 조용히 건너뛰었다 — 에러도 drift 리포트도
#   없이 rules 동기화가 0건으로 죽어 있었다(2026-08-02 전파 감사에서 발견, 6일간 방치).
#   플러그인 사용자는 그동안 룰 업데이트를 한 건도 받지 못했다.
# 폐기조건: forge 가 rules 를 다시 .claude/ 하위로 되돌리면 이 예외 매핑을 지운다.
SUBDIR_SRC = {
    "rules": os.path.join(os.environ.get("FORGE_ROOT", os.path.join(_HOME, "forge")),
                          "dev", "global-rules"),
}

RE_FORGE = re.compile(r'~/forge\b')
RE_CLAUDE = re.compile(r'~/\.claude\b')
DRIVE_MARK = re.compile(r'\b[A-Z]:[\\/~]')  # Windows drive-letter prose table lines

# ⚠️ 이 레포는 PUBLIC 이고 forge SSoT 는 PRIVATE 다. 아래 규칙이 없으면 비공개 환경의
#   절대경로·DB 식별자가 그대로 공개된다. 실사고(2026-08-06): `~/forge` 리터럴만 치환하던
#   탓에 `/home/<user>/forge/.claude/worktrees/...` 8곳이 PR #42 로 공개 배포됐다.
#   ↓ 순서 의존: 더 긴 경로(forge/.claude)를 먼저 치환해야 generic $HOME 규칙에 먹히지 않는다.
RE_HOME_FORGE = re.compile(r'/home/[^/\s]+/forge\b')
RE_HOME_CLAUDE = re.compile(r'/home/[^/\s]+/\.claude\b')
RE_HOME_ANY = re.compile(r'/home/[^/\s]+(?=/|\b)')
RE_NOTION_ID = re.compile(r'(notion\.so/)[0-9a-f]{32}\b')

# 잔여 누출 탐지 — 치환 후에도 남은 사설 절대경로. 여기 걸리면 **쓰지 않는다**(fail-closed).
#   제외 2종(오탐 내는 가드는 결국 무시당한다 — 정밀도가 곧 가드의 수명이다):
#   ① `/mnt/<drive>/*` 는 WSL 드라이브 판별 glob(`/mnt/e/* 또는 E:/* → windows`) — 경로가 아니라 패턴
#   ② `<user>` `${VAR}` `$USER` 같은 **플레이스홀더 세그먼트**는 이미 일반화된 표기다
#   ③ `/mnt/<d>/Program Files` · `/mnt/<d>/Windows` 는 **표준 윈도우 설치 경로**다(예: Unity Hub).
#      사설 정보가 아니고 문서로서 유용하다 — 이걸 막으면 가드가 정당한 문서를 죽인다.
_PLACEHOLDER = r'(?:<[^>/\s]+>|\$\{[^}/\s]+\}|\$[A-Z_]+)'
_WIN_SYSTEM = r'(?:Program(?:\\?[ ]|%20)Files(?:[ ]?\(x86\))?|Windows|ProgramData)'
RE_LEAK = re.compile(
    r'/home/(?!' + _PLACEHOLDER + r'/)[^/\s]+/'
    r'|/mnt/[a-z]/(?![*\s])(?!' + _PLACEHOLDER + r')(?!' + _WIN_SYSTEM + r'\b)[^\s`"\')]+'
)

def _load_redactions():
    """프로젝트 루트처럼 **문자열 자체가 사설**인 매핑은 이 공개 레포에 둘 수 없다.
    PRIVATE 인 forge 쪽 JSON({"literal": "replacement"})에서 읽는다. 부재 시 빈 맵 —
    누출은 RE_LEAK 가 fail-closed 로 잡으므로 조용히 새지 않는다."""
    path = os.environ.get("PLUGIN_REDACT_MAP",
                          os.path.join(FORGE_ROOT, "plugin-redact.json"))
    try:
        import json
        with open(path, encoding='utf-8') as f:
            m = json.load(f)
        return sorted(m.items(), key=lambda kv: -len(kv[0]))  # 긴 것 먼저
    except FileNotFoundError:
        return []
    except Exception as e:
        print(f"[sync-from-forge] WARN: redaction map 읽기 실패 {path}: {e}", file=sys.stderr)
        return []

REDACTIONS = _load_redactions()

def transform_line(line: str) -> str:
    for literal, replacement in REDACTIONS:
        line = line.replace(literal, replacement)
    line = RE_NOTION_ID.sub(r'\1${NOTION_DB_ID}', line)
    if DRIVE_MARK.search(line):
        return line  # preserve Windows drive-table prose untouched
    line = RE_FORGE.sub('${FORGE_ROOT:-$HOME/forge}', line)
    line = RE_CLAUDE.sub('$HOME/.claude', line)
    line = RE_HOME_FORGE.sub('${FORGE_ROOT:-$HOME/forge}', line)
    line = RE_HOME_CLAUDE.sub('$HOME/.claude', line)
    line = RE_HOME_ANY.sub('$HOME', line)
    return line

def transform_content(content: str) -> str:
    return ''.join(transform_line(l) for l in content.splitlines(keepends=True))

def find_leaks(content: str):
    """치환 후 남은 사설 절대경로를 (행번호, 매칭) 으로 돌려준다. 비어야 정상."""
    out = []
    for i, line in enumerate(content.splitlines(), 1):
        if DRIVE_MARK.search(line):
            continue
        for m in RE_LEAK.findall(line):
            out.append((i, m))
    return out

# ── G-3: 레포 전역 누출 스캔 ────────────────────────────────────────────────────
# 왜 별개 경로인가: 위 find_leaks 는 main() 의 sync 루프 안에서만 돌아 **SUBDIRS
#   (skills/commands/agents/rules)를 지나는 파일만** 본다. `mcp/`·`hooks/`·플러그인 루트
#   문서는 sync 를 타지 않으므로 가드가 아예 닿지 않았다 — 실제로
#   `forge-knowledge/mcp/forge-tools-server.py` 에 사설 경로 3곳이 남아 PR #46 에서야
#   별도로 회수됐다(harness-gaps/2026-08-06-plugin-sync-public-leak-harness-gaps.md §G-3).
#   이 스캔은 sync 경로와 **무관하게** 추적 파일 전량을 본다.
# 대상 = `git ls-files`(추적 파일)뿐이다. 공개되는 것이 곧 추적본이고, 미추적 산출물까지
#   세면 오탐이 늘어 가드가 무시당한다(§RE_LEAK 주석의 "정밀도가 곧 가드의 수명이다").
# 폐기조건: 누출 검사가 CI 외부 도구(gitleaks 등)로 이관되면 이 모드를 지운다.
SCAN_SELF_EXCLUDE = {
    # 이 두 파일은 **탐지 규칙 자체와 그 픽스처**를 소스로 담고 있어 구조적으로 자기 매칭한다
    # (`RE_HOME_FORGE = re.compile(r'/home/[^/\s]+/forge\b')` · 테스트의 `/home/u1/...`).
    # 제외하지 않으면 가드가 영구 FAIL 이라 아무도 안 쓰게 된다. 대신 이 둘은 **사설 정보를
    # 담을 이유가 없는 도구 파일**이라 위험이 낮다 — 실제 배포물(플러그인 번들)은 전부 검사된다.
    "scripts/sync-from-forge.py",
    "scripts/sync-from-forge.test.py",
}

def iter_tracked_files(repo_root: str):
    """추적 중인 파일의 레포 상대경로를 돌려준다. git 부재·비레포면 빈 목록(fail-open 아님 —
    호출부가 0건을 '스캔 못 함'으로 구분해 보고한다)."""
    import subprocess
    try:
        out = subprocess.run(["git", "-C", repo_root, "ls-files", "-z"],
                             capture_output=True, text=True, check=True).stdout
    except (OSError, subprocess.CalledProcessError):
        return None
    return [p for p in out.split("\0") if p]

def scan_repo_leaks(repo_root: str):
    """스캔 불가면 `None`, 아니면 `(found, unreadable)` 튜플.

    - `found`     = [(rel, leaks)] — 누출이 발견된 파일
    - `unreadable`= [(rel, 사유)]  — **검사하지 못한** 파일(바이너리·디코드 실패·읽기 오류)

    ⚠️ `unreadable` 을 따로 돌려주는 이유(2026-08-07 cr-final MED): 이전 판은 이 파일들을
      `except: continue` 로 **건수도 신호도 없이** 삼켰다. 그러면 "검사했는데 깨끗함"과
      "검사하지 못했음"이 출력에서 구분되지 않는다 — 이 스캐너가 `None`(스캔 실패) 과
      `[]`(0건) 을 굳이 구분해 놓고 파일 단위에서는 그 엄밀함을 스스로 깨고 있었다.
      비-UTF-8 로 저장된 텍스트 파일에 사설 경로가 있으면 조용히 통과했다.
    """
    rels = iter_tracked_files(repo_root)
    if rels is None:
        return None
    found, unreadable = [], []
    for rel in rels:
        if rel in SCAN_SELF_EXCLUDE:
            continue
        p = os.path.join(repo_root, rel)
        if not os.path.isfile(p):
            continue
        try:
            with open(p, encoding='utf-8') as f:
                content = f.read()
        except UnicodeDecodeError:
            # 바이너리이거나 비-UTF-8 텍스트. 전자는 정상, 후자는 사각지대 — 구분이 안 되므로
            # 통과시키되 **보이게** 남긴다(침묵 스킵 금지).
            unreadable.append((rel, "non-utf8"))
            continue
        except OSError as e:
            unreadable.append((rel, f"oserror:{e.__class__.__name__}"))
            continue
        leaks = find_leaks(content)
        if leaks:
            found.append((rel, leaks))
    return found, unreadable

def sha(s: str) -> str:
    return hashlib.sha256(s.encode('utf-8', errors='replace')).hexdigest()[:12]

def iter_pairs():
    """Yield (plugin, subdir, relpath, forge_abs, plugin_abs) for files present in BOTH."""
    for plugin in PLUGINS:
        for sub in SUBDIRS:
            plug_dir = os.path.join(PLUGIN_ROOT, plugin, sub)
            forge_dir = SUBDIR_SRC.get(sub, os.path.join(FORGE_ROOT, sub))
            if not os.path.isdir(plug_dir):
                continue
            if not os.path.isdir(forge_dir):
                # 소스 디렉터리 부재를 조용히 넘기면 카테고리 전체가 침묵 스킵된다
                # (2026-07-27~08-02 rules 6일 사망의 정확한 원인). 반드시 보이게 한다.
                print(f"[sync-from-forge] WARN: forge 소스 없음 — {sub}: {forge_dir} "
                      f"(이 카테고리는 동기화되지 않는다)", file=sys.stderr)
                continue
            for root, _, files in os.walk(plug_dir):
                for fn in files:
                    plug_abs = os.path.join(root, fn)
                    rel = os.path.relpath(plug_abs, plug_dir)
                    forge_abs = os.path.join(forge_dir, rel)
                    yield plugin, sub, rel, forge_abs, plug_abs

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--dry-run', action='store_true')
    ap.add_argument('--verify', action='store_true', help='report remaining drift, no writes')
    ap.add_argument('--scan-repo', metavar='ROOT', nargs='?', const=PLUGIN_ROOT,
                    help='G-3: sync 경로와 무관하게 추적 파일 전량에서 사설 절대경로를 찾는다 '
                         '(기본 ROOT=PLUGIN_ROOT). 발견 시 exit 1, 쓰기 없음.')
    args = ap.parse_args()

    # --scan-repo 는 sync 를 돌리지 않는 독립 모드다 — 쓰기가 없으므로 CI/pre-commit 에서 안전하다.
    if args.scan_repo:
        # 조용히 무시하면 "dry-run 으로 스캔했다"는 오해를 남긴다(cr-final LOW).
        for ignored in ('dry_run', 'verify'):
            if getattr(args, ignored, False):
                print(f"[sync-from-forge] WARN: --scan-repo 모드에서는 --{ignored.replace('_','-')} "
                      f"가 의미 없다(sync 를 돌리지 않는다). 무시하고 스캔만 수행한다.", file=sys.stderr)
        root = os.path.abspath(args.scan_repo)
        result = scan_repo_leaks(root)
        if result is None:
            # 스캔 실패를 0건과 같게 보고하면 "검사했는데 깨끗함"으로 오독된다 — 구분해서 실패시킨다.
            print(f"SCAN_STATUS=error — git ls-files 실패({root}). 검사되지 않았다.", file=sys.stderr)
            return 2
        found, unreadable = result
        # UNREADABLE 을 항상 찍는다(0 이어도). 침묵하면 "0 건"과 "안 봤음"이 구분되지 않는다.
        print(f"SCAN_STATUS=ok  SCAN_ROOT={root}  LEAK_FILES={len(found)}  "
              f"UNREADABLE={len(unreadable)}", file=sys.stderr)
        for rel, leaks in found:
            print(f"  LEAK: {rel} ({len(leaks)}건)", file=sys.stderr)
            for ln, frag in leaks[:3]:
                print(f"        L{ln}: {frag}", file=sys.stderr)
        for rel, why in unreadable[:10]:
            print(f"  UNREADABLE: {rel} ({why}) — 검사하지 못했다(통과 아님)", file=sys.stderr)
        if len(unreadable) > 10:
            print(f"  UNREADABLE: … 외 {len(unreadable) - 10}건", file=sys.stderr)
        if found:
            print("  → PUBLIC 레포다. forge SSoT 를 고치거나 PLUGIN_REDACT_MAP 에 매핑을 추가하라.",
                  file=sys.stderr)
            return 1
        return 0

    changed = {}
    missing_in_forge = []  # plugin-only files (present in plugin, absent in forge) -> untouched
    drift_remaining = []
    leaked = []  # 치환 후에도 사설 절대경로가 남은 파일 — 쓰지 않고 보고한다

    for plugin, sub, rel, forge_abs, plug_abs in iter_pairs():
        if not os.path.isfile(forge_abs):
            missing_in_forge.append(f"{plugin}/{sub}/{rel}")
            continue
        try:
            with open(forge_abs, 'r', encoding='utf-8') as f:
                forge_content = f.read()
        except UnicodeDecodeError:
            # binary file (e.g. .skill zip, .png) — no text transform applies, byte-compare/copy
            with open(forge_abs, 'rb') as f:
                forge_bytes = f.read()
            with open(plug_abs, 'rb') as f:
                plug_bytes = f.read()
            if forge_bytes != plug_bytes:
                changed.setdefault(plugin, []).append(f"{sub}/{rel} [binary]")
                if args.verify:
                    drift_remaining.append(f"{plugin}/{sub}/{rel}")
                elif not args.dry_run:
                    with open(plug_abs, 'wb') as f:
                        f.write(forge_bytes)
            continue
        with open(plug_abs, 'r', encoding='utf-8', errors='replace') as f:
            plug_content = f.read()

        target_content = transform_content(forge_content)

        # PUBLIC 레포로 사설 절대경로가 나가는 것을 **쓰기 직전에** 막는다.
        # 경고만 내면 사람이 놓친다 — 실제로 PR #42 가 그렇게 나갔다. 그래서 skip 이다.
        leaks = find_leaks(target_content)
        if leaks:
            leaked.append((f"{plugin}/{sub}/{rel}", leaks[:3], len(leaks)))
            continue

        if target_content != plug_content:
            changed.setdefault(plugin, []).append(f"{sub}/{rel}")
            if args.verify:
                drift_remaining.append(f"{plugin}/{sub}/{rel}")
            elif not args.dry_run:
                with open(plug_abs, 'w', encoding='utf-8') as f:
                    f.write(target_content)

    # 누출은 drift 와 별개로 **항상 먼저** 보고한다 — 조용한 skip 은 "동기화 완료"로 오독된다.
    if leaked:
        print(f"LEAK_BLOCKED={len(leaked)}", file=sys.stderr)
        for path, samples, n in leaked:
            print(f"  LEAK: {path} ({n}건) — 치환 후에도 사설 절대경로 잔존", file=sys.stderr)
            for ln, frag in samples:
                print(f"        L{ln}: {frag}", file=sys.stderr)
        print("  → 이 파일들은 쓰지 않았다. forge SSoT 를 고치거나 "
              "PLUGIN_REDACT_MAP 에 매핑을 추가하라.", file=sys.stderr)
    else:
        print("LEAK_BLOCKED=0", file=sys.stderr)

    if args.verify:
        print(f"DRIFT_REMAINING={len(drift_remaining)}")
        for d in drift_remaining:
            print(f"  DRIFT: {d}")
        return 0 if not (drift_remaining or leaked) else 1

    total = sum(len(v) for v in changed.values())
    mode = "DRY-RUN" if args.dry_run else "APPLIED"
    print(f"[{mode}] total files changed: {total}")
    for plugin, files in changed.items():
        print(f"  {plugin}: {len(files)} files")
        for f in files:
            print(f"    - {f}")

    print(f"\nplugin-only files (untouched, forge has none): {len(missing_in_forge)}")
    for f in missing_in_forge:
        print(f"    ~ {f}")

    # exit code 로도 드러낸다 — 파이프라인이 stderr 를 안 읽어도 실패가 전달돼야 한다.
    return 1 if leaked else 0

if __name__ == '__main__':
    sys.exit(main())
