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
_MARKETPLACE_CLONE = os.path.join(_HOME, ".claude/plugins/marketplaces/forge-plugins")


def default_plugin_root():
    """PLUGIN_ROOT 기본값 — 이 스크립트를 담은 레포가 곧 기본 대상이다.

    root-cause (G-4, 2026-08-06): 구 기본값은 마켓플레이스 **클론**
      (~/.claude/plugins/marketplaces/forge-plugins) 이라, 레포 디렉터리에서
      `python3 scripts/sync-from-forge.py` 를 실행해도 **눈앞의 레포가 아니라 클론이 바뀌었다.**
      "지금 있는 곳에 작용한다"는 최소놀람 원칙을 기본값이 정면으로 뒤집은 것이다.
      더 나쁜 건 조용하다는 점이다 — 클론이 바뀌어도 레포는 clean 이라 아무 신호가 없다.
    → 스크립트가 플러그인 레포 안에 있으면(마켓플레이스 매니페스트로 식별) 그 레포를 기본값으로,
      아니면 종전 클론 경로를 유지한다(설치 사용자 경로 불변 — 기존 동작 회귀 없음).
    재현: cd <repo> && python3 scripts/sync-from-forge.py --verify
          구 동작 = 클론을 검사 / 신 동작 = 이 레포를 검사
    폐기조건: 마켓플레이스 배포가 레포 직접 참조로 바뀌어 클론 경로가 사라지면 분기를 지운다.
    """
    env = os.environ.get("PLUGIN_ROOT")
    if env:
        return env
    here = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    if os.path.isfile(os.path.join(here, ".claude-plugin", "marketplace.json")):
        return here
    return _MARKETPLACE_CLONE


PLUGIN_ROOT = default_plugin_root()

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

# ⚠️ G3 (2026-08-20): 종전에는 이 마커가 **줄에 하나라도 있으면 그 줄 전체**를 치환·유출검사에서
#   면제했다. 그래서 같은 줄에 진짜 사설 경로가 섞여 있으면 **둘 다 통과**했다 —
#   즉 `LEAK_BLOCKED=0` 이 "유출 없음"을 보증하지 못했다.
#   **한 칸을 비켜 가려다 그 줄 전체를 눈감은 셈**이다.
#   실측(수정 전):
#     transform_line('linux /home/exampleuser/forge/private and windows C:/Program Files/Git/x')
#       → 원문 그대로(치환 없음) · find_leaks(같은 문자열) → []   ← 유출 0건으로 보고
#     같은 문자열에서 `C:/…` 만 빼면 → 정상 치환되고 [(1, '/home/exampleuser/')] 로 탐지된다.
#   조치: 면제 단위를 **줄 → 드라이브 경로 토큰**으로 좁힌다. 그 토큰만 자리표시자로 빼두고
#   나머지는 평소대로 처리한 뒤 되돌린다. 보호하려던 것(윈도우 표기 원형 유지)은 그대로 지켜진다.
#   ⚠️ 여전히 못 잡는 입력: 사설 경로가 드라이브 토큰 **안에** 들어 있는 형태
#     (예: `C:/home/someuser/...`). 그건 윈도우 경로 자체라 원형 보존이 옳다고 본다.
DRIVE_PATH = re.compile(r'\b[A-Z]:[\\/~][^\s`"\')\]\x00]*')
_DRIVE_SLOT = '\x00DRV%d\x00'


def _shield_drives(line: str):
    """윈도우 드라이브 경로 토큰만 자리표시자로 빼둔다. (가려진 줄, 원본조각들) 반환."""
    spans = []

    def _stash(m):
        spans.append(m.group(0))
        return _DRIVE_SLOT % (len(spans) - 1)

    return DRIVE_PATH.sub(_stash, line), spans


