---
description: 버그 수정 통합 파이프라인 단일 진입점 — 4-스테이지(조사·재현→리포트→수정→검수) + 게이트 R/G 강제, 실브라우저·실DB 검증 항상 강제 (plan v1.1, 2026-07-03)
allowed-tools: Bash, Read, Write, Edit, Glob, Grep, Agent
argument-hint: "\"<버그 설명>\" | --scan <URL> | --loop \"<종료조건>\" | [--coder claude:tier|codex:tier|sol|terra|luna|ab] [--advisor sol|terra|opus|fable]"
model: sonnet
group: implement
---
> **⚠️ 실행 모드 확인**: 이 커맨드는 쓰기 모드에서만 정상 동작합니다. Plan mode 감지 시 즉시 [STOP] — "Escape로 plan mode 해제 후 재실행하세요."

> **plan v1.1 (2026-07-03, SSoT)**: `11-platform/pipelines/forge-dev/2026-07-03-v1-bugfix-pipeline-unification/plan.md`. `/forge-fix` = **버그 수정 통합 파이프라인의 유일 진입점(Lane A)**. investigate·bug-report·healer를 4-스테이지 루틴으로 흡수한다. **검증(조사 RED + 검수 GREEN)은 버그 규모·모드 무관 항상 강제** — "hotfix라서 검증을 생략한다" 같은 경량 우회는 존재하지 않는다(구 AD-95 `qa --mode=hotfix` wrapper 폐지).

> **하네스 패밀리 맵**: spec有→forge-implement / spec無+코드·문서·에셋→forge-pge / 버그→forge-fix. `${FORGE_ROOT:-$HOME/forge}/.claude/rules-on-demand/harness-family-map.md` 참조.

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

**결정론적 표면(surface) 판정(non-UI 자동 감지 — A4)**: 수정 대상이 UI 렌더 산출물이 없는 **서버 핸들러/컨트롤러/라우트**(`**/controller{s,}/`·`**/handler{s,}/`·`**/route{s,}/`·`**/api/`·`*.controller.*`·`*.handler.*`·`*.route.*` 등, 렌더 반환 없이 JSON/status만 반환)면 자가태깅과 무관하게 **surface=non-UI로 자동 판정**한다 — UI 오라클 하드게이트(screenshot/console/network)를 백엔드 버그에 과적용하지 않는다. UI 오라클 절("DevTools 증거 번들")은 **surface=ui일 때만 로드**된다. **surface=game-engine (2026-07-10)**: 수정 대상이 게임 엔진 클라이언트(씬·프리팹·게임 스크립트)면 제3 표면으로 판정 — RED/GREEN 증거 4종 계약(엔진 콘솔 로그 diff·렌더 캡처·런타임 상태 실측·서버 로그)은 `${FORGE_ROOT:-$HOME/forge}/.claude/rules-on-demand/game-e2e-oracle.md` 참조. 증거를 뽑는 도구는 프로젝트 `qa-config.json` `surfaceAdapters.game-engine` 선언이 답한다(엔진·프로젝트 값 하드코딩 금지). playwright 부재 = fail-open이 아니라 이 계약이 정식 경로. 어댑터 미선언 = GUIDE-STOP. 렌더 출력이 있거나 판정 모호하면 기존 자가태깅·2축 표를 따른다(fail-open). WARN-우선(게이트 R/G 신설 아님).

**surface 내용 기반 승격(Batch 1-3, 2026-07-10 — WARN-first)**: 경로 패턴이 non-UI로 판정해도, `git diff -U0` **hunk에** 클라이언트 토큰(`<script>`·`$(`·`.html(`·`addEventListener`·`document.`·`innerHTML`) 히트 시 경로·확장자 무관 **surface=ui 승격 WARN**(강제 아님, WARN-first — 토큰 리스트는 오탐 로그로 튜닝). grep 대상은 diff hunk만 — 파일 전체 스캔 금지(비용 상한). 선례: 서버 `.php` 파일 안 인라인 JS 수정이 경로 판정만으로 non-UI 처리돼 UI 오라클을 건너뛴 사고(리포트 A-P1).

**구현완성도 판정(real/mock/placeholder — B1, mock-unwired 감지)**: 진입 버그가 "화면이 동작 안 함"류일 때, 해당 화면이 **BE 미배선 mock**(소스가 `@/lib/mock/*` 등 인라인 mock 데이터만 import, 상호작용 시 `/api`·`/api/proxy` 백엔드 호출 0건)인지 먼저 감지한다. mock-unwired로 판정되면 이것은 **버그가 아니라 미구현**(엔드포인트 신설+배선 = 기능개발)이므로 외과적 수정 대상이 아니다 → **[STOP] + `/forge`(spec/구현 파이프라인) 라우팅 권고**. 억지로 외과 수정 시도 금지. 판정 근거: (a) 소스 grep에서 API 계층 부재 + mock import만, (b) 상호작용 트레이스 백엔드 호출 0. 실 API 배선이 하나라도 있거나 판정 모호하면 기존 버그 경로로 진행(fail-open). WARN-우선(게이트 신설 아님). 선례: 2026-07-07 운영툴 QA CRITICAL 6/7이 이 유형(partner/creator 포털 mock 미배선)이었고 forge-fix가 아니라 /forge 대상이었다.

