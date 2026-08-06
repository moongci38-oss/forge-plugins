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

    # 감사 HIGH #9 (2026-07-06 system-audit): 프롬프트 3요소(역할/컨텍스트/출력) 구조화 WARN
    # BLOCK X — 기존 스킬 58개 미충족을 즉시 실패시키지 않는다(§enforcement-theater-prevention).
    body = content[match.end():]
    missing_elements = check_prompt_three_elements(body)
    if missing_elements:
        print(
            f"⚠️ WARN [감사#9]: 프롬프트 3요소 미충족 — 누락: {', '.join(missing_elements)}",
            file=sys.stderr,
        )
        print(
            "   권장: 본문 상단에 '**역할**: ...' / '**컨텍스트**: ...' / '**출력**: ...' "
            "(또는 '## Role' / '## Context' / '## Output') 형식으로 명시",
            file=sys.stderr,
        )

    return True, "Skill is valid!"


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