---
description: Forge Dev Phase 8 진입 — Spec 기준 구현 + 빌드/린트 통과 게이트.
argument-hint: "[--spec <path>] [--skip-cr-code]"
group: implement
---

# /forge-implement — Phase 8 구현 진입 커맨드

> 진입점: Phase 7 Spec 승인 후 Phase 8 구현 착수. Iron Law 강제.

## Iron Law
승인된 Spec(§7~8 태스크 + 검증 기준) 없이 코드 작성 = **즉시 중단**. spec-write 먼저.

## Red Flags (무시 금지 — 자기합리화 차단)
| 이런 생각이 들면 | 강제 행동 |
|--------------|---------|
| "간단해서 Spec 없이 바로 짜도 돼" | Red Flag → spec-write 먼저 |
| "계획서는 나중에, 일단 시작" | Red Flag → Spec §8 태스크 먼저 |
| "비슷한 거 했으니 대충 알아" | Red Flag → 기존 Spec Read 후 진입 |
| "테스트는 나중에 추가" | Red Flag → 실패 테스트 먼저 (TDD) |

> 출처: Superpowers Iron Law 패턴 (YT af3OJ0L1jEU 분석, 2026-05-21). "Claude는 규칙을 알지만 자기합리화로 우회 — 지식이 아니라 규율 문제."

## 동작 (단일 절차)

### 0. Path Boundary Validation

**`--spec <path>` validation**:
- `.specify/specs/` 하위 강제 (절대경로 거부)
- `.md` 확장자 강제
- traversal 차단 (`../` 포함 → reject)
- NUL/newline 문자 reject
- 미충족 → exit 3

### 1. Phase 7 승인 검증 (PHASE7-IRON-1)

- `state=phase7_complete` 또는 `phase8_pending` 확인
- Spec 파일 (`.specify/specs/{name}.md`) 존재 + INDEX.md 등재 검증
- 미충족 → exit 1 **[STOP]** + Phase 7 우선 진행 안내

### 2. session-state 갱신

```bash
$HOME/.claude/scripts/session-state.mjs checkpoint phase8
```

### 3. Iron Law 인쇄

PHASE7-IRON-1 + PHASE8-IRON-1 출력.

**머지 브랜치 검증 (MERGE-IRON-1 강제)**:
```
머지 실행 전 무조건:
- source == feature/* AND target == develop  → autoMerge 허용
- target == main OR protected branch          → 무조건 [STOP] (MERGE-IRON-1)
- 위 조건 미충족                                → [STOP] (불명확 머지 차단)
develop→main 진입 = 항상 Human 승인 (autoMerge 우회 불가)
```

### 4. 빌드/린트 게이트 안내 출력

```
Phase 8 구현 진입 완료.
성공 조건: 빌드 PASS + 린트 PASS
→ 구현 후 feature→develop 머지 (MERGE-IRON-1 준수)
```

### 5. exit 0

---

## Exit 코드

| code | 의미 |
|:-:|---|
| 0 | Phase 8 진입 성공 |
| 1 | Phase 7 미승인 [STOP] |
| 3 | path validation FAIL (boundary violation) |

---

## 호출 예시

```
/forge-implement
/forge-implement --spec .specify/specs/auth-refactor.md
/forge-implement --skip-cr-code
```

---

## 관련 파일

- `${FORGE_ROOT:-$HOME/forge}/pipeline.md` Phase 8 — 전체 절차 (정본)
- `${FORGE_ROOT:-$HOME/forge}/.claude/commands/forge-fix.md` — 단일 hotfix wrapper
- `${FORGE_ROOT:-$HOME/forge}/.claude/commands/sdd.md` — Phase 7 Spec 작성
> 실패 시 [[pev-self-correction]] 적용
