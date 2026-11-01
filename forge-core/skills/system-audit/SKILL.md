---
name: system-audit
description: "12축 AI 시스템 감사(실측 채점 · 보안·군살 필수) — 전체 역량 점검을 요청할 때."
argument-hint: "[target: system|{project-name}]"
context: fork
model: opus
---

> **저장 경로 앵커**: 보고서 경로는 반드시 `${FORGE_OUTPUTS:-$HOME/forge-outputs}/` 로 시작(cwd 상대 금지) → `references/audit-common.md` §저장 경로 앵커

**역할**: 한 세션(또는 에이전트 1개)이 12축(점수 10축 + 판정 2축: 12 Security · 13 Bloat)+중복을 **직접 실측**하고 채점·보고서까지 쓰는 단독 감사자. 축 에이전트·Workflow 는 없다.
**컨텍스트**: 대상 레포의 `.claude/` 전체 · `~/.claude` 전체(크기·설정·권한 비트 — 내용은 측정 스크립트가 정한 것만) · 이전 감사 보고서. **출력**: 점수 10축·보안 축·군살 축·필수 점검 13항목·축간 트레이드오프·통합 로드맵 보고서 1개(Step 5 경로).
**Evaluator 원칙(관대 금지)** → 실행 전 반드시 Read: `references/audit-common.md` §Evaluator 핵심 원칙
**방식**: 단독 실측. 측정은 진입점 1개(`measure.sh`)가 전부 돌리고 이 세션은 판정만 한다 — 측정을 끄는 옵션·따로 부르는 명령은 없다. 축 정의서: `shared/docs/2026-03-30-four-engineering-disciplines.md` · `$FORGE_OUTPUTS/docs/tech/2026-03-16-5-axis-ai-analysis-framework.md`

- **감사 유형**(모든 지표에 명시): 실측(스크립트·Grep·wc) · 추정(글자→토큰 등) · 설계 검토(판단) · 미측정(N/A, 런타임 데이터 필요)
- **강제 수준**: ENFORCED(훅이 exit 2 로 차단, 100%) · GUIDED(규칙만, 70%) · PAPER(감사에만 존재, "미적용" 표기·점수 제외)
  - ⚠️ 차단력은 grep 이 아니라 **실행 시험**으로 판정: `echo '{"tool_input":{...}}' | bash <훅> ; echo "EXIT=$?"` (페이로드는 파일로 넘긴다 — 명령줄에 직접 쓰면 가드가 감사 명령 자체에 반응)
- **인자**: `$ARGUMENTS` 첫 단어 = target(미입력 `system`). `system` = `~/forge` · `{project-name}` = `forge-workspace.json` 등록 경로(그 레포의 `.claude` 를 같은 표로 잰다)
- **채점자 1명의 한계**: 후광효과를 막으려고 **판정을 뒤집는 주장마다 재현 명령을 붙인다.** 보고서 §0 에 실행 방식(단독 실측)을 적는다.

## Step 0: 시작 출력 `🔍 12축 통합 감사 시작: {target} (단독 실측)`

## Step 1: 기계 실측 — 스크립트 출력을 1차 근거로 인용 (`S=~/forge/shared/scripts` · `R=`target 경로 — system 이면 `~/forge`)
| 무엇 | 명령 |
|---|---|
| 구조 수치 + 군살 `BLOAT_*` + 보안 `SEC_*` — 한 번에 전부 | `bash $S/system-audit/measure.sh --root $R > <audit-dir>/{date}-measure.txt`(잴 수 없으면 `NA(까닭)` — 0 과 구분 · 이 파일이 Step 6 의 대조 원문) |
| evals 보유율·프롬프트 3요소 포함률(정의 정본) | `bash $S/harness-metrics.sh --json --root $R` |
| 규칙 중복률 · L1 증감 | `bash $S/rules-duplication-measure.sh` · `bash $S/l1-budget.sh` |
| 훅 배선(4레인 — 직접 세지 않는다 · 안 도는 훅 수 = `BLOAT_HOOKS_DEAD_N`) | `bash $S/register-forge-hooks.sh --verify` |
| 전수 테스트(고아 테스트·상시 FAIL) | `bash $S/run-all-tests.sh` |
| 차단력 실행 시험 | 핵심 가드 = `SEC_GUARD` 줄(등록 + 가드 시험 결과) · 그 밖은 위 실행 시험 |
| BOUNDARY 발화·오탐·override | `bash $S/boundary-metrics.sh` |
- 값이 의심스러우면 직접 다시 재고, 스크립트와 어긋나면 **직접 실측 우선 + 어긋남을 finding** 으로. 0 은 "실측 결과 0"일 수 있다.
- 재귀 grep 은 `--exclude-dir=worktrees --exclude-dir=logs` 필수(워크트리마다 하네스 사본 — 같은 파일을 N+1 번 센다).
- Step 6 을 통과하면 `python3 $S/system-audit/bloat.py --root $R --save-baseline` 으로 다음 회차의 "직전 대비" 기준을 남긴다.

