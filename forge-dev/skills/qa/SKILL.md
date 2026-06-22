---
name: qa
description: QA 전 사이클 오케스트레이터 (AD-93 Phase A~H). 브랜치 생성→시나리오 전수→버그 발견→수정 계획→Healer 병렬→cr-* + Codex 검증→develop 자동 머지→Wiki 축적. 스코프 지정 가능 (--scope=full|domain|file-pattern).
role: orchestrator
user-invocable: true
model: sonnet
---

**역할**: QA 전 사이클 오케스트레이터 (AD-93). Phase A~H 전체를 메인 컨텍스트에서 순서대로 실행한다.
**컨텍스트**: P5 Check P5.7-X PASS 후 자동 트리거 또는 `/qa` 호출 시. 메인 컨텍스트 직접 실행 (context:fork 폐지 — AD-92-1).
**출력**: `docs/qa/YYYY-MM-DD-final-qa-report.md` + `docs/qa/baseline.json` + PR (develop 자동 머지)

# QA — E2E 자율 QA 파이프라인 (AD-93, Phase A~H)

> **AD-92-1**: 메인 컨텍스트 실행. 서브에이전트 스폰은 메인→1레벨만 (중첩 금지 — Claude Code 공식 제약).
> **AD-92-2**: 기대값 = Spec/Human/레거시. 코드 역산 금지.
> **AD-92-3**: DB 변이 테스트 = 트랜잭션 롤백 or 매 사이클 seed 재주입.

## 사용법

```
/qa                                       # 전체 QA (Phase A~H, --scope=full)
/qa --scope=auth                          # auth 도메인만 (qa-config domains 매칭)
/qa --scope="src/routes/payment/**"       # file-pattern 스코프
/qa --spec auth.md                        # 특정 Spec만
/qa --cycle 1                             # 1사이클만 (Phase B~C)
/qa --migration --legacy http://HOST:PORT # AD-92 P1 migration 패리티 모드
/qa --mode=hotfix --bug "<이슈 설명>"     # hotfix 모드 (Phase B~C 스킵, forge-fix 내부 전달)
/qa --mode=hotfix --bug "<text>" --skip-final  # cr-test/cr-final 선택 스킵
/qa --mode=uat --scope={domain}           # UAT 모드: Phase B~D 스킵, E~H 외부 검수자 시나리오 기반
                                          # 전제: docs/qa/uat-scenarios.md 사전 생성 필요 (Phase A/B에서 준비)
                                          # UAT persistent tracking: docs/qa/uat-tracking.md 누적 (severity: CRITICAL/HIGH/MEDIUM/LOW)
                                          # cold-start smoke: UAT 첫 진입 시 /qa --cycle 1 자동 선행 (기본 smoke injection)
                                          # NL severity: bug-report 자연어에서 severity 자동 추론 → uat-tracking.md에 기록
/qa --cr on                               # Phase F Codex cr-final 활성 (기본값)
/qa --cr degrade                          # Phase F Codex cr-final 스킵 (비용 절감·Codex 불가 시)
/qa --cr off                              # Phase F Codex cr-final 스킵 (명시적 비활성)
                                          # crMode='degrade'/'off' → codex-critic 스폰 X, 나머지 cr-* + Ship 정상 진행
                                          # caller: MODE=$(~/forge/shared/scripts/cr-mode.sh "$CR_ARG") → args.crMode 전달
```

자동 트리거: P5 Check P5.7-X PASS → 자동 실행

---

## E2E 자율 시퀀스 (Phase A~H)

> **Human 개입 없이 100% 자율 진행. Human은 develop 머지 후 final-qa-report만 검수.**

