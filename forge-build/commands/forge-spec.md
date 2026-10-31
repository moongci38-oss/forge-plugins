---
description: Spec 작성 단독 명령 (옛 /sdd Phase 0~2)
argument-hint: "<기능 설명> [--spec <기존 path>] [--plan <plan dir>] [--bulk <forge-context-path>] [--waves]"
model: opus
group: plan
---

# /forge-spec

Spec 작성 단독 실행(옛 `/sdd` Phase 0~2). 이 파일이 정본. Phase 세부는 해당 Phase 실행 시점에만 `$HOME/.claude/rules-on-demand/forge-spec-phases-detail.md` 의 해당 절을 Read 한다.

**이슈 먼저**: 시작 전 이 기능의 상위 이슈 번호를 확인한다(없으면 `issue-new.sh` 1장). FR 이슈는 승인 뒤(아래) — 정본 `harness-family-map.md` §이슈 먼저 · 경계 `${FORGE_ROOT:-$HOME/forge}/.claude/rules-on-demand/harness-family-map.md`.

**모델**: 본체 = frontmatter 모델 · 탐색(기존 spec/ADR 충돌·스키마) = `Agent(model:"haiku")` · 고위험 전략 자문 = `advisor-strategist`(모델은 `advisor-spawn-guard.sh resolve` 출력, `gpt-*` 면 `mcp__codex__codex` read-only).

