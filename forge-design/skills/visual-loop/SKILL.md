---
name: visual-loop
description: "프론트엔드 변경을 실제 브라우저 렌더링으로 캡처해 Vision 분석한다. UI 코드를 수정한 직후 시각 회귀를 확인할 때 사용한다."
argument-hint: "[url] [--viewport=desktop,tablet,mobile]"
allowed-tools: "Bash,Read,Write,Edit,Glob,Grep,Skill,Agent"
context: fork
model: sonnet
---

**역할**: 당신은 프론트엔드 변경사항을 정적+시각 closed loop로 검증하는 UX 품질 엔지니어입니다.
**컨텍스트**: 자체 정적 분석 후 "실제 렌더링이 의도한 대로 나오는지" 추가 검증이 필요한 시점에 호출됩니다.
**출력**: 3 viewport 스크린샷 + Gemini Vision 분석 + 정적 분석과의 delta 리포트.

# Visual Loop Skill (Boris Chrome 확장 패턴의 WSL 대체)

> 출처: Boris Cherny 15 features (Chrome 확장 + Claude Desktop 브라우저 자동 검증 루프)
> WSL 제약: Chrome 확장/Claude Desktop 대신 Playwright + Gemini Vision 조합
> 관련 스킬: /screenshot-analyze (비전 분석), /playwright-cli (브라우저 자동화)

## PoC 목적

**정적 분석의 맹점 보완.** 정적 분석만으로는 실제 브라우저 렌더링 결과(폰트 로딩 실패, flex 깨짐, 3rd-party CSS 간섭 등)는 못 잡음. 이 스킬이 **실제 렌더링을 시각적으로 검증**하여 false negative를 줄인다.

## 실행 조건

- 사용자 수동 호출 `/visual-loop <url>` OR
- Forge Dev Check 8.6 후 시각 검증이 필요한 경우 추가 호출
- `.tsx/.jsx/.css` 변경된 PR에서 시각 검증 필요 시

## 인자

- `$1` = 검증 URL (예: `http://localhost:3000/dashboard`)
- `--viewport=` (선택) = `desktop,tablet,mobile` 중 콤마 구분. 기본: 3개 모두

## 절차

### Step 1 — 사전 검증

```bash
# 1.1 playwright 설치 확인
command -v playwright-cli || echo "playwright-cli 없음 — npm install -g @playwright/cli 필요"

# 1.2 dev server 가동 확인
curl -sf --max-time 3 -o /dev/null "$URL" && echo "server OK" || echo "server 미가동"

# 1.3 dev server 자동 기동 옵션 (package.json 감지)
if [ -f "package.json" ] && grep -q '"\"dev"\"'  package.json; then
  echo "package.json 감지 — 'npm run dev' 병행 실행 필요"
fi
```

Dev server 없으면: 사용자에게 `npm run dev`를 별도 터미널에서 실행하라고 안내 후 **대기 금지 종료**.

### Step 2 — 캡처 (스크린샷 + a11y snapshot, qa/forge-fix 엔진 재사용)

> **정합화**: playwright-cli 단독 스크린샷 → `shared/scripts/playwright-devtools-capture.mjs` 재사용으로 전환 (qa/forge-fix Gate R/G와 동일 엔진 = 로직 단일화). 스크린샷과 동시에 `-aria.json`(a11y snapshot)을 확보해 Step 2.5 기능축 판정 입력으로 쓴다.

```bash
mkdir -p /tmp/visual-loop/

# 3 viewport 병렬 캡처 — viewport당 1회 호출
node "${FORGE_ROOT:-$HOME/forge}/shared/scripts/playwright-devtools-capture.mjs" \
  --url "$URL" --out-prefix /tmp/visual-loop/{vp} \
  --viewports {vp} --phase green
```

