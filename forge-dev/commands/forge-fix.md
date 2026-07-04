---
description: 버그 수정 통합 파이프라인 단일 진입점 — 4-스테이지(조사·재현→리포트→수정→검수) + 게이트 R/G 강제, 실브라우저·실DB 검증 항상 강제 (plan v1.1, 2026-07-03)
allowed-tools: Bash, Read, Write, Edit, Glob, Grep, Agent
argument-hint: "<버그 설명>" | --scan <URL> | --loop "<종료조건>"
model: sonnet
group: implement
---
> **⚠️ 실행 모드 확인**: 이 커맨드는 쓰기 모드에서만 정상 동작합니다. Plan mode 감지 시 즉시 [STOP] — "Escape로 plan mode 해제 후 재실행하세요."

> **plan v1.1 (2026-07-03, SSoT)**: `11-platform/pipelines/forge-dev/2026-07-03-v1-bugfix-pipeline-unification/plan.md`. `/forge-fix` = **버그 수정 통합 파이프라인의 유일 진입점(Lane A)**. investigate·bug-report·healer를 4-스테이지 루틴으로 흡수한다. **검증(조사 RED + 검수 GREEN)은 버그 규모·모드 무관 항상 강제** — "hotfix라서 검증을 생략한다" 같은 경량 우회는 존재하지 않는다(구 AD-95 `qa --mode=hotfix` wrapper 폐지).

# /forge-fix

버그 수정을 처리하는 **단일 진입 커맨드**. 알려진 버그 1건, 미지 버그 다발 스캔, 종료조건까지의 N-버그 오토런을 동일한 4-스테이지 엔진으로 처리한다.

## 사용법

```
/forge-fix "<버그 설명>"          # 단일 (알려진 버그)
/forge-fix --scan <URL>           # 미지 버그 다발 — bug-report 발견 프론트로 스캔 후 각 버그를 파이프라인 진입
/forge-fix --loop "<종료조건>"     # N-버그 오토런 (goal PEV 흡수 — 종료조건까지 반복)
```

**예시**:
```
/forge-fix 로그인 페이지에서 이메일 유효성 검사가 작동하지 않음
/forge-fix https://notion.so/xxx (Notion 이슈 URL)
/forge-fix --scan https://app.example.com
/forge-fix --loop "CRITICAL/HIGH 버그 0건까지"
```

## 버그 2축 분류 (plan §3 — 오라클 시어터 방지)

각 버그는 진입 시 2축으로 분류되고, 축별로 요구되는 RED/GREEN 오라클이 다르다:

| 축 | 값 | 요구 오라클 |
|----|----|-------------|
| **표면(surface)** | UI (브라우저 렌더) | red/green screenshot + Vision + pixel-diff |
| | non-UI (백엔드 API·CLI·cron·스크립트) | API 응답 body + 서버/실행 로그 (스크린샷 **면제**) |
| **데이터(data)** | data (DB write: INSERT/UPDATE/DELETE) | db_query_before/after (영속 증명) |
| | non-data (표시·계산 only) | db_query **면제** |

**결정론적 오버라이드**: 수정 대상 파일이 DB 레이어 경로(`**/model{s,}/`·`**/repository/`·`**/migration{s,}/`·`**/dao/`·`*.repository.*`·`*.entity.*` 등)를 건드리면 자가태깅과 무관하게 **data 버그로 강제 판정**한다.

## 4-스테이지 루프 (버그 1개든 N개든 동일 — 게이트로 강제)