## Step 2: 축별 설계 검토 (읽기 전용 — 정의서 해당 § 의 기법 목록만)
점수 축마다 0~3점 항목 ≥4 · 재현 명령 포함. 축 번호는 보고서 §1 소제목 번호와 같다(1.6 = 중복).
| 축 | 정의서 § · 점검 항목 |
|---|---|
| 1 Agentic | §4 — Composable Patterns·ACI(에러 계약)·Agent Evals·Multi-Agent Coordination·Memory·AgentOps |
| 2 Context | §2 — 9기법(System Prompt·단기/장기 메모리·RAG·Tool Definition·Compaction·Sub-Agent·Progressive Disclosure·Note-Taking) + 끊긴 포인터 |
| 3 Harness | §3 — Check Chain·Guardrails 5 Rail·Hooks·Evals·Observability·Rollback(보안은 12 Security 축 — 여기서 다시 채점하지 않는다) |
| 4 Cost | 모델 라우팅 계층·컨텍스트 절약·MCP→CLI·디스크/로그 레인·낭비 패턴(미러 좀비·이중 등록) |
| 5 Human-AI | 5-Level Autonomy·[STOP] 게이트·BOUNDARY 하드스톱·에스컬레이션·안티패턴(Rubber Stamping·Alert Fatigue — B3 오탐) |
| 7 Prompt | §1 — evals 커버리지(`validate-evals.py`)·description 트리거 정확도·`skill-ablation.py` 결과·지시문 중복·길이·평가(LLM-judge·Regression 레인) 실제 실행 여부 |
| 8 Loop | §5 — 검수 재귀 횟수(review-brief 2회 차단)·버스 재전송 중앙값(`BUS_CUT_7D`)·데몬 회차 성공률(todo-dispatch·update-watch 로그)·plateau 승격·`loop-kernel.js` 멈춤 조건 테스트 |
| 9 Graph | §6 — **작업 흐름 그래프**(노드=단계·에이전트·엣지=전이·조건·상태): 파이프라인(P1~P7·spec→implement→pr) 상태·전이 명시·관문이 조건 엣지로 동작(실행 시험)·병렬 fan-out·재개(Workflow pipeline/resume·forge-checkpoint)·막다른 노드 수(미소비 체크포인트·`BUS_DEAD`)·흐름 관측. ⚠️ 지식그래프 사용률이 아니다(그건 Compound) |
| 10 Compound | §7 — learnings 재사용률(`recall-context.sh --health`)·지식그래프(gitnexus·graphify·위키) 색인 신선도·호출률(`FEATURE_USE`)·깨진 링크 수·직전 감사 권장 이행률·같은 지적 반복 횟수·방 qa wisdom 축적 수·하네스 갭 종결률 |
| 11 Distribution | §8 — 안정판 나이(`team-stable-promote.sh --status`)·PC 별 판 차이(`pc-status.sh`)·자동 업데이트 켜짐(`update:` 줄)·boot-check DOWN 수·미러 drift(`forge-update.sh --check`) |
| 12 Security(독립·필수) | OWASP Top 10 for Agentic Applications 2026 — ASI01 Agent Goal Hijack · ASI02 Tool Misuse · ASI03 Identity & Privilege Abuse · ASI04 Agentic Supply Chain Vulnerabilities · ASI05 Unexpected Code Execution · ASI06 Memory & Context Poisoning · ASI07 Insecure Inter-Agent Communication · ASI08 Cascading Failures · ASI09 Human-Agent Trust Exploitation · ASI10 Rogue Agents. 근거 = `SEC_*` 줄(가드는 **등록 + 실행 시험** — 문서·설정 존재는 증거가 아니다). `SEC_NOT_MEASURED` 항목은 이 세션이 읽고 항목마다 판정한다. 더해 본다: 설정 변경 감시·권한 모드·우회 예약 작업·샌드박스 · 강제 계층(금지·승인 규칙마다 코드 관문인지 지시문뿐인지 — 지시문뿐이면 보안 통제로 세지 않는다) · 경로 우회 동치성(셸·스크립트·MCP·브라우저) · 영속 주입 채널(규칙·스킬·메모리·wisdom 에 쓰는 길마다 사람 검토·출처) · 주장 검증(문서가 "막는다"고 한 것을 실행 시험으로) · 자격 격리(`SEC_CRED_FILE`) |
| 13 Bloat(판정) | `.claude` 전체 · `~/.claude` 전체 · `dev/global-rules` 의 `BLOAT_*` 줄 — 폴더별 파일·용량·직전 대비(`BLOAT_ENTRY`) · 큰 지침 · 안 도는 훅 · 훅 주석 비중 · 백업·보관·덤프 · 원본↔사본 고아·이중 로드 · git 밖 누적·워크트리·치우는 장치 · 학습 기록(사용 기록 비중·기한 넘은 줄·등급 미기재·GC 적용일) |
- 점수 축(1~5·7~11)마다 점수(0-100)·강점·발견 ≥2(위치+이유+방법, 재현 명령 포함). 주관 판단 금지 — 측정 불가 = "N/A (런타임 데이터 필요)".
- 12 Security · 13 Bloat 은 점수가 아니라 **판정**(통과 / 통과 아님)이다. 12 = ASI 행마다 판정·등급(CRITICAL~LOW) · 13 = 안 도는 훅 > 0 또는 백업·보관 > 0(또는 `NA`)이면 통과 아님 — 의도적 비활성은 까닭이 적힌 목록에 있는 것만 인정한다.
- **필수 점검 13항목**(`references/report-template.md` §필수 점검 13항목)을 실측값·직전 대비·판정으로 전부 채운다.

