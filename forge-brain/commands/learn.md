---
description: forge compounding 지식 루프 — learnings.jsonl 저장·검색·GC (AD-26 Self-Curating)
allowed-tools: Read, Bash, Glob, Grep
argument-hint: save "<내용>" | search "<키워드>" | gc [--apply] | list [--tag <태그>]
model: haiku
group: brain
---

# /learn — Compounding 지식 루프

AD-26 Self-Curating 루프의 실행 인터페이스. `learnings.jsonl`에 세션 간 학습을 누적·검색·정리합니다.

## 사용법

```
/learn save "학습 내용"                       # 새 learning 저장
/learn search "키워드"                        # 키워드 검색
/learn list                                   # 전체 목록 (최근 20개)
/learn list --tag planning-fallacy            # 태그 필터
/learn gc                                     # GC 후보 dry-run
/learn gc --apply                             # 실제 아카이브 이동
```

## 동작

`learn` 스킬을 호출하여 다음을 실행합니다:

### save
1. collision-safe ID (`L-<ts>-<8hex>`) 생성
2. category / summary / apply / tags 필드 자동 추론
3. `$HOME/.claude/scripts/learnings.sh add` 실행
4. 시크릿·민감정보 포함 시 저장 거부 (exit 2)

### search
1. `$HOME/.claude/scripts/learnings.sh search <keyword>` 실행
2. 날짜·ID·내용·태그 포함 결과 반환
3. planning-fallacy / security / architecture 등 태그 필터 지원

### gc
1. 90일 미참조 stale 항목 식별
2. dry-run: 후보 목록만 출력 (실제 변경 없음)
3. `--apply`: `learnings.archive.jsonl`로 이동 (영구 삭제 없음)

## 관련

- 스킬 SKILL.md: `${FORGE_ROOT:-$HOME/forge}/.claude/skills/learn/SKILL.md`
- learnings 헬퍼: `$HOME/.claude/scripts/learnings.sh`
- GC 스크립트: `${FORGE_ROOT:-$HOME/forge}/shared/scripts/learn-gc.sh`
- 메모리 lifecycle: `$HOME/.claude/rules-on-demand/memory-lifecycle.md`

> planning-fallacy 반복 패턴은 `learnings.jsonl`의 `planning-fallacy` 태그 항목을 먼저 조회하세요 (behavior-core.md §계획 오류 보정 게이트).