```
① 조사·재현 (RED)   [investigate 흡수]
    - 착수 시 `export LOG_HTTP=1 LOG_SOCKET=1 LOG_DB=1` — 앱 계측 로그(BE HTTP/소켓/DB) 활성화 (qa Phase A 패리티; 미지원 앱은 무시 = non-blocking). ④ 검수까지 동일 셸 유지해 BE·FE 로그를 RED/GREEN 오라클로 캡처.
    - UI: 실렌더 red screenshot + **DevTools 증거 번들 전수 캡처**(콘솔 전레벨/네트워크 전요청/JS예외/실패리소스≥400/경고/서버로그/프론트로그 — 상세: 본 문서 하단 "DevTools 증거 번들" 절) | non-UI: red API/로그 오라클
    - data(강제판정 포함): db_query_before → 틀린/누락 행 실측
    - ▶ 게이트 R(Gate R): 축별 RED 오라클 부재 시 소스 Edit `exit 2` BLOCK → ③ 수정 진입 불가
      (qa-event-router.sh 배선, current-bug 귀속 + fix_started_at 이전 신선도 검사, Tier-E day-1 hard-block)
    - **AMBIGUOUS 라우팅 시 advisor 자문(T1)**: 초기 증거로 근본원인 가설이 좁혀지지 않으면(AMBIGUOUS) → `/investigate` 선행 라우팅 직전 `Agent(subagent_type="advisor-strategist", prompt="<증상+가설후보+검증현황 500토큰> 조사 접근·가설 방향 조언 요청")` 스폰. advisor 조언(400~700토큰)을 investigate 가설 우선순위에 반영 후 재개. 근본원인이 이미 명확한 SIMPLE 버그는 스폰하지 않는다(비용 방지 — 매 버그 자동 호출 금지).

② 리포트   [bug-report 흡수]
    - 6하원칙(누가/언제/어디서/무엇을/어떻게/왜) bug-fix-plan.md 작성
    - RED 증거(스크린샷/API·로그/db_query_before) 첨부
    - current-bug 포인터 기록 (게이트 귀속 판정 근거)

③ 수정   [healer a1~a3]
    - **아키텍처 영향 감지 시 advisor 자문(T2)**: multi-file 교차의존 / 인터페이스·계약 변경 / healer MANUAL-ONLY 분류 감지 시 → 수정 착수 전 `Agent(subagent_type="advisor-strategist", prompt="<변경범위+교차의존+계약변경 요약 500토큰> 설계 정합·회귀위험·대안 조언 요청")` 스폰. 단일파일·명확 원인 버그는 스폰하지 않는다.
    - **고위험·비가역 감지 시 advisor 자문(T4)**: 수정 대상이 data migration / DELETE·삭제 경로 / 결제·billing 경로 중 하나면 → 착수 전 `Agent(subagent_type="advisor-strategist", prompt="<비가역 변경 요약+롤백 전략 현황 500토큰> 비가역 리스크·롤백 전략 조언 요청")` 스폰 + 사용자 [STOP] 게이트와 연계(advisor 조언을 승인 요청에 포함). 그 외 일반 수정은 스폰하지 않는다. → 착수 전 `MODEL=$(bash "${FORGE_ROOT:-$HOME/forge}/shared/scripts/advisor-model-resolve.sh" T4 2>/dev/null)` 실행. 출력에 `fable` 포함 시 `Agent(subagent_type="advisor-strategist", model:"fable", prompt="...")`, 아니면 `model:"opus"`(또는 model 생략)로 스폰. 리졸버가 kill-switch/일일캡/미가용을 처리하므로 여기선 출력만 신뢰. Fable 스폰이 미가용·크레딧으로 실패하면 즉시 `model:"opus"`로 재스폰(무한재시도 금지, 1회 폴백). **리졸버 출력이 비었거나 스크립트 실행 자체가 실패해도(파일 없음/실행권한 없음) 기본 `model:"opus"`로 진행 — 에러로 중단 금지(non-blocking).** **이 자동 Fable 분기는 T4에 한함 — T1/T2/T3 및 advisor 외 경로(forge-pr/cr-*/자동게이트)엔 배선 금지(비용가드).**
    - root-cause surgical fix (인접 코드 무관 변경 금지)
    - fix_started_at 타임스탬프 기록 (아티팩트 신선도 기준)
    - cr-code(blocking)

④ 검수 (GREEN)   [healer a4~a7 + visual-loop 흡수]
    - UI: green screenshot + pixel-diff + Vision + **DevTools 번들 재캡처 + RED대비 diff**(콘솔/네트워크/JS예외/실패리소스/경고/서버·프론트로그 — 상세: 본 문서 하단 "DevTools 증거 번들" 절). GREEN 통과 조건에 `console_clean` = **RED 대비 신규 error/exception 0** + **실패요청(status≥400) 소멸** 추가(단순 "콘솔 비어있음" 아님) | non-UI: green API/로그
    - data: db_query_after(동일쿼리 재실행) + fresh reload + full-journey
    - ▶ 게이트 G(Gate G): 축별 GREEN 오라클 미충족 시 머지 불가 `exit 2` BLOCK
      (Tier-E 존재·신선도=day-1 hard / Tier-S FOP 의미판정(success·reload·journey)=7-08 metrics 게이트 WARN→enforce 스케줄)
    - 회귀 체크(baseline 대조) → 영구 회귀테스트 등록
```

