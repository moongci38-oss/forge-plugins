---
name: forge-check-docs
description: "문서 품질 게이트 — PR/커밋 docs 변경 검증: Diataxis 커버리지맵, CHANGELOG sell-test 채점, cross-doc 일관성, PR body Documentation 섹션 제안. 트리거: /forge-check-docs, Phase 4 PR 전, 'docs 검수'. SKIP: docs 파일 0개."
---

# forge-check-docs — 문서 품질 게이트

**역할**: PR/커밋 범위의 docs 변경을 4축으로 체크하고 PASS/WARN/FAIL 판정.
**컨텍스트**: 코드 변경 대비 문서 갭 탐지. 생성 X — 플래그만.
**출력**: 판정 리포트 + PR body Documentation 섹션 초안.

## 실행 순서 (4단계)

### Step 1. 변경 분석

```bash
BASE="${1:-main}"
git diff "$BASE"...HEAD --stat
git diff "$BASE"...HEAD --name-only | grep -E '\.(md|rst|txt)$'
```

코드 변경 파일과 문서 변경 파일을 분리. 코드는 있고 docs 없으면 → Diataxis 체크 트리거.

### Step 2. Diataxis 커버리지 맵 (플래그만, 생성 X)

변경된 기능 대비 4분면 커버 여부 체크:

| 분면 | 목적 | 예시 파일 패턴 |
|------|------|--------------|
| Tutorial | 처음 배우는 단계별 가이드 | tutorial*.md / getting-started* |
| How-to | 특정 목표 달성 절차 | how-to-*.md / guide-*.md |
| Reference | 정확한 명세 (API, 옵션) | reference*.md / api*.md / SKILL.md |
| Explanation | 개념·배경·WHY | architecture*.md / design*.md / ADR |

**플래그 기준**: 신규 기능 추가 시 How-to + Reference 중 1개 이상 없으면 WARN. Tutorial·Explanation은 권고(WARN 아님).

출력 형식:
```
Diataxis 커버리지:
  ✓ Reference: SKILL.md 업데이트
  ✗ How-to: 신규 스킬 사용법 가이드 없음  → WARN
  - Tutorial: 해당 없음 (신규 기능 X)
  - Explanation: 권고 (배경 문서 없음)
```

### Step 3. CHANGELOG sell-test 루브릭

`CHANGELOG.md` 최신 항목 또는 PR body의 변경 설명을 채점:

| 점수 | 기준 |
|------|------|
| 3 | 사용자 관점 혜택 + 구체적 예시 또는 코드 |
| 2 | 사용자 관점 혜택 (why it matters) |
| 1 | 기능 설명만 (what changed, no why) |
| 0 | 없음 또는 내부 커밋 메시지 그대로 |

**판정**: 2점 미만 = voice polish 필요 → WARN. CHANGELOG 없음 = WARN.

채점 출력:
```
CHANGELOG sell-test: 1/3 → WARN
  현재: "forge-check-docs 스킬 추가"
  권고: "PR 병합 전 문서 누락을 자동 탐지 — 신규 기능 대비 How-to·Reference 갭을 플래그하고 CHANGELOG 품질을 채점합니다"
```

### Step 4. Cross-doc 일관성 체크

변경된 문서 파일 내:

```bash
CHANGED_DOCS=$(git diff "$BASE"...HEAD --name-only | grep -E '\.(md|rst|txt)$')
echo "$CHANGED_DOCS" | while IFS= read -r CHANGED_DOC; do
  [ -z "$CHANGED_DOC" ] && continue
  # broken link 체크 (상대 경로 .md)
  grep -oP '\[.*?\]\(\K[\w./\-]+\.md(?=\))' "$CHANGED_DOC" | while read link; do
    [ -f "$link" ] || echo "BROKEN: $link in $CHANGED_DOC"
  done
  # 버전 번호 불일치 (변경 문서 vs CHANGELOG 최신)
  grep -oP 'v\d+\.\d+(\.\d+)?' "$CHANGED_DOC" | sort -u
done
```

출력: broken link 목록 + 버전 불일치 파일 쌍.

## 판정 기준

| 등급 | 조건 |
|------|------|
| PASS | Diataxis WARN 0 + CHANGELOG ≥2 + broken link 0 |
| WARN | Diataxis WARN 1+ 또는 CHANGELOG <2 또는 broken link 1+ |
| FAIL | 신규 공개 API + Reference 문서 완전 누락 (CHANGELOG 도 없음) |

## PR body Documentation 섹션 초안

판정 후 PR body에 추가할 섹션 제안:

```markdown
## Documentation
- [x/] CHANGELOG 업데이트: {예/아니오 + 이유}
- [x/] How-to 가이드: {링크 또는 "해당 없음"}
- [x/] Reference 업데이트: {파일명}
- Diataxis 판정: {PASS/WARN + 요약}
```

<!-- root-cause(skills-1/S1-06, 2026-08-03 관측): 여기 있던 "자동 평가(eval-rubric 통합)"·"Evaluator (Wave 2.5)" 두 절은 8개 SKILL.md에 동일/유사 문구로 복제된 산문이었고 실제 배선(hook/Agent() 호출)이 0건이었다(재현: `grep -rn "eval-rubric\|eval_cases" .claude/hooks .claude/settings.json` → 무관 hit뿐). "자동 누적"이라 썼지만 실행하는 코드가 없다 — 제거. 독립 검증이 실제로 가치 있는 codex-review·forge-check-security만 실제 Agent() 호출로 승격했다(해당 파일 참조) — 이 스킬은 정적 문서 검증이라 별도 2차 검증의 한계효용이 낮다고 판단해 제거만 하고 승격하지 않았다. -->
