---
name: migration-audit
description: |
  레거시→신규 스택 마이그레이션 검수 하네스. legacy=SSoT 원칙으로 로직 100% sync 도달까지 audit→fix→re-audit 자율 반복.
  트리거: "/migration-audit", "마이그레이션 검수", "레거시 대조", "migration audit", "legacy vs src 비교".
  지원 스택: node-nest (Socket.IO↔NestJS), php-nest, 확장 가능.
  7 Phase: 인벤토리→이벤트커버리지→로직대조→DB대조→멀티검수→리포트→fix루프.
  3-bucket 분류: MIGRATION-DRIFT / KNOWN-DIVERGENCE / LEGACY-BUG-CANDIDATE.
  오라클: golden-test(순수함수) + black-box trace(부수효과 영역).
  PEV 루프 종료조건: CRITICAL+HIGH=0 AND golden 100% AND 회귀 0 AND UNVERIFIED=0(or waiver).
---

# /migration-audit

```
/migration-audit <legacy-path> <migrated-path> [--stack=node-nest|php-nest] [--scope=full|domain|events] [--fix=off|propose|auto] [--cr=on|degrade|off]
```

예: `/migration-audit matgo/server/legacy matgo/server/src --stack=node-nest`

**핵심 원칙**: legacy = 정답 기준. src≠legacy → src 의심 (legacy 버그 가능성도 기록). 대조 불가 = UNVERIFIED(BLOCKING), silent skip 금지.

스택별 엔트리포인트 매핑 → `references/stack-mappings.md`
Subagent 상세 명세 → `references/subagents.md`

## 사전 준비

- 검수 전 `feature/migration-audit-<name>` 브랜치 생성 (develop 기준)
- legacy working-tree 오염(미커밋 변경) → `git stash push -u -m "pre-audit"` 필수
- **audit 기준 = frozen legacy commit** (`git show <frozen-sha>:path`), working-tree 아님
- `npm run build` 또는 `npx nest build` 스크립트 존재 선검증

## 7 Phase 실행 순서

### Phase 0 — 인벤토리 + 환경선검증

Explore subagent 2개 병렬 (legacy / migrated 구조 추출):
- 파일 목록, 엔트리포인트, 진입 이벤트/라우트 추출
- 빌드 스크립트 존재 확인, golden-test 하네스 가능성 판단
- **BLOCKER 게이트**: 구조 매핑 미해결 항목("확인필요") 100% 해소 후 Phase 1 진입

산출물: `00-inventory-legacy.md`, `00-inventory-src.md`

### Phase 0.5 — Provenance Ledger 구축

```bash
git log -- <legacy-path> --oneline          # frozen 여부 확인
git log <migrated-path> --oneline           # src 전 커밋 분류
```

`intent-ledger.md` 생성:
- **MIGRATION**: 마이그/port/본문/라우팅 커밋
- **INTENTIONAL**: fix/feat 행위변경 커밋 (보존 대상)
- **CHORE**: 코스메틱/deps

src 인라인 주석(`legacy:.../g-N:...`) + bug_report + learnings 교차수집 → known-divergence 후보 레지스트리

### Phase 1 — 이벤트 커버리지 매트릭스 [게이트 1]

**이름 단위** 매핑 (개수 일치 ≠ 충분). 판정: **COVERED / MISSING / RENAMED / EXTRA**. MISSING = CRITICAL.

산출물: `01-event-coverage-matrix.md`

### Phase 2 — 핵심 로직 deep 대조

`migration-auditor` subagent를 도메인별 병렬 스폰. 각 auditor는 **read-only + git blame 한정**.

차이 발견 시 git blame → ledger 조회 → 3-bucket 분류:
- **MIGRATION-DRIFT**: 마이그 커밋 출처, fix 후보
- **KNOWN-DIVERGENCE**: fix/feat 커밋 출처, 보존 (SHA 명기)
- **LEGACY-BUG-CANDIDATE**: 사용자 확정 대기
- **MISSING**: legacy 有 src 無 → CRITICAL
- **UNVERIFIED**: 대조 불가 → BLOCKING

산출물: `02-game-rule-diff.md` (auditor 결과 합본)

### Phase 3 — DB/외부계약 대조 [게이트 2]

- SP명/파라미터/반환/호출순서 대조
- **IRON Rule 4**: 컬럼 오타 보존 확인 — "고쳐졌으면" CRITICAL
- relay 프로토콜 미확보 시 relay 도메인 PASS 금지

산출물: `03-sp-db-mapping.md`

### Phase 4 — 멀티 적대적 검수 [게이트 3 — BLOCKING]

`--cr=on` (기본): codex-critic(`agentType:'codex-critic'`) 스폰 — 외부 토큰 선발행 전제.
`--cr=degrade` | `--cr=off`: codex-critic 스폰 생략. Phase 2 findings를 WARN verdict로 그대로 통과. 비용 절감 또는 Codex 불가 환경용.
crMode 해석은 `${FORGE_ROOT:-$HOME/forge}/shared/scripts/cr-mode.sh`가 담당하며 `args.crMode`로 Workflow에 전달한다.

Claude 1차 finding → `/cr-multi --mode triple`:

**페이로드 필수 형식** (요약 금지 — 동의편향 방지):
```
[도메인] [판정등급]
legacy 함수: <원문 코드 excerpt>
src 함수: <원문 코드 excerpt>
판정근거: <라인 단위 차이>
git blame: <커밋 SHA + 메시지>
```

Triage 합산 후 확정 finding만 Phase 5로.

### Phase 5 — 종합 리포트 + 버그 등록