**Spec-gap 판별 (F5, mock-unwired와 동형 — WARN-우선, 2026-07-16)**: Stage ① 진입 시 대상 기능에 Spec(`.specify/specs/`)이 존재하면 관련 FR/AC를 대조한다. 증상이 코드 결함이 아니라 **미구현 AC(spec-gap)** — Spec이 요구하는 공통 요구(예: 화면 전 유형 공통 레이아웃·토큰)가 아예 구현되지 않은 것 — 이면 증상 단위 국소 패치 금지 → **[STOP] + Spec 트랙(`/forge` P5) 라우팅 권고**. 근거: 증상별 별건 패치는 Spec의 공통 요구를 화면별로 유실시킨다(선례: 2026-07-16 던전 UI — 일반/균열/보스 3화면이 같은 spec-gap인데 각각 별건 처리됨). 판별 모호 시 기존 버그 경로 진행(fail-open). 반대 방향 보증: 일반 버그(구현은 됐고 동작이 틀림)는 이 판별로 라우팅되지 않는다 — AC가 구현돼 있으면(코드·화면에 존재) spec-gap 아님.

## 4-스테이지 루프 (버그 1개든 N개든 동일 — 게이트로 강제)

```
① 조사·재현 (RED)   [investigate 흡수]
    - 착수 시 `export LOG_HTTP=1 LOG_SOCKET=1 LOG_DB=1` — 앱 계측 로그(BE HTTP/소켓/DB) 활성화 (qa Phase A 패리티; 미지원 앱은 무시 = non-blocking). ④ 검수까지 동일 셸 유지해 BE·FE 로그를 RED/GREEN 오라클로 캡처.
    - **입력 리포트 Fixed-claim 재검증(claim revalidation, WARN-first — D2b)**: 입력 버그 리포트가 이미 `status: Fixed`/`Resolved`로 표기돼 있으면 그 주장을 그대로 신뢰하지 않는다 — 완료선언 검증 게이트(behavior-core)를 **입력 리포트에도 적용**한다. 주장된 수정이 실제로 워킹트리/git에 존재하는지 grep(수정 함수·심볼·조건) + 커밋 이력(`git log --oneline -S"<수정 시그니처>"`)으로 확인한다. 존재하면 정상 진행(이미 GREEN이면 회귀 여부만 확인). **부재(주장만 있고 코드 없음 = stale status)면 status를 신뢰하지 말고 ③ 재수정(re-implement) 경로로 라우팅**한다. 확인 불가(레포 미접속 등)는 fail-open — 조사 지속(추측 라우팅 금지). non-blocking(게이트 신설 아님).
    - UI: 실렌더 red screenshot + **DevTools 증거 번들 전수 캡처**(콘솔 전레벨/네트워크 전요청/JS예외/실패리소스≥400/경고/서버로그/프론트로그 — 상세: 본 문서 하단 "DevTools 증거 번들" 절) | non-UI: red API/로그 오라클
    - DB 격리 실증 게이트 (P0): data 버그 db_query 실행 직전 필수 — bash "${FORGE_ROOT:-$HOME/forge}/shared/scripts/assert-db-isolation.sh". DB_ISOLATION: WARN(dev/prod/불명) 시 격리 DB(*_test/*_qa) 지정 후 재확인. WARN-first(FORGE_DB_ISOLATION_ENFORCE=1 opt-in BLOCK, fail-open). ④ 검수 db_query_after도 동일 격리 계승.
    - data(강제판정 포함): db_query_before → 틀린/누락 행 실측
    - ▶ 게이트 R(Gate R): 축별 RED 오라클 부재 시 소스 Edit `exit 2` BLOCK → ③ 수정 진입 불가
    - **과거 유사버그 회상 (착수 시 1회, fail-open)**: `/rag-search "{버그 제목} {에러 메시지 키워드}"` 결과를 `docs/qa/obsidian-context.md`에 저장 — healer P1-D가 소비하는 동일 아티팩트(빈 파일 = 정상). SIMPLE 직행 경로 포함 전 경로 적용: 유사 버그·과거 해결 패턴·반증된 원인론이 있으면 가설 랭킹의 입력으로 사용. rag 미가용 = 빈 파일 생성 후 진행(비차단).
    - **pre-work branch sweep (착수 최선행)**: `${FORGE_ROOT:-$HOME/forge}/.claude/rules-on-demand/pre-work-branch-sweep.md` — "미구현처럼 보이는 404/빈 기능"의 실원인 빈도는 미머지 > 연동누락(mock) > 계약드리프트 > 설정드리프트 >> 진짜 미구현. 미머지 완성물 발견 시 재작성 금지.
    - **계약 드리프트 RED (non-UI API 버그 우선 패턴)**: FE가 보내는 body 그대로 실 EP 호출 → 4xx/오류 재현(`bug-feedback-loop.md` 루프 구축법 #10). 필드명·casing 드리프트를 코드 추측 없이 확정한다.
    - **인증 필요 재현(authBootstrap)**: 로그인 뒤 증상이면 프로젝트 `qa-config.json`의 `authBootstrap` 선언(type: cookie-inject/token-header/login-flow/none, 값은 `.env` 참조)을 읽어 재현 전 인증을 수립 — 특정 인증방식·토큰을 이 스킬에 하드코딩하지 않는다. 아티팩트(HAR·network.json)의 토큰·쿠키값은 `***` 마스킹 새니타이즈 필수, 인증 자료 커밋 금지.
      (`healer-log-read-required.sh` 배선 — PreToolUse Edit/Write 훅, current-bug 귀속 + fix_started_at 이전 신선도 검사, Tier-E day-1 hard-block. surface=ui는 screenshot+console.json+network.json playwright 실측까지 포함)
    - **red_symptom_observed 필드(Batch 1-2, 2026-07-10)**: RED = **리포트 증상 문구와 대응하는 관측**이다(fop `red.symptom_observed`, optional 필드). "코드가 이렇게 생겼다" 같은 정적 코드 관찰은 `hypothesis` 태그 — **RED 자격 없음**, GREEN 판정 근거에서 제외. 판정 기준 = `rules-on-demand/bug-feedback-loop.md`의 red-capable 정의(중복 정의 금지 — 그 문서가 SSoT).
    - **AMBIGUOUS 라우팅 시 advisor 자문(T1)**: 초기 증거로 근본원인 가설이 좁혀지지 않으면(AMBIGUOUS) → `/investigate` 선행 라우팅 직전 `Agent(subagent_type="advisor-strategist", prompt="<증상+가설후보+검증현황 500토큰> 조사 접근·가설 방향 조언 요청")` 스폰. advisor 조언(400~700토큰)을 investigate 가설 우선순위에 반영 후 재개. 근본원인이 이미 명확한 SIMPLE 버그는 스폰하지 않는다(비용 방지 — 매 버그 자동 호출 금지).
    - **버그-클래스 discriminator(WARN, 프로덕션 결함 vs 테스트/mock drift)**: RED 재현 확보 직후, 실패 원인이 (a) 프로덕션 코드 결함인지 (b) 테스트/mock이 스키마·계약 변경을 못 따라간 drift(프로덕션은 정상)인지 조사 초기에 판별한다. 판별 근거: 실패 assertion이 참조하는 계약(API 응답 스키마·DB 컬럼·이벤트 페이로드)을 최근 프로덕션 커밋이 의도적으로(feat/fix/refactor 커밋 메시지) 변경했고 프로덕션 코드는 신규 계약대로 정상 동작하는데 테스트/mock만 구계약을 기대하면 (b)로 판정 — qa Phase C.5 `spec-code-discriminate.sh`(spec↔code 방향 판별: git 커밋 타임스탬프·커밋유형 시그널로 IMPL_GAP/SPEC_STALE_CANDIDATE/AMBIGUOUS 판정, `${FORGE_ROOT:-$HOME/forge}/shared/scripts/spec-code-discriminate.sh`)의 판별 패턴을 개념적으로 준용한다(대상이 spec↔code가 아니라 프로덕션↔테스트라 스크립트 재사용은 아님 — 판별 체크리스트만 차용). (b) 판정 시 ③ 진입 대상을 프로덕션 코드 수정이 아니라 테스트/mock 갱신으로 전환한다 — 정상 프로덕션 코드를 되돌리는 회귀를 방지. 판별 모호(AMBIGUOUS) 시 안전 기본값은 조사 지속(추측 라우팅 금지). 선례: blog-search 버그(f03dc7e)는 실제로 (b) mock drift였고 RED 재현이 우연히 프로덕션 코드 교정으로 이어졌다가 ce04bf4에서 mock 쪽으로 재보정된 사례 — 동일 오분류 재발 방지 목적. **게임 도메인 확장(버그 vs 의도설계)**: 게임 도메인은 확률·꽝·페널티가 의도된 설계인 경우가 많아 무보상/실패 경로를 버그로 단정하기 전 기획 확률 테이블 실측이 선행되어야 한다. 선례: NewGacha 꽝(무보상) 경로를 버그로 오판할 뻔했으나 코드·확률 패턴테이블 실측으로 설계 동작임을 확증(godblade, 2026-07-18).

② 리포트   [bug-report 흡수]
    - 6하원칙(누가/언제/어디서/무엇을/어떻게/왜) bug-fix-plan.md 작성
    - RED 증거(스크린샷/API·로그/db_query_before) 첨부
    - current-bug 포인터 기록 (게이트 귀속 판정 근거)
    - **evidence_tier / provenance 필드(Batch 3 증거등급 정직화, WARN-first, additive — fop-schema.json `additionalProperties:true`와 무모순)**: fop.json/수정 보고 헤더에 다음 2필드를 추가한다.
      - `evidence_tier`: `runtime`(실브라우저·실API·실DB 등 실행 관측) | `code+db`(코드+DB 실측이나 실행 환경 미가용) | `code-only`(코드 근거만, 실행·DB 모두 미가용)
      - `provenance`: 검증을 실행한 환경(로컬/샌드박스/CI) + 네트워크 가용 여부 1줄
      - `evidence_tier`가 `runtime`이 아니면 산출물에 "런타임 증거 없음 — 근거등급 하향" 문구를 명기해야 한다(WARN 고지 의무, 자동 통과는 유지 — **[STOP] 아님**). 미기재 시 자동 게이트 BLOCK 없음(WARN-first 초기).
      - kill-switch: `FORGE_EVIDENCE_TIER=off` — off 시 이 절 전체 미적용(기존 fop 흐름 그대로).

③ 수정   [healer a1~a3]
    - **아키텍처 영향 감지 시 advisor 자문(T2)**: multi-file 교차의존 / 인터페이스·계약 변경 / healer MANUAL-ONLY 분류 감지 시 → 수정 착수 전 `Agent(subagent_type="advisor-strategist", prompt="<변경범위+교차의존+계약변경 요약 500토큰> 설계 정합·회귀위험·대안 조언 요청")` 스폰. 단일파일·명확 원인 버그는 스폰하지 않는다.
    - **고위험·비가역 감지 시 advisor 자문(T4)**: 수정 대상이 data migration / DELETE·삭제 경로 / 결제·billing 경로 중 하나면 → 착수 전 `Agent(subagent_type="advisor-strategist", prompt="<비가역 변경 요약+롤백 전략 현황 500토큰> 비가역 리스크·롤백 전략 조언 요청")` 스폰 + 사용자 [STOP] 게이트와 연계(advisor 조언을 승인 요청에 포함). 그 외 일반 수정은 스폰하지 않는다. → 착수 전 `MODEL=$(bash "${FORGE_ROOT:-$HOME/forge}/shared/scripts/advisor-model-resolve.sh" T4 2>/dev/null)` 실행. 출력에 `fable` 포함 시 `Agent(subagent_type="advisor-strategist", model:"fable", prompt="...")`, 아니면 `model:"opus"`(또는 model 생략)로 스폰. 리졸버가 kill-switch/일일캡/미가용을 처리하므로 여기선 출력만 신뢰. Fable 스폰이 미가용·크레딧으로 실패하면 즉시 `model:"opus"`로 재스폰(무한재시도 금지, 1회 폴백). **리졸버 출력이 비었거나 스크립트 실행 자체가 실패해도(파일 없음/실행권한 없음) 기본 `model:"opus"`로 진행 — 에러로 중단 금지(non-blocking).** **이 자동 Fable 분기는 T4에 한함 — T1/T2/T3 및 advisor 외 경로(forge-pr/cr-*/자동게이트)엔 배선 금지(비용가드).**
    - **③ 수정 실행자 라우팅 (--coder, DMC 트랙C — 2026-07-15)**: `--coder` 지정 시 **③ 수정(코드 편집)만** Claude/Codex/ab로 라우팅한다. **①RED·④GREEN은 항상 Claude 고정**(무변경) — 이유 2중: (a) RED/GREEN 오라클은 우리 세션 MCP(브라우저·DB)가 필요한데 Codex 샌드박스는 이 MCP에 접근 못 함, (b) **구현자≠검증자** — 수정한 모델이 자기 수정을 검증하면 oracle_independence 위반(게이트 G의 self-validating REJECT 사유와 동형). 즉 Codex는 재현도 검수도 소유하지 않는다(RED 독립성).
      - CODER_SPEC 파싱 → `MODEL=$("${FORGE_ROOT:-$HOME/forge}/shared/scripts/coder-model-resolve.sh" "$CODER_SPEC")`. **미지정 = 기존 healer/Sonnet 수정(무변경, no-op)**.
      - **codex:tier** → `mcp__codex__codex`(sandbox=workspace-write, approval-policy=on-request, cwd=현재 워크트리, model=$MODEL)로 root-cause surgical fix. RED 오라클·리포트·확정된 근본원인 가설을 프롬프트에 주입(Codex 재탐색 방지). Codex diff는 표시·커밋 전 `secret-content-scan.sh` 경유(LN-03 마스킹).
      - **surface=game-engine 감지 → Claude 폴백**(forge-implement와 동일 — Unity Windows 전용, Codex Linux 샌드박스 batchmode 불가. 실측 확정 2026-07-15).
      - **advisor tier-gate (2026-07-16)**: `GATE=$("${FORGE_ROOT:-$HOME/forge}/shared/scripts/advisor-tier-gate.sh" "$CODER_SPEC")`. **`skip`**(구현자≥Opus: sol/terra/opus/fable) → T1/T2 strategic advisor **생략**(tier 역전 방지). **`advise`**(구현자<Opus) → advisor 발동 + **조언을 Codex 프롬프트에 주입**. ⚠️ **T3(plateau·thrash bounding)·T4(비가역) 자문은 tier 무관 항상 유지** — 제어 기능이라 구현자가 프런티어여도 필요.
      - **--advisor 오버라이드 (2026-07-16)**: `--advisor <spec>`(sol/terra/opus/fable)로 advisor 모델을 경우별 선택. `AMODEL=$("${FORGE_ROOT:-$HOME/forge}/shared/scripts/coder-model-resolve.sh" "$ADVISOR_SPEC")` → 결과가 gpt/codex면 **`mcp__codex__codex`(sandbox=read-only)로 advisor 스폰**(sol/terra, Plus 정액=무료·독립 관점), claude면 `Agent(subagent_type="advisor-strategist", model=$AMODEL)`(opus/fable). 미지정=현행(Opus + tier-gate). ⚠️ **독립성: advisor 벤더 ≠ 구현자 벤더 권고**(같은 벤더=자기훈수 무의미 → Codex 구현엔 opus/fable advisor, Claude 구현엔 sol/terra advisor). fable은 **현재 구독 정액(종량 아님, 2026-07-16 사용자 확인)**이라 sol과 동급으로 자유 선택 가능(advisor-model-resolve 가드=kill-switch·가용성 폴백만 유지).
      - **coder-attribution (기계 강제)**: 수정 직후 `coder-attribution.sh write "$WORKTREE" "$MODEL"` → ④ 검수의 cr-code 진입 시 `MODE=$("${FORGE_ROOT:-$HOME/forge}/shared/scripts/coder-attribution.sh" review-mode "$WORKTREE")`를 `--cr $MODE`로 전달(codex 수정→`degrade`=codex 레그 배제 / 그 외→`on` / 무마커→`on` fail-open). 자기검수 방지 = 산문 아닌 스크립트 강제.
      - kill-switch `FORGE_DUAL_CODE=off` → codex 요청도 Claude(healer)로 대체. Codex 미가용 = Claude 폴백(로그+경고, fail-open). advisor T2/T4·게이트 R/G는 `--coder` 무관 유지. 모델 id = `model-registry.json` SSoT(버전무관).
    - root-cause surgical fix (인접 코드 무관 변경 금지)
    - **클래스 스윕 표 필수(Batch 1-4, 2026-07-10 — WARN-first 초기)**: 수정 심볼/패턴을 **레포 전체 grep** → 발견 항목별 처분 표 작성 — `fix`(이번에 수정) / `verified-clean`(확인 결과 무결) / `follow-up`(티켓팅) + **근거 1줄** 필수. 처분 누락 항목 존재 = 게이트 실패(WARN-first 초기 — fop `sweep.found_count/fixed_count/ticketed`와 정합). 실증: 2026-07-10 스윕이 즉시 동일 클래스 3건 적중(리포트 A-P2). **`git rm`(삭제) 포함 시 스윕 대상 = 삭제된 경로 문자열** — 테스트 스크립트 타깃 배열 · CI path 필터 · qa-config 엔드포인트 · docs 실행예시. 코드 심볼만 grep하면 회귀 게이트가 stale 타깃으로 조용히 죽는다.
    - **상호의존 편집 원자성(F4, WARN-first — 라이브 dev서버 과도기 크래시 방지)**: 필드 제거/optional화 + 그 필드 소비처 가드처럼 **서로 의존하는 다단계 편집**은 반드시 (a) **역순 적용**(소비처의 `?.` 옵셔널 가드·판별 분기를 **먼저** 넣고 → 그 다음 데이터/타입에서 필드 제거) 또는 (b) 한 번에 원자적 적용한다. 순서를 뒤집으면(데이터 먼저 제거) HMR이 중간 상태를 컴파일하는 순간 "데이터엔 없는데 렌더는 아직 비옵셔널 접근" → throw로 라이브 서버에서 실사용자 크래시(최종 코드가 정상이라 '최종 상태 GREEN'으론 못 막는 창). 소비처 전수 grep 후 가드-우선 순서로 편집. non-blocking(규율, 게이트 신설 아님).
    - fix_started_at 타임스탬프 기록 (아티팩트 신선도 기준)
    - **background/headless cr 폴백(WARN-first — A7)**: cr 게이트(cr-code/cr-bug) 진입 전 실행 컨텍스트가 background/headless 세션인지 감지한다 — 이런 세션은 사용자 TTY가 없어 외부 cr 워커(Codex/Gemini HMAC 승인)를 블로킹한다. 감지 시 외부 워커 대신 **Opus-worker cr 폴백으로 자동 라우팅**한다(cr-multi가 이미 보유한 폴백을 forge-fix 레벨에서 배선). 감지 불가·전경(foreground) 세션이면 정상 외부 cr 진행. non-blocking(게이트 신설 아님, 라우팅만 전환).
    - cr-code(blocking)

④ 검수 (GREEN)   [healer a4~a7 + visual-loop 흡수]
    - UI: green screenshot + pixel-diff + Vision + **DevTools 번들 재캡처 + RED대비 diff**(콘솔/네트워크/JS예외/실패리소스/경고/서버·프론트로그 — 상세: 본 문서 하단 "DevTools 증거 번들" 절). GREEN 통과 조건에 `console_clean` = **RED 대비 신규 error/exception 0** + **실패요청(status≥400) 소멸** 추가(단순 "콘솔 비어있음" 아님) | non-UI: green API/로그
    - data: db_query_after(동일쿼리 재실행) + fresh reload + full-journey
    - **인터프리터 서버 재기동 증거(interpreter-server restart evidence, WARN-first — D2c)**: 재현 대상이 코드를 인메모리 캐시하는 인터프리터 서버(`php -S`·node·python dev server 등, `require_once`/모듈 캐시로 소스 변경이 즉시 반영 안 됨)면, RED→GREEN 사이에 **서버 재기동 증거**(PID 변경 / 재기동 로그 / healthcheck 응답 변화)를 축별 GREEN 오라클 조건에 추가한다 — 재기동 없이 캡처한 GREEN은 stale 인메모리 코드에 대한 것일 수 있다(오라클 시어터). **인터프리터 서버 표면(surface)에만 적용**(컴파일 언어·정적 페이지·요청당 재로드 서버는 면제). 증거 확보 불가 시 fail-open(사유 로그 필수) — non-blocking(게이트 G hard-BLOCK 아님, WARN).
    - **편집창 서버로그 throw 0 스캔(F4, WARN-first)**: GREEN 판정 시 최종 렌더/응답만 보지 말고, **fix_started_at 이후 서버 stderr 로그 창**을 스캔해 편집 과정에서 발생한 throw/uncaught exception이 0인지 확인한다 — 다단계 편집의 과도기(중간 컴파일) throw는 최종 상태 캡처엔 안 남지만 편집창 로그엔 남는다(F1 서버로그 오라클·상호의존 편집 원자성 규율과 연동). throw 발견 시 과도기 크래시로 기록(라이브 human-test 노출 리스크). 로그 부재·비인터프리터 서버는 fail-open(사유 로그). non-blocking(게이트 G hard-BLOCK 아님, WARN).
    - **정상경로 회귀 확인(Batch 1-5, 2026-07-10)**: GREEN 필수 요소 — 증상 소멸만이 아니라 **정상경로가 여전히 정상**임을 짝으로 확인한다(예: 빈 검색 수정 시 유효 검색이 정상 반환되는지).
    - ▶ 게이트 G(Gate G): 축별 GREEN 오라클 미충족 시 머지 불가 `exit 2` BLOCK
      (Tier-E 존재·신선도=day-1 hard / Tier-S FOP 의미판정(success·reload·journey)=7-08 metrics 게이트 WARN→enforce 스케줄)
    - **oracle_independence advisory(Batch 1-1, 2026-07-10 — WARN-first, 비차단)**: 게이트 G 시점에 `qa-event-router.sh check_auto_merge()`가 `${FORGE_ROOT:-$HOME/forge}/shared/scripts/oracle-independence-check.sh`를 advisory 호출(`|| true`) — ①`bug-{N}-red-*`/`bug-{N}-green-*` 짝 실검사 ②red/green 수집법 일치(GREEN 근거가 수정 파일 grep/read = self-validating oracle REJECT 사유) ③RED 증상 관측 신호. GREEN = **RED와 동일 수집 스크립트의 diff(증상 소멸)만 인정** — 수정 문자열 grep 존재는 GREEN이 아니다. 위반 = WARN + `docs/qa/oracle-independence.jsonl` 로깅(verdict·사유·override). kill-switch `FORGE_ORACLE_GATE=off`. 승격 판정 2026-07-17(WARN≥10 + false-WARN<10% + override<5% 전부 충족 시에만 Human 승인 하 BLOCK).
    - **커밋된 사본 = 워킹트리 일치 검증(committed-copy parity, WARN-first — D2a)**: `git mv`+edit로 수정한 경우(특히 경로에 `()` 등 셸 특수문자 포함 시) 워킹트리는 GREEN이어도 **커밋된 사본은 구 내용**일 수 있다(re-`git add` 누락). GREEN 선언 전 `git show HEAD:<path>`(스테이징만 한 상태면 `git show :<path>`) 출력이 워킹트리와 동일한지 확인한다 — 불일치면 `git add` 재스테이징 후 재확인. 대상 파일 조회 불가·미커밋(신규 파일 등)은 fail-open(워킹트리 기준 진행). non-blocking(WARN).
    - **reviewed-up-to-commit 포인터(re-review 강제, WARN-first — A6)**: cr-code는 1차 커밋만 검수하므로 검수 과정에서 파생된 follow-up 커밋은 미검수로 남을 수 있다. 마지막 검수한 커밋 SHA를 `reviewed_sha`로 기록하고, **머지 직전 `git rev-list <reviewed_sha>..HEAD`가 비어있지 않으면 재검수를 강제**한다. 특히 조건부 SQL(`WHERE`/동적 절)·bind 파라미터 변경이 포함된 후속 커밋은 `re-review-required` 태그를 붙여 반드시 재검수한다. `reviewed_sha` 미기록·조회 불가는 fail-open(HEAD 기준 1회 검수 진행). non-blocking(WARN).
    - 회귀 체크(baseline 대조) → 영구 회귀테스트 등록
```

