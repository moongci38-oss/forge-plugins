---
name: memory-manage
description: MEMORY.md 관리 — 항목 추가·수정·삭제·GC. forge 프로젝트별 메모리 인덱스 유지보수. 범위 충돌 감지(global > project > session > ephemeral), 90일 미참조 GC + count>30 보조 트리거(advisory), 중복 병합.
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
$HOME/.claude/projects/{project-slug}/memory/MEMORY.md   # 프로젝트 메모리
$HOME/.claude/projects/-home-damools-forge-outputs/memory/MEMORY.md  # forge-outputs 전역
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

GC 기준 (시간 기반, AD-119):
- 90일 미참조 항목
- 중복 또는 superseded 항목
- ephemeral 범위 30일 이상

### count 기준 보조 트리거 (advisory, 시간 기준 보완)

시간 기준(위)만으로는 최고령 항목이 90일 미만이어도 총 항목 수가 과다해질 수 있다(예: 61일 최고령이지만 37항목). 아래는 **삭제 기준이 아니라 surface·제안 전용** — 자동 실행 금지, 항상 사용자 승인 필요.

```bash
# 최상위 항목(## 헤더) 개수 카운트 — 절대경로 사용
COUNT=$(grep -c '^## ' "$MEMORY_PATH")
if [ "$COUNT" -gt 30 ]; then
  echo "count-based GC 보조 트리거: ${COUNT}항목 > 30 — advisory surface 실행"
fi
```

`COUNT > 30` 시 (`gc` / `audit` 실행 시 자동 병행, 별도 `--apply` 없이도 dry-run 섹션에 표기):
1. **최고령/최소참조 항목 surface** — 항목 내 날짜 표기(예: `2026-05-11`) 또는 언급 기준 오래된 순 상위 N개(기본 5) 나열. 날짜 파싱 불가 항목은 파일 내 등장 순서(위쪽=오래됨) 사용.
2. **유사 주제 병합 후보 제안** — 제목·키워드 overlap(예: "모델 라우팅"·"Fable" 등 반복 키워드) 있는 항목 쌍을 후보로 나열, 병합 문구 초안 제시.
3. **세부 이관 제안** — 항목 내 실행 로그성 세부(구체 수치·1회성 사례·날짜별 diff)는 요약만 MEMORY.md에 남기고 원문은 `learnings.jsonl` 이관 제안(`learnings.sh append`).

전부 **제안 텍스트로만 출력** — MEMORY.md 자동 수정·삭제 금지. 최종 병합·이관 실행은 사용자 승인 후 별도 명령(`update`/`delete`)으로 수행.

### 감사
```
/memory-manage audit        # 전체 범위 충돌·중복 점검
```

## 워크플로우

1. 대상 MEMORY.md 위치 확인 및 Read
2. 사용자 요청 파악 (add/update/delete/gc/audit)
3. 범위 충돌 사전 검사
3.5. `gc`/`audit` 시 count 기준 보조 트리거 체크 (`^## ` 항목 수 > 30 → advisory surface, 위 §count 기준 보조 트리거 참조)
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
- PASS: 요청 항목 정확히 처리, 범위 충돌 없음, 보안 항목 미기록, (gc/audit 시) count>30이면 advisory surface 포함
- WARN: 부분 처리 또는 GC 후보 누락, 중복 미탐지, count>30인데 advisory surface 누락
- FAIL: 잘못된 범위 판정, 보안 항목 기록, global 범위 무확인 삭제, count 기준 후보를 자동 삭제·수정으로 실행
