# 컨텍스트 & 하네스 엔지니어링 규칙

> `aux` = `rules-on-demand/context-engineering-aux.md` — 근거·원문(§context-engineering — L1 감량 전 원문)

## CLAUDE.md 작성 강제

- 새 프로젝트·폴더 진입 시 CLAUDE.md 없으면 **생성 필수**.
- 최소 섹션: 목적 / **규범 링크(주제 인덱스)** / 참조 파일 — **규범 본문 금지**(CLAUDE.md = 목차, SSoT = `rules*/`).
- 하위 `.claude/CLAUDE.md` = scope 전용 · 페르소나 = 루트 상속 + 프로젝트 우선 → aux §하위 scope 상속 정의

## 하네스 패턴 강제

**복잡도 높은 작업에서** 하네스 없이 직접 구현 금지(PGE/Teams 스킵 금지) → aux §하네스 패턴 매핑표
⚠️ 한정어 「복잡도 높은」을 빼지 마라 — 빼면 §위임 임계값(오버헤드 > 작업 → 메인 직접)과 정면 충돌한다.

## 컨텍스트 토큰 관리

- **70% 권장 / 90% 강제** `/compact`(Phase 전환이 분할점) · 착수 시 프로젝트 식별 + 목표 1줄 선언, 재개 시 handover 선확인 → aux §토큰 관리 원문
- **⚠️ `/compact` 는 스킬 전문을 전량 재주입한다** → 대형 스킬(15KB+) 2개+ 세션은 반복 `/compact` 대신 **`/forge-checkpoint` 후 새 세션 재개** → aux §/compact 한계 실측
- 예산은 `session-context-budget.sh` 훅이 상시 측정 → aux §측정 하네스
- **압축 때 무엇을 남길지도 지시한다**: **미해결·계약성 항목(요구사항·설계 결정·보안 제약·blocker)은 남기고** 나머지는 최근 가중치 → aux §압축 잔존 우선순위

## JIT 탐색 — 전체 Read 전에 grep/head 로 좁힌다

- **통째로 Read 하기 전에 `grep -n`·`head`·`sed -n '<범위>p'` 로 필요한 부분만 연다.**
- ⚠️ **L-38 과 다른 축** — L-38 = "추측 말고 **실측하라**", 이 절 = "실측하되 **좁게 열어라**". 좁게 여는 것이 **실측 생략 근거가 아니다.**
- 예외: 작은 파일·구조 전체가 필요할 때는 전량 Read.
- 근거·폐기조건 → aux §JIT 탐색 — 근거

## 도구 응답 관리 (Tool Response Pruning)

최근 5회만 전문 유지 · 2,000자+ offload(`~/.claude/offload/`) · WebSearch 상위 3 · 대용량 MCP 는 subagent 격리 → aux §도구 응답 원문

## 컨텍스트 레이어 인식 (L1~L4)

레이어 순서 위반 금지(L3 없이 L4, L2 없이 구현) → aux §L1~L4 레이어 정의표

## 핵심정보 (Project Vitals) — CLAUDE.md 필수 섹션

- 루트 CLAUDE.md에 `## 핵심정보` **필수** — 매 세션 필요한 운영정보(접속·실행·데이터소스)는 **L1 이 섹션에만** 쓰고 분리 **금지**.
- 시크릿 **평문 금지 — 위치 참조만**(`.env` 또는 secret manager ref) → aux §Vitals 시크릿 탐지 명령

## On-demand 패턴 (cascade 최소화 — P52-D)

**`rules/`** = 모든 세션 필수(High)만 · **`rules-on-demand/`** = Low/Medium · 1회용 미생성 · **의심 시 on-demand 우선.**

CLAUDE.md 100줄 초과 → 인덱스만 두고 상세는 `rules*/` 로(Vitals 제외) → aux §On-demand 배치 판정 원문

**룰 편집은 그 세션에 적용되지 않는다** — 세션 중 고친 규칙은 `/clear`·`/compact`·재시작 전까지 **이 세션이 못 본다** → aux §룰 편집 mid-session

**L1 추가 게이트**: `rules/` 규범 **신설** 시 커밋 메시지에 ①왜 매 세션 필요한가 ②`shared/scripts/l1-budget.sh` 의 `L1_GROWTH_BYTES` — 하나라도 없으면 `rules-on-demand/`. **한도 재산정은 사람만**(사유 1행 `.claude/brain/l1-baseline.jsonl`) → aux §L1 추가 게이트 근거

**기계가 볼 것 / LLM 이 볼 것** — 분할선은 **형식·개수·존재·임계값 = 기계 / 의미·타당성·새로움 = LLM**. 검수 LLM 은 기계가 이미 본 축을 다시 보지 않는다 → `rules-on-demand/machine-vs-llm-boundary.md`

## Subtraction Review (감산 리뷰)

**규칙·에이전트·스킬을 3개 이상 추가 제안할 때** ①제거 후보 식별 ②복잡도 수지(총 파일 수·토큰 예산 증감)를 함께 낸다.
순 증가 **+2 초과 = 추가 정당화 필요**. 상세 → `rules-on-demand/forge-context-engineering.md §Subtraction Review` · aux §Subtraction Review 상세
⚠️ 「3개 이상」이 이 절의 **발동 조건**이다 — 조건을 빼면 아무도 이 게이트가 있는 줄 모른다.

## 단순 검색 = subagent 위임 (권고 — 2026-07-31 강등)

**Grep·Glob·find·다중 Read 등 단순 탐색 = 위임 고려.** 4축(병렬 독립 경로·반환량 과다·메인 점유·예산 압박) 중 하나라도 강하면 위임, 모두 약하면 **메인 직접 처리**. 도구 = `Agent(subagent_type="Explore")`(정확한 단일 파일·심볼은 직접 Read).

✅ Agent 도구에 세션 제약 없다(2026-08-26 Human — 허용이지 의무 아님). 정본 `forge-core.md §병렬 실행` → aux §단순 검색 Why

### 검색 깊이별 모델 tier (2026-06-08)
- **simple**(기계적 grep/glob) → `Agent(model:"haiku")` · **middle·deep**(다중파일·로직·아키텍처) → `Agent(model:"sonnet")`
- ⚠️ **검색에 Opus 를 쓰지 않는다** — 반환량이 크고 결론만 쓰인다(`model-routing.md §워커 tier`).
- 위임 결정 시에만 적용 — "항상 subagent" 아님.
- **`model:` 명시 필수**(미명시 = 부모 상속 → 비용 누수) → aux §검색 tier 용어 구분

## Context Rot 완화 (WI-18)

→ `rules-on-demand/context-rot-mitigation.md` · aux §Context Rot 수록 항목

## Subagent 결과 검증 (L-38, 2026-05-10)

Subagent audit·리포트·apply-plan = 1차 후보. **실 코드 grep·find·cat = 2차 사실 확정.** Edit·결정 전 실측 의무.

검증 실패 시 silently 추측 정정 X. "verification failed" 명시 후 skip.

**전파 케이스 (fact laundering 방지)**: 사실 주장을 **타 워커 브리프에 넣을 때**도 동일 — 실측 재확인, 또는 `(미검증 — 착수 전 실측 필수)` 태그 + fail-closed 지시. **태그는 통과증이 아니다.** → aux §L-38 전파 케이스 원문

## 룰 신설 규약 (근거·폐기조건 의무)

`rules*/` 에 새 규범 추가 시 `근거:` 1줄 + `폐기조건:` 1줄 **필수** → aux §룰 신설 규약 근거
