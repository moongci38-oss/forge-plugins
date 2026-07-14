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
SUBDIRS = ["skills", "commands", "agents", "rules"]

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
            forge_dir = os.path.join(FORGE_ROOT, sub)
            if not os.path.isdir(plug_dir) or not os.path.isdir(forge_dir):
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