**핵심 강제 원칙**: 조사(재현)·검수는 반드시 실제 브라우저 + 실제 DB 기반. 버그가 "간단해 보인다"는 이유로 ①이나 ④를 생략하지 않는다 — 생략 시 게이트 R/G가 BLOCK한다.

## 버그-클래스 판별 & 디버깅 규율 (G3, 2026-07-05)

Stage ① 조사 진입 시 아래 판별 표로 버그 클래스를 먼저 특정하고, 클래스에 맞는 분석 기법을 라우팅한다. 이미 캡처된 trace.zip/aria.json/console.json 등 증거 위에 **분석 기법만 얹는다** — 신규 캡처 항목 추가 아님(WARN-우선, 게이트 신설 없음).

### 버그-클래스 판별 표

| 버그 클래스 | 시그니처 | 잡는 법 |
|---|---|---|
| hydration/race | SSR-CSR mismatch, "Hydration failed", 초기렌더 후 깜빡임 | 렌더 타임라인 diff(SSR HTML vs CSR 최초 paint) + 이벤트 순서 로그 |
| stale-closure | 상태 최신값 미반영, useEffect deps 누락, 이전 렌더 값 캡처 | 렌더별 클로저 변수 스냅샷 비교, deps 배열 대조 |
| memory-leak | 시간경과 heap 증가, 탭 방치 후 슬로다운 | heap snapshot diff(detached DOM 탐지) — 아래 처방 |
| CLS(레이아웃 이동) | 폰트·이미지 로드 후 요소 밀림 | Lighthouse CLS 지표 + 레이아웃 shift 리전 캡처 |
| INP(응답성 지연) | 클릭 후 반응 200ms+ | perf trace 롱태스크 구간 식별 |