## Step 3: 중복 축 (축 6 · 결정론 = 스크립트, 판정 = 이 세션)
`python3 $S/audit-dup-axis.py prep --root $R --out <audit-dir>/{date}-dup-axis` → `prompt.txt` 를 읽고 이 세션이 판정해 `verdicts.json` 작성 → `python3 $S/audit-dup-axis.py report --out <같은 폴더> --verdicts <verdicts.json>` → `section.md` 를 보고서 §1.6 에 싣는다. 더해 고아 테스트(삭제된 대상을 찾는 테스트)·고아 에이전트·Hook theater·미러 좀비를 적는다.

## Step 4: 채점
1. 점수 10축: 항목별 0(미구현)·1(부분)·2(구현, 개선 루프 없음)·3(성숙) → 축 점수 = 획득/최대×100. 전체 = Σ(축×가중치).
   가중치(%, 기본/초기/운영/스케일링 — 단계마다 합 100): Agentic 12/15/12/10 · Context 12/15/12/10 · Harness 14/10/15/15 · Cost 10/6/10/14 · Human-AI 10/15/10/10 · Prompt 8/10/8/6 · Loop 8/7/8/8 · Graph 8/7/8/7 · Compound 10/8/9/10 · Distribution 8/7/8/10
   단계 판별: 초기 = 스킬<20 또는 규칙<5 · 운영 = 스킬 20-50+규칙 5-15+프로덕션 배포 · 스케일링 = 멀티 프로젝트+팀 2명+ 또는 월 $500+.
2. **12 Security 은 가중치가 없고 다른 축 점수와 평균 내지 않는다.** 보안 축에 CRITICAL·HIGH 가 1건이라도 있으면 보안 축 판정과 **감사 총평은 통과가 아니다**(전체 점수가 높아도). 13 Bloat 도 가중치 없이 판정만 한다.
3. **정량 지표 10개**(`references/report-template.md` §3 표).
4. **트렌드**: `${FORGE_OUTPUTS:-$HOME/forge-outputs}/docs/reviews/audit/` 이전 보고서와 축별 Δ·이슈 해소율·신규 이슈 수·방향(↑↓→) 표. 필수 13항목의 직전 대비는 `BLOAT_ENTRY` 증감 칸을 쓴다.
5. **축간 트레이드오프**: Cost↔Harness · Agentic↔Human-AI · Context↔Cost · Harness↔Agentic · Human-AI↔Cost · Loop↔Cost · Distribution↔Harness.
6. **이슈 통합**: CRITICAL→LOW 정렬 · cross-axis 태그 · 같은 파일 중복 합산 · 영향도 = 심각도(4/3/2/1)×영향 범위.

## Step 5: 보고서
저장: `${FORGE_OUTPUTS:-$HOME/forge-outputs}/docs/reviews/audit/{date}-system-audit[-{target}].md`(target=system 이면 suffix 생략). 템플릿 → `references/report-template.md` (§0 실행 방식 · Executive Summary 의 **감사 총평** 줄 · §1.1~1.13(1.6 = 중복 · 1.12 Security · 1.13 Bloat) · §필수 점검 13항목 · §3 끝에 **재현 명령 모음** 필수)

## Step 6: 완료 게이트 (완료 보고 이전 필수 — 둘 다 rc 0 이어야 완료)
1. `bash ~/forge/shared/scripts/verify-outputs.sh "<보고서 경로>"` — 출력 표를 완료 보고에 포함. exit 2(MISSING/0바이트) → 완료 보고 금지, 재생성 후 exit 0 에서만 진행.
2. 아래 독립 Evaluator 1단계 구조 린트(`--measure` 필수) — rc 1 이면 완료 보고 금지.