**3개 병렬 Agent**로 호출 (각 viewport 담당: desktop/tablet/mobile). 결과 저장:
- `/tmp/visual-loop/{vp}-{vp}-shot.png` (fullPage 스크린샷)
- `/tmp/visual-loop/{vp}-aria.json` (a11y snapshot — Step 2.5 입력)
- `/tmp/visual-loop/{vp}-console.json`, `/tmp/visual-loop/{vp}-network.json` (참고용)

**폴백**: 캡처 헬퍼가 exit 3(`PLAYWRIGHT_UNAVAILABLE`) 반환 시 `/playwright-cli` 스킬로 스크린샷만 폴백 캡처 — 이 경우 aria.json이 없으므로 Step 2.5(기능축)는 skip하고 Step 3(Vision)만으로 진행.

에이전트 브라우저 실행 보안 경계(staging 격리·run-code 감사·시크릿 마스킹·DOM=untrusted): `${FORGE_ROOT:-$HOME/forge}/.claude/rules-on-demand/agent-browser-security.md` 준수.

### Step 2.5 — 기능축 판정 (a11y-tree, 결정론 — 신규)

> **핵심**: "요소가 보이나/작동하나"는 Vision이 아니라 **aria snapshot(JSON tree)**으로 판정한다. Gemini Vision은 disabled/hidden/모달가림 요소를 신뢰성 있게 구분하지 못함(실측 확인) — 기능 판정을 Vision에 맡기지 않는다.

Step 2의 각 viewport 캡처 Agent가 자신의 `-aria.json`을 받은 직후 곧바로 수행(신규 Agent fan-out 없음):

```
입력: /tmp/visual-loop/{vp}-aria.json
  (실제 산출: page.accessibility.snapshot() 노드 = {role, name, disabled?, focused?, children} —
   enabled/focusable 필드 없음. interestingOnly 기본 pruning 적용 — 안 보이는 노드는 트리에서 아예 빠질 수 있음)
판정 대상: 검증하려는 요소별 {role, name(=accessible name), enabled(= disabled 필드 부재/false로 판정)}
  (focused는 관측 가능하나 판정 기준 아님 — 별도 참고용)
불일치 처리:
  - role 불일치 / name 불일치 / disabled:true인데 enabled 기대 = 기능 FAIL 1건 (결정론)
  - 요소 자체가 트리에 없음 = pruning 오탐 가능성 있으므로 즉시 FAIL 금지 → WARN 1건(재확인 권고)로 기록
출력(viewport별): /tmp/visual-loop/{vp}-functional-axis.json
  { "viewport": "...", "checks": [{"target": "...", "expected": {...}, "found": {...}, "pass": bool, "severity": "fail|warn"}], "fail_count": N, "warn_count": M }
```

### Step 3 — Gemini Vision 분석 (외관축 한정 — tree가 못 보는 이슈만)

> **범위 축소**: "요소 존재/활성 여부" 판정은 Step 2.5(aria축)가 전담 — Vision에게 재위임 금지. Vision은 aria-tree로 검증 불가능한 순수 외관 이슈만 담당.

각 스크린샷(`/tmp/visual-loop/{vp}-{vp}-shot.png`)에 대해 `/screenshot-analyze` 스킬을 병렬 Agent로 호출:

```
프롬프트 템플릿:
"다음 스크린샷({viewport} viewport, {width}x{height})을 분석하여 (요소 존재/활성 여부는 판정하지 말 것 — aria축 전담):
1. 시각적 계층 구조 (Visual hierarchy) — 가장 큰 주목 요소
2. 색상 대비 이슈 (텍스트 가독성)
3. Touch target 크기 (모바일만)
4. Layout 깨짐 (overflow, overlap, 잘림 — 표현 문제, 요소 활성여부 아님)
5. 애니메이션/차트/그라디언트 등 tree로 검증 불가한 시각 표현
각 항목을 PASS/WARN/FAIL로 판정. JSON 반환."
```

출력: `/tmp/visual-loop-analysis-{viewport}.json`

