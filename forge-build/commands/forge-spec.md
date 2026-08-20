---
description: Spec 작성 단독 명령 (옛 /sdd Phase 0~2)
argument-hint: "<기능 설명> [--spec <기존 path>] [--plan <plan dir>] [--bulk <forge-context-path>] [--waves]"
model: sonnet
group: plan
---

# /spec-write

Spec 작성 단독 실행. `/sdd` Phase 0~2 분리 명령 (AD-46).

> **상세 분리 (컨텍스트 비용 절감)**: 각 Phase 실행 세부는 `$HOME/.claude/rules-on-demand/forge-spec-phases-detail.md`에 이관. core는 절차·게이트·판정만 잔류하고, 해당 Phase 실행 시점에만 상세를 Read한다. 게이트·Iron Law 문구·강제력은 그대로 보존.

## 모델 라우팅 (2026-07-04)

| 작업 | 모델 | 방법 |
|------|------|------|
| Spec 본체 작성 | **Sonnet** | frontmatter `model: sonnet` |
| 탐색(기존 spec/ADR 충돌·데이터 스키마 확인) | **Haiku** | `Agent(model:"haiku")` |
| 고위험 전략 자문(범위/NFR) | **Fable 5**(대체 `gpt-5.6-sol`) | `advisor-strategist` — 모델은 `advisor-model-resolve.sh` 출력 |

근거: `$HOME/.claude/rules/model-routing.md §Advisor 전략 상시 가동`. advisor 모델 = `advisor-model-resolve.sh` 출력(기본 Fable 5 · 대체 `gpt-5.6-sol`) — 구 "Opus 고정(Fable 자동 없음 — forge-fix T4 한정)" 은 2026-08-12 폐기. 출력이 `gpt-*` 면 Agent 대신 `mcp__codex__codex`(read-only).

## Step 0 — Brain recall (선행 필수, 회사 두뇌 계획서 §3.6 파이프라인 회수 배선 / A4-5)

Spec 작성 착수 **전에 브레인 조회 1회**를 수행한다. 축적한 wiki·RAG 지식이 개발 중 잠들어 있는 구멍을 막는 스텝이다.

1. 기능 키워드로 `rag-search` 1회 + wiki 조회(`mcp__…__wiki_search` 또는 20-wiki Glob) 1회
2. **결과가 0건이어도 "조회함 + 0건"을 기록한다** — 브레인을 *안 물어본 것*과 *물어봤는데 없는 것*은 다르다
3. 기록(1줄):
   ```bash
   printf '{"ts":"%s","stage":"forge-spec","query":"<키워드>","hits":<n>}\n' "$(date -u +%FT%TZ)" \
     >> "${FORGE_OUTPUTS:-$HOME/forge-outputs}/.claude/audit/brain-recall.jsonl"
   ```
4. 적중 건이 있으면 Spec 본문 "선행 지식" 항목에 출처 링크로 남긴다.

> T3 미연결(강등) 세션이면 조회 결과가 팀과 다를 수 있다 — 세션 시작 배너(`t2-degraded-banner.sh`) 경고를 그대로 신뢰하고, 중요한 근거는 T3 복구 후 재조회한다.

## Step 0.1 — 라우팅 승격 게이트 (WARN 전용, 비차단)

착수 규모를 한 번 재서 "이거 한 번에 하기엔 큰데요?" 를 최대 1줄 듣는 단계다. **막지 않는다.**

```bash
bash "${FORGE_ROOT:-$HOME/forge}/shared/scripts/harness-escalation-check.sh" \
  --cmd forge-spec --fr <FR 수> --files <대상 파일 수> --domains <도메인 수>
```

권고가 나오면 `forge-core.md §병렬 실행` **라우팅 3분법 표**로 레인을 정하고, **정한 뒤 1줄 기록**한다
(미기록은 skip 이 아니라 **결측** — 이 줄이 없으면 P6 오탐률의 분자를 계산할 수 없다):

```bash
bash "${FORGE_ROOT:-$HOME/forge}/shared/scripts/harness-escalation-check.sh" \
  decision --rec-id <권고에 찍힌 rec_id> --decision <wave|teams|workflow|main>
```

끄기 `FORGE_ESCALATION_GATE=off` · 스크립트 부재·실패는 무시하고 진행(fail-open).