- **rate-limit 신호 오염 판별(F6, WARN)**: 반복 자동 재현이 백엔드 **전역 스로틀(단일 공유 버킷)**을 소진하면 무관 엔드포인트에 429가 번져 진짜 버그를 가리거나 흉내낸다(얇은 body를 "429 탓"으로 오귀속 위험). 재현 헬퍼는 **요청 간 스로틀** 또는 테스트 트래픽을 전역 버킷에서 제외한다. "공유 스로틀 버킷 소진 → 무관 엔드포인트 429"를 버그-클래스 discriminator에 등록(정상 렌더의 짧은 텍스트를 429로 오판 금지).

### 클래스별 분석 처방 (기 캡처 trace/aria 위 레이어, 신규 캡처 아님)

- **memory-leak** → heap snapshot diff로 detached DOM 노드 탐지 (Chrome DevTools MCP 평가 배선 — 하단 "DevTools 증거 번들" 절 참조)
- **regression**(이전엔 없던 회귀) → `git bisect run <검증스크립트>`로 원인 커밋 이분탐색
- **flake**(간헐적 재현) → Trace Viewer로 통과 trace와 실패 trace를 나란히 diff
- **race**(경합조건) → 패턴매칭 추측 금지, 인터리빙(스레드·이벤트 순서)을 명시적으로 추론
- **다크모드 UI "안 보임" pre-check(P4, Tailwind v4 + next-themes)**: 다크모드 관련 색/표시 버그는 **`@custom-variant dark` 배선 확인**을 표준 pre-check로 한다. Tailwind v4는 `dark:` 유틸을 기본 `prefers-color-scheme`(OS)로 컴파일 → next-themes의 `.dark` 클래스 토글과 어긋난다(배경 CSS변수만 반응·`dark:` 유틸은 OS만 따르는 절반-작동). `globals.css`에 `@custom-variant dark (&:where(.dark, .dark *));` 존재 확인. RED 재현 팁: **OS=light + `.dark` 클래스 강제**(Playwright `colorScheme:"light"` + `classList.add("dark")`)로 토글≠OS 시나리오를 재현 — OS까지 dark로 강제하면 `dark:`가 우연히 동작해 버그를 놓친다.

