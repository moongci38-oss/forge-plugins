---
name: retro
disable-model-invocation: true
description: "Use when user says /retro for sprint/session retrospective. Went-well/Went-wrong/Next-sprint 3섹션 + learnings.jsonl 캡처 + SMART 액션아이템. Triggers: \"sprint 회고\", \"세션 회고\", \"레트로\". /forge-end 미완료 시 먼저 권고."
---

# /retro — Sprint/Session 회고

## 실행 흐름

```
1. /forge-end 완료 여부 확인
2. 3-section 회고 생성 (Went Well / Went Wrong / Next Sprint)
3. 핵심 항목 → learnings.sh 자동 추출
4. 다음 스프린트 action items 확정
```

## Step 1 — /forge-end 선행 확인

세션 회고(`/retro`) 실행 전:
- handover 파일 존재 여부 확인: `ls ${FORGE_ROOT:-$HOME/forge}-outputs/handover/` 최신본
- 없으면 먼저 제안: "세션 정리(/forge-end)가 먼저 필요합니다. 진행할까요?"
- handover 있으면 → Step 2 진행 (요약 참조)

Sprint 회고(주기적)는 handover 없어도 직접 진행 허용.

## Step 2 — 3-Section 회고 생성

### 출력 형식

```markdown
## 🔄 Sprint/Session 회고 — {날짜 또는 스프린트명}

### ✅ Went Well (잘 된 것)
- {구체적 사례 + 왜 잘 됐는지}
- {반복 가능한 패턴이면 → [KEEP] 태그}

### ❌ Went Wrong (안 된 것)
- {구체적 실패 사례 + 근본 원인}
- {반복 패턴이면 → learnings 대상}

### ➡️ Next Sprint Actions
| # | 액션 | 담당 | 기한 | 완료 기준 |
|---|------|------|------|---------|
| 1 | {SMART 액션} | AI/Human | {날짜} | {측정 가능 기준} |
```

### 품질 기준 (Anti-Sycophancy)

**금지**:
- "잘 진행됐습니다" 수준의 일반적 칭찬
- 실패 원인 없는 "앞으로 더 잘 하겠습니다"
- 5개 이상의 Next Sprint 항목 (우선순위 없는 목록 = 실행 안 됨)

**필수**:
- Went Wrong 항목마다 근본 원인(1줄) 명시
- Next Sprint Actions = 최대 3개, 담당자·기한·완료 기준 명시
- [KEEP] 태그 항목은 다음 CLAUDE.md 또는 룰 반영 후보

## Step 3 — learnings.sh 추출

Went Wrong 또는 Next Sprint에서 **재발 방지 패턴** 포착 시 자동 추출:

```bash
# 카테고리 매핑
Went Wrong → review-pattern 또는 pge-failure
설계 결정 → decision (기록용)
프로세스 이슈 → process
버그 패턴 → bug-fix-pattern
```

추출 명령 (1건 이상 있을 때):
```bash
bash $HOME/.claude/scripts/learnings.sh append \
  --category review-pattern \
  --summary "{핵심 교훈 1줄}" \
  --source "{session slug 또는 sprint 이름}"
```

**Per-item source attribution 필수**: 출처(세션 slug, 날짜) 없는 learnings = 재현 불가 → 추가 금지.

## Step 4 — 결과 저장 (선택)

스프린트 회고는 forge-outputs에 저장:
```bash
# 경로: ${FORGE_ROOT:-$HOME/forge}-outputs/docs/retro/YYYY-MM-DD-{sprint-name}-retro.md
```

세션 회고는 handover 파일의 ## Retrospective 섹션으로 append.

## [STOP] 게이트

다음 조건 시 회고 중단 + Human 확인:
- Went Wrong 항목이 5건 이상이고 공통 원인이 보임 → "구조적 문제 진단 필요"
- 동일 항목이 이전 회고에서 반복됨 → "learnings 적용 실패 진단" 제안