```
[User] /qa --scope={domain|full}
   │
   ▼ AI 자율 진행
   ├─ Phase A: branch 생성 (fix/qa-{scope}-{YYYY-MM-DD}) [자동, §A13 idempotency]
   │           develop 브랜치 확인 → 기존 fix/qa-* 브랜치 검사 → resume/신규/v2 분기
   │           LOG_HTTP=1 / LOG_SOCKET=1 / LOG_DB=1 자동 export
   │
   ├─ Phase B: 시나리오 전수 작성
   │           qa-setup → gitnexus route_map → scenarios.md (전체 API/페이지)
   │           --scope 필터 적용 → scenarios-filtered.md
   │           출처 격리: Spec FR 우선, Spec 없음 → legacy 동작 출처 (코드 역산 금지)
   │           8 카테고리 강제 + Bug-ID Allocator + 카테고리별 병렬/직렬 분류
   │
   ├─ Phase C: 버그 발견 + 아티팩트 수집
   │           T1(API) + T2(UI) + T3(DB) + T6(보안) + T7(성능) 실행
   │           ⚠️ 각 테스트 실행 시 proof 생성: bash ~/forge/shared/scripts/run-tests-proof.sh "<cmd>"
   │              → TEST_PROOF: SHA256=<hash> CMD=<cmd> LINES=<n> EXIT=<code> (WARN if absent — codex-gate §5.5)
   │           FAIL → artifacts/bug-{N}-{shot|http|server|console}.* 강제 생성
   │           6하원칙 bug-report.md 작성
   │
   ├─ Phase D: 버그 수정 계획서
   │           docs/qa/{date}-bug-fix-plan.md 신규 생성
   │           버그별: 원인가설 / 영향파일 / 수정방향 / 회귀위험 / healer분담 / 복잡도
   │           docs-diff → bug-fix-plan-diff.md (healer worktree 스코프 가드)
   │
   ├─ Phase E: Healer 병렬 수정 (worktree 격리)
   │           복잡도별 자동 라우팅: SIMPLE→subagent1 / MODERATE→AgentTeams+worktree
   │           HIGH→PGE+5specialist / AMBIGUOUS→/investigate 선행
   │           직렬 회귀 게이트: 병렬 완료 후 순서대로 머지 + 회귀 감지
   │           UI버그: Vision evaluator(JSON schema) + pixel-diff-gate + forge-check-ui
   │           [UAT 진입점] --mode=uat 시: docs/qa/uat-scenarios.md 로드 → Healer 비활성 → 수동 검토 플로우
   │
   ├─ Phase F: 검증 전수 (cr-* + Codex)
   │           1. /cr-bug {bug-report}       (수정 적정성)
   │           2. /cr-code {changed-files}   (코드 품질)
   │           3. /cr-test {qa-report}       (커버리지·fake-pass)
   │           4. /cr-final {PR-body}        (Claude, 적대적 리뷰)
   │           5. Codex /cr-final            (third-party LLM, PR 머지 직전 1회)
   │              └─ [crMode gate] args.crMode='on'(기본) 시에만 스폰.
   │                 'degrade'/'off' → codex-critic 스킵, Phase G 계속 진행.
   │           → 전부 PASS/WARN 시에만 Phase G 진입
   │
   ├─ Phase G: PR 생성 → CI → develop 자동 머지 [자동]
   │           gh pr create --base develop --head fix/qa-{scope}-{date}
   │           bash scripts/ci-wait.sh {branch} (15분 timeout + CI FAIL 패턴 분석)
   │           bash scripts/codex-cr-final.sh {pr-body} → docs/reviews/codex-final/{date}-*.json
   │           9 조건 모두 충족 시 → gh pr merge --squash --delete-branch
   │           (MVP: 수동 머지. auto-merge hook = AD-97 향후)
   │           git checkout develop && git pull && git worktree prune
   │
   └─ Phase H: 지식 축적 + 메트릭 + 정리 (AD-93 W5)
               learnings.jsonl append (healer 종료 시)
               wiki-sync 자동 트리거 (nohup background, Human 승인 유지)
               docs/qa/intervention-log.jsonl append (Human override 발생 시)
               docs/qa/metrics.jsonl append {date, scope, bugs_found, bugs_fixed, cycles, mttr_min, regression_count}
               docs/qa/{date}-final-qa-report.md (Human 검수용)
               git worktree prune (orphan cleanup, §A10)
               ~/.claude/worktrees/qa-* 7일+ 자동 삭제
   │
   ▼
[User] final-qa-report 검수 (develop 머지 완료 상태)
```

### 자동 머지 조건 (9개 전부 충족)

- [✓] /cr-bug PASS/WARN
- [✓] /cr-code PASS/WARN
- [✓] /cr-test PASS/WARN
- [✓] /cr-final PASS/WARN (Claude Sonnet, 적대적)
- [✓] Codex /cr-final PASS (third-party LLM — 미충족 시 develop 머지 X)
- [✓] 보안 CRITICAL 0건
- [✓] 회귀 0건 (baseline 대조)
- [✓] GitHub CI PASS
- [✓] 모든 시나리오 PASS