### 디버깅 컨텍스트 체크리스트 (Stage ①·② 진입 규율)

- 정확한 에러 메시지 + 전체 스택 트레이스(요약·패러프레이즈 금지, 원문 그대로)
- 최소 재현(minimal repro) — 불필요한 변수 제거
- 직접 연루 파일만 grep(call-graph 한 홉 이내 — 레포 전수 훑기 금지)
- 구조화 로그(JSON/key-value) — 자유텍스트 로그 최소화
- 이전 실패한 수정 시도 + 실패 이유 기록(동일 오답 재탕 방지)
- sub-agent로 조사 격리(대용량 로그·grep 결과가 메인 대화 오염 금지 — `context-engineering.md §단순 검색=subagent 위임` 준용)

### 10단계 디버깅 규율 (Agans, Stage ① 명문화)

가설은 **3~5개를 랭킹 생성**한 뒤(단일 가설 생성 = 첫 그럴듯한 아이디어에 앵커링, `rules-on-demand/bug-feedback-loop.md`) 상위부터 falsifiable(반증가능) 형태로 검증한다 — 한 번에 한 변수만. 재현 루프가 자명하지 않으면 같은 문서의 루프 구축법 11종·tight 4기준을 선행 적용한다. 가장 시끄러운 증상 하나만 잡고 끝내지 말 것 — **관측된 모든 증상을 설명하는 가설**만 root-cause로 채택한다(일부 증상만 설명되면 가설 기각·재수립).