## Phase-hard-gate (GS-B20)

Phase 진입 전 코드 먼저 읽기 + Codex 2차 게이트:

```
Phase-hard-gate 순서:
  1. 코드 먼저 읽기 (Code-First Read)
     - 관련 모듈 구조 파악 (최소 3개 파일 Read)
     - 기존 유사 Spec + ADR 확인
     - 공유 타입·인터페이스·DB 스키마 확인
     ↓
  2. Spec 작성
     ↓
  3. Codex 2차 게이트 (자동, blocking — 가용 시)
     - codex-review --stage spec 호출
     - codex 가용 + FAIL 반환 → Spec 재작성 후 재통과 필수 (blocking 유지)
     - codex/MCP 미가용(도구 부재·인증 실패 등) → fail-open + WARN
       ("Codex 미가용 → advisory로 강등, 수동 리뷰 권고") 명시 후 Phase 진행
       (근거: `$HOME/.claude/rules/dev-workflow-rules.md` §전역 무블로킹 롤아웃 — Fail-open)
     ↓
  4. [STOP] Human 승인
     ↓
  5. /forge-implement 진입 허용
```

Phase-hard-gate 위반 = 구현 즉시 STOP + 게이트로 복귀.

## HARD GATE — Spec 승인 전 구현 절대 차단

```
[HARD GATE] Spec 미승인 상태에서 코드 작성·scaffold·파일 생성·DB 마이그레이션 = 즉시 STOP.
  이유: 미검증 설계 기반 구현 = 기술 부채 누적 + 재작업 비용.
  통과 조건: Human 승인 [STOP] 게이트 완료 + Spec 파일 존재.
```

**codebase read 의무 (Code-First Read)**: Spec 작성 전 반드시 관련 기존 코드·스키마·ADR을 Read한다.
- 기존 패턴 무시 Spec → 구현 충돌 위험
- 최소 확인: 관련 모듈 구조, 기존 유사 기능 Spec, 공유 타입/인터페이스
- **코드 읽기 전 Spec 초안 작성 금지** (Phase-hard-gate §1)

## Iron Law
설계(Spec) 승인 전 코드·scaffold·구현 액션 절대 금지. Spec 작성만.

> **Red Flags (자기합리화 차단 — 강제 행동 inline 보존)**: 감지 → **즉시 강제 이행**(reference 로드 불문): "기획서 없어도 바로 쓰자" → **Phase 0 전제조건 먼저** / "태스크는 추상 설명으로 충분" → **§8 실제 코드블록+커밋메시지 작성** / "에러 핸들링 추가라고만 적자" → **실제 try-catch 코드 작성**. 배경·추가 사례만 `rules-on-demand/forge-spec-phases-detail.md §Red Flags`.

## 실행 단계

**Phase 0 — Readiness 판정 (요건 기반 3-way 게이트)**
→ 공통 헬퍼: `/readiness-gate` 참조 (4-state 판정 + GUIDE-STOP 산출기 + ADAPT 규칙 + **§M9 세션 재진입 안전성**).
> **⟳ 세션 재진입 시**: `/readiness-gate §M9` 규약 적용 — `{domain}/_STATUS.md` read → resume/fresh 판정 → resume 리포트 출력 후 다음 미완료 M스텝부터 재개.

**Phase 0-a — 선행 Phase 게이트 (기계 검증, 선행 필수)**
```bash
bash "${FORGE_ROOT:-$HOME/forge}/shared/scripts/forge-gate-check.sh" {project} P4-ENTRY
```
`exit 1` → **즉시 GUIDE-STOP**(P3 미완). 요소 A~H 를 스캔하기 전에 이것부터 돌린다 —
재료가 다 있어도 앞 공정이 안 끝났으면 진입하지 않는다. 상세 규칙 → `/readiness-gate §선행 Phase 게이트`.

**Phase 0-b — 요소 스캔**
forge-spec 진입 계약(**표에 있는 요소 전부** — 2026-08-11 현재 A~I 9요소, `I`=선행 Phase 상태)으로
입력 스캔(파일경로|인라인텍스트|디렉토리 수용, 요소별 4-state 판정). **판정 라우팅**:

