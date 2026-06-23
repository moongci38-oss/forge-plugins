---
name: memory-manage
description: MEMORY.md 관리 — 항목 추가·수정·삭제·GC. forge 프로젝트별 메모리 인덱스 유지보수. 범위 충돌 감지(global > project > session > ephemeral), 90일 미참조 GC, 중복 병합.
user-invocable: true
context: fork
model: haiku
group: brain
triggers:
  - "메모리 정리"
  - "memory gc"
  - "기억 업데이트"
  - "/memory-manage"
---

**역할**: forge 프로젝트 MEMORY.md를 관리하는 메모리 큐레이터입니다.
**컨텍스트**: MEMORY.md 항목 추가·수정·삭제·GC가 필요할 때 호출됩니다.
**출력**: 변경 사항 요약 + 범위 충돌·중복·GC 후보 보고.

# memory-manage — MEMORY.md 관리

forge 프로젝트별 MEMORY.md 파일을 유지보수하는 스킬.

## 저장 위치

```
~/.claude/projects/{project-slug}/memory/MEMORY.md   # 프로젝트 메모리
~/.claude/projects/-home-damools-forge-outputs/memory/MEMORY.md  # forge-outputs 전역
```

## 범위 우선순위 (충돌 시)

```
global (forge-core.md·글로벌 rules)
  > project (프로젝트 .claude/rules)
    > session (handover 문서)
      > ephemeral (임시 메모)
```

충돌 감지 시: 상위 범위 승, 하위 범위 항목에 충돌 주석 표기.

## 명령

### 추가
```
/memory-manage add "새 규칙 내용" --type feedback
/memory-manage add "프로젝트 상태" --type project
```

지원 타입: `user` | `feedback` | `project` | `reference`

### 수정
```
/memory-manage update <항목 키워드> "새 내용"
```

### 삭제
```
/memory-manage delete <항목 키워드>
```

`global` 범위 항목 삭제 = 명시 확인 필요.

### GC (가비지 컬렉션)
```
/memory-manage gc           # dry-run — 후보 목록만
/memory-manage gc --apply   # 실제 삭제 (확인 후)
```

GC 기준:
- 90일 미참조 항목
- 중복 또는 superseded 항목
- ephemeral 범위 30일 이상

### 감사
```
/memory-manage audit        # 전체 범위 충돌·중복 점검
```

## 워크플로우

1. 대상 MEMORY.md 위치 확인 및 Read
2. 사용자 요청 파악 (add/update/delete/gc/audit)
3. 범위 충돌 사전 검사
4. 처리 실행 (삭제는 확인 후)
5. 변경 사항 요약 보고 + MEMORY.md 갱신

## 제약

- `.env*` 정보 기록 금지
- `06-finance/07-legal/08-admin` 내용 기록 금지
- hook 자동 삭제 대상 파일 생성 금지 (forge-outputs MEMORY 룰 — 본 파일 인라인 작성, 포인터 형식 금지)
- `global` 범위 삭제 = 사용자 명시 확인 필수
- MEMORY.md 200줄 초과 시 인덱스화 + 상세 룰 분리 권고

## Evaluator (Wave 2.5)

모델: claude-haiku-4-5-20251001

판정 기준:
- PASS: 요청 항목 정확히 처리, 범위 충돌 없음, 보안 항목 미기록
- WARN: 부분 처리 또는 GC 후보 누락, 중복 미탐지
- FAIL: 잘못된 범위 판정, 보안 항목 기록, global 범위 무확인 삭제