### AI 3대 함정 방어 (B5)

- **환각 root-cause**: 증거(RED 오라클) 없이 원인 단정 금지 — Gate R이 이미 강제
- **발명 API**: 존재하지 않는 함수·속성 호출 — red-green 사이클이 부분 방어(빌드·타입에러로 걸림). ⚠️ **self-validating test 경고**: 회귀테스트가 수정과 동일한 틀린 가정을 인코딩하면 통과해도 무의미 — oracle 독립성 체크 필수(수정 코드가 참조하지 않는 방식으로 기대값 검증). forge-implement 테스트 패턴 ⑤와 동일 처방(cross-ref).
- **concurrency 버그의 프롬프팅 저항**: 경합조건은 프롬프트만으로 안정적으로 안 잡힌다 — 위 "race" 처방(인터리빙 명시 추론)으로 보완, 패턴매칭성 "그럴듯한 수정" 경계

### 옵셔널 필드 제거/optional화 null-safety 체크리스트 (F5)

필드를 제거하거나 `optional`로 바꿀 때(판별식 렌더 규율):
- (a) 해당 필드 **소비처 전수 grep** — 접근 지점 하나도 빠뜨리지 않는다.
- (b) 판별 플래그(`comingSoon`/`disabled` 등) 분기를 **필드 접근보다 앞**에 배치(렌더 최상단 early-return/분기).
- (c) 배열/객체 타입을 `{field?: T}`로 **명시**해 컴파일러가 미가드 접근을 잡게 한다.
- ⚠️ **캐스트가 null-safety를 우회**한다: `as {...}[]` 같은 단언은 TS strict의 옵셔널 체크를 무력화 → 컴파일러가 미가드 접근을 못 잡는다. 캐스트 구간은 수동 전수 확인.
(F4 "상호의존 편집 원자성"과 연동 — 가드-우선 순서로 편집.)

