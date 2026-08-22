#!/usr/bin/env python3
"""
Quick validation script for skills - minimal version
"""

import sys
import os
import re
import yaml
from pathlib import Path

def validate_skill(skill_path):
    """Basic validation of a skill"""
    skill_path = Path(skill_path)

    # Check SKILL.md exists
    skill_md = skill_path / 'SKILL.md'
    if not skill_md.exists():
        return False, "SKILL.md not found"

    # Read and validate frontmatter
    content = skill_md.read_text()
    if not content.startswith('---'):
        return False, "No YAML frontmatter found"

    # Extract frontmatter
    match = re.match(r'^---\n(.*?)\n---', content, re.DOTALL)
    if not match:
        return False, "Invalid frontmatter format"

    frontmatter_text = match.group(1)

    # Parse YAML frontmatter
    try:
        frontmatter = yaml.safe_load(frontmatter_text)
        if not isinstance(frontmatter, dict):
            return False, "Frontmatter must be a YAML dictionary"
    except yaml.YAMLError as e:
        return False, f"Invalid YAML in frontmatter: {e}"

    # Define allowed properties
    # skill-creator/SKILL.md 공식 frontmatter 필드 목록과 동기화(2026-08-03)
    ALLOWED_PROPERTIES = {
        'name', 'description', 'model', 'context', 'disable-model-invocation',
        'user-invocable', 'when_to_use', 'argument-hint', 'arguments',
        'allowed-tools', 'disallowed-tools', 'effort', 'agent', 'hooks',
        'paths', 'shell', 'license', 'metadata',
    }

    # Check for unexpected properties (excluding nested keys under metadata)
    unexpected_keys = set(frontmatter.keys()) - ALLOWED_PROPERTIES
    if unexpected_keys:
        return False, (
            f"Unexpected key(s) in SKILL.md frontmatter: {', '.join(sorted(unexpected_keys))}. "
            f"Allowed properties are: {', '.join(sorted(ALLOWED_PROPERTIES))}"
        )

    # Check required fields
    if 'name' not in frontmatter:
        return False, "Missing 'name' in frontmatter"
    if 'description' not in frontmatter:
        return False, "Missing 'description' in frontmatter"

    # Extract name for validation
    name = frontmatter.get('name', '')
    if not isinstance(name, str):
        return False, f"Name must be a string, got {type(name).__name__}"
    name = name.strip()
    if name:
        # Check naming convention (hyphen-case: lowercase with hyphens)
        if not re.match(r'^[a-z0-9-]+$', name):
            return False, f"Name '{name}' should be hyphen-case (lowercase letters, digits, and hyphens only)"
        if name.startswith('-') or name.endswith('-') or '--' in name:
            return False, f"Name '{name}' cannot start/end with hyphen or contain consecutive hyphens"
        # Check name length (max 64 characters per spec)
        if len(name) > 64:
            return False, f"Name is too long ({len(name)} characters). Maximum is 64 characters."

    # Extract and validate description
    description = frontmatter.get('description', '')
    if not isinstance(description, str):
        return False, f"Description must be a string, got {type(description).__name__}"
    description = description.strip()
    if description:
        # Check for angle brackets
        if '<' in description or '>' in description:
            return False, "Description cannot contain angle brackets (< or >)"
        # Check description length (max 1024 characters per spec)
        if len(description) > 1024:
            return False, f"Description is too long ({len(description)} characters). Maximum is 1024 characters."

    # AD-115: eval_cases.jsonl 미존재 시 WARN (BLOCK X — §enforcement-theater-prevention)
    eval_cases = skill_path / 'eval_cases.jsonl'
    eval_cases_off = frontmatter.get('eval_cases') == 'off' or frontmatter.get('metadata', {}) and frontmatter.get('metadata', {}).get('eval_cases') == 'off'
    if not eval_cases.exists() and not eval_cases_off:
        print(f"⚠️ WARN [AD-115]: eval_cases.jsonl 미생성 — 시드 케이스 3개 권장 (PASS/WARN/FAIL)", file=sys.stderr)
        print(f"   스킵: frontmatter에 'eval_cases: off' 추가 또는 eval_cases.jsonl 생성", file=sys.stderr)

    # 감사 HIGH #9 (2026-07-06 system-audit): 프롬프트 3요소(역할/컨텍스트/출력) 구조화.
    #
    # M-8 (2026-08-22 감사): 4회에 걸쳐 "권장"으로 두었더니 채택률이 49%(34/70)에서 멎었다.
    #   권장은 신규 스킬에서도 무시된다 — 아무도 지키지 않는 권장은 규범이 아니라 장식이다.
    #   그래서 **신규 스킬에 한해** 게이트로 올린다.
    #
    # ⚠️ 기존 스킬은 계속 WARN 이다. 36개를 소급해 실패시키면 그게 바로
    #   §enforcement-theater-prevention 이 경계하는 상황이다 — 사람이 검증을 통째로 끄게 된다.
    #
    # "신규" 판정 = **git 이 아직 추적하지 않는 파일**. 스캐폴딩 직후가 정확히 그 상태다.
    #   판정 불가(git 없음·레포 밖)면 **WARN 으로 강등**한다(fail-open) — 판정 못 하는 상황에서
    #   막으면 레포 밖 스킬 작성이 통째로 불가능해진다.
    # kill-switch: FORGE_SKILL3_GATE=off → 신규도 WARN 으로 되돌린다.
    # 재현: bash shared/scripts/tests/test-skill3-gate.sh
    # 폐기조건: 3요소 채택률이 2분기 연속 90% 이상이면 게이트를 걷고 WARN 으로 되돌린다.
    body = content[match.end():]
    missing_elements = check_prompt_three_elements(body)
    if missing_elements:
        is_new = _is_untracked(skill_path / 'SKILL.md')
        gate_on = os.environ.get('FORGE_SKILL3_GATE', 'on') != 'off' and is_new is True
        level = "BLOCK" if gate_on else "WARN"
        print(
            f"⚠️ {level} [감사#9/M-8]: 프롬프트 3요소 미충족 — 누락: {', '.join(missing_elements)}",
            file=sys.stderr,
        )
        print(
            "   권장: 본문 상단에 '**역할**: ...' / '**컨텍스트**: ...' / '**출력**: ...' "
            "(또는 '## Role' / '## Context' / '## Output') 형식으로 명시",
            file=sys.stderr,
        )
        if gate_on:
            print(
                "   신규 스킬이라 게이트가 적용됐습니다(기존 스킬은 WARN 유지). "
                "끄기: FORGE_SKILL3_GATE=off",
                file=sys.stderr,
            )
            return False, "프롬프트 3요소 미충족 (신규 스킬 게이트, M-8)"

    return True, "Skill is valid!"


