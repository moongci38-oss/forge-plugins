---
description: Spec 작성 단독 명령 (옛 /sdd Phase 0~2)
argument-hint: "<기능 설명> [--spec <기존 path>] [--plan <plan dir>] [--bulk <forge-context-path>]"
model: sonnet
group: plan
---

# /spec-write

Spec 작성 단독 실행. `/sdd` Phase 0~2 분리 명령 (AD-46).

> **상세 분리 (컨텍스트 비용 절감)**: 각 Phase 실행 세부는 `~/.claude/rules-on-demand/forge-spec-phases-detail.md`에 이관. core는 절차·게이트·판정만 잔류하고, 해당 Phase 실행 시점에만 상세를 Read한다. 게이트·Iron Law 문구·강제력은 그대로 보존.

## 모델 라우팅 (2026-07-04)

| 작업 | 모델 | 방법 |
|------|------|------|
| Spec 본체 작성 | **Sonnet** | frontmatter `model: sonnet` |
| 탐색(기존 spec/ADR 충돌·데이터 스키마 확인) | **Haiku** | `Agent(model:"haiku")` |
| 고위험 전략 자문(범위/NFR) | **Opus** | `advisor-strategist` |

근거: `~/.claude/rules/model-routing.md`. advisor=Opus 고정(Fable 자동 없음 — forge-fix T4 한정).

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
       (근거: `~/.claude/rules/dev-workflow-rules.md` §전역 무블로킹 롤아웃 — Fail-open)
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

forge-spec 진입 계약(A~H 8요소)으로 입력 스캔(파일경로|인라인텍스트|디렉토리 수용, 요소별 4-state 판정). **판정 라우팅**:
- 전부 ok → **PASS** (Phase 1)
- normalize/derive만 → **ADAPT** (Phase 0.5)
- absent 1개+ → **GUIDE-STOP** (`forge-spec-readiness-{date}.md` 출력 후 정지)

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