## Iron Law · HARD GATE
- Spec 승인 전 코드·scaffold·파일 생성·DB 마이그레이션 = 즉시 STOP. 통과 조건: Human 승인 [STOP] 완료 + Spec 파일 존재.
- **Code-First Read**: 초안 전 관련 모듈(최소 3개 파일)·기존 유사 Spec·ADR·공유 타입/인터페이스·DB 스키마를 Read. 코드 읽기 전 초안 금지.
- Phase-hard-gate 순서: ①Code-First Read → ②Spec 작성 → ③`/forge-review --stage plan --target <spec>`(가용 시 blocking — FAIL 이면 재작성 후 재통과 / 미가용이면 fail-open + WARN "Codex 미가용 → advisory로 강등, 수동 리뷰 권고") → ④[STOP] Human 승인 → ⑤`/forge-implement` 허용. ⚠️ 지금 동작(실측 #3634): `--blocking` 없이는 막지 않는다 · 옛 이름 `--stage spec` 은 `plan` 으로 돈다(#3638). 위반 = 구현 즉시 STOP + 게이트 복귀.
- Red Flags 즉시 이행: "기획서 없어도 바로" → Phase 0 먼저 / "태스크는 추상 설명" → §8 실제 코드블록+커밋메시지 / "에러 핸들링 추가라고만" → 실제 try-catch 코드. 배경 → `rules-on-demand/forge-spec-phases-detail.md §Red Flags`.

## Step 0-pre — intent.md 입력 (첫 입력 · #1443)
Spec 은 **무엇**을 적는다. 그 앞의 **왜**는 `intent.md` 가 갖는다 — 그래서 이 단계가 Spec 의 첫 입력이다.
⚠️ intent.md 는 CLAUDE.md 처럼 자동으로 읽히지 않는다 — **여기서 명시해 읽어야 한다**.

절차 = `${FORGE_ROOT:-$HOME/forge}/docs/intent/STEP.md` 를 Read 해 따른다 — 찾기(`planning-dirs.py --kind intent` · 옛 자리 포함) · 없으면 5칸으로 먼저 만들기 · **intent 이슈에 사람이 쓴 승인·결정 문장(총괄 반영)이 없으면 Spec 을 쓰기 전에 [STOP]**(승인 관문 `STEP.md` 4번 · `상태:` 칸만으로는 승인이 아니다 · 기획서·계획서와 달리 여기서는 진행하지 않는다 · 사람 키 서명은 없앴다 — #4080) · 자명한 작은 버그는 1줄 기록. 찾은 intent 는 Spec 의 "왜"(배경·목표·성공 기준·범위 밖) 근거로 삼고 Spec 머리말에 `intent: <경로>` 1줄로 인용한다.

근거: Anthropic AI-Native SDLC 플레이북(2026-08-21) `intent.md → spec.md → plan.md` 체인 · 5개 섹션 원문. 분석 원장 → `forge-outputs/01-research/videos/analyses/2026-09-06-4kXsF2S5MNY-…-analysis.md`(팩트체크 1·2 ✅ 1차 소스 확인).
검수 기준 사본 = 레포 루트 `REVIEW.md`(Pass1 버그 / Pass2 보안 / Pass3 spec·plan 준수).
폐기조건: 사람이 intent 단계를 철회하면 이 절과 `docs/intent/STEP.md` · `docs/intent/TEMPLATE.md` 를 함께 지운다.

## Step 0 — 기억 회상 (선행 필수)
`bash "${FORGE_ROOT:-$HOME/forge}/shared/scripts/recall-context.sh" --stage forge-spec --query "<기능 키워드>"` → learnings·RAG(위키 포함)·brain 을 기계가 모아 준다(조회 기록도 자동). 적중 건은 Spec "선행 지식" 에 출처(learnings ID·파일 경로)로 남기고, 0건이면 "조회함 + 0건" 1줄.

## Step 0.1 — 라우팅 승격 게이트 (WARN 전용, 비차단)
- `bash "${FORGE_ROOT:-$HOME/forge}/shared/scripts/harness-escalation-check.sh" --cmd forge-spec --fr <FR 수> --files <대상 파일 수> --domains <도메인 수>`
- 권고가 나오면 `forge-core.md §병렬 실행` 라우팅 4분법 표로 레인을 정하고 **1줄 기록**(미기록 = 결측): `bash "${FORGE_ROOT:-$HOME/forge}/shared/scripts/harness-escalation-check.sh" decision --rec-id <권고에 찍힌 rec_id> --decision <wave|teams|workflow|main>`
- 끄기 `FORGE_ESCALATION_GATE=off` · 스크립트 부재·실패는 무시하고 진행(fail-open).

## 실행 단계

**Phase 0 — Readiness 판정**(4-state + GUIDE-STOP + ADAPT — 아래 0-b · 옛 0-a 선행 P3 게이트는 P3 폐지로 삭제 #3736). 세션 재진입 시 `{domain}/_STATUS.md` read → resume/fresh(M9).

**Phase 0-b — 요소 스캔**: 진입 계약 표의 **행 전부**(개수 하드코딩 금지)를 4-state 판정.
전부 ok → **PASS**(Phase 1) · normalize/derive만 → **ADAPT**(Phase 0.5) · absent 1개+ → **GUIDE-STOP**(`forge-spec-readiness-{date}.md` 출력 후 정지).

**Phase 0.3 — 기획 계약 L2 대조** (기획이 폴더형일 때만 — 기획 패키지 폴더 `planning-dirs.py --project-root <레포> --kind plan`(기본 `docs/03-plan` · rc 2 = 판정 불가 → [STOP]) 아래 `<slug>/` · #3600)
```bash
python3 "${FORGE_ROOT:-$HOME/forge}/shared/scripts/planning-contract-lint.py" <기획폴더>
```
- 기본 exit 0(차단 안 함, `--strict` 만 exit 1). GAP 이면 린터의 객관식 질문을 그대로 제시 → 답을 `DECISIONS.md` 에. 무응답이면 권장안 + `미응답` 기록.
- **다이어그램 인용 의무**: 기획 폴더에 `flow.d2` 가 있으면 Spec 본문에 그 흐름을 인용·유지한다(spec `## 화면` 흐름 지도는 Mermaid, 기능 흐름 인용은 D2 — 통일하지 않는다).

**Phase 0.5 — ADAPT**: ①normalize → 자동 변환(내역 1줄씩) ②derive → 자동 초안 + `vetted_by: ai-inferred` → **[STOP] 1회 일괄 확인** ③Phase 1.

**Phase 0.7 — 가정 표면화 + Ground-Truth 실측**: 암묵 가정 → 사용자 확인. DB 스키마 의존·기존 FE 수정 시 권위 소스 실측 **blocking**(불가 → GUIDE-STOP, stale/SSoT 불명확 → [STOP]/Human, 결과는 Phase 2 에 박제). 상세 `§Phase 0.7 DB/FE 실측 세부`.

**Phase 1 — 기존 Spec 확인**: `.specify/specs/` 탐색. 동일 기능 Spec 존재 시 [STOP] → 덮어쓰기 or 신규.

**Phase 2 — Spec 작성**: `spec-writer` 에이전트(정의 `agents/spec-writer-base.md`). 인자: `--spec <path>` 갱신 / `--plan <dir>` 계획서 / `--bulk <path>` 대량.
- 저장: `.specify/specs/YYYY-MM-DD-{slug}.md`(SSoT). `--plan` 이 도메인 폴더(`_registry.yaml`/`00-도메인개요.md`)면 `{domain}/spec/YYYY-MM-DD-{slug}.md` 미러.
- 미러 헤더 + §데이터모델 provenance 태그 필수 → `§Phase 2 미러 헤더·provenance`.
- `## 도메인 모델`(유비쿼터스 언어 표·애그리거트·불변식·도메인 이벤트) + `## 모듈·책임`(OOP — 책임 단위 이름·도메인 언어만 · 인터페이스·주입은 구현 몫 — 옛 Plan 1-M4c 는 #3736 폐지) 절 **필수** → `§Phase 2 도메인 모델·모듈 책임` · 원칙 정본 `${FORGE_ROOT:-$HOME/forge}/.claude/rules-on-demand/design-principles.md`(#2052).
- 재-spec 은 항상 Human 승인 게이트를 거친다(AI 자동 Spec 변경 금지).
- **표면 분할(권고, 차단 아님)**: Spec 단위(PR 이 될 FR 묶음)마다 새 표면 수 선언 후 실행, 결과를 Spec 에 적는다.
  ```bash
  python3 "${FORGE_ROOT:-$HOME/forge}/shared/scripts/cr-surface-count.py" declare --units-file <units.json>
  #   units.json = [{"name":"FR-1..3 라운드 상한","surface":1}, ...]  rc 0 진행 · rc 1 쪼개기 권고 · rc 2 판정 불가(선언 누락)
  ```
  표면 = 새 CLI 서브커맨드·플래그/환경변수/종료코드·결정 값/공개 심볼(내부 헬퍼·문서·테스트 제외). 셀 수 없으면 `surface: 0` + 사유 1줄. 원자 단위 override `FORGE_CR_SURFACE_MAX_HUMAN_OVERRIDE=<N>`.

**Phase 2-W — 도메인 병렬 작성** (`--waves` **그리고** 도메인 ≥3 일 때만, 아니면 단일 패스)
```
Workflow({ scriptPath: "${FORGE_ROOT:-$HOME/forge}/shared/scripts/forge-spec-waves.workflow.js",
           args: { specDir: ".specify/specs", domains: [{name, brief}, …], requestId } })
```
- 도메인 이름 `^[a-z0-9][a-z0-9_-]{0,63}$` · 중복 불가(위반 → 스폰 전 stop). Wave 1 은 도메인당 `{domain}.spec.md` 하나만, FR id 는 `FR-{domain}-N`.
- 레그 실패 → 그 레그만 1회 재시도 → 잔존 시 [STOP](부분 산출물로 Wave 2 금지). Wave 3 은 spec 전량 + 교차 검수 리포트를 함께 받는다.
- 스펙당 게이트(M1·기존 spec [STOP]·M7·Phase-hard-gate)는 요청 단위 1회. Wave 2 는 WARN-first, Wave 3 codex-review 는 blocking.
- 반환 `status`: `ok`(Wave3 PASS) → 진행 · `skip`(도메인 <3) → 단일 패스 · `stop`(이름 위반/`failedDomains`/Wave3 FAIL/Wave3 결과 부재) → **[STOP]**.

**Phase 2.4 — 화면·시안** (UI 가 있을 때 · 옛 `/prd` 5~8단계 · #4084): spec `## 화면`(`### 화면 목록` · `### 화면 흐름 지도` · `### 화면별 명세` — 템플릿 `spec-template-base.md`)을 아래 순서로 채운다. UI 가 없으면 `## 화면` 에 `해당 없음 — <이유 1줄>` 로 끝. 순서 근거(#3142): 빠진 정보는 그림에서 먼저 보이고 비개발자 검토는 그림이 빠르다 · 범위(§2 FR `우선순위: Must | Nice` · §5.1 범위 밖)를 정하기 전에 화면부터 그리면 다시 그린다. 설계 폴더 = `python3 "${FORGE_ROOT:-$HOME/forge}/shared/scripts/planning-dirs.py" --project-root <레포> --kind design`(rc 2 → [STOP]) — 시안·한 장 보기는 거기, spec 은 `.specify/specs/` 하나(설계 폴더에 복제하지 않는다).
1. 화면 목록(화면 ID kebab-case 영문·고유 | 화면명 | 1줄 목적) + 화면 흐름 지도(Mermaid · 노드 = 화면 ID 전수 · 목록 밖 노드 금지 · 화살표 = 버튼·조건 `-->|조건|` · 노드마다 `click {화면ID} "s3-mockup/{화면ID}.png"` · 한 장 ≤15 노드, 넘으면 `#### 영역: {이름}` 아래 여러 장 · 영역 사이 이동은 양쪽에 같은 노드) → 검사 1회 `python3 ${FORGE_ROOT:-$HOME/forge}/shared/scripts/prd-screen-flow-check.py <spec>` — WARN(빠진 화면·목록 밖 노드·15 노드 초과)은 spec 을 고치고 진행(비차단).
2. lofi 뼈대 — 배치 합의: 화면 전수 `/forge-mockup --lofi --screen <화면ID> --project <설계 폴더>` → 회색 박스 `s3-mockup/lofi/{화면 ID}.{html,png}`(싼 모델 · 스타일 가이드·`DESIGN.md` 없이 · #2801). 사람과 배치를 합의한다 — 그림에서 빠진 정보·버튼을 찾으면 FR·화면 목록을 먼저 고친다. 합의 전 **[STOP]**.
3. 화면별 명세(`### 화면별 명세`): 화면마다 lofi 그림 + 상태(기본·빈·로딩·오류·권한 없음 — 상태마다 무엇이 보이나 1줄) + 주석표 `| # | 요소 | 동작(누르면 → 어디로·무엇이) | 오류(조건 → 표시·복구) | 역할 | FR |`(그림 위 번호 ①② = 표 #). 화면 전수 · 빠진 화면 = **[STOP]**. 화면에 보이는 상태·동작·오류·권한은 여기에만 적는다.
4. 디자인 방향 + hifi 시안(Human 이 방향을 정한 뒤 · 배치는 2번 lofi 합의를 따른다): 참고 자료면 `/screenshot-analyze` → 스타일 키워드(URL = https 공개 출처만 / 이미지 ≤10MB, PNG·JPG·WEBP, EXIF 제거, PII·시크릿 금지 → 위반 입력 폐기 · 출처·라이선스는 style-guide 에) → `/style-forge` → `YYYY-MM-DD-s3-style-guide.md` · 토큰: `shared/design-tokens/DESIGN.template.md` → 설계 폴더 `DESIGN.md` 로 복사해 style-guide·전역 기본값 근거로 채운다(direction 1개, primitive→semantic→component · 이후 Edit-only · 프론트는 권고) · 시안 1순위 `/forge-mockup --screen <화면ID> --project <설계 폴더>`(GPT 코더 코드 목업 · 신규 시안 sol · #3232) → `s3-mockup/{화면 ID}.png` + 코드 `s3-mockup/{화면 ID}/` 보존(HTML = `s4-pages` 초안) · `DESIGN.md` 없으면 경고(토큰 먼저) · 2순위 Claude Design 은 1순위 불가·실패 때만(Human 통보) · ⛔ Stitch · 화면마다 1개 이상, 누락 = [STOP] · 검수: `/forge-review --lens ui` (1회 — CRITICAL ≥1 이면 고치고 `/visual-loop` 캡처로 확인 · 다시 부르지 않는다 · 2회 고쳐도 남으면 [STOP]).
5. 한 장 보기: `python3 ${FORGE_ROOT:-$HOME/forge}/shared/scripts/plan-onepage.py <설계 폴더> --spec <spec 경로>` → `plan-onepage.html`(안 할 것→요약→기능→흐름→시안 · 빈 칸은 "없음" · 비차단). 승인([STOP] M1)은 화면 포함 spec 으로 받는다.

**Phase 2.5 — HTML 시각화**: 복잡도 High(아키텍처·UI 옵션·상태 전이) Spec 만 HTML 병행 제안 → `§Phase 2.5 HTML 시각화`.

**Phase 2.6 — 완결성체인 (WARN)**: intent→FR→AC(acceptance_predicate)→화면(spec `## 화면`) 체인 — 끊긴 노드=0, predicate 측정가능성, 화면 매핑(oracle-manifest), UI-상태(G5), 시각 바인딩(F3). 갭 → WARN(BLOCK 아님). 상세 `§Phase 2.6 완결성체인 세부`.

**Phase 2.7 — conflict-detection (작성 전)**: 기존 Spec·ADR 충돌 → [STOP] 해소 후 진행 / 없으면 `conflict-detection: PASS`. 상세 `§Phase 2.7 conflict-detection`.

**Phase 2.8 — grey-area**: scope 불명확·옵션 분기 → DISCOVERY.md + MVP 수직 슬라이스 제안, 사용자 확인 후 반영. 상세 `§Phase 2.8 grey-area batch`.

**Advisor (조건부)**: `FORGE_ADVISOR_AUTO≠off` + (범위 모호 또는 NFR 충돌) → `advisor-strategist`. 참고용 — 결정은 Human 게이트. 템플릿 `§Advisor 조언 프롬프트 템플릿`.

**Phase 2.9 — AI-integration**: `LLM`/`AI`/`embedding`/`vector`/`RAG` 감지(`model` 단독 제외) → framework-selector → researcher → domain-researcher → eval-planner 순차 → `AI-SPEC.md`(locked, Edit-only). 상세 `§Phase 2.9 AI-integration 파이프라인`.
- 조사 단계 축약 시 spec 상단 `research: abbreviated` + 근거 1줄. 수치는 절대값 병기(`월 30,000건(3만)`), 수치와 근거는 분리 표기(`mem_level=1 (실유저)`). 축약 단독 표기는 Phase 2.6 측정가능성에서 WARN.

**Phase 2.95 — 기술 검토 (Wave 3 · cto-advisor · 옛 `/forge-plan` Step 4-② · #3736)**: Spec 에 `## 기술 스택`·`## ADR` 절이 있을 때만. 리졸버 경유 `MODEL=$(bash "${FORGE_ROOT:-$HOME/forge}/shared/scripts/advisor-spawn-guard.sh" resolve)` → `claude-*`면 `Agent(subagent_type="cto-advisor", model:"fable"|"opus")`, `gpt-*`면 `mcp__codex__codex`(read-only). 7축 → 반환 본문을 호출자가 그대로 `<레포>/docs/reviews/wave3-cto-{date}.md` 에 저장(cto-advisor 는 Write 없음 · #3746) · `Critical` ≥1 이면 Spec 을 고친다 · 리포트 `## 단계 점검` 의 `빈칸:` 이 `없음` 이 아니면 그 번호 목록을 `[STOP]` 1회 확인 대상으로 올린다(FAIL 게이트 아님 · 답은 Spec `## 우려 사항` 에 적고, '해당 없음'이면 그 사유를 적고 진행 · #3632) · 빈칸 읽기 = `grep -m1 '^빈칸: ' <리포트> || echo '빈칸: 전부(단계 점검 절 없음)'` — 절·줄이 없으면 9칸 전부 빈칸으로 본다(fail-closed).

**M7 EXIT self-check**: `forge-spec-exit-readiness-{date}.md` 생성. FAIL = [STOP] + 보강 작업지시. EXIT ② = 존재 + Phase 2.6 측정가능성 WARN=0. 상세 `§M7 EXIT 판정 강화`.

**[STOP] Human 검토 + 승인 — M1 Intent-Lock** (매 실행 필수)
- **AC 없는 FR 먼저**(#4062): `python3 ${FORGE_ROOT:-$HOME/forge}/shared/scripts/spec-fr-without-ac.py <spec>` 의 첫 줄 `AC 없는 FR: N개` 를 승인 요청에 그대로 붙인다(검수 한 장 3번 칸 · `docs/intent/STEP.md` 4번). rc 1(N ≠ 0)·rc 2(판정 불가)면 승인 대기로 올리지 않고 `AC 보완 필요` — AC 를 채운 뒤 다시 센다.
- 4줄 계약 제시: ①보장 동작 ②왜 ③어디에 어떻게 붙나 ④핵심 결정·트레이드오프. Human 에게 restate/교정 요청(restate 후 "ㅇㅇ" 유효).
- restate 없이 승인만 → 진행하되 spec 헤더 `intent_lock: unconfirmed` + `${FORGE_OUTPUTS:-$HOME/forge-outputs}/.claude/audit/complement-protocol.jsonl` 에 `{ts, mech:"M1", event:"intent_unconfirmed", spec, session}` append(실패해도 진행). restate 수신 → `event:"restate_received"` + `intent_lock: confirmed`(`intent:` 는 intent 파일 경로 칸).
- "M1 끄자" 한마디면 skip. Spec 승인 없이 `/forge-implement` 진입 금지.
- **승인 뒤 이슈 등록**: Spec 태스크(FR)를 work-plan 양식(5단계 — 담당·검수·확인 방법·마일스톤)으로 `bash ${FORGE_ROOT:-$HOME/forge}/shared/scripts/issue-new.sh` 등록(이미 있으면 그 번호 재사용) → `/forge-implement` 는 그 이슈 번호로 시작.

**교차 검수 제안**: Spec 저장 직후 사용자에게 제안 1줄을 보인다 — "2벤더 교차 검수가 필요하면 `/forge-multi <경로>` (승인하면 Claude+Codex 로 돈다 · 자동 실행 안 함)". 묻지 않고 부르지 않는다.

**다음 단계 · Exit**: 이슈 1건이면 그 이슈 번호로 `/forge-implement`(P5) · 여러 건이면 `/work-plan`. Exit: 0 완료+승인 · 1 전제조건 미충족(기획서/계획서 없음) · 2 spec-writer 실패.