def _is_untracked(path):
    """git 이 추적하지 않는 파일이면 True, 추적 중이면 False, 판정 불가면 None.

    판정 불가(None)는 **게이트를 켜지 않는다**(fail-open) — git 이 없거나 레포 밖인
    환경에서 스킬 작성을 통째로 막아버리는 것이 이 게이트의 목적이 아니다.

    ⚠️ **초안의 결함 2건을 2026-08-22 r2 에 수리했다.** 둘 다 검수가 실행으로 잡았다:

    1. **레포 밖이 fail-open 이 아니라 BLOCK 이었다.** git 저장소 밖에서
       `git ls-files --error-unmatch` 는 예외를 던지지 않고 **exit 128** 로 정상 반환한다.
       `except Exception` 에 안 걸리므로 `returncode != 0` 이 True(신규)가 되어,
       위 docstring 이 약속한 WARN 강등 대신 조용히 exit 1 로 막혔다.
       → 종료코드를 **구분**한다: 0=추적중(False) · 1=미추적(True) · 그 외=판정불가(None).

    2. **상대경로 인자에서 기존 스킬도 신규로 오판했다.** `cwd` 를 스킬 디렉터리로 옮기면서
       인자는 호출자 기준 상대경로를 그대로 넘겨, git 이 `<skill-dir>/<상대경로>` 를 찾아 실패했다.
       SKILL.md 가 안내하는 **공식 호출이 레포 루트 기준 상대경로**라 표준 경로에서 계약이 깨졌다.
       → `resolve()` 로 **절대경로**를 넘긴다.

    재현: `bash shared/scripts/tests/test-skill3-gate.sh` (레포 밖·상대경로 케이스 포함)
    """
    try:
        import subprocess
        ap = path.resolve()
        r = subprocess.run(
            ['git', 'ls-files', '--error-unmatch', str(ap)],
            cwd=str(ap.parent), capture_output=True, timeout=5,
        )
        if r.returncode == 0:
            return False    # 추적 중 = 기존 스킬
        if r.returncode == 1:
            return True     # 레포 안인데 미추적 = 신규 스킬
        return None         # 128 등 = 레포 밖·git 부재 → 판정 불가(fail-open)
    except Exception:
        return None


def check_prompt_three_elements(body):
    """스킬 본문에 역할/컨텍스트/출력(또는 role/context/output 등가) 마커 존재 여부 확인.

    마커 형식: '**역할**' 볼드 라벨 또는 '## 역할' 헤더(한/영 등가 포함).
    존재하면 해당 요소를 충족으로 간주. 반환값 = 누락된 요소 이름 리스트(한글).
    """
    element_patterns = {
        '역할': [
            r'\*\*역할\*\*', r'\*\*role\*\*',
            r'^#{1,4}\s*역할\b', r'^#{1,4}\s*role\b',
        ],
        '컨텍스트': [
            r'\*\*컨텍스트\*\*', r'\*\*context\*\*',
            r'^#{1,4}\s*컨텍스트\b', r'^#{1,4}\s*context\b',
        ],
        '출력': [
            r'\*\*출력\*\*', r'\*\*output\*\*',
            r'^#{1,4}\s*출력\b', r'^#{1,4}\s*output\b',
        ],
    }

    missing = []
    for element_name, patterns in element_patterns.items():
        found = any(
            re.search(p, body, re.IGNORECASE | re.MULTILINE)
            for p in patterns
        )
        if not found:
            missing.append(element_name)
    return missing

if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("Usage: python quick_validate.py <skill_directory>")
        sys.exit(1)

    valid, message = validate_skill(sys.argv[1])
    print(message)
    sys.exit(0 if valid else 1)