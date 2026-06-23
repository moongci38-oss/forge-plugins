---
description: harness-legacy-scan 리포트 기반 하네스 자동 적용 — diet_auto=true && risk=low 항목만 실행 (읽기전용 scan 먼저 필수)
argument-hint: [--dry-run] [--queue <path-to-diet-queue.json>]
allowed-tools: Read, Write, Edit, Bash, Glob, Grep
model: sonnet
group: harness
---

# /harness-diet — Forge 하네스 슬림화 적용기

**ARGUMENTS**: $ARGUMENTS

`harness-diet` 스킬을 실행하여 `harness-legacy-scan`이 생성한 diet-queue.json의 저위험 항목을 자동 적용합니다.

> **선행 필수**: `/harness-legacy-scan` 실행 후 리포트 검토·납득 완료 시에만 사용하세요.

## 실행

`harness-diet` 스킬을 즉시 호출하고, `$ARGUMENTS`를 스킬 입력으로 전달합니다.

## 사용 예시

```
/harness-diet
/harness-diet --dry-run
/harness-diet --queue ${FORGE_OUTPUTS:-$HOME/forge-outputs}/11-platform/harness/diet-queue.json
```

## 적용 기준

- **자동 적용**: `diet_auto=true && risk=low`만
- **Human 승인 후 적용**: `risk=medium/high` 항목 — 목록 출력 후 대기

## 허용 7가지

| # | 허용 작업 |
|---|----------|
| 1 | CLAUDE.md 축소 (중복/일반지침 섹션 제거) |
| 2 | 절차 CLAUDE.md→Skills 이동 |
| 3 | 긴 SKILL.md 분리 (SKILL.md + reference.md) |
| 4 | description 좁힘 ("쓰지 말아야 할 때" 추가) |
| 5 | 자동호출 Skill negative guard 추가 |
| 6 | 삭제후보 archive 이동 (영구삭제 X) |
| 7 | 인라인주석 정리 |

## 절대 금지

- 영구 삭제 (archive 이동만 허용)
- hooks / MCP 설정 수정
- 앱 코드·테스트·빌드 실행

## 산출물

7섹션 보고: 변경목록 / 이유 / Before-After diff / Human 승인 필요 목록 / smoke-test 결과