### Iron Laws (전 Phase 공통)

- **main 직접 머지 X** (MERGE-IRON-1 — develop만 자동, main은 Human)
- **test PASS 주장 = TEST_PROOF hash 동반** (WARN if absent — 합성경로 허위보고 방지, AD-161)
- 회귀 감지 / same-issue 3회 (`sha256({file_path}:{symbol}:{error_class})`) / 6사이클 초과 → 즉시 [STOP]
- 보안 CRITICAL → 즉시 [STOP] + Human 알림
- Lethal Trifecta (미신뢰 외부 입력 + DB write + 코드쓰기 동시) → 즉시 [STOP]
- subagent → subagent 중첩 금지 (Claude Code 1-level)

### TDD RED-GREEN 게이트 (WI-24)

버그수정·구현 시 RED-GREEN 사이클을 QA 검증 게이트로 적용한다:

**Verify-RED (수정 전 필수)**:
1. 버그 증상을 재현하는 테스트 또는 명령을 실행
2. FAIL(RED) 확인 — 올바른 이유로 실패하는지 확인 (기능 없음, 버그 존재 등)
3. "이미 통과할 것 같으니 생략" 금지 — Verify-RED 없이 수정 착수 금지

**Verify-GREEN (수정 후 필수)**:
1. 동일 테스트/명령 재실행
2. PASS(GREEN) 확인
3. 회귀 테스트 전체 PASS 확인

_QA 맥락 차별_: behavior-core.md의 red-green은 일반 버그수정 룰. 본 게이트는 **Phase C/E 내 healer 수정 사이클**에서 각 Bug-ID별로 Verify-RED→Verify-GREEN 강제 적용 (TEST_PROOF hash 동반 의무). Phase F cr-* 진입 전 전체 Bug-ID RED-GREEN 완료 확인 필수.

---

## Hotfix 모드 (`--mode=hotfix`) — AD-95

`/forge-fix <이슈>` 또는 직접 `--mode=hotfix` 호출 시 경량 흐름 (Phase B~C 스킵):

```
/qa --mode=hotfix --bug "<text>"
  ├─ Phase A: 브랜치 생성 (hotfix/{slug} prefix)
  ├─ Phase B~C: SKIP (시나리오 전수 + 버그 발견 생략)
  ├─ Phase D: bug-fix-plan.md 자동 생성 (SIMPLE 고정)
  ├─ Phase E: SIMPLE 라우팅만 (healer 1개, model=sonnet)
  ├─ Phase F: cr-bug + cr-code 필수 / cr-test + cr-final = 옵션
  └─ Phase G~H: 동일 (PR + CI + develop 자동 머지 + 지식 축적)
```

Hotfix 단일 파일 가드: Phase E 완료 후 2+ 파일 변경 감지 시 [STOP].
상세 구현 → `reference.md` §Hotfix 상세

---

## Phase Gate 호출 표 (AD-96-MVP M14 — dispatcher)

> **호출 방법**: `bash ~/forge/.claude/hooks/dispatch/phase-gate.sh <gate-name> [bug_id] [artifacts_dir] [scenarios_path]`

| Gate | 호출 시점 | 실행 Hook | Exit 2 조건 |
|------|----------|---------|------------|
| `phase-a-to-b` | Phase A 완료 → Phase B 진입 직전 | H26 `scenarios-required.sh` | scenarios.md 없음 |
| `phase-b-entry` | Phase B 실행 시작 직전 | H27 `scenarios-coverage-8.sh` | 8 카테고리 미커버 |
| `phase-e-entry` | Phase E 진입 (healer 스폰 직전) | H1 `qa-6w-validate.sh` (Phase E) | Why_hypothesis 없음 |
| `phase-e-a4-ui` | Phase E a4 완료 (UI 버그) | H2 `qa-artifact-frontend.sh` + H7 `pixel-diff-gate.sh` + H6 `vision-evaluator-required.sh` | 6장 미완성 / diff>1% / vision FAIL |
| `phase-e-a4-backend` | Phase E a4 완료 (API/DB 버그) | H3 `qa-artifact-backend.sh` | 3종 로그 없음 |
| `phase-f-entry` | Phase F 진입 직전 | H1 `qa-6w-validate.sh` (Phase F) | Why_root_cause 미작성 |
| `phase-a-branch` | Phase A (AD-97 예약) | skip (MVP) | - |
| `phase-g-merge` | Phase G (AD-97 예약) | skip (MVP) | - |