> ⚠️ **개수를 여기에 다시 적지 말고 `/readiness-gate` 표를 읽어 그 행 전부를 판정한다.**
> 2026-08-11 실사고: 계약 표에 `I`(선행 Phase 상태)를 추가했는데 이 문장이 "A~H 8요소"로
> 고정돼 있어 **신설 항목이 조회되지 않을 뻔했다**(적대적 검수 Critical). 원 사고의 근본 원인이
> "표에 없는 항목은 조회되지 않는다"였는데, 개수를 하드코딩하면 같은 실패가 반복된다.
> 표가 정본이고 이 문장은 요약이다.
- 전부 ok → **PASS** (Phase 1)
- normalize/derive만 → **ADAPT** (Phase 0.5)
- absent 1개+ → **GUIDE-STOP** (`forge-spec-readiness-{date}.md` 출력 후 정지)

**Phase 0.3 — 기획 계약 L2 대조 (폴더형 기획일 때만, WARN-first)**

대상 기획이 **폴더형**(`${FORGE_OUTPUTS:-$HOME/forge-outputs}/docs/planning/active/<slug>/`)이면
Spec 작성 전에 **흐름↔요구사항 양방향 대조**를 먼저 돌린다.

```bash
python3 "${FORGE_ROOT:-$HOME/forge}/shared/scripts/planning-contract-lint.py" <기획폴더>
```

- **폴더가 아니거나** `flow.d2`·`requirements.md` 가 없으면 린터가 그 사실만 보고하고 끝난다 —
  기존 단일 `.md` 기획 18건은 **무영향**이다.
- GAP 이 나오면 린터가 만든 **객관식 질문을 그대로** 사용자에게 제시하고, 답을 `DECISIONS.md` 에 적는다.
  **답이 없으면 권장안으로 진행하고 `미응답` 으로 기록한다** — 기획을 멈추지 않는다.
- **WARN-first**(AD-168): 린터 기본 `exit 0`. Spec 작성을 차단하지 않는다. `--strict` 만 `exit 1`.
  3주 관측 후 BLOCK 승격 검토.
- **다이어그램 인용 의무**: 기획 폴더에 `flow.d2`(또는 PRD 단계 다이어그램)가 있으면 Spec 본문에
  그 흐름을 **인용·유지**한다. PRD 단계의 시각 자산이 구현 스펙에서 끊기면, 텍스트만 남은 스펙이
  다시 "사용자 흐름을 못 읽는" 원래 문제로 돌아간다.
  근거: 2026-08-06 YT 분석 `a1UFpF3sPe4` P2(원문은 Mermaid 기준 — 도구는 Human 결정으로 **D2**).
  폐기조건: 폴더형 기획이 2분기 연속 0건이면 이 절을 되돌린다.

**Phase 0.5 — ADAPT 자동보완 분기** (absent=0, normalize/derive 감지 시)
`/readiness-gate` ADAPT 규칙: ①`normalize` → 자동 변환(무승인, 내역 1줄씩) ②`derive` → 자동 초안 + `vetted_by: ai-inferred` 태깅 → **[STOP] 1회 일괄 확인** ③확인 후 Phase 1. **판정 결과: ADAPT 통과 시 Phase 1 진행**.

**Phase 0.7 — 가정 표면화 + Ground-Truth 실측 (DB + FE)**
암묵 가정 추출 → 사용자 확인. DB 스키마 의존·기존 FE 수정 감지 시 권위 소스 실측을 **blocking**으로 수행(실측 불가 → GUIDE-STOP, stale/SSoT불명확 → [STOP]/Human, 실측 결과 Phase 2 박제).
> 실행 시 상세 Read: `rules-on-demand/forge-spec-phases-detail.md §Phase 0.7 DB/FE 실측 세부`.

**Phase 1 — 기존 Spec 확인**
- `.specify/specs/` 탐색. 동일 기능 Spec 존재 시 사용자 확인 [STOP] → 덮어쓰기 or 신규.