확정 CRITICAL/HIGH → `docs/bug_report/BUG-NNN-*.md` (healer 형식 + **legacy=SSoT 대조근거** 필드)

산출물: `MIGRATION-AUDIT-REPORT.md` + `SYNC-STATUS.md`

분류 모호 finding 존재 시 (`MIGRATION-DRIFT` vs `INTENTIONAL-IMPROVEMENT` git blame으로 판정 불가) AND `FORGE_ADVISOR_AUTO` ≠ `"off"`:

```
Agent(
  subagent_type="advisor-strategist",
  prompt="""
<맥락 (500토큰 이내)>
- 모호 finding 목록: {ambiguous_findings}
- git blame 결과 (커밋 메시지 불명확): {blame_summary}

질문:
1. DRIFT vs INTENTIONAL 분류 시 놓치기 쉬운 판단 기준 1~2개.
2. 각 모호 finding의 권장 분류 + 근거 1~2개만.
"""
)
```

Advisor 응답 → `MIGRATION-AUDIT-REPORT.md`의 `## Advisor 분류 조언` 섹션에 첨부.

**→ [STOP] M1 사용자 승인 게이트**

### Phase 6 — 수정 루프 (`--fix=propose|auto`)

`migration-fixer` subagent. **oracle 전제**: 실패 oracle 있는 finding만 auto-fix.

게이트 순서 (순서 위반 시 abort):
1. **forbidden-diff 스캐너**: denylist 경로 변경 차단
   - denylist: `legacy/**`, `*/mysql_info.js`, env/secret/config, package-lock, require 위치
   - IRON Rule 4/5/6 변경 차단
2. **oracle PASS**: golden-test + `npm run build` 통과
3. **patch 멀티검수**: `/cr-multi --mode triple` (실코드 전달)

commit: `fix(migration): BUG-NNN`

### Phase 7 — PEV 루프 (100% sync)

재검 범위: 변경 도메인 + 의존/호출 연결 도메인. finding 의존그래프 기록.

`SYNC-STATUS.md` **매 사이클 갱신**:
```
사이클: N/6 | 신규: X | 해결: Y | CRITICAL: A | HIGH: B | plateau: P
```

**STOP**: 사이클 캡(6) / plateau(2연속) / 진동(동일 finding 2회)

plateau(2연속) 감지 시 AND `FORGE_ADVISOR_AUTO` ≠ `"off"`:

```
Agent(
  subagent_type="advisor-strategist",
  prompt="""
<맥락 (500토큰 이내)>
- 사이클 현황: {cycle}/6, plateau: {plateau_count}연속
- 미해결 CRITICAL/HIGH: {critical_count}/{high_count}
- 반복 발생 finding 요약: {stalled_findings}

질문:
1. plateau 돌파 방법 또는 루프 종료 근거 1~2개.
2. STOP vs 추가 사이클 권고 + 핵심 이유 1~2개만.
"""
)
```

Advisor 응답 → `SYNC-STATUS.md`의 `## Advisor 루프 판단` 섹션에 첨부.

## 100% sync 종료조건

- 정적: MISSING=0 / DRIFT=0 / SP불일치=0
- 동적: golden 100% (M2) + UNVERIFIED=0 (M3)
- 회귀: 신규 CRITICAL/HIGH=0
- INTENTIONAL-IMPROVEMENT: 수정 제외 + 기록
- LEGACY-BUG-CANDIDATE: 사용자 확정 후 sync 분모 제외

## 산출물 경로

`<migrated-path>/../docs/migration-audit/<name>/`:
`00-inventory-{legacy,src}.md` / `01-event-coverage-matrix.md` / `02-game-rule-diff.md` / `03-sp-db-mapping.md` / `intent-ledger.md` / `MIGRATION-AUDIT-REPORT.md` / `SYNC-STATUS.md`

BUG: `<migrated-path>/../docs/bug_report/BUG-NNN-*.md`
Golden tests: `<migrated-path>/test/migration-golden.*` (영구 편입)

## Workflow 통합 (계획서 P2-3)
Phase 7 PEV 루프 = while() 자동화 (사이클 캡 6 + plateau 2연속 감지 중단).
패턴: Phase 0 parallel(legacy/src 인벤토리) → Phase 2 pipeline(도메인별 병렬 대조) → Phase 5 [STOP] M1 게이트 → Phase 7 while(CRITICAL>0 && cycles<6).
실행: `Workflow({ script: Bash("cat $HOME/.claude/skills/migration-audit/workflow.js"), args: { legacyPath, migratedPath, stack, scope, fix, crMode } })`
`crMode` 값은 `${FORGE_ROOT:-$HOME/forge}/shared/scripts/cr-mode.sh` 출력을 caller가 읽어 전달 (`on`|`degrade`|`off`, 기본 `on`).
fix='off'(기본) → Phase 5에서 PENDING_APPROVAL 반환. fix='auto' → Phase 6+7 자동 실행.
`CLAUDE_CODE_DISABLE_WORKFLOWS=1` 시 기존 7 Phase 수동 실행 방식 fallback.

## 자동 평가 (eval-rubric 통합)

### 호출 시점
- Phase 5 완료 후: `/eval-rubric --target MIGRATION-AUDIT-REPORT.md`
- Phase 7 루프 종료 후: SYNC-STATUS.md 평가

### 절차
1. 산출물 저장 후: `/eval-rubric --target {경로}`
2. verdict + 4축 점수 수신
3. eval_cases.jsonl append (`$HOME/.claude/scripts/eval-cases-append.py`, case_id: EC-migration-audit-{N})

자동 비활성: `EVAL_RUBRIC_AUTO=off`
