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

def transform_line(line: str) -> str:
    if DRIVE_MARK.search(line):
        return line  # preserve Windows drive-table prose untouched
    line = RE_FORGE.sub('${FORGE_ROOT:-$HOME/forge}', line)
    line = RE_CLAUDE.sub('$HOME/.claude', line)
    return line

def transform_content(content: str) -> str:
    return ''.join(transform_line(l) for l in content.splitlines(keepends=True))

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
    args = ap.parse_args()

    changed = {}
    missing_in_forge = []  # plugin-only files (present in plugin, absent in forge) -> untouched
    drift_remaining = []

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

        if target_content != plug_content:
            changed.setdefault(plugin, []).append(f"{sub}/{rel}")
            if args.verify:
                drift_remaining.append(f"{plugin}/{sub}/{rel}")
            elif not args.dry_run:
                with open(plug_abs, 'w', encoding='utf-8') as f:
                    f.write(target_content)

    if args.verify:
        print(f"DRIFT_REMAINING={len(drift_remaining)}")
        for d in drift_remaining:
            print(f"  DRIFT: {d}")
        return 0 if not drift_remaining else 1

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

    return 0

if __name__ == '__main__':
    sys.exit(main())