**핵심 강제 원칙**: 조사(재현)·검수는 반드시 실제 브라우저 + 실제 DB 기반. 버그가 "간단해 보인다"는 이유로 ①이나 ④를 생략하지 않는다 — 생략 시 게이트 R/G가 BLOCK한다.

## DevTools 증거 번들 (F12 전수 — 2026-07-04)

surface=ui 버그의 RED(①)와 GREEN(④) 각각에서 인간이 F12로 보는 브라우저 개발자도구 전체 + 서버/프론트 로그를 전수 캡처한다. 착수 시 이미 활성화된 `LOG_HTTP=1 LOG_SOCKET=1 LOG_DB=1`(Stage ① 첫 bullet) 계측 위에 아래 7종을 추가로 캡처·저장한다.

| # | 항목 | 도구/방법 | 저장 파일 |
|---|------|-----------|-----------|
| 1 | 콘솔 전 레벨(log/info/warn/error/debug) | `read_console_messages` 전량 | `bug-{N}-{red\|green}-console.json` |
| 2 | 네트워크 전 요청(method·URL·status·req/res 헤더·바디·타이밍) | `read_network_requests` | `bug-{N}-{red\|green}-network.json` |
| 3 | JS 예외/스택(uncaught exception·unhandled rejection) | console error 필터 | `bug-{N}-{red\|green}-js-errors.log` |
| 4 | 실패 리소스(status≥400·CORS·mixed-content·404) | network 필터 | `bug-{N}-{red\|green}-failed-resources.log` |
| 5 | 경고(console warning·hydration·deprecation) | console warn 필터 | (console.json에 포함) |
| 6 | 서버 로그(BE) | LOG_HTTP/SOCKET/DB 계측 + 앱 서버 stdout/stderr | `bug-{N}-{red\|green}-server.log` |
| 7 | 프론트 앱 로그(있으면) | 앱 자체 로거 | `bug-{N}-{red\|green}-front.log` |

**핵심 원칙**: RED 캡처 → GREEN 동일 재캡처 → diff. GREEN 통과 = RED의 error/exception/실패요청 소멸 + 신규 에러 0. `console_clean` = "콘솔 비어있음"이 아니라 **RED 대비 신규 error/exception 0**을 의미.

**게이트 레벨**: 신규 세부필드(`js_errors`/`failed_resources`/`warnings`/`front_log`) = **WARN-우선 non-blocking** — 기존 하드게이트(surface=ui: screenshot+console+network / non-ui: api_response|log_evidence / data: db_query)는 그대로 유지되며, 이 세부필드 누락만으로는 게이트 R/G가 hard-BLOCK하지 않는다.

## 모드별 실행

### 단일 모드 — `/forge-fix "<버그>"`

**Step 1. 이슈 파싱**: 자유 텍스트 → 이슈 내용 직접 파악. Notion URL → `forge-pm-updater` Subagent로 상세 조회.

**Step 2. 규모 확인** (경량 검증은 없으나, 라우팅 규모는 확인):