### Step 3.4 — 외관 수치 판정 (pixel-diff, 조건부 — toHaveScreenshot 결과 존재 시만)

> **현실 반영(honest)**: visual-loop 이 ad-hoc 호출 컨텍스트에는 `toHaveScreenshot` 베이스라인 생산자가 **아직 배선되지 않았다** (qa/forge-fix 테스트 컨텍스트에만 존재). 따라서 `{vp}-pixel-diff.json`은 **보통 부재**하며, 아래 게이트는 그 경우 정상적으로 **skip**된다 — FAIL이 아니다.

`{vp}-pixel-diff.json`이 존재하는 경우(qa/forge-fix 테스트 컨텍스트에서 넘어온 경우)에만 **`.claude/hooks/pixel-diff-gate.sh`**로 수치 판정한다(육안/Vision이 아니라 수치):

```bash
bash "${FORGE_ROOT:-$HOME/forge}/.claude/hooks/pixel-diff-gate.sh" /tmp/visual-loop/{vp}-pixel-diff.json 0.01
# exit 2 = diffPixelRatio > 1% → 외관 FAIL (결과 파일이 있을 때만 의미 있음)
# exit 0 = 통과 (결과 파일 없으면도 통과 — graceful skip, ad-hoc 호출의 기본 케이스)
```

베이스라인이 없는 최초 실행(또는 애초에 생산자 미배선): 게이트가 diff 파일 부재로 자동 통과(graceful skip) — FAIL로 취급하지 않는다. Vision(Step 3)은 이 수치 판정의 보조 신호일 뿐, 결과 파일이 존재하는 경우에 한해 외관 최종 판정은 pixel-diff-gate 결과가 우선한다.

### Step 3.5 — 독립 Evaluator 스폰: 시각 비교 결과 종합 판정 (신규)

> **핵심 원칙**: 스크린샷을 캡처하고 구현한 Generator(Lead 에이전트)가 직접 시각 결과를 평가하면
> 자기합리화 편향이 생긴다. 독립 Evaluator subagent가 결과를 종합하여 PASS/FAIL을 판정한다.

