---
description: Spec 작성 단독 명령 (옛 /sdd Phase 0~2)
argument-hint: "<기능 설명> [--spec <기존 path>] [--plan <plan dir>] [--bulk <forge-context-path>]"
model: sonnet
group: plan
---

# /spec-write

Spec 작성 단독 실행. `/sdd` Phase 0~2 분리 명령 (AD-46).

## 모델 라우팅 (2026-07-04)

| 작업 | 모델 | 방법 |
|------|------|------|
| Spec 본체 작성 | **Sonnet** | frontmatter `model: sonnet` |
| 탐색(기존 spec/ADR 충돌·데이터 스키마 확인) | **Haiku** | `Agent(model:"haiku")` subagent |
| 고위험 전략 자문(범위/NFR) | **Opus** | `advisor-strategist`(기존 배선) |

근거: `$HOME/.claude/rules/model-routing.md`. advisor=Opus 고정(Fable 자동 없음 — forge-fix T4 한정).

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

## Red Flags (무시 금지 — 자기합리화 차단)
| 이런 생각이 들면 | 강제 행동 |
|--------------|---------|
| "기획서 없어도 Spec 바로 쓰자" | Red Flag → Phase 0 전제조건 먼저 |
| "태스크는 추상 설명으로 충분" | Red Flag → §8 실제 코드블록+커밋메시지 |
| "에러 핸들링 추가 라고만 적자" | Red Flag → 실제 try-catch 코드 작성 |

> 출처: Superpowers brainstorming/writing-plans Iron Law (YT af3OJ0L1jEU, 2026-05-21).

## 실행 단계

**Phase 0 — Readiness 판정 (요건 기반 3-way 게이트)**

→ 공통 헬퍼: `/readiness-gate` 참조 (4-state 판정 + GUIDE-STOP 산출기 + ADAPT 규칙 + **§M9 세션 재진입 안전성**)

> **⟳ 세션 재진입 시**: `/readiness-gate §M9` 규약 적용 — `{domain}/_STATUS.md` read → resume/fresh 판정 → resume 리포트 출력 후 다음 미완료 M스텝부터 재개.

forge-spec 진입 계약(A~H 8요소) 기준으로 입력 스캔:
- 입력 3종 수용: 파일경로 | 인라인텍스트 | 디렉토리
- 요소별 4-state 판정(ok/normalize/derive/absent)
- 라우팅:
  - 전부 ok       → **PASS** (Phase 1 진행)
  - normalize/derive만 → **ADAPT** (Phase 0.5 진행)
  - absent 1개+  → **GUIDE-STOP** (`forge-spec-readiness-{date}.md` 출력 후 정지)

**Phase 0.5 — ADAPT 자동보완 분기**
(Phase 0에서 absent=0, normalize/derive 감지 시 진입)

`/readiness-gate` ADAPT 규칙 적용:
1. `normalize` 항목 → 자동 변환 (무승인). 변환 내역 1줄씩 출력
2. `derive` 항목 → 자동 초안 + `vetted_by: ai-inferred` 태깅 → **[STOP] 1회 일괄 확인**
3. 확인 후 Phase 1 진행

derive 확인 예시:
  ```
  [ADAPT] 추론 초안 확인 후 진행:
  • C (인수기준): 테스트전략 §7에서 파생 → {AC 초안} [vetted_by: ai-inferred]
  확인 → 진행 / 수정 → 수정 내용 반영 후 진행
  ```