**Phase 2 — Spec 작성**
- `spec-writer` 에이전트 호출 (정의: `agents/spec-writer-base.md`, 레지스트리 name: `spec-writer`).
- 인자: `--spec <path>` 기존 갱신 / `--plan <dir>` 계획서 디렉토리 / `--bulk <path>` 대량 모드.
- 저장: `.specify/specs/YYYY-MM-DD-{slug}.md` (항상 SSoT).
- **도메인 폴더 연계**: `--plan <dir>`가 도메인 폴더(`_registry.yaml`/`00-도메인개요.md` 존재)면 → `{domain}/spec/YYYY-MM-DD-{slug}.md`에도 미러 저장.
- **미러 헤더 의무 + §데이터모델 provenance 태그**: 미러 저장·DB 스키마 §데이터모델 작성 시 필수. 실행 시 상세 Read: `rules-on-demand/forge-spec-phases-detail.md §Phase 2 미러 헤더·provenance`.
> **원칙 — Spec은 1회성 handoff가 아니다**: human request → 기술 탐색 → mockup/explainer → refine → 재구현 → implementation notes 축적 → 필요 시 re-spec으로 이어지는 반복 프로세스다. 구현 중 발견된 기술 제약이 implementation notes로 축적되면 Human 승인 하 재-spec 사이클(`dev-workflow-rules.md` §Spec관리 (B) 배포 후 노후 예외와 연결)로 되먹인다. 단, AI가 승인 없이 자동으로 Spec을 변경하는 것은 여전히 금지 — 재-spec은 항상 Human 승인 게이트를 거친다.


**Phase 2-W — 도메인 분해 병렬 작성 (`--waves` 옵트인, 2026-08-14 신설)**

기본은 지금까지처럼 **단일 패스**다. 스펙이 여러 도메인에 걸칠 때만 사람이 `--waves` 를 붙여 켠다.
쉽게 말하면: 도메인마다 한 명씩 붙여 동시에 쓰게 하고 → 다 모인 뒤 "서로 말이 맞는지" 한 번 대조하고
→ 마지막에 기존 최종 검수를 그대로 태운다.

- **발동 조건**: `--waves` **그리고 도메인 ≥3**. 스크립트가 실제로 보는 값은 **도메인 개수 하나**이며
  (`domains.length < 3` → `status:"skip"`), FR 수는 규모 참고 지표일 뿐 판정에 쓰이지 않는다.
  둘 중 하나라도 아니면 단일 패스(자동 발동 없음 — 자동화 승격은 P6 실측 후 별도 결정).
  > 2026-08-14 정정: 종전 문구 "FR·도메인 ≥3" 은 FR 과 도메인 중 어느 쪽이 기준인지 모호했다(cr-double LOW).
- **도메인 이름 규약(하드 게이트)**: `^[a-z0-9][a-z0-9_-]{0,63}$` · **중복 불가**. 이 값이 산출 파일
  경로와 워커 프롬프트에 그대로 들어가므로, 슬래시·`..`·제어문자는 **에이전트를 띄우기 전에** 거부한다
  (`status:"stop"` + `invalidNames`/`duplicateNames`). 재현: 위 Workflow 를 `name:"../../evil"` 로 호출 → 0 에이전트 stop.
- **실행 레인 = Workflow**(Agent Teams 아님). 근거: 3단계+ barrier 구조 + 주관 판단 검증이 섞여
  AD-114 두 축에 걸친다 → `forge-core.md §병렬 실행` 라우팅 3분법 표 **각주 ①(상위 승격)**.
  ```
  Workflow({ scriptPath: "${FORGE_ROOT:-$HOME/forge}/shared/scripts/forge-spec-waves.workflow.js",
             args: { specDir: ".specify/specs", domains: [{name, brief}, …], requestId } })
  ```
- **파일 소유권**: Wave 1 은 도메인당 `{domain}.spec.md` **하나만** 쓴다(남의 도메인 파일 수정 금지).
  FR id 는 `FR-{domain}-N` 접두로 전역 충돌을 피한다.
- **팬인 계약**: ①레그 실패 시 **그 레그만 1회 재시도** → 그래도 실패가 남으면 **[STOP]**(2/3 으로
  Wave 2 진입 금지 — spec 은 전량이 있어야 교차 검수가 의미 있다. 부분 산출물은 보고에 명시)
  ②Wave 3 은 **spec 전량 + 교차 검수 리포트를 함께** 받는다(도메인별 개별 호출 금지 — 교차 결함은
  개별 spec 만 봐서는 보이지 않는다).
