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


def load():
    spec = importlib.util.spec_from_file_location("sff", TARGET)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


print("== 1. 모든 카테고리의 forge 소스 디렉터리가 실재한다 ==")
mod = load()
for sub in mod.SUBDIRS:
    src = mod.SUBDIR_SRC.get(sub, os.path.join(mod.FORGE_ROOT, sub))
    if os.path.isdir(src):
        ok(f"{sub} → {src}")
    else:
        ng(f"{sub} 소스 부재 → {src}",
           "이 카테고리는 조용히 스킵된다(2026-07-27 rules 사고와 동일)")

print()
print("== 2. rules 카테고리가 실제로 대응 파일을 찾는다(0건 = 죽은 것) ==")
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
print("================================")
print(f"PASS={PASS}  FAIL={FAIL}")
sys.exit(0 if FAIL == 0 else 1)