## 독립 Evaluator
Read 먼저: `references/audit-common.md` §독립 Evaluator 공통. **1단계 구조 린트**:
`python3 ~/forge/shared/scripts/audit-report-structure-lint.py --skill system-audit --report "<보고서 경로>" --measure "<audit-dir>/{date}-measure.txt" > /tmp/audit-lint-system-audit.json; echo "lint rc=$?"`

**판정 기준 원문**(8항목 모두 충족 = PASS · 피드백 `[파일명+섹션] — [이유] → [방법]`):
1. **점수 10축 커버** — 축별 요약 1.1~1.5·1.7~1.11/점수표에 10축 각각 점수(0-100)+발견 ≥2, N/A·빈 값 FAIL.
2. **축간 트레이드오프** — Cost vs Harness / Agentic vs Human-AI / Context vs Cost 3쌍+ "현재 균형"·"권장 방향", 빈 셀 FAIL.
3. **로드맵 P0/P1/P2** — P0(이번 주)/P1(이번 달)/P2(다음 분기) 각 액션 ≥1, 빈 섹션 FAIL. 액션이 구체적인지는 항상 residual.
4. **증거 기반 점수** — 정량 지표 대시보드 10개 지표 모두 실측값 또는 "미측정"(제외 지표는 행 없음), 빈 셀 FAIL.
5. **12 Security 축** — §1.12 절 · ASI01~10 행 · `판정 · CRITICAL n · HIGH n` 줄 · CRITICAL·HIGH ≥1 인데 축이나 감사 총평이 통과면 FAIL · `SEC_NOT_MEASURED` 항목마다 세션 판정 빈 칸 FAIL.
6. **13 Bloat 축** — §1.13 절과 판정 줄 · 안 도는 훅·백업(프로젝트·전역) > 0 또는 `NA` 인데 통과면 FAIL.
7. **필수 점검 13항목** — 행 1~13 · 실측값·판정 빈 칸 FAIL · 실측값 `NA` 인데 통과면 FAIL.
8. **측정 원문 대조** — `--measure` 없음 · 필수 `BLOAT_*`·`SEC_*` 줄 누락 · `*_ERROR` 줄 · `NA` 줄을 통과로 인용(또는 인용 없음)이면 FAIL.

**2단계 질적 판정**(residual 만): 감사자 ≠ 평가자. 메인 세션이면 `Agent(subagent_type="general-purpose", model="sonnet")` 1개에 "구조는 린트가 PASS 확정 — 다시 보지 말 것. `/tmp/audit-lint-system-audit.json` 의 residual 과 해당 번호 판정 기준 원문만 판정. PASS/FAIL + 피드백 형식." · **이 감사가 subagent 로 돌고 있으면**(깊이 2 금지) 스폰하지 말고 residual 을 완료 보고에 `미판정 residual` 로 넘겨 호출자가 판정한다.
- PASS → 완료 보고 · FAIL → 해당 부분 재감사 후 1회 재실행 · **2회 연속 FAIL → [STOP] Human 에스컬레이션**

## 실패 시 출력
- 스크립트가 없거나 rc≠0 → 그 지표는 `미측정(사유: <명령> rc=N)` 으로 적고 계속한다(감사 중단 아님 — 단 `BLOAT_*`·`SEC_*` 가 빠지면 Step 6 이 완료를 막는다). 보고서 저장 실패·Step 6 rc≠0 → 완료 보고 대신 `❌ system-audit 미완료: <사유>` 1줄 + 재시도할 명령.

## 완료 보고 (Step 6 둘 다 rc 0 이후에만)
```
✅ 12축 통합 감사 완료 (단독 실측)
감사 총평: {통과|통과 아님} — 보안 축 CRITICAL {n} · HIGH {n}
전체 점수(점수 10축 가중): {전체점수}/100
- Agentic: {A}/100 · Context: {C}/100 · Harness: {H}/100 · Cost: {Co}/100 · Human-AI: {E}/100
- Prompt: {P}/100 · Loop: {L}/100 · Graph: {G}/100 · Compound: {Cp}/100 · Distribution: {D}/100 · Redundancy: {dup}건/{orphan}건/{deprecated}건/{theater}건
- Security: {통과|통과 아님} · Bloat: {통과|통과 아님} · 필수 13항목 통과 {n}/13
이슈: CRITICAL {n}건 / HIGH {n}건 / MEDIUM {n}건
평가: {PASS|FAIL|미판정 residual n건}
보고서: ${FORGE_OUTPUTS:-$HOME/forge-outputs}/docs/reviews/audit/{date}-system-audit.md
```