```python
evaluator_agent = Agent(
  subagent_type="general-purpose",
  model="sonnet",
  prompt="""
당신은 독립 Visual QA Evaluator 에이전트입니다.
구현 에이전트(Generator)의 컨텍스트(의도, 디자인 결정 이유)를 공유받지 않습니다.
오직 아래 파일만을 근거로 시각 품질을 판정하십시오.

입력 파일 경로:
  - (선택) 외부 정적 분석 결과: {static_analysis_result_path}
  - (선택) 프로젝트 DESIGN.md: {project-root}/DESIGN.md — 존재 시 외관축 대조 기준(토큰/간격/anti-slop)으로 Read, 없으면 skip
  - 기능축(결정론, viewport별): /tmp/visual-loop/{desktop,tablet,mobile}-functional-axis.json
  - 외관축(수치, viewport별, **조건부 — toHaveScreenshot 결과 존재 시만**): /tmp/visual-loop/{desktop,tablet,mobile}-pixel-diff.json — ad-hoc visual-loop 호출엔 베이스라인 생산자 미배선이라 보통 부재 → 파일 없으면 해당 viewport는 graceful skip(FAIL 아님, 정상 케이스)
  - Vision 보조(tree-불가 외관 이슈만): /tmp/visual-loop-analysis-{desktop,tablet,mobile}.json
  - 스크린샷: /tmp/visual-loop/{desktop,tablet,mobile}-{viewport}-shot.png

수행할 작업:
1. viewport별 {vp}-functional-axis.json Read → fail_count 합산 (기능축, 결정론 — Vision으로 재판정하지 않는다)
2. viewport별 pixel-diff.json Read → **파일이 존재할 때만** `pixel-diff-gate.sh` 판정 결과(exit 0/2에 해당하는 diffPixelRatio vs 0.01) 확인. 파일 없으면(ad-hoc 호출의 일반 케이스) graceful skip으로 기록 — FAIL로 카운트하지 않는다.
3. Vision 분석 JSON Read → 스크린샷과 대조해 tree-불가 외관 이슈(P0/P1)만 추출 (요소 존재/활성 판정은 무시 — 기능축이 이미 결정론으로 처리)
4. (선택) DESIGN.md 있으면 외관 이슈가 committed direction/토큰/anti-slop 위반인지 대조
5. (선택) 외부 정적 분석 결과와 시각 결과 비교 — 없으면 시각 결과 단독 보고. Delta 분류:
   - 정적 PASS → 시각 WARN/FAIL: "시각 발견" (정적 분석이 놓친 이슈)
   - 정적 FAIL → 시각 PASS: "오탐 가능" (재검토 필요)
   - 양쪽 FAIL: "이슈 확정"
6. 최종 PASS/FAIL 판정 — **2축 결정론 + 1축 조건부**(하나라도 해당하면 FAIL, 육안 종합 아님):
   (a) 기능축: 임의 viewport의 {vp}-functional-axis.json fail_count ≥ 1
   (b) Vision 보조: tree-불가 시각 이슈 중 P0 1건 이상
   (c) 외관축(수치, **pixel-diff.json 결과 파일이 실제로 존재할 때만 적용** — 없으면 이 조건 자체가 해당 없음, FAIL 사유로 세지 않는다): 임의 viewport의 pixel-diff-gate.sh 판정이 exit 2(diffPixelRatio > 1%)
7. 판정 결과를 {evaluator_result_path} 에 JSON으로 Write (판정 근거로 어느 축이 FAIL을 유발했는지 명시)

절대 관대하게 보지 않는다:
- "전체적으로 괜찮아 보인다" 금지 → 각 항목 개별 검증
- Generator의 의도를 추정하여 실수를 용납하지 않는다
- rubric·수치 기준은 대리지표(proxy)다 — 점수 최적화(reward hacking)·무한 폴리싱 금지. intent(디자인 의도·기능 충족)로 판정. (G15)
"""
)
```

**입력/출력 파일**:
- 입력: `/tmp/visual-loop/{vp}-functional-axis.json` × 3, `/tmp/visual-loop/{vp}-pixel-diff.json` × 3(선택), `/tmp/visual-loop-analysis-{viewport}.json` × 3, (선택) `{project-root}/DESIGN.md`, (선택) 외부 정적 분석 결과
- 출력: `/tmp/visual-loop-evaluator-result.json`

Evaluator 결과가 나오면 Step 4(Delta 분석)는 해당 JSON을 기반으로 요약만 수행한다.

### Step 4 — 정적 분석과의 Delta (교차 검증)

Evaluator 결과 (`/tmp/visual-loop-evaluator-result.json`) 를 읽어 Delta 요약:

**Delta 판정 기준:**

| 정적 결과 | 시각 결과 | 판정 | 처리 |
|---|---|---|---|
| PASS | PASS | 일치 | 보고만 |
| PASS | WARN/FAIL | **시각 발견** | 정적 분석이 놓친 이슈 → 리포트 |
| FAIL | PASS | 검토 필요 | 정적 오탐 가능 → 재검토 |
| FAIL | FAIL | 일치 | 이슈 확정 |

"시각 발견" 항목이 이 PoC의 **핵심 가치**.

### Step 5 — 통합 리포트 생성

저장 경로: `forge-outputs/docs/reviews/visual-loop/{YYYY-MM-DD}-{slug}-report.md`

리포트 구조:

```markdown
# Visual Loop Report — {URL}

**날짜:** {date}  **Viewport:** {desktop/tablet/mobile}

## 요약
- 시각 분석: {PASS X / WARN Y / FAIL Z}
- **시각 발견(정적 누락):** {count}
- **Evaluator 최종 판정**: PASS / FAIL

## 스크린샷
![desktop](./screenshots/desktop.png)
![tablet](./screenshots/tablet.png)
![mobile](./screenshots/mobile.png)

## Delta 상세
### 정적 PASS → 시각 WARN/FAIL (시각 발견)
| 항목 | Viewport | Gemini 소견 | 제안 수정 |
|---|---|---|---|

### 정적 FAIL → 시각 PASS (오탐 가능)
...

## 권고 조치
- P0 (즉시): ...
- P1 (이번 주): ...
```