```bash
# qa SKILL 구현 예시
bash ~/forge/.claude/hooks/dispatch/phase-gate.sh phase-a-to-b
bash ~/forge/.claude/hooks/dispatch/phase-gate.sh phase-e-entry
bash ~/forge/.claude/hooks/dispatch/phase-gate.sh phase-e-a4-ui "bug-${N}"
bash ~/forge/.claude/hooks/dispatch/phase-gate.sh phase-f-entry
```

---

## Phase B — 8 카테고리 강제 (요약)

| # | 카테고리 | 병렬 정책 |
|---|---------|---------|
| 1·2·3·8 | Happy Path / Boundary / Negative / A11y | 병렬 가능 |
| 4·6 | Error/Exception / Concurrency | worktree 격리 필수 + 병렬 가능 |
| 5·7 | State Transition / Security | 직렬 의무 |

면제 시: `면제 카테고리: [N] / 사유: <1줄>` 명시. 3건 이상 동시 면제 = [STOP].
H28 gate: 카테고리 1·2·3·4·6·8 합산 5+건 직렬 시도 → 차단.
상세 시나리오 schema + 병렬 실행 코드 → `reference.md` §Phase B 상세

---

## Phase E — 복잡도 라우팅 요약

| 복잡도 | 하네스 |
|--------|-------|
| SIMPLE | subagent 1개 (healer, model=sonnet) |
| MODERATE | Agent Teams (healer 병렬, worktree) |
| HIGH | PGE + Agent Teams (5 specialist 병렬) — cross-repo 전용 |
| AMBIGUOUS | `/investigate` 4단계 선행 → 재분류 |

Brain-Hands 분리: 메인 컨텍스트 = orchestrator ONLY. healer + cr-* = **Sonnet 강제**.

**Worktree isolation (MODERATE+)**: MODERATE 이상 = healer 각각 독립 worktree 격리. 병렬 완료 후 순서대로 머지 + 회귀 감지 (직렬 회귀 게이트).

**Post-wave build+test gate**: 각 healer 완료 직후 `build PASS + regression test PASS` 필수. FAIL → 해당 worktree 롤백 (다음 병렬 작업 불블록).

**Orchestrator heartbeat / stall 감시**: Phase E 오케스트레이터 = 30초 간격으로 활성 healer 상태 확인. 응답 없는 healer 3회 연속 무응답 시 [STOP] + 완료된 worktree 보존 + Human 알림.

상세 라우팅 코드 + Vision evaluator JSON schema → `reference.md` §Phase E 상세

---

## 소스코드 읽기 금지 원칙 (LN-05)

**QA = 동작 검증, 코드 리뷰 X.** 소스코드를 Read하여 동작을 추론하지 말 것.
- 실제 실행·화면·로그·HTTP 응답으로만 판정
- "코드를 보면 이렇게 동작할 것 같다" = 즉시 중단, 실제 실행으로 검증
- 코드 리뷰 필요 시 `/cr-double` 또는 `/code-review` 별도 실행

## 8축 가중 Health Score Rubric (LN-05)

> **총점 100점. 70점 미만 → FAIL. 기능성 축 즉시 FAIL 시 총점 무관 FAIL.**

| 축 | 가중치 | FAIL 기준 |
|----|:------:|----------|
| 1. 기능성 (Functionality) | 25% | FR 미충족 1건 → 즉시 FAIL |
| 2. 성능 (Performance) | 15% | P95 응답 > 기준치 2× |
| 3. 보안 (Security) | 15% | CRITICAL 취약점 1건 |
| 4. 접근성 (Accessibility) | 10% | WCAG AA 위반 |
| 5. UX/UI 일관성 | 10% | 디자인 시스템 이탈 3건+ |
| 6. 에러 처리 | 10% | 미처리 예외 또는 빈 에러 메시지 |
| 7. 모바일 뷰포트 | 10% | 360px / 390px 레이아웃 깨짐 |
| 8. 문서 | 5% | 주요 변경 미반영 |