**Phase 0.7 — 가정 사항 표면화 + Ground-Truth 실측 (DB + FE)**
- 요구사항에서 암묵적 가정 추출: DB 스키마, 인증 방식, 외부 API 의존, 기존 FE 구조
- 가정 목록을 사용자에게 제시 → 확인 후 진행 (가정 기반 Spec 방지)
- **DB 스키마 의존 기능 감지 시** → 권위 소스 실측을 blocking 단계로 수행:
  - 스키마 SSoT 파일 존재 (Schema.cs / Prisma schema.prisma / TypeORM entity / Unity SO 등) → 관련 테이블/모델 라인 **Read** (스니펫 추출)
  - live DB 접근 가능 → `SHOW COLUMNS FROM <table>` / `DESCRIBE <table>` / `\d <table>` 실행
  - 둘 다 불가 → `absent` → **GUIDE-STOP**: "DB 접근 정보 또는 스키마 파일 경로를 제공하라" 작업지시 후 정지
  - **stale 의심**: 수동 마이그레이션 관리 프로젝트(Migrations/*.sql 별도 존재) → 파일 Read만으로 ok 금지. "이 파일이 현재 배포 DB 상태를 반영하는가?" [STOP] 1회. 불확실 시 최신 Migrations Read 대조 → 차이 있으면 WARN 명시 후 진행
  - **SSoT 불명확**: Schema.cs / Migrations / live DB 내용 불일치 → 경쟁 소스 목록 나열 + "권위 소스 결정하라" Human 요청. AI 임의 선택 금지
  - **불완전 실측**: Spec 범위 테이블 중 일부만 읽음 → 미커버 테이블 추가 Read 후 박제(전체 커버 시 진행)
  - 실측 결과 → Phase 2 Spec §데이터모델에 **박제** (provenance 태그 필수 — Phase 2 §데이터모델 provenance 참조)
- **기존 FE 코드베이스 수정 포함 감지 시** (HTML/CSS/JS/Next.js 컴포넌트·라우팅·스타일 변경) → FE 실측을 blocking 단계로 수행:
  - **감지 기준**: 기존 components/pages/api 경로 파일 변경·import 포함 → 수정으로 판정(실측 필수). 완전 신규 경로 파일만 추가 + 공용 스타일/컴포넌트 미재사용 → 신규(실측 생략 가능). 기존 tailwind·공용 컴포넌트 재사용 예정이면 신규라도 실측 필수.
  - 컴포넌트 구조: `components/`·`src/components/` 관련 파일 **Read** 스니펫 또는 `find` 트리 출력
  - CSS/스타일: `globals.css`·`tailwind.config.js`·CSS 변수 파일 관련 라인 **Read**
  - Next.js 라우팅: `app/` 또는 `pages/` 구조 (`find app/ -name "page.tsx"` 등) 실행
  - API 라우트 수정 포함 시: `app/api/`·`pages/api/` 경로 목록 + 기존 핸들러 파일 **Read** 스니펫
  - 기존 코드베이스 접근 불가 → `absent` → **GUIDE-STOP**: "프로젝트 루트 경로 또는 관련 파일 경로를 제공하라" 작업지시 후 정지
  - 실측 결과 → Phase 2 Spec §화면/UI·§API 계약에 **박제** (provenance 태그 동반: `source: <파일경로> @ <date>`)

**Phase 1 — 기존 Spec 확인**
- `.specify/specs/` 탐색
- 동일 기능 Spec 존재 시 사용자 확인 [STOP] → 덮어쓰기 or 신규

**Phase 2 — Spec 작성**
- `spec-writer` 에이전트 호출 (정의 파일: `agents/spec-writer-base.md`, 레지스트리 name: `spec-writer`)
- 인자: `--spec <path>` 기존 Spec 갱신 / `--plan <dir>` 계획서 디렉토리 / `--bulk <path>` 대량 모드
- Spec 저장: `.specify/specs/YYYY-MM-DD-{slug}.md`
- **도메인 폴더 연계**: `--plan <dir>` 인자가 `{domain}/` 도메인 폴더인 경우 → `{domain}/spec/YYYY-MM-DD-{slug}.md`에도 저장 (도메인 폴더 자동감지 — `_registry.yaml` 또는 `00-도메인개요.md` 존재 여부 기준). `.specify/specs/`는 항상 SSoT 유지.
- **미러 파일 헤더 의무 (P5-c, drift 방지)**: `{domain}/spec/` 미러 저장 시 파일 상단 첫 줄에 반드시 삽입:
  ```
  <!-- GENERATED MIRROR of .specify/specs/<X> @ <date> — DO NOT EDIT. SSoT=.specify/specs/ -->
  ```
  미러 파일 직접 편집 금지 — 항상 `.specify/specs/` 정본 편집 후 재미러링.
- **§데이터모델 provenance 태그 (Schema Ground-Truth Gate)**: DB 스키마 의존 기능 §데이터모델 작성 시 각 테이블/컬럼 명세에 출처 태그 동반 필수. 태그 없는 항목 = 미검증.
  - 파일 소스: `source: <파일경로:라인> @ <date>`
  - live DB: `source: SHOW COLUMNS FROM <table> @ <date>`
  - 형식 예시:
    ```
    #### tb_user (source: Data/Schema.cs:L120-138 @ 2026-06-29)
    | 컬럼      | 타입      | 비고                    |
    |-----------|-----------|-------------------------|
    | id        | BIGINT PK |                         |
    | create_at | DATETIME  | ⚠️ created_at 아님(실측) |
    ```

**Phase 2.5 — HTML 시각화 옵션 (복잡도 High Spec)**
- 아키텍처 다이어그램·UI 옵션 비교·상태 전이가 포함된 Spec → HTML 병행 생성 제안
- 저장: `.specify/specs/YYYY-MM-DD-{slug}.html` (Markdown은 AI 지침용 SSoT로 유지)
- 단순 Spec(단일 기능·CRUD)은 Markdown만. (근거: HTML 시각화가 복잡 설계 전달에 우월 — YT 분석 2026-05-18)

**Phase 2.6 — 완결성체인 게이트 (A2, WARN)**
- Spec 작성 완료 후 PRD→FR→AC(acceptance_predicate)→디자인 아티팩트 체인 검증:
  1. 각 FR이 PRD 요구사항에서 파생됐는지 (끊긴 노드=0 목표)
  2. 각 FR이 `acceptance_predicate` **보유 + 측정가능성** 검증 (untestable FR=0 목표):
     - 보유(존재) 여부 + **측정가능 품질**: 각 predicate가 (a)정량 기준(수치·임계값) / (b)관측가능 결과(입력→기대출력) / (c)given-when-then 중 최소 1개를 충족하는가.
     - 비측정 predicate(예: "정상 작동", "잘 됨") → WARN + 구체 보완 요구("어떤 입력에 어떤 관측가능 결과인가?"). WARN-우선(BLOCK 아님 — spec 작성 hard-block 회피, enforcement-theater 방지). 근거: 다운스트림 Check 5.8/qa 루브릭/spec-code 판별기의 입력 품질(GIGO 방지).
  3. 프론트 화면이 있는 경우: `oracle-manifest.json` `uiux` 필드에 화면 매핑 100% 목표
     - oracle-manifest 미존재 시: `oracleStatus: "spec-only"` 명시 + WARN
  4. **프론트 FR 한정 — UI-상태 완결성 서브체크 (G5, WARN-우선)**: 프론트엔드 화면·컴포넌트를 다루는 FR은 AC가 happy-path만이 아니라 **loading / empty / error / partial** 4상태와 **키보드 / focus / live-region** 접근성을 명시적으로 커버하는지 확인.
     - 근거(1줄): LLM이 신뢰성 있게 틀리는 지점 = 비-happy-path UI 상태·ARIA — 리뷰 시점엔 그럴듯해 보이나 배포 후 실패로 드러난다. 그래서 이 항목들은 암묵 전제가 아니라 §2.6 측정가능성 AC 차원으로 명시돼야 한다.
     - 위 4상태·접근성 항목 중 AC에 누락된 것 발견 시 → WARN + "UI-상태 갭: FR-NNN → {누락 상태/축} 미기재" 명시. BLOCK 아님(§2.6 기존 톤 유지).
     - Phase 0.7 FE 실측 구조(§실측 컴포넌트/스타일)와 상호보완 — 실측이 "무엇이 있는가"를 박제한다면, 이 서브체크는 "그 화면의 어떤 상태까지 검증 대상인가"를 측정가능하게 만든다.
- 끊긴 노드 발견 시 → WARN 보고(BLOCK 아님) + "완결성체인 갭: FR-NNN → predicate 미작성" 명시
- 프론트 프로젝트: oracle-manifest.json 생성 또는 갱신 제안

**Phase 2.7 — conflict-detection pre-write (WI-08)**
- Spec 작성 **전** 기존 Spec·ADR 충돌 체크 의무:
  - `.specify/specs/` 전체 탐색 → 동일 FR/기능 범위 중복 여부 확인
  - `docs/adr/` 탐색 → 설계 결정과 상충하는 ADR 존재 여부 확인
  - 충돌 발견 시 → **[STOP]** 사용자에게 충돌 내역 제시 + 해소 방향 확인 후 진행
  - 충돌 없으면 → `conflict-detection: PASS` 명시 후 Phase 2 진행

**Phase 2.8 — grey-area batch proposal (WI-07)**
- 요구사항 분석 시 **회색 지대**(scope 불명확·옵션 분기·다중 구현 방향) 발견 시:
  - DISCOVERY.md artifact 생성: `.specify/discovery/YYYY-MM-DD-{slug}-DISCOVERY.md`
  - 내용: 회색 지대 목록 + 각 옵션 trade-off + 권고 방향
  - **MVP 수직 슬라이스 우선**: 전체 수평 구현(모든 레이어 동시) 대신 단일 흐름 End-to-End 먼저 제안
  - 사용자 확인 후 Spec에 반영 (자의 판단 해소 금지)

**Advisor 조언 (조건부)** — `FORGE_ADVISOR_AUTO` 환경변수가 `"off"`가 아니고 아래 트리거 충족 시 `advisor-strategist` 호출:
- 트리거: **spec 경계/범위 모호** (동일 기능에 복수 접근 가능, scope 결정이 구현 비용에 크게 영향) **또는 NFR(성능·보안·가용성 수치) 충돌** (기획서 수치 vs 현실 제약 불일치)
- PASS(범위 명확 + NFR 충돌 없음) → 스킵

```
Agent(
  subagent_type="advisor-strategist",
  prompt="""<spec 맥락 500토큰 이내>
기능: {기능명}
모호한 경계 또는 NFR 충돌: {경계 이슈 또는 충돌 수치 내용}
선택지: {A 범위 vs B 범위 구체 내용}
제약: {기존 스택, 팀 규모, 마감}

질문: 권장 범위 결정 + 핵심 trade-off 1~2개만."""
)
```

→ 400~700토큰 조언 수령 후 Spec 작성 진행. 조언은 참고용 — Phase 2 Human 승인 게이트에서 최종 결정.

**Phase 2.9 — AI-integration mode (WI-29)**

AI/LLM 기능이 포함된 Spec 감지 시 4-agent sequential pipeline 실행:

```
framework-selector → researcher → domain-researcher → eval-planner
```

**감지 조건**: 사용자 요청 또는 DISCOVERY.md에 `LLM`, `AI`, `embedding`, `vector`, `RAG` 키워드 중 1개 이상 포함 시 트리거.
- **`model` 키워드 단독 false-trigger 방지**: `model`은 "data model"·"사용자 model" 등 AI와 무관한 맥락에서도 빈발 → 단독 등장만으로는 트리거하지 않는다. `model`이 `LLM`/`AI`/`embedding`/`vector`/`RAG` 중 최소 1개와 **co-occurrence**(동일 요청·문서 내 함께 등장)할 때만 트리거로 인정.

**Agent 1 — framework-selector**
- 태스크: AI 기능 구현에 적합한 프레임워크/라이브러리 선정 (LangChain/LlamaIndex/raw API/etc.)
- 출력: `framework: <name>`, `rationale: <1-2줄>`, `alternatives: [...]`

**Agent 2 — researcher**
- 태스크: 선정 프레임워크의 패키지 legitimacy + 공식 docs 검색 (context7 우선)
- 출력: `docs_url`, `latest_version`, `legitimacy: OK|SUS|SLOP`

**Agent 3 — domain-researcher**
- 태스크: 해당 AI 도메인 검증 패턴 조사 (고정 seed, 구조 검증, mock 전략)
- 출력: `test_strategy: deterministic|schema-validation|golden-set`

**Agent 4 — eval-planner**
- 태스크: eval 케이스 초안 생성 (입력/기대 출력 구조, PASS 기준)
- 출력: `evals.json` 구조 초안 (evals 시스템 SSoT = skill-creator 관할)

**산출물 — AI-SPEC.md (locked design contract)**
```
.specify/ai-spec/{YYYY-MM-DD}-{slug}-AI-SPEC.md
```
내용:
```markdown
## AI Integration
- Framework: {framework} {version}
- LLM 파라미터: model / temperature / max_tokens / top_p
- 프롬프트 버전: prompt-v{N}.md (변경 시 AI-SPEC.md 갱신 의무)
- 비결정 출력 테스트: {test_strategy} — 고정 seed 또는 출력 스키마 검증
- 폴백 전략: LLM 호출 실패 시 (재시도 / 기본값 / 에러 반환)
- Eval 초안: {evals.json 구조 참조}
```

**Edit-only discipline**: AI-SPEC.md 생성 후 재생성 금지. 변경 = Edit 도구만. Spec 본문에 AI-SPEC.md 참조 링크 추가.

AI 기능 없는 Spec은 섹션 생략 허용.

**M7 EXIT self-check** (`/readiness-gate §M7`): P4 EXIT 항목 전수 확인 → `forge-spec-exit-readiness-{date}.md` 자동생성. FAIL = [STOP] + 보강 작업지시.
- **EXIT ② 판정 강화(measurability 결속)**: `/readiness-gate` P4 EXIT ②("FR 전수 acceptance_predicate")는 존재 여부만 확인하므로 "정상 작동" 같은 비측정 predicate로도 통과 가능 — 갭. forge-spec 실행 시 이 항목은 **존재 확인 + Phase 2.6 측정가능성 통과(비측정 predicate WARN 건수 = 0)**를 모두 충족해야 PASS로 인정한다. Phase 2.6에서 발생한 측정가능성 WARN이 1건이라도 남아있으면 EXIT ②는 FAIL 처리 → [STOP] + 해당 FR predicate 구체화 후 재통과 필수.

**[STOP] Human 검토 + 승인**
- Spec 승인 없이 `/forge-implement` 진입 금지 (PHASE4-IRON-1)

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