| 조건 | 판정 |
|------|------|
| 단일 파일 수정 예상 + 명확한 버그 | ✅ 4-스테이지 진입 (healer SIMPLE 라우팅) |
| 변경 파일 2개 이상 예상 | 4-스테이지 그대로 진입, healer MODERATE 라우팅(Agent Teams + worktree 격리)로 승격 — 검증 강도는 동일(게이트 R/G 면제 없음) |
| 새 기능/리팩토링 성격 | **[STOP]** `/forge` 커맨드로 전환 제안 (버그 수정 범위 아님) |
| cross-repo 버그 | **[STOP]** 사용자 확인 후 Lane A 내 Agent Teams(다중 healer)로 처리 — **PGE 라우팅 금지**(D3, PGE는 spec 없는 개발 전용으로 버그 도메인 완전 제외) |

**Step 3. 4-스테이지 실행**: 위 ①~④를 bug-1로 실행. learnings append(bug-fix-pattern) — healer 종료 시 자동.

### `--scan <URL>` 모드

`bug-report` 스킬로 대상 URL(LNB 전체 메뉴 등) 순회 발견 → 각 발견 버그를 bug-N으로 등록 → 4-스테이지 루프를 버그별로 실행(복잡도별 healer 라우팅 — SIMPLE/MODERATE는 병렬, HIGH는 Agent Teams 5-specialist·PGE 아님).

### `--loop "<종료조건>"` 모드 (goal PEV 흡수)

종료조건 문자열 파싱 → `--scan` 또는 지정 소스로 버그 큐 생성 → 종료조건 충족까지 4-스테이지 루프 반복.
전역 캡(qa Iron Laws 준용): 6사이클 초과 / same-issue 3회(`sha256({file}:{symbol}:{error_class})` 동일) / 회귀 감지 → 즉시 [STOP].

## 자동 리뷰-수정 루프 (③→④ 재시도, iteration-cap: 3)

④ 검수(cr-bug/cr-code 등) FAIL 시 자동 루프:

```
1회: FAIL 이슈 목록 수신 → healer 단일파일 수정 → 재검수
2회: 여전히 FAIL → 재수정
3회: 여전히 FAIL → [STOP] Human 에스컬레이션 (plateau 신호)
```

탈출 조건: PASS/WARN 달성 → Phase G(PR) 진입 / 동일 이슈 재발(위 sha256 키 기준) → 즉시 [STOP] / 3회 초과 → [STOP].
iteration-cap 초과 = cr-multi plateau 규칙 적용 (4 옵션: A추가R/B override/C폐기/D단순화).

**plateau/oscillation advisor 자문(T3)**: same-issue 3x / cr-code FAIL 3x / plateau 2연속 STOP 발동 시, healer가 [healer→Lead] 위임 요청으로 advisor-strategist 자문(접근 전환 권고)을 구하고 그 응답(400~700토큰)을 위 4옵션(A/B/C/D) 판단 입력에 포함한다. advisor는 조언만 — STOP 자체를 해제하거나 자동 재시도를 트리거하지 않는다. 최종 옵션 선택은 Human/오케스트레이터.

## 에스컬레이션 규칙

| 상황 | 행동 |
|------|------|
| 수정 범위 확대(2+ 파일) | healer MODERATE 승격(Agent Teams + worktree) — 게이트 R/G는 그대로 강제, 스킵 없음 |
| 새 기능/리팩토링 성격 감지 | **[STOP]** `/forge` 커맨드로 시작 제안 |
| cross-repo 버그 | **[STOP]** 사용자 확인 후 Lane A 내 다중 healer 처리 (PGE 아님 — D3) |
| ①/④ 오라클 생성 불가(DB 미접속 등) | carve-out 결정론화(§4.5, 접속실패 로그 필수) 경유 — 자유텍스트 사유만으로 통과 불가 |

## forge-sync 배포 대상

이 커맨드는 `forge-sync` 실행 시 `$HOME/.claude/commands/forge-fix.md`에 자동 배포된다.
> 실패 시 [[pev-self-correction]] 적용