def _unshield(line: str, spans) -> str:
    for i, frag in enumerate(spans):
        line = line.replace(_DRIVE_SLOT % i, frag)
    return line

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
# NUL(\x00)을 **구분자로** 취급한다 — 문자 클래스에 들어가면 안 된다.
#   root-cause (2026-08-07): 바이너리 스캔에서 `[^/\s]+` 가 NUL 을 삼키는 바람에
#   `/home/` 과 `/forge` 가 수백 바이트의 NUL 을 사이에 두고 떨어져 있어도 한 매칭으로 이어져
#   **원본에 없는 경로가 합성**됐다. 텍스트 경로에는 NUL 이 없으므로 이 추가는 기존 동작 불변이고,
#   바이너리 평면 스캔에서만 오탐을 없앤다.
RE_LEAK = re.compile(
    r'/home/(?!' + _PLACEHOLDER + r'/)[^/\s\x00]+/'
    r'|/mnt/[a-z]/(?![*\s])(?!' + _PLACEHOLDER + r')(?!' + _WIN_SYSTEM + r'\b)[^\s`"\')\x00]+'
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
    # 윈도우 드라이브 경로 **토큰만** 보호한다(줄 전체 면제 금지 — 위 G3 주석 참조).
    line, _drv = _shield_drives(line)
    line = RE_FORGE.sub('${FORGE_ROOT:-$HOME/forge}', line)
    line = RE_CLAUDE.sub('$HOME/.claude', line)
    line = RE_HOME_FORGE.sub('${FORGE_ROOT:-$HOME/forge}', line)
    line = RE_HOME_CLAUDE.sub('$HOME/.claude', line)
    line = RE_HOME_ANY.sub('$HOME', line)
    return _unshield(line, _drv)

def transform_content(content: str) -> str:
    return ''.join(transform_line(l) for l in content.splitlines(keepends=True))

def find_leaks(content: str):
    """치환 후 남은 사설 절대경로를 (행번호, 매칭) 으로 돌려준다. 비어야 정상."""
    out = []
    for i, line in enumerate(content.splitlines(), 1):
        # 드라이브 토큰만 가리고 **나머지는 검사한다**(줄 통째 건너뛰기 금지 — G3).
        masked, _ = _shield_drives(line)
        for m in RE_LEAK.findall(masked):
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
    """스캔 불가면 `None`, 아니면 `(found, skipped)` 튜플.

    - `found`   = [(rel, leaks)] — 누출이 발견된 파일 (exit 1)
    - `skipped` = [(rel, kind)]  — **분류 채널**이지 "검사 안 함"이 아니다. `kind` 는
                  `"binary"`  = NUL 포함. **검사는 한다**(아래 평면 스캔). 여기 담기는 것은
                                "검사 결과가 exit code 를 올리지 않는다"는 뜻뿐이다
                                (zip 하나로 가드가 상시 FAIL 되는 것을 막기 위함).
                                단, 이 파일에서 누출이 나오면 `found` 로 가서 exit 1 이다.
                  `"oserror:*"` = 읽기 실패. 이건 진짜로 **검사하지 못한** 것이고 exit 1 이다.

    ⚠️ 이름이 `skipped` 라 "건너뛰었다"로 읽히지만 `binary` 는 건너뛰지 않는다(2026-08-07 정정).
      1차 docstring 은 `binary` 를 "검사하지 못한 파일 / 설계상 정상"이라 적었는데, 그 문장이
      쓰인 뒤 구현이 "검사하되 exit code 만 안 올림"으로 바뀌었고 문서만 옛 계약에 남았다.
      계약을 읽고 소비하는 쪽이 "바이너리는 미검사"로 오해하면, 실제로는 검사돼 exit 1 을
      낼 수 있는 경로를 예상하지 못한다.

    ⚠️ 비-UTF-8 **텍스트**는 스킵하지 않는다(2026-08-07 cr-final HIGH). 1차판은
      `UnicodeDecodeError` 를 통째로 스킵하고 exit 0 을 냈다 — 출력은 "검사하지 못했다
      (통과 아님)" 이라 말하는데 **종료코드는 통과**여서 문구와 계약이 어긋났고, cp949 등으로
      저장된 텍스트에 사설 경로가 있어도 CI 가 그린으로 지나갔다. 이 PR 이 닫으려던
      '침묵 스킵' 갭이 exit code 계층에 그대로 남아 있었던 것이다.
      → NUL 유무로 **바이너리와 비-UTF-8 텍스트를 가르고**, 후자는 latin-1 로 복호해
        그대로 검사한다(사설 경로는 ASCII 라 latin-1 왕복에서 보존된다).
      → 진짜 바이너리만 `binary` 로 남기고, 그건 exit code 를 올리지 않는다
        (그렇지 않으면 zip 하나 때문에 가드가 상시 FAIL 이 돼 아무도 안 쓴다).
    """
    rels = iter_tracked_files(repo_root)
    if rels is None:
        return None
    found, skipped = [], []
    for rel in rels:
        if rel in SCAN_SELF_EXCLUDE:
            continue
        p = os.path.join(repo_root, rel)
        if not os.path.isfile(p):
            continue
        try:
            with open(p, 'rb') as f:
                raw = f.read()
        except OSError as e:
            # 추적 파일을 읽지도 못했다 = "깨끗함"이라고 말할 근거가 없다 → 호출부가 실패시킨다.
            skipped.append((rel, f"oserror:{e.__class__.__name__}"))
            continue
        is_binary = b'\x00' in raw
        if is_binary:
            # ⚠️ NUL 유무만으로 "바이너리 = 검사 불필요"라고 끊으면 **UTF-16/UTF-32 텍스트가
            #   통째로 빠진다**(2026-08-07 cr-final HIGH, opus·codex 독립 적중).
            #   UTF-16LE 의 `/home` 은 `/\x00h\x00o\x00m\x00e\x00` 라 ASCII 사이에 NUL 이 끼고,
            #   latin-1 복호로도 `/home/` 정규식에 걸리지 않는다 — 즉 이 PR 이 닫으려던
            #   '비-UTF-8 텍스트 침묵 스킵' 갭이 **인코딩만 바꿔 그대로 재현**된다.
            # → 인코딩을 알아맞히려 들지 않는다(BOM 없는 UTF-16 판별은 휴리스틱의 연속이다).
            #   분류는 `binary` 로 남겨 종료코드를 올리지 않되(zip 하나로 상시 FAIL 방지),
            #   **검사는 건너뛰지 않는다** — 스킵과 통과를 구분하는 것이 이 계열의 전부다.
            #
            # 2026-08-07 정정: 1차 구현은 `raw.replace(b'\x00', b'')` 로 **NUL 을 전역 제거**했다.
            #   UTF-16 은 잡히지만, 진짜 바이너리에서는 NUL 로 갈라져 있던 **멀리 떨어진 바이트들이
            #   맞붙어 원본에 없던 문자열이 합성된다** — 없는 경로를 만들어 오탐을 내는 구조다.
            #   (item 1 계열과 같은 병: 검사 대상을 가공해 만든 산물을 원본처럼 다룬다.)
            # → 가공 대신 **세 개의 뷰**를 각각 본다:
            #     ① raw            — 진짜 바이너리에 박힌 ASCII 문자열(`strings` 원리)
            #     ② raw[0::2]      — 짝수 바이트 평면 = UTF-16LE 의 ASCII 구간
            #     ③ raw[1::2]      — 홀수 바이트 평면 = UTF-16BE 의 ASCII 구간
            #   UTF-16 문자열이 짝수/홀수 어느 오프셋에서 시작하든 ②나 ③ 중 하나에 온전히 남는다.
            #
            # ⚠️ 2026-08-08 정정(cr-final codex): 초판 주석은 "어느 뷰도 원본에 없던 인접성을
            #   만들지 않는다"고 적었으나 **거짓이다.** ②③ 은 한 바이트 걸러 버리므로 원본에서
            #   인접하지 않던 바이트를 맞붙인다 — 그 점에서는 NUL 전역 제거와 같은 종류다.
            #   합성 오탐을 실제로 막는 것은 이 평면 분리가 아니라 **RE_LEAK 에서 NUL 을
            #   구분자로 뺀 것**이다(§RE_LEAK 주석). 둘은 쌍으로만 성립한다 — 한쪽만으로는
            #   UTF-16 을 놓치거나(구분자만) 오탐을 낳는다(평면만).
            skipped.append((rel, "binary"))
            content = '\n'.join((
                raw.decode('latin-1'),
                raw[0::2].decode('latin-1'),
                raw[1::2].decode('latin-1'),
            ))
        else:
            try:
                content = raw.decode('utf-8')
            except UnicodeDecodeError:
                # 비-UTF-8 단일바이트 텍스트(cp949/euc-kr/latin-1 …). latin-1 은 어떤 바이트열도
                # 실패하지 않고 ASCII 구간을 그대로 보존하므로 경로 패턴 탐지에 충분하다.
                content = raw.decode('latin-1')
        leaks = find_leaks(content)
        if leaks:
            found.append((rel, leaks))
    return found, skipped

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

# ── G-1: inbound(안 오는 것) 가시화 ────────────────────────────────────────────
# root-cause (2026-08-06): iter_pairs() 는 **플러그인 디렉터리를 walk** 하므로 정의상
#   "양쪽에 다 있는 파일"만 본다. 그래서 forge SSoT 에 새 스킬이 생겨도 플러그인에 없으면
#   drift 로도, plugin-only 로도, 어디에도 나타나지 않는다 — `--verify` 는 태연히
#   `DRIFT_REMAINING=0` 을 낸다. 그 0 이 "완전 동기화"로 읽히는 것이 갭의 전부다.
#   실측(2026-08-06): SSoT 스킬 98 vs 플러그인 등재 45.
#   "새는 것"(누출)은 막았지만 "안 오는 것"(누락)은 그대로였다.
# 자동 추가는 하지 않는다 — 어느 플러그인이 무엇을 담을지는 사람 판단이고, 전량 복사는
#   PUBLIC 레포에 사설 자료를 밀어 넣는 정반대 사고를 만든다. 대신 **분모를 보이게** 한다.
# 폐기조건: 플러그인별 "담아야 할 목록" 매니페스트가 생기면 후보가 아니라 정확한 누락을 낼 수 있다.
def _has_hidden_segment(rel):
    """경로에 dot-세그먼트가 있으면 런타임 부산물로 본다(예: agents/.claude/agent-budget/*.calls)."""
    return any(p.startswith('.') for p in rel.split(os.sep) if p)


def iter_inbound_gaps():
    """forge SSoT 에 있으나 **어느 플러그인도 담고 있지 않은** 파일 → [(sub, rel)] 정렬 목록.

    ⚠️ 정밀도가 곧 가드의 수명이다(§RE_LEAK 주석과 같은 이유). 1차 구현은 필터 없이 128건을
      냈고 상위가 전부 `agents/.claude/agent-budget/*.calls` 같은 **런타임 부산물**이었다 —
      그런 목록은 한 번 보고 무시당하며, 무시당하는 순간 갭은 안 고쳐진 것과 같다.
    → 두 가지로 좁힌다. 둘 다 **하드코딩 목록이 아니라 관측에서 유도**한다:
        ① dot-세그먼트 경로 제외(런타임/캐시 디렉터리)
        ② 확장자는 **그 카테고리에서 플러그인이 실제로 담고 있는 확장자**만 — 담은 적 없는
           종류를 "누락"이라 부르지 않는다. 새 종류가 필요해지면 하나만 담기면 그때부터 보인다.
    """
    gaps, out_of_scope = [], []
    for sub in SUBDIRS:
        forge_dir = SUBDIR_SRC.get(sub, os.path.join(FORGE_ROOT, sub))
        if not os.path.isdir(forge_dir):
            continue  # 부재는 iter_pairs() 가 이미 WARN 으로 보고한다(중복 경고 금지)
        carried, carried_ext = set(), set()
        for plugin in PLUGINS:
            plug_dir = os.path.join(PLUGIN_ROOT, plugin, sub)
            if not os.path.isdir(plug_dir):
                continue
            for root, _, files in os.walk(plug_dir):
                for fn in files:
                    rel = os.path.relpath(os.path.join(root, fn), plug_dir)
                    carried.add(rel)
                    carried_ext.add(os.path.splitext(fn)[1].lower())
        if not carried_ext:
            continue  # 이 카테고리를 담는 플러그인이 없다 = 비교 기준이 없다
        for root, _, files in os.walk(forge_dir):
            for fn in files:
                rel = os.path.relpath(os.path.join(root, fn), forge_dir)
                if rel in carried or _has_hidden_segment(rel):
                    continue
                if os.path.splitext(fn)[1].lower() not in carried_ext:
                    # ⚠️ 2026-08-08(cr-final opus): 여기서 그냥 continue 하면 확장자 없는 파일이나
                    #   플러그인이 아직 한 번도 담지 않은 종류가 **영원히 안 보인다** — 이 기능이
                    #   고치려던 "0 이 완전성으로 읽힌다"를 다른 파일 모양으로 재현하는 셈이다.
                    #   후보로 올리지는 않되(정밀도 유지) **몇 건이 그 이유로 빠졌는지는 센다.**
                    out_of_scope.append((sub, rel))
                    continue
                gaps.append((sub, rel))
    return sorted(gaps), sorted(out_of_scope)


def report_inbound(limit=10):
    """INBOUND_NOT_CARRIED 를 **항상** 찍는다(0 이어도). 침묵하면 DRIFT_REMAINING=0 이
    '전부 최신'으로 읽힌다 — 이 줄이 그 오독을 막는 유일한 장치다."""
    gaps, out_of_scope = iter_inbound_gaps()
    print(f"INBOUND_NOT_CARRIED={len(gaps)}", file=sys.stderr)
    # 필터로 제외된 수를 함께 낸다 — 침묵 제외는 "그런 파일은 없다"로 오독된다.
    print(f"INBOUND_FILTERED={len(out_of_scope)}  (확장자 미보유·dot-세그먼트로 후보에서 제외)",
          file=sys.stderr)
    if gaps:
        print("  ↳ forge SSoT 에 있으나 어느 플러그인도 담고 있지 않다. DRIFT 수치에 포함되지 "
              "않으므로 DRIFT_REMAINING=0 이 '완전 동기화'를 뜻하지 않는다.", file=sys.stderr)
        shown = gaps if limit is None else gaps[:limit]
        for sub, rel in shown:
            print(f"  NOT_CARRIED: {sub}/{rel}", file=sys.stderr)
        if len(gaps) > len(shown):
            # 상한을 두되 **잘린 양을 말한다** — 침묵 절단 금지(2026-08-07 audit 계열과 동일 규약).
            print(f"  NOT_CARRIED: … 외 {len(gaps) - len(shown)}건 (전량은 --inbound-all)",
                  file=sys.stderr)
    return gaps


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--dry-run', action='store_true')
    ap.add_argument('--verify', action='store_true', help='report remaining drift, no writes')
    ap.add_argument('--inbound-all', action='store_true',
                    help='G-1: INBOUND_NOT_CARRIED 목록을 상한 없이 전량 출력한다')
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
        found, skipped = result
        binary = [(r, k) for r, k in skipped if k == "binary"]
        unreadable = [(r, k) for r, k in skipped if k != "binary"]
        # 세 카운터를 **항상** 찍는다(0 이어도). 침묵하면 "0 건"과 "안 봤음"이 구분되지 않는다.
        print(f"SCAN_STATUS=ok  SCAN_ROOT={root}  LEAK_FILES={len(found)}  "
              f"BINARY={len(binary)}  UNREADABLE={len(unreadable)}", file=sys.stderr)
        for rel, leaks in found:
            print(f"  LEAK: {rel} ({len(leaks)}건)", file=sys.stderr)
            for ln, frag in leaks[:3]:
                print(f"        L{ln}: {frag}", file=sys.stderr)
        for rel, _ in binary[:10]:
            print(f"  BINARY: {rel} — NUL 제거 후 검사함(압축/암호화된 내부는 여전히 미스캔)",
                  file=sys.stderr)
        if len(binary) > 10:
            print(f"  BINARY: … 외 {len(binary) - 10}건", file=sys.stderr)
        for rel, why in unreadable[:10]:
            print(f"  UNREADABLE: {rel} ({why}) — 검사하지 못했다(통과 아님)", file=sys.stderr)
        if len(unreadable) > 10:
            print(f"  UNREADABLE: … 외 {len(unreadable) - 10}건", file=sys.stderr)
        if found:
            print("  → PUBLIC 레포다. forge SSoT 를 고치거나 PLUGIN_REDACT_MAP 에 매핑을 추가하라.",
                  file=sys.stderr)
            return 1
        if unreadable:
            # 출력이 "통과 아님"이라고 말했으면 **종료코드도 통과가 아니어야 한다**
            # (2026-08-07 cr-final HIGH: 문구와 계약이 어긋나 CI 가 그린으로 지나갔다).
            print("  → 추적 파일을 읽지 못했다. '깨끗함'이라고 말할 근거가 없으므로 실패로 낸다.",
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
        # G-1: DRIFT 는 '양쪽에 다 있는 파일'만 센다. 분모를 함께 내지 않으면 0 이 완전성으로 읽힌다.
        report_inbound(limit=None if args.inbound_all else 10)
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

    # 위 목록은 "플러그인에만 있는 것"이다. 그 대칭인 "forge 에만 있는 것"이 없으면
    # 사람은 한쪽 방향만 보고 동기화가 끝났다고 판단한다(G-1).
    report_inbound(limit=None if args.inbound_all else 10)

    # exit code 로도 드러낸다 — 파이프라인이 stderr 를 안 읽어도 실패가 전달돼야 한다.
    return 1 if leaked else 0

if __name__ == '__main__':
    sys.exit(main())