## DevTools 증거 번들 (F12 전수 — 2026-07-04, playwright 실측 배선 2026-07-05)

surface=ui 버그의 RED(①)와 GREEN(④) 각각에서 인간이 F12로 보는 브라우저 개발자도구 전체 + 서버/프론트 로그를 전수 캡처한다. 착수 시 이미 활성화된 `LOG_HTTP=1 LOG_SOCKET=1 LOG_DB=1`(Stage ① 첫 bullet) 계측 위에, **자체 playwright Node 스크립트(헬퍼, MCP·CLI 바이너리 아님) 1회 실행**으로 아래 항목을 전수 캡처·저장한다:

```bash
node ~/forge/shared/scripts/playwright-devtools-capture.mjs \
  --url <재현 URL> --out-prefix docs/qa/artifacts/bug-{N}-{red|green} --phase {red|green} \
  [--actions <인터랙션 시퀀스 json경로>]
```

정적 페이지 로드만으로 재현되지 않는 버그(클릭·입력·선택·스크롤·hover 이후 발생)는 `--actions`로 실사용자 인터랙션을 순서 실행하며 스텝별 스냅샷+`actions-trace.json`을 함께 남긴다.

> **에이전트 브라우저 실행 보안 경계**: 위 playwright 헬퍼가 실인증 세션·staging 환경을 구동하는 동안 staging 실인증 격리·run-code 감사·시크릿 마스킹·DOM=untrusted 원칙을 준수한다. `${FORGE_ROOT:-$HOME/forge}/.claude/rules-on-demand/agent-browser-security.md` 참조.

> **Chrome DevTools MCP 옵션(평가 후 선택 배선)**: 위 playwright 헬퍼(구동·액션 시퀀스 실행)와 별도로, 디버깅 전용 MCP(Lighthouse 지표·heap snapshot·source-map 복원 스택·perf trace)는 memory-leak/CLS/INP 클래스 분석을 보완할 수 있다 — 현재 미배선, 평가 후 선택 배선 대상이며 도입 시 위 agent-browser-security 룰 선결 필수.