**증거 2-Tier**:
- Tier 1 (필수): 스크린샷·로그·HTTP 응답 직접 첨부
- Tier 2 (보완): 재현 명령어 or 자동화 스크립트 경로

### 모바일 뷰포트 검증 (축 7 — 필수)

모바일 대상 기능은 다음 2개 뷰포트 강제 검증:
```
- 360×800 (Android 기준)
- 390×844 (iPhone 14 기준)
```
Playwright: `page.setViewportSize({width: 360, height: 800})`

### Diff-Aware 모드

`--diff-aware` 플래그 or PR/브랜치 컨텍스트 시 자동 활성:
- 변경된 FR/파일만 재검증 (전체 regression 스킵)
- 신규 추가 코드 경로 우선 커버
- 기존 PASS 시나리오 샘플링 20%만 재실행

### Framework별 검증 가이드

| Framework | 추가 검증 항목 |
|-----------|--------------|
| Next.js | SSR 하이드레이션 에러, 404/500 페이지 |
| NestJS | Swagger 스펙 일치, DTO 검증 실패 케이스 |
| Unity | 프레임레이트 60fps 유지, 메모리 누수 |
| FastAPI | 응답 스키마 일치, 오류 코드 표준화 |

## 평가 Rubric (합격/불합격 기준)

> 8축 가중 점수 합산 (LN-05). **70점 미만 → FAIL (재작업 필수)**

| 항목 | 가중치 | 불합격 기준 |
|------|:------:|-----------|
| 기능성 | 25% | FR 미충족 1개라도 있으면 즉시 FAIL |
| 성능 | 15% | P95 응답 기준치 2× 초과 |
| 보안 | 15% | CRITICAL 취약점 1건 이상 |
| 접근성 | 10% | WCAG AA 위반 |
| UX/UI | 10% | 디자인 시스템 이탈 3건+ |
| 에러 처리 | 10% | 미처리 예외·빈 에러 메시지 |
| 모바일 뷰포트 | 10% | 360px/390px 깨짐 |
| 문서 | 5% | 주요 변경 미반영 |

**PASS**: 70점 이상 + 기능성 즉시 FAIL 없음
**FAIL**: 70점 미만 또는 기능성 즉시 FAIL → Cycle 2 재작업
도메인별 불합격 기준 + AI 슬롭 체크리스트 → `reference.md` §Rubric 상세

---

## 산출물

`docs/qa/YYYY-MM-DD-{spec-name}-qa-report.md`

| 항목 | 내용 |
|------|------|
| 시나리오 수 | FR별 시나리오 개수 |
| PASS/FAIL | 각 시나리오 결과 |
| Rubric 점수 | 항목별 점수 + 합산 |
| 이슈 목록 | 발견된 이슈 + 수정 내역 |
| 사이클 수 | 실행된 사이클 수 |

---

## Workflow 통합

병렬/다단계 실행 = Workflow 도구로 컨텍스트 격리 + resume 지원.
패턴: Phase A~D(순차) → Phase C(parallel T1~T7) → Phase E(parallel healer) → Phase F~H(순차).
실행: `Workflow({ script: Bash("cat ~/.claude/skills/qa/workflow.js"), args: { scope, mode } })`
`CLAUDE_CODE_DISABLE_WORKFLOWS=1` 시 기존 Phase A~H 메인 컨텍스트 방식 fallback.

## Codex 2차 게이트 (Plan v2-C1, 자동)

QA 시나리오 작성 완료 후 Codex `--stage test` 자동 호출:
- 정책: `test` stage = blocking NO. WARN/FAIL → 사용자 컨펌 후 진행.
- 비활성: `CODEX_REVIEW_AUTO_STAGES=off`

## eval-rubric 통합 (자동)

스킬 산출물 저장 후 자동 `/eval-rubric --target {산출물 경로}` 호출.
결과 → `~/.claude/skills/qa/eval_cases.jsonl` 누적 (EC-qa-{N}).
비활성: `EVAL_RUBRIC_AUTO=off`

> **상세 구현 참조**: `~/forge/.claude/skills/qa/reference.md`
> (Phase A~H 세부 코드 / T1~T7 검증 상세 / healer 루프 / Phase 입출력 표 / Artifact 보존 정책)
