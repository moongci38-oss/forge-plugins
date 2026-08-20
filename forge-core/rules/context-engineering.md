# 컨텍스트 & 하네스 엔지니어링 규칙

> 이하 `aux` = `rules-on-demand/context-engineering-aux.md`. 각 절이 막는 과거 실패 기록 → aux §Ratchet origin

## CLAUDE.md 작성 강제

- 새 프로젝트·작업 폴더 진입 시 CLAUDE.md 없으면 **생성 필수**(없는 `.claude/` 작업 = 무결성 보장 불가).
- 최소 섹션: 목적 / **규범 링크(주제 인덱스)** / 참조 파일 — **규범 본문은 CLAUDE.md에 쓰지 않는다**(CLAUDE.md = 목차, 규범 SSoT = `rules*/`. 아래 §On-demand 패턴)
- 하위 `.claude/CLAUDE.md` = scope 전용 · 프로젝트 페르소나 = 루트 상속 + 프로젝트 1절(충돌 시 프로젝트 우선) → aux §하위 scope 상속 정의

## 작업 착수 오리엔테이션 (멀티세션)

- 작업 착수 시: ① 대상 프로젝트 식별(해당 CLAUDE.md 참조) ② 목표 1줄 선언 후 진행. 세션 재개 시 handover/checkpoint 선확인(아래 §컨텍스트 토큰 관리).

## 하네스 패턴 강제

**하네스 없이 직접 구현 금지**: 복잡도 높은 작업에서 PGE/Teams 스킵 금지. 상황별 패턴 매핑표(버그수정·기획·검증·대용량 출력·병렬) → aux §하네스 패턴 매핑표

## 컨텍스트 토큰 관리

- **70% 권장 / 90% 강제** `/compact` — Wave·Phase 전환이 자연 분할점, 세션 재개는 handover 선확인. 원문 → aux §토큰 관리 원문
- **⚠️ /compact 한계**: 스킬 전문 **전량 재주입** → **대형 스킬(15KB+) 2개+ 세션은 `/compact` 반복 대신 `/forge-checkpoint` 저장 → 새 세션에서 재개**. 원문·실측 → aux §/compact 한계 실측 · §compact 한계 원문
- 예산은 `session-context-budget.sh` 훅이 상시 측정(측정 하네스). 수동 audit 명령 → aux §측정 하네스

## 도구 응답 관리 (Tool Response Pruning)

pruning 준수 — 최근 5회만 전문 유지 · 2,000자 초과 offload(`$HOME/.claude/offload/` 훅) · WebSearch 상위 3 · 대용량 MCP는 subagent 격리. 원문·근거 → aux §도구 응답 원문 · §도구 응답 관리 — 근거

## 컨텍스트 레이어 인식 (L1~L4)

레이어 순서 위반 금지 — L3 없이 L4 참조, L2 없이 구현 시작 금지. 레이어 정의표(L1 rules / L2 handover / L3 Spec / L4 reference) → aux §L1~L4 레이어 정의표

## 핵심정보 (Project Vitals) — CLAUDE.md 필수 섹션

- 모든 프로젝트 루트 CLAUDE.md에 `## 핵심정보` 섹션 **필수**. 매 세션 필요한 안정 운영정보(접속·실행·포털·마감·데이터소스)는 **이 섹션(L1)에만** 기재하고 `rules-on-demand/` 분리 **금지**(L1만 자동로드 보장 — 분리 시 세션마다 누락).
- 시크릿은 **평문 금지 — 위치 참조만**(`.env` 참조 또는 secret manager ref). 탐지 명령·표기 예시 → aux §Vitals 시크릿 탐지 명령 · §Vitals 시크릿 표기 예시

## On-demand 패턴 (cascade 최소화 — P52-D)

**`rules/`** = 모든 세션 필수(High)만. **`rules-on-demand/`** = Low/Medium 빈도. 1회용 → 미생성. 의심 시 `rules-on-demand/` 우선.