### Step 6 — 자동 fix PR (선택, 사용자 승인 시)

시각 발견이 명확한 경우(예: 모바일에서 버튼 잘림):
1. 변경 제안을 PR diff 형식으로 출력
2. [STOP] 게이트 — 사용자 승인 대기
3. 승인 시: Edit 도구로 파일 수정 + Step 7 re-verify (아래)

### Step 7 — re-verify 루프 (fix 승인 후 자동, cap=1)

Step 6 사용자 승인 후 수정이 실제로 시각 이슈를 해결했는지 **1회 자동 재검증**한다.

```
re-verify 절차 (cap=1회, 초과 시 Human에 위임):
  1. Step 2 재캡처(스크린샷+aria.json, 동일 viewport 세트) → Step 2.5 기능축 재판정
  2. Step 3 Gemini Vision 재분석 → Step 3.4 외관 수치 재판정(pixel-diff-gate.sh)
  3. Step 3.5 독립 Evaluator 재스폰 (동일 프롬프트, 3축 결과 갱신 반영)
  4. Evaluator 판정:
     - PASS → "✅ re-verify PASS. Step 6 수정 확인됨." + 리포트 업데이트
     - FAIL → "❌ re-verify FAIL. 수정 미해결. Human 개입 요청." + 상세 delta 첨부
  5. cap=1 초과 시 (2회 이상 재시도 불가) → [STOP] Human 위임

토큰 캡 적용: re-verify 시작 전 VISUAL_LOOP_TOKEN_CAP 확인
```

**토큰 캡 가드 (전체 스킬)**:

```
VISUAL_LOOP_TOKEN_CAP = 환경변수 VISUAL_LOOP_TOKEN_CAP (기본: 400000)

Step 2 시작 전 / Step 7 시작 전 확인:
  if estimated_tokens ≥ VISUAL_LOOP_TOKEN_CAP:
    "[STOP] VISUAL_LOOP_TOKEN_CAP={cap} 도달. 현재 단계 시작 취소."
    완료된 스텝 결과 + 리포트 경로(있으면) 반환
```

- `VISUAL_LOOP_TOKEN_CAP` 미설정 시 기본값 **400000** 적용 (정상 fix→re-verify 경로 ~310000 추정을 캡이 상회 — 자기 트립 방지).
- 추정: 3 viewport 스크린샷(~50000) + 3 Vision 분석(~75000) + Evaluator(~30000) = 사이클당 ~155000.
- Step 7 re-verify = 추가 ~155000 → 합산 ~310000 (< 400000 캡). 캡 근접 시 WARN 출력 후 진행.
- ⚠️ **추정치 정직성**: 추정치 = best-effort (LLM 자가추정, 정확 토큰 카운트 불가). **결정론적 bound = max-cycles**; 토큰 추정은 보조 가드. 정확한 토큰 enforcement는 P4 (agent-budget 훅 연동) 예정.

## 비용·리소스

| 리소스 | 1회 호출당 |
|---|---|
| Playwright 실행 | 로컬 (무료) |
| Gemini Vision API | ~$0.01~0.05 (3 스크린샷) |
| 스킬 Agent fan-out | 7개 (playwright 3 + analyze 3 + evaluator 1) |
| 소요 시간 | ~35~70초 |

**비용 통제:** 매 PR 자동 호출 금지. 의심 PR만 수동 호출.

## 제약 사항