| # | 항목 | 저장 파일 | 게이트 |
|---|------|-----------|--------|
| 1 | 콘솔 전 레벨(log/info/warn/error/debug) | `bug-{N}-{red\|green}-console.json` | **hard** |
| 2 | 네트워크 전 요청(method·URL·status·req/res 헤더·바디·타이밍) | `bug-{N}-{red\|green}-network.json` | **hard** |
| 3 | 뷰포트별 스크린샷(mobile/tablet/desktop) | `bug-{N}-{red\|green}-{vp}-shot.png` | **hard** |
| 4 | JS 예외/스택(uncaught exception) | `bug-{N}-{red\|green}-js-errors.log` | WARN |
| 5 | 실패 리소스(status≥400·CORS·404) | `bug-{N}-{red\|green}-failed-resources.log` | WARN |
| 6 | HAR / trace / accessibility snapshot | `bug-{N}-{red\|green}-network.har` / `-trace.zip` / `-aria.json` | WARN |
| 7 | 인터랙션 스텝 트레이스(--actions 사용 시) | `bug-{N}-{red\|green}-actions-trace.json` + `-step{NN}-{action}-desktop.png` | WARN |
| 8 | 서버 로그(BE) | `bug-{N}-{red\|green}-server.log` | WARN |
| 9 | 프론트 앱 로그(있으면) | `bug-{N}-{red\|green}-front.log` | WARN |

**핵심 원칙**: RED 캡처 → GREEN 동일 재캡처(동일 `--actions` 시퀀스 포함) → diff. GREEN 통과 = RED의 error/exception/실패요청 소멸 + 신규 에러 0. `console_clean` = "콘솔 비어있음"이 아니라 **RED 대비 신규 error/exception 0**을 의미.

**게이트 레벨(hard 실측 강제, 2026-07-05)**: surface=ui 버그는 스크린샷 + `console.json` + `network.json`(요청 1건 이상, fresh)이 **playwright 헬퍼 실측으로 hard 필수**다 — Gate R은 `healer-log-read-required.sh`, Gate G는 `qa-event-router.sh`의 `check_auto_merge()`가 강제한다. 헬퍼 exit 3(playwright 미설치)일 때만 fop.json `{red|green}.playwright_unavailable` carve-out으로 면제(fail-open, 영구 BLOCK 방지). 신규 세부필드(`js_errors`/`failed_resources`/`har`/`trace`/`aria`/`actions-trace`)는 **WARN-우선 non-blocking**(AD-168 카브아웃) — 이 세부필드 누락만으로는 게이트 R/G가 hard-BLOCK하지 않는다.

**서버 로그 1순위 승격(F1 — 브라우저 렌더 clean인데 사용자는 에러)**: RED 재현 시 브라우저는 200/정상 렌더인데 사용자가 에러를 보는 경우(error-boundary가 `digest`만 노출하고 실제 스택을 숨김 — `global-error.tsx`/segment `error.tsx` 등)는, §8 서버 로그(BE stderr) grep을 **이 증상 클래스에서 1순위 RED 오라클로 캡처**한다(브라우저 재현만으론 원인 도달 불가). 진짜 스택은 서버 stderr에만 있다. 동반 규율: 증상이 뜬 라우트 ≠ throw 위치일 수 있다 — **전역/레이아웃 컴포넌트(Header/Footer/Provider)의 SSR throw가 임의 페이지에서 화이트스크린으로 발현**하므로, 최근 `git diff`에 레이아웃-레벨 컴포넌트 변경이 있으면 먼저 의심하라. 이 승격은 **캡처 우선순위 규율**이며 §8 등급(WARN)·게이트 레벨은 불변(신규 hard-BLOCK 아님).

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

> **worktree 부트스트랩 시 workspace deps 선빌드(WARN)**: MODERATE 승격으로 worktree 격리 진입 시, 워커 pre-push `tsc`/빌드 검증이 monorepo workspace 의존 패키지(shared/공용 패키지 등) 미빌드로 실패할 수 있다 — 일반 원칙: **monorepo workspace deps는 worktree에서 선빌드 필요**. worktree 생성 직후 healer 수정(③) 착수 전, 프로젝트 빌드 스크립트로 workspace 의존 패키지를 먼저 빌드한다. non-blocking — 선빌드 생략 자체가 게이트 R/G를 BLOCK하지 않으나, 이후 pre-push tsc 실패의 흔한 원인이므로 worktree 부트스트랩 표준 스텝으로 둔다.

> **중첩 git 레포 소유권 판정(nested-repo ownership, WARN — A2)**: 수정 대상 파일이 루트 레포가 `.gitignore`로 제외한 **중첩 별도 git 레포**(monorepo 내부 nested repo)에 속할 수 있다. 브랜치/worktree 생성 전, 대상 파일 경로에 `git -C <대상파일 디렉토리> rev-parse --show-toplevel`을 실행해 **소유 레포를 판정**하고, 루트가 아니라 **그 소유 레포에서** 브랜치/worktree를 만든다 — 루트 레포에 브랜치를 만들면 대상 파일이 추적되지 않아 커밋이 누락된다. 판정 실패(레포 경계 모호·미추적 등)는 fail-open(루트 레포 기준 진행). non-blocking(게이트 신설 아님).

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

이 커맨드는 `forge-sync` 실행 시 `~/.claude/commands/forge-fix.md`에 자동 배포된다.
> 실패 시 [[pev-self-correction]] 적용