CLAUDE.md 100줄 초과 시 → 인덱스(목차)만 유지 + 상세는 `rules*/` 분리(**예외**: Vitals는 카운트 제외). 원문·배치 판정·정책 포인터 → aux §On-demand 배치 판정 원문

## Subtraction Review (감산 리뷰)

**규칙/에이전트/스킬을 3개 이상 추가 제안할 때**는 ①제거 후보 식별 ②복잡도 수지(총 파일 수·토큰 예산 증감)를 함께 낸다. 순 증가 +2 초과 = 추가 정당화 필요. 상세 → aux §Subtraction Review 상세

## 단순 검색 = subagent 위임 (권고 — 2026-07-31 강등)

**Grep·Glob·find·다중 Read 등 단순 탐색 작업 = subagent 위임 고려.**

- **위임 판단축(4개 — 하나라도 강하게 해당 시 위임)**: ① 병렬 독립 경로 실재 ② 반환량이 커서 메인에 담기 부적합 ③ 소요 시간이 길어 메인 오케스트레이터를 점유 ④ 누적 컨텍스트량이 세션 예산을 압박. 4축 모두 약하면 **도구 호출 수와 무관하게 메인 직접 처리**.
- **사용 도구**: `Agent` tool with `subagent_type="Explore"`. **예외**: 정확한 단일 파일·심볼(정확 path 알 때) → 직접 Read/grep.
- ⚠️ **세션이 AgentTool 을 금지하면 이 절도 예외**(`forge-core.md §병렬 실행` 카브아웃 동일 적용 — 2026-08-11 명시). 직접 탐색하되 보고에 "병렬 미사용(세션 설정)" 1줄. 근거·폐기조건은 정본에만 둔다(3중복 정정 2026-08-13).
- 강등 근거·폐기조건·구 임계값·spawn cap 수치·Why·선례 → aux §단순 검색 Why · §단순 검색 spawn cap·tier 적용범위

### 검색 깊이별 모델 tier (2026-06-08)
- **simple** (grep/glob/locate 기계적 탐색) → `Agent(model:"haiku")` subagent
- **middle** (다중파일·로직 추적·중간 추론) → `Agent(model:"sonnet")` subagent
- **deep** (아키텍처 이해·크로스시스템 종합·복잡 추적) → `Agent(model:"opus")` subagent
- 위 4축으로 **위임하기로 결정한 경우에만** 적용 — 메인 직접 처리를 택했으면 tier 배정 대상이 아니다("항상 subagent" 규칙 아님, 2026-08-01 자기모순 정정).
- **`model:` 명시 필수**(미명시 = 부모 모델 상속 → 비용 누수). 근거·deep search ≠ deep-research 구분 → aux §검색 tier 용어 구분

## Context Rot 완화 (WI-18)

상세 → `rules-on-demand/context-rot-mitigation.md`. 수록 항목·4-tier 표 → aux §Context Rot 수록 항목 · §Context Rot — 4-tier Context Degradation 표(임계 규범 = 위 §컨텍스트 토큰 관리).

## Subagent 결과 검증 (L-38, 2026-05-10)

Subagent audit / 자동 리포트 / apply-plan = 1차 후보. **실 코드 grep·find·cat = 2차 사실 확정.** Edit·결정 전 실측 의무.

검증 실패 시 silently 추측 정정 X. "verification failed" 명시 후 skip.

**전파 케이스 (fact laundering 방지)**: 사실 주장을 **타 워커 브리프에 넣을 때**도 동일 적용 — 실측 재확인, 또는 `(미검증 — 착수 전 실측 필수)` 태그 + fail-closed 지시 동봉. 태그는 통과증이 아니다. 원문·미준수 영향 → aux §L-38 전파 케이스 원문

사례(추측 6건 · 전파 실증) + Subagent 제약 + 메모리 카논 → aux

## 룰 신설 규약 (근거·폐기조건 의무)

`rules/`·`rules-on-demand/`에 새 규범을 추가할 때 `근거:` 1줄 + `폐기조건:` 1줄을 **반드시** 함께 쓴다. 왜 이 규약이 있는지·언제 폐기하는지 → aux §룰 신설 규약 근거