1. **Dev server 필수** — 사용자가 별도 터미널에서 `npm run dev` 실행 필요
2. **WSL 환경 Playwright** — 의존성 설치 필요 (`playwright install chromium`)
3. **Gemini API 키 필요** — `GEMINI_API_KEY` 환경변수 or forge `.env`
4. **localhost 한정** — 원격 스테이징/프로덕션 URL은 CORS/인증 이슈 가능

## Chrome 확장 vs 이 스킬 (설계 결정)

Boris는 "Chrome 확장 + Claude Desktop 내장 브라우저"를 추천. 우리 환경 제약:
- WSL → Chrome 확장 설치 불가
- Claude Desktop 앱 → WSL bash에서 자동화 불가

**결론:** Playwright + Gemini Vision 조합이 **같은 가치**(코드→실행→스크린샷→분석 closed loop)를 WSL에서 달성. Chrome 확장은 대화형 UX 이점만 있고, 자동화 효과는 이 스킬이 동등.

## 향후 확장

- **E2E 시나리오 테스트 통합**: `/playwright-parallel-test`와 연계해서 사용자 플로우(로그인→결제→확인) 검증 후 스크린샷 캡처
- **Visual regression (pixel-diff) 베이스라인 생산자 배선**: Step 3.4 게이트(`pixel-diff-gate.sh`)는 이미 본문에 있으나, ad-hoc visual-loop 호출 컨텍스트에서 `toHaveScreenshot` 베이스라인을 실제로 생산하는 경로는 아직 미배선(현재는 qa/forge-fix 테스트 컨텍스트에서만 존재) — visual-loop 자체 캡처 흐름에 베이스라인 생산·저장 단계를 추가하는 작업이 남아있다.
- **a11y 자동 검사**: axe-playwright로 WCAG 자동 검증 추가 (aria snapshot 기반 기능축 판정과 별개 — 규칙 기반 WCAG 검증은 여전히 미통합)

## 사용 예시

```bash
# 기본 (3 viewport)
/visual-loop http://localhost:3000/dashboard

# 모바일만
/visual-loop http://localhost:3000/checkout --viewport=mobile

# 카드게임 프로젝트 예시 (PC 버전)
/visual-loop http://localhost:5173/game/<project> --viewport=desktop
```

## 트러블슈팅

| 증상 | 원인 | 해결 |
|---|---|---|
| `playwright-cli: command not found` | Playwright 미설치 | `npm install -g @playwright/cli && playwright install chromium` |
| `ECONNREFUSED localhost:3000` | Dev server 미기동 | 별도 터미널에서 `npm run dev` 후 재실행 |
| Gemini API 429 rate limit | 과다 호출 | `--viewport=mobile` 등으로 축소, 10초 sleep 삽입 |
| 스크린샷 빈 화면 | JS 렌더링 대기 부족 | Playwright `--wait-until networkidle` 옵션 |
| Evaluator 스폰 실패 | Agent 도구 미허용 | `allowed-tools`에 Agent 포함 확인 (frontmatter) |

---

**출처 및 관련 문서:**
- Boris Cherny 15 features 원본: `forge-outputs/01-research/articles/2026-04-17/2026-04-17-yozm-wishket-com-boris-cherny-15-claude-code-features-analysis.md`
- 관련 스킬: `/screenshot-analyze` (Gemini Vision), `/playwright-cli` (브라우저 자동화), `/playwright-parallel-test` (E2E)
> 실패 시 [[pev-self-correction]] 적용

## Workflow 통합 (계획서 P1)

병렬/다단계 실행 = Workflow 도구로 컨텍스트 격리 + resume 지원. 패턴: 3 viewport Gemini Vision parallel().

실행: `Workflow({ script: Bash("cat ~/.claude/skills/visual-loop/workflow.js") })`

`CLAUDE_CODE_DISABLE_WORKFLOWS=1` 시 기존 방식 fallback.

> ⚠️ Phase 0 전제: Codex/Gemini Vision용 approve-worker 토큰 외부 선발행 필수 (Workflow는 셸 직접 호출 불가).

