---
description: Forge 하네스 읽기전용 레거시 감사 — 낡은룰/중복/과대 전역컨텍스트/불필요 Hook·MCP/제품중복 분류 + diet-queue.json 생성
argument-hint: [--scope rules|skills|hooks|all]
allowed-tools: Read, Bash, Glob, Grep, Write
model: sonnet
group: harness
---

# /harness-legacy-scan — Forge 하네스 레거시 감사

**ARGUMENTS**: $ARGUMENTS

`harness-legacy-scan` 스킬을 실행하여 Forge 하네스 슬림화 기회를 감사합니다.

## 실행

`harness-legacy-scan` 스킬을 즉시 호출하고, `$ARGUMENTS`를 스킬 입력으로 전달합니다.

## 사용 예시

```
/harness-legacy-scan
/harness-legacy-scan --scope rules
/harness-legacy-scan --scope hooks
```

## 감사 범위 (9섹션)

| 섹션 | 대상 |
|------|------|
| 1 | 낡은 룰 — 제품 기본기능이 된 지침 |
| 2 | 과대 전역컨텍스트 — 매 세션 불필요 로드 |
| 3 | 넓은 Skill description — 경계 없는 자동호출 |
| 4 | 불필요 Hook — theater에 그치는 Hook |
| 5 | 불필요 MCP — 의도 대비 효과 없는 서버 |
| 6 | 제품 중복 — Claude Code 자체 기능과 겹치는 룰 |
| 7 | 삭제후보 — 90일+ 미사용 자산 |
| 8 | 중복 스킬 — 동일 기능 복수 등록 |
| 9 | cascade 부하 — CLAUDE.md 200줄 초과 |

## 산출물

- 9섹션 스캔 리포트 (콘솔 출력)
- `${FORGE_OUTPUTS:-$HOME/forge-outputs}/11-platform/harness/diet-queue.json`

> **읽기전용**. 실제 수정은 `/harness-diet`를 사용하세요.  
> system-audit(ACHCE 5축)과 다릅니다 — 본 스킬은 하네스 슬림화 전용입니다.