- **게이트 다중화 금지**: M1 Intent-Lock·기존 spec 확인 [STOP]·M7 EXIT 등 스펙당 게이트는 **요청 단위
  1회**로 묶는다. 도메인 수만큼 [STOP] 이 반복되면 승인 피로로 게이트가 형식화된다(rubber-stamp).
  도메인별로 갈라지는 것은 spec 본문뿐이다. **Phase-hard-gate 도 단일 게이트를 유지**한다.
- **Wave 2 는 WARN-first** — 불일치가 나와도 여기서 막지 않는다(신규 hard-block 신설 아님).
  **Wave 3 codex-review 는 기존 blocking 게이트 그대로**(현행 유지이지 신규 차단이 아니다).
- **반환값을 반드시 검사한다 — `status` 가 계약이다**(2026-08-14 정합 수정):

  | status | 의미 | 호출측 행동 |
  |---|---|---|
  | `ok` | Wave3 verdict=PASS | 다음 Phase 진행 |
  | `skip` | 도메인 3 미만 — 대상 아님 | 단일 패스로 진행 |
  | `stop` | 아래 4 사유 중 하나 | **[STOP]** — 사람에게 넘긴다 |

  `stop` 사유: ①도메인 이름 규약 위반(스폰 전 차단) ②레그 재시도 후에도 실패 잔존(`failedDomains`)
  ③**Wave3 verdict=FAIL** ④**Wave3 결과 부재**(레그 사망 — 결과 없음을 PASS 로 읽지 않는다, fail-closed).
  > ③④는 2026-08-14 cr-double HIGH 적발분이다: 종전 코드는 verdict 가 FAIL 이어도 `status:"ok"` 를
  > 반환해 **"blocking 게이트"라는 이 문서의 서술과 코드가 어긋나 있었다.** 게이트라고 써 놓고
  > 통과시키면 그 게이트는 장식이다.

**Phase 2.5 — HTML 시각화 옵션 (복잡도 High Spec)**
아키텍처 다이어그램·UI 옵션·상태 전이 포함 Spec → HTML 병행 제안. 단순 Spec은 Markdown만.
> 실행 시 상세 Read: `rules-on-demand/forge-spec-phases-detail.md §Phase 2.5 HTML 시각화`.

**Phase 2.6 — 완결성체인 게이트 (A2, WARN)**
Spec 작성 후 PRD→FR→AC(acceptance_predicate)→디자인 아티팩트 체인 검증: FR 파생(끊긴 노드=0), acceptance_predicate 보유+측정가능성, 프론트 화면 매핑(oracle-manifest), UI-상태 완결성 서브체크(G5), 시각 바인딩 서브체크(F3). **판정 결과: 끊긴 노드/비측정 predicate/UI-상태 갭 → WARN 보고(BLOCK 아님)**.
> 실행 시 상세 Read (측정가능성 a/b/c 기준·G5·F3 절차): `rules-on-demand/forge-spec-phases-detail.md §Phase 2.6 완결성체인 세부`.

**Phase 2.7 — conflict-detection pre-write (WI-08)**
Spec 작성 **전** 기존 Spec·ADR 충돌 체크 의무. **판정 결과: 충돌 발견 → [STOP] 해소 후 진행 / 없으면 `conflict-detection: PASS`**.
> 실행 시 상세 Read: `rules-on-demand/forge-spec-phases-detail.md §Phase 2.7 conflict-detection`.

**Phase 2.8 — grey-area batch proposal (WI-07)**
회색 지대(scope 불명확·옵션 분기) 발견 시 DISCOVERY.md 생성 + MVP 수직 슬라이스 우선 제안. **판정 결과: 사용자 확인 후 Spec 반영(자의 판단 해소 금지)**.
> 실행 시 상세 Read: `rules-on-demand/forge-spec-phases-detail.md §Phase 2.8 grey-area batch`.

**Advisor 조언 (조건부)** — `FORGE_ADVISOR_AUTO≠off` + 트리거(spec 경계/범위 모호 **또는** NFR 충돌) 시 `advisor-strategist` 호출. PASS(범위 명확 + NFR 충돌 없음) → 스킵. 조언은 참고용 — Phase 2 Human 승인 게이트에서 최종 결정.
> 실행 시 상세 Read (프롬프트 템플릿): `rules-on-demand/forge-spec-phases-detail.md §Advisor 조언 프롬프트 템플릿`.

