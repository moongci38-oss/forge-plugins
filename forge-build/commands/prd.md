---
description: 기획 첫 단계 — 아이디어를 입력하면 요구사항 명확화 + intent(왜) 1장 생성 · PRD 문서는 폐지(무엇·화면은 /forge-spec)
argument-hint: <제품/기능 아이디어 설명>
allowed-tools: Read, Write, WebSearch, WebFetch, Glob, Grep
model: sonnet
group: plan
---
> **⚠️ 실행 모드 확인**: 이 커맨드는 쓰기 모드에서만 정상 동작합니다. Plan mode 감지 시 즉시 [STOP] — "Escape로 plan mode 해제 후 재실행하세요. 내부 [STOP] 게이트가 승인 지점입니다."

당신은 제품 기획 전문가입니다. 이 명령은 **intent(왜) 1장**을 만듭니다 — 요구사항 명확화(2~3 명확도 스코어 + 갭 분석 질의)·시장 조사·에이전트 회의는 본 커맨드 내장 절차(2~5)로 수행하고, 결과는 intent 5칸과 `## 사업 근거` 에만 넣습니다.

## 제품/기능 아이디어
$ARGUMENTS

## 진입 — intent · track · Readiness (`/forge-design` 흡수 · #3737)
흡수 기록: 기획서 진입 디스패처 `/forge-design`(track 분기 → `/prd` 위임)은 2026-10-28 #3737 로 이 명령에 합쳤다 — 진입은 `/prd` 하나다.
- **intent(첫 입력 · #3599)**: `${FORGE_ROOT:-$HOME/forge}/docs/intent/STEP.md` 를 Read 해 따른다 — 이 변경의 intent 가 없으면 여기서 5칸으로 만든다(`상태: draft` 로도 진행). 찾은 intent 를 "왜" 근거로 쓴다.
- **track**: `bash "${FORGE_ROOT:-$HOME/forge}/shared/scripts/forge-design-track.sh" [--track <값>]` → `TRACK=` · `SOURCE=arg|workspace|none|error`(인자 최우선 → `forge-workspace.json` CWD→devTarget 역매핑).
  - `TRACK=web` → 아래 수행 절차 그대로.
  - `TRACK=game` → 이 단계에서 안내하고 멈춘다: 게임 기획서(GDD)는 이 명령이 쓰지 않는다(`/gdd`·`gdd-writer` 는 2026-09-27 #1370 삭제 · 사람 결정 #2135 A 되살리지 않음) — 사람이 기획서를 써서 `docs/gameDesign/<기능>/original/` 에 두거나, 웹·앱 범위면 `--track web` 으로 다시 부른다. **[STOP]**
  - `TRACK=none`·판정 불가(rc 2) → **[STOP]** `--track web` 을 명시해 다시 부르라고 1줄(임의 기본값 금지).
- **Readiness(경량)**: 컨셉/목표 · 타깃 사용자 · 문제정의 중 1개+ 가 있으면 진행 · 셋 다 없으면(완전 빈 입력) `prd-readiness-{date}.md` 에 무엇이 필요한지 적고 **GUIDE-STOP**. intent 완성도를 미리 요구하지 않는다.
- **조언자(조건부)**: `FORGE_ADVISOR_AUTO` 가 `off` 가 아니고 아키텍처·접근 선택이 비자명(동등 선택지 2+ 또는 핵심 trade-off 충돌)이면 `advisor-strategist` 에 결정점만 묻는다(권장 접근 + 근거 1~2개). 자명하면 건너뛴다.

## 수행 절차

결과물 = **intent 1장**(#4084 · 사람 결정 2026-10-28 "PRD 문서 폐지 — 왜는 intent, 무엇은 spec"). 양식 = intent 5칸(`docs/intent/TEMPLATE.md`) + `## 사업 근거`(새 제품일 때 — 경쟁·RICE·일정). 화면·FR·RICE 표·시안은 여기서 쓰지 않는다 — 화면 목록·흐름·화면별 명세·lofi·DESIGN.md·hifi 시안·한 장 보기는 `/forge-spec` Phase 2.4(spec `## 화면`)가 한다. 옛 `*s3-prd.md` 는 지우거나 고치지 않는다(옛 제품 호환 — 읽는 쪽은 spec 먼저·없을 때 옛 PRD).

0. **기억 회상**(선행): `bash "${FORGE_ROOT:-$HOME/forge}/shared/scripts/recall-context.sh" --stage prd --query "<제품·기능 키워드>"` (조회 기록 자동). 적중은 intent `## Constraints` 아래 "선행 지식" 1줄에 출처(learnings ID·파일 경로), 0건이면 "조회함 + 0건" 1줄.
1. **기존 문서 확인** (M5 모드 판정): intent 폴더(`STEP.md` 1번)·설계 폴더(10단계)·옛 자리 `${FORGE_OUTPUTS:-$HOME/forge-outputs}/02-product/{project}/` 에서 관련 기존 intent·기획서(옛 PRD)가 있는지 확인
   - **자산 존재 → 검증·보강 모드**: 그 문서의 왜(문제·대상·기대 결과·범위 밖·위험)를 intent 칸으로 가져오고 칸마다 출처를 단다 · 빈 칸만 보강(`ai-inferred` 태그 · [STOP] 1회). 비파괴 — 옛 문서는 고치지 않는다.
   - **자산 전무 → 신규 생성 모드**: 2단계부터
2. **명확도 평가**: 요구사항 명확도 0-100점
3. **갭 분석**: 90점 미만이면 부족 영역(타겟 사용자·핵심 문제·성공 지표·범위·기술 제약) 구체화 질문 — 답은 intent 칸으로(문제 → Problem · 성공 지표 → Proposed outcome · 대상 → Affected users and systems · 범위 밖·기술 제약 → Constraints · 못 정한 것 → Open questions)
   - **질의 규약 필수**: `${FORGE_ROOT:-$HOME/forge}/.claude/rules-on-demand/grilling-protocol.md` — 질문은 **한 번에 하나씩**, 각 질문에 **권고안 + 근거 1줄** 동반, 문서·코드로 확인 가능한 **사실은 묻지 말고 직접 조사**. 위 영역을 한꺼번에 나열해 묻는 것은 금지.
   - **되묻기 모드**(필요한 곳만): 문제 정의·타겟 사용자·성공 지표·핵심 가치에 사람 답의 근거가 비었거나 · 명확도가 낮거나 · 권고안과 답이 갈리거나 · 답끼리 모순될 때만 같은 파일 `## 되묻기 모드` 를 따른다(열린 질문 1개씩 · 답을 먼저 주지 않는다 · 영역당 왕복 3회). 결과는 intent `## Open questions` 아래 `### 되묻기 결과` 표(가정 | 반례·근거 | 결론 확인됨/바뀜/미검증), 넘어간 가정은 같은 칸에 "미검증 가정".
4. **시장 검증**: 웹에서 유사 제품/경쟁사 조사 (출처 URL, 날짜 포함) → intent `## 사업 근거` 경쟁 분석
4.5. **(Phase 2 skip 시) 5요소 체크리스트 작성**: `gate-log.md`에 페르소나·가치제안·Moat·가격·위험 5요소 각각 = `충족` + 근거 1줄 기록. 1개라도 미충족 → **[STOP]** (Phase 2 진행 권고)
5. **에이전트 회의 (4관점 3라운드) → intent 초안**:
   - Round 1: 전략가·사용자 옹호자·기술 아키텍트·비판자 독립 초안 (병렬, 앱/웹=4명) → 탈락 필터: Phase 2 완료 시 = Don't 태그 위반 초안 탈락 / Phase 2 skip 시 = 4.5의 5요소 체크리스트 미반영 초안 탈락
   - Round 2: 교차 크리틱 — 각 에이전트가 타 관점 반박·보완
     - **너무 빨리 모두 동의하면**(4관점이 다 같은 안을 지지) 비판자가 가장 강한 반대안 1개를 세우고 반박 라운드를 한 번 더 한다 — 결과를 회의 비교표에 1줄(`조기 합의 → 반대 논쟁 1회`) (#3297 · roast-room)
   - Round 3: Lead가 수렴 → 최적안으로 **intent 5칸 + `## 사업 근거`**(경쟁·RICE 근거·일정·마일스톤) 완성 (명확도 90점 이상). 화면·FR·RICE 표는 쓰지 않는다(`/forge-spec` 몫)
     - 어느 관점이든 **망할 위험**(되돌릴 수 없는 손실·현금 고갈·법적 위험)을 근거와 함께 짚으면 최적안 판정은 "조건부" 이하 — 그 위험을 해소할 조건을 함께 적는다 (#3297 · roast-room)
   - `agent-meeting-template.md` 형식 비교표 + 선택 근거 → intent `## 사업 근거` 아래 `### 에이전트 회의 결과`(사업 근거 절이 없는 변경이면 선택 근거 1~3줄을 `## Proposed outcome` 아래). 충돌 해소 불가 → **[STOP]**
   - 산출물: `<intent 폴더>/<YYYY-MM-DD>-<slug>.md` + 같은 이름 `.html`(`STEP.md` 1·3번)
6. **검토 — [MANDATORY — 건너뛰기 금지] /prd-review 5관점 검토**: 5단계 intent 완성 직후 반드시 실행. (조각 P5 — #3738 뒤 이 단계를 "intent 검토"로 다시 맞춘다 · 그때까지 아래 그대로)
   - 입력: 5단계 intent(옛 제품 보강이면 그 PRD 도). 사업·디자인/UX·개발·QA·보안 5관점 동시 검토 → 지적마다 등급(심각/주의/제안)·해결안 1줄 · 결과 `<intent 이름>-review.md` + intent 머리 요약 3줄. 심각 0건 → 단계 7
   - **심각 ≥1 → intent 를 고치고 단계 7 로 간다** — `/prd-review` 를 다시 부르지 않는다. 고칠 수 없는 심각 → **[STOP]**
7. **검토 — /forge-review --stage plan (권고 · 1회)**:
   - `/forge-review --stage plan --target <intent 파일 경로>` — 1회. FAIL 지적은 intent 에 반영하고 진행한다(다시 부르지 않는다). 결과: `forge-outputs/docs/reviews/plan/{date}-{slug}.{md,json}`
8. **intent 승인 안내**(`STEP.md` 4번): 승인 = 사람이 intent 이슈에 쓴 승인·결정 문장(총괄 반영) — `/prd` 는 승인 전이어도 진행하고 "intent 가 아직 미승인 — `/forge-spec` 전에 사람 승인 문장 필요" 1줄만 알린다(사람 키 서명은 없앴다 — #4080).
9. **(Human 요청 시만) PPT 변환**: `/pptx` 스킬로 .pptx 생성
10. **저장**: intent 폴더 = 그 프로젝트 레포의 `python3 "${FORGE_ROOT:-$HOME/forge}/shared/scripts/planning-dirs.py" --project-root <레포> --kind intent`(기본 `docs/00-intent` · 레포 `.claude/readonly-session.json` `planning_dirs` 로 바꾼다 · rc 2 = 판정 불가 → [STOP]) — 그 아래 `<YYYY-MM-DD>-<slug>.md` + `.html`(`STEP.md` 3번) 저장
    - 커밋(저장 뒤 마지막에): `bash "${FORGE_ROOT:-$HOME/forge}/shared/scripts/planning-commit.sh" --repo <레포> --message "docs(intent): {project} intent"`(기획 폴더 변경만 pathspec 커밋 · push 는 하지 않는다 · 트레일러는 커밋 규칙대로 `--message` 에). 읽기 세션은 커밋하지 않는다(거부 rc 2) — 다음 쓰기·겸용 세션 `/forge-start` §0b 가 같은 명령으로 커밋한다.
11. **다음 단계 안내(필수 출력)**: `다음 단계: /forge-spec <기능 설명> — Spec(무엇 + 기술 결정 · 화면·시안은 Phase 2.4)`
    ⚠️ P3(`/forge-plan`)는 폐지됐다(#3736) — P2 다음은 P4(`/forge-spec`)다.
