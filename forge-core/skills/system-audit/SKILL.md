---
name: system-audit
description: "6축 통합 시스템감사(Agentic·Context·Harness·Cost·Human-AI+중복). 한 세션이 재현 명령·스크립트로 직접 실측해 채점한다. 전체 AI시스템 역량점검 요청 시. 하네스 슬림화만 원하면 harness-legacy-scan."
argument-hint: "[target: system|{project-name}]"
context: fork
model: opus
---

> **저장 경로 앵커**: 보고서 경로는 반드시 `${FORGE_OUTPUTS:-$HOME/forge-outputs}/` 로 시작(cwd 상대 금지) → `references/audit-common.md` §저장 경로 앵커

**역할**: 한 세션(또는 에이전트 1개)이 5축(ACHCE)+중복을 **직접 실측**하고 채점·보고서까지 쓰는 단독 감사자. 축 에이전트·Workflow 는 없다.
**컨텍스트**: 대상 레포의 `.claude/`(rules·skills·agents·hooks)·`~/.claude` 미러·이전 감사 보고서. **출력**: 6축 점수·축간 트레이드오프·통합 로드맵 보고서 1개(Step 5 경로).
**Evaluator 원칙(관대 금지)** → 실행 전 반드시 Read: `references/audit-common.md` §Evaluator 핵심 원칙
**방식 근거**: 축 에이전트 5종 삭제(#1374, 2026-09-27) → 2026-09-28 사람 결정 #1415(A안): 단독 실측으로 전환. 참조: `$FORGE_OUTPUTS/docs/tech/2026-03-16-5-axis-ai-analysis-framework.md`

- **감사 유형**(모든 지표에 명시): 실측(스크립트·Grep·wc) · 추정(글자→토큰 등) · 설계 검토(판단) · 미측정(N/A, 런타임 데이터 필요)
- **강제 수준**: ENFORCED(훅이 exit 2 로 차단, 100%) · GUIDED(규칙만, 70%) · PAPER(감사에만 존재, "미적용" 표기·점수 제외)
  - ⚠️ 차단력은 grep 이 아니라 **실행 시험**으로 판정: `echo '{"tool_input":{...}}' | bash <훅> ; echo "EXIT=$?"` (페이로드는 파일로 넘긴다 — 명령줄에 직접 쓰면 가드가 감사 명령 자체에 반응)
- **인자**: `$ARGUMENTS` 첫 단어 = target(미입력 `system`). `system` = `~/forge`(`.claude/` rules·skills·agents·hooks) · `{project-name}` = `forge-workspace.json` 등록 경로
- **채점자 1명의 한계**: 후광효과를 막으려고 **판정을 뒤집는 주장마다 재현 명령을 붙인다.** 보고서 §0 에 실행 방식(단독 실측)을 적는다.

## Step 0: 시작 출력 `🔍 6축 통합 감사 시작: {target} (단독 실측)`

## Step 1: 기계 실측 — 스크립트 출력을 1차 근거로 인용 (`S=~/forge/shared/scripts` · `R=`target 경로 — system 이면 `~/forge`)
| 무엇 | 명령 |
|---|---|
| 구조 수치(스킬·에이전트·세션 시작 토큰·MEMORY·조건부 로딩·모델 계층화·ASI·[STOP]) | `bash $S/system-audit/measure.sh --root $R`(잴 수 없으면 `NA` — 0 과 구분) |
| evals 보유율·프롬프트 3요소 포함률(정의 정본) | `bash $S/harness-metrics.sh --json --root $R` |
| 규칙 중복률 · L1 증감 | `bash $S/rules-duplication-measure.sh` · `bash $S/l1-budget.sh` |
| 훅 배선(4레인 — 직접 세지 않는다) | `bash $S/register-forge-hooks.sh --verify` |
| 전수 테스트(고아 테스트·상시 FAIL) | `bash $S/run-all-tests.sh` |
| 차단력 실행 시험 | `bash $S/tests/destructive-guard-rm.test.sh` + 필요 시 위 실행 시험 |
| BOUNDARY 발화·오탐·override | `bash $S/boundary-metrics.sh` |
- 값이 의심스러우면 직접 다시 재고, 스크립트와 어긋나면 **직접 실측 우선 + 어긋남을 finding** 으로. 0 은 "실측 결과 0"일 수 있다.
- 재귀 grep 은 `--exclude-dir=worktrees --exclude-dir=logs` 필수(워크트리마다 하네스 사본 — 같은 파일을 N+1 번 센다).

## Step 2: 축별 설계 검토 (읽기 전용 — 정의서 `shared/docs/2026-03-30-four-engineering-disciplines.md` 해당 § 의 기법 목록만)
| 축 | 정의서 § · 점검 항목 |
|---|---|
| Agentic | §4 — Composable Patterns·ACI(에러 계약)·Agent Evals·Multi-Agent Coordination·Memory·AgentOps |
| Context | §2 — 9기법(System Prompt·단기/장기 메모리·RAG·Tool Definition·Compaction·Sub-Agent·Progressive Disclosure·Note-Taking) + 끊긴 포인터 |
| Harness | §3 — Check Chain·Guardrails 5 Rail·OWASP Agentic Top 10(실제 ENFORCED 기준)·Hooks·Evals·Observability·Rollback |
| Cost | 모델 라우팅 계층·컨텍스트 절약·MCP→CLI·디스크/로그 레인·낭비 패턴(미러 좀비·이중 등록) |
| Human-AI | 5-Level Autonomy·[STOP] 게이트·BOUNDARY 하드스톱·에스컬레이션·안티패턴(Rubber Stamping·Alert Fatigue — B3 오탐) |
- 축마다 점수(0-100)·강점·발견 ≥2(위치+이유+방법, 재현 명령 포함). 주관 판단 금지 — 측정 불가 = "N/A (런타임 데이터 필요)".

## Step 3: 중복 축 (결정론 = 스크립트, 판정 = 이 세션)
`python3 $S/audit-dup-axis.py prep --root $R --out <audit-dir>/{date}-dup-axis` → `prompt.txt` 를 읽고 이 세션이 판정해 `verdicts.json` 작성 → `python3 $S/audit-dup-axis.py report --out <같은 폴더> --verdicts <verdicts.json>` → `section.md` 를 보고서 §1.6 에 싣는다. 더해 고아 테스트(삭제된 대상을 찾는 테스트)·고아 에이전트·Hook theater·미러 좀비를 적는다.

## Step 4: 채점
1. 항목별 0(미구현)·1(부분)·2(구현, 개선 루프 없음)·3(성숙) → 축 점수 = 획득/최대×100. 전체 = Σ(축×가중치).
   가중치(%, 기본/초기/운영/스케일링): Agentic 20/25/20/15 · Context 20/25/20/15 · Harness 20/15/25/25 · Cost 20/10/15/25 · Human-AI 20/25/20/20
   단계 판별: 초기 = 스킬<20 또는 규칙<5 · 운영 = 스킬 20-50+규칙 5-15+프로덕션 배포 · 스케일링 = 멀티 프로젝트+팀 2명+ 또는 월 $500+.
2. **정량 지표 10개**(`references/report-template.md` §3 표): evals 보유율 >70% · 세션 시작 토큰 <12,000 · MEMORY 항목 <30 · 규칙 중복률 <10% · 프롬프트 구조 포함률 >70% · Hook 커버리지 >70% · OWASP 커버리지 >50% · 모델 계층화율 >60% · 조건부 로딩률 >50% · 게이트 커버리지 100%.
3. **지표 제외(폐기 기록)**: 2026-09-28 사람 결정 #1416: 계측 훅 삭제(#1358)는 의도, 지표 제외 — 도구 커버리지(`log-tool-metrics`·`usage-logger`)·게이트 승인/rubber-stamp(`gate-approval-tracker`)·override rate(`track-override-rate`). 캐시 히트율(`cache-stats.jsonl`, 로거 2026-09-24 폐기)도 제외(#1418). 이 항목들은 감점·FAIL·"미측정" 행으로 적지 않는다.
4. **트렌드**: `${FORGE_OUTPUTS:-$HOME/forge-outputs}/docs/reviews/audit/` 이전 보고서와 축별 Δ·이슈 해소율·신규 이슈 수·방향(↑↓→) 표.
5. **축간 트레이드오프**: Cost↔Harness · Agentic↔Human-AI · Context↔Cost · Harness↔Agentic · Human-AI↔Cost.
6. **이슈 통합**: CRITICAL→LOW 정렬 · cross-axis 태그 · 같은 파일 중복 합산 · 영향도 = 심각도(4/3/2/1)×영향 범위.

## Step 5: 보고서
저장: `${FORGE_OUTPUTS:-$HOME/forge-outputs}/docs/reviews/audit/{date}-system-audit[-{target}].md`(target=system 이면 suffix 생략). 템플릿 → `references/report-template.md` (§0 실행 방식 · §3 끝에 **재현 명령 모음** 필수)

## Step 6: 완료 게이트 (완료 보고 이전 필수)
`bash ~/forge/shared/scripts/verify-outputs.sh "<보고서 경로>"` — 출력 표를 완료 보고에 포함. exit 2(MISSING/0바이트) → 완료 보고 금지, 재생성 후 exit 0 에서만 진행.

## 독립 Evaluator
Read 먼저: `references/audit-common.md` §독립 Evaluator 공통. **1단계 구조 린트**:
`python3 ~/forge/shared/scripts/audit-report-structure-lint.py --skill system-audit --report "<보고서 경로>" > /tmp/audit-lint-system-audit.json; echo "lint rc=$?"`
`rc`: 1 = 구조 FAIL 확정 · 2 = 입력 오류(경로 고쳐 재실행) · 0+`residual` 없음 = PASS · 0+`residual` 있음 = 2단계.

**판정 기준 원문**(4항목 모두 충족 = PASS · 피드백 `[파일명+섹션] — [이유] → [방법]`):
1. **5축 커버** — 축별 요약 1.1~1.5/점수표에 5축 각각 점수(0-100)+발견 ≥2, N/A·빈 값 FAIL.
2. **축간 트레이드오프** — Cost vs Harness / Agentic vs Human-AI / Context vs Cost 3쌍+ "현재 균형"·"권장 방향", 빈 셀 FAIL.
3. **로드맵 P0/P1/P2** — P0(이번 주)/P1(이번 달)/P2(다음 분기) 각 액션 ≥1, 빈 섹션 FAIL. 액션이 구체적인지는 항상 residual.
4. **증거 기반 점수** — 정량 지표 대시보드 10개 지표 모두 실측값 또는 "미측정"(제외 지표는 행 없음), 빈 셀 FAIL.

**2단계 질적 판정**(residual 만): 감사자 ≠ 평가자. 메인 세션이면 `Agent(subagent_type="general-purpose", model="sonnet")` 1개에 "구조는 린트가 PASS 확정 — 다시 보지 말 것. `/tmp/audit-lint-system-audit.json` 의 residual 과 해당 번호 판정 기준 원문만 판정. PASS/FAIL + 피드백 형식." · **이 감사가 subagent 로 돌고 있으면**(깊이 2 금지) 스폰하지 말고 residual 을 완료 보고에 `미판정 residual` 로 넘겨 호출자가 판정한다.
- PASS → 완료 보고 · FAIL → 해당 부분 재감사 후 1회 재실행 · **2회 연속 FAIL → [STOP] Human 에스컬레이션**

## 실패 시 출력
- 스크립트가 없거나 rc≠0 → 그 지표는 `미측정(사유: <명령> rc=N)` 으로 적고 계속한다(감사 중단 아님). 보고서 저장 실패·Step 6 exit 2 → 완료 보고 대신 `❌ system-audit 미완료: <사유>` 1줄 + 재시도할 명령.

## 완료 보고 (Step 6 exit 0 이후에만)
```
✅ ACHCE 6축 통합 감사 완료 (단독 실측)
전체 점수: {전체점수}/100
- Agentic: {A}/100 · Context: {C}/100 · Harness: {H}/100 · Cost: {Co}/100 · Human-AI: {E}/100 · Redundancy: {dup}건/{orphan}건/{deprecated}건/{theater}건
이슈: CRITICAL {n}건 / HIGH {n}건 / MEDIUM {n}건
평가: {PASS|FAIL|미판정 residual n건}
보고서: ${FORGE_OUTPUTS:-$HOME/forge-outputs}/docs/reviews/audit/{date}-system-audit.md
```