**Phase 2.9 — AI-integration mode (WI-29)**
AI/LLM 기능 포함 Spec 감지(`LLM`/`AI`/`embedding`/`vector`/`RAG` 키워드, `model` 단독 false-trigger 방지) 시 4-agent sequential pipeline(framework-selector → researcher → domain-researcher → eval-planner) 실행 → 산출물 `AI-SPEC.md`(locked design contract, Edit-only). AI 기능 없는 Spec은 생략.
> 실행 시 상세 Read (파이프라인 전체·AI-SPEC.md 형식): `rules-on-demand/forge-spec-phases-detail.md §Phase 2.9 AI-integration 파이프라인`.
> ⚠️ 조사 축약 체크: researcher/domain-researcher 단계를 스킵·축약했다면 spec 상단에 `research: abbreviated`로 명시하고 근거를 1줄 남긴다 — 무언 축약 금지 (online-mode M-4).
> ⚠️ **수치 축약 금지**: spec 본문의 수량·금액·임계값은 `N만`·`N억`·`Nk` 같은 축약 표기 대신
> **절대값을 병기**한다(예: `월 3만` → `월 30,000건(3만)`). 축약 표기는 자릿수 오독이 일어나도
> 요구사항이 10배 어긋난 채 리뷰를 통과한다 — 숫자가 틀렸다는 신호가 문장 어디에도 남지 않기
> 때문이다. Phase 2.6 측정가능성 검사에서 축약 단독 표기를 발견하면 WARN 으로 되돌린다.
> (이 항목은 §조사 축약과 다른 주제다 — 그쪽은 *공정* 축약, 이쪽은 *표기* 축약이다.)
>
> ⚠️ 수치와 그 조사 근거를 **한 문자열로 결합하지 말 것**: `mem_level=1 (실유저)` 처럼 수치와 근거를 분리 표기한다. 결합해 쓰면 수치만 인용될 때 근거가 떨어져 나가 출처 없는 상수가 된다 (online-mode M-4 원 요구 — 위 '조사 축약' 항목은 같은 태그가 붙었으나 다른 주제였다).

**M7 EXIT self-check** (`/readiness-gate §M7`): P4 EXIT 전수 확인 → `forge-spec-exit-readiness-{date}.md` 자동생성. **판정 결과: FAIL = [STOP] + 보강 작업지시**. EXIT ②는 존재 확인 + Phase 2.6 측정가능성 통과(WARN=0) 모두 충족해야 PASS.
> 실행 시 상세 Read (EXIT ② 판정 강화 해설): `rules-on-demand/forge-spec-phases-detail.md §M7 EXIT 판정 강화`.

**[STOP] Human 검토 + 승인 — M1 Intent-Lock** (매 실행 필수 — 잔류)
- AI는 승인 요청과 함께 **4줄 계약** 제시: ①이 기능이 보장하는 동작 ②왜(비즈니스/시스템 이유) ③시스템 어디에 어떻게 붙나 ④핵심 결정·트레이드오프.
- Human에게 본인 말 restate 또는 교정을 요청한다. restate 후의 짧은 긍정("ㅇㅇ")은 유효 승인.
- restate 없이 승인만 오면 **차단하지 않되(WARN-first)** spec 헤더에 `intent: unconfirmed` 표기 + `${FORGE_OUTPUTS:-$HOME/forge-outputs}/.claude/audit/complement-protocol.jsonl`에 `{ts, mech:"M1", event:"intent_unconfirmed", spec, session}` append (기록 실패해도 진행 — fail-open).
- restate 수신 시 `event:"restate_received"` append + spec 헤더 `intent: confirmed`.
- kill: 사용자가 "M1 끄자" 한마디면 이 절차 skip (행동 규율 — env 불필요).
- Spec 승인 없이 `/forge-implement` 진입 금지 (PHASE4-IRON-1).

## 다음 단계

```
/forge-implement    # P5 구현 (시나리오 라우팅)
```

## Exit 코드

| 코드 | 의미 |
|:---:|------|
| 0 | Spec 작성 완료 + Human 승인 |
| 1 | 전제조건 미충족 (기획서/계획서 없음) |
| 2 | spec-writer 에이전트 실패 |
