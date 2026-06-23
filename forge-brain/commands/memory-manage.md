---
description: MEMORY.md 관리 — 메모리 추가·업데이트·삭제·정리 + 스탤 항목 감지 + lifecycle audit (AD-119)
argument-hint: add <내용> | update <slug> <내용> | remove <slug> | audit | gc [--apply]
allowed-tools: Read, Write, Edit, Bash, Glob, Grep
model: sonnet
group: brain
---

# /memory-manage — MEMORY.md 생애주기 관리

**ARGUMENTS**: $ARGUMENTS

Forge 메모리 시스템(`$HOME/.claude/projects/*/memory/MEMORY.md`)의 항목을 관리합니다.

## 사용법

```
/memory-manage add "기억할 내용"              # 새 메모리 추가
/memory-manage update <slug> "수정 내용"     # 기존 항목 업데이트
/memory-manage remove <slug>                 # 항목 삭제
/memory-manage audit                         # 스탤·중복·충돌 감지
/memory-manage gc                            # 90일 미참조 항목 dry-run
/memory-manage gc --apply                    # 실제 아카이브 이동
```

## 동작

### add
1. 메모리 타입 자동 분류 (user / feedback / project / reference)
2. 범위 중복 체크 (SSoT forge-core.md와 충돌 방지)
3. `MEMORY.md` 인라인 작성 (본 프로젝트는 포인터 방식 금지)

### audit
1. 스탤 항목 감지 (90일+ 미참조)
2. 전역 룰 중복 항목 경고 (forge-core.md SSoT 위반)
3. 범위 충돌 감지 (global > project > session 우선순위)
4. 검증 필요 항목 목록 반환

### gc
- dry-run: 아카이브 후보 목록 출력
- `--apply`: `memory-archive/` 이동 (영구 삭제 없음)

## 제약

- 별도 `.md` 파일 생성 금지 (hook 즉시 삭제)
- `MEMORY.md` 인라인 1~3줄 작성만 허용
- `$HOME/.claude/rules/` 내용 중복 저장 금지
- 민감정보(credential/token/secret) 저장 금지

## 관련

- 메모리 lifecycle: `$HOME/.claude/rules-on-demand/memory-lifecycle.md`
- 메모리 스키마: `$HOME/.claude/rules-on-demand/memory-schema.md`
- compounding 지식 루프: `/learn`
