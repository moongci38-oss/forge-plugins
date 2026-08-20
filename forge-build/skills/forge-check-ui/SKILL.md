---
name: forge-check-ui
description: UI 품질게이트 — workflow.js 5축(static/lighthouse/responsive/screen-mapping/source-quality) 자동검증. AI-Slop 19패턴·WCAG AA 임계값·디자이너 10카테고리·수치축 15개는 프롬프트로 주입돼 가동 중(2026-08-06 P1.1). 2026-08-11 로 6-Pillar adversarial(L3)·3-Layer 자동 심화 트리거까지 배선 완료 — 목표 스펙 전 항목 가동.
model: sonnet
arguments:
  url: "검증 대상 URL (기본: http://localhost:3000)"
  projectRoot: "프로젝트 루트 경로 (기본: .)"
---

## ⚠️ 구현 현황 (2026-08-06 갱신 — 이 절을 먼저 읽어라)

**자동 실행 = `workflow.js`의 5축**: static / lighthouse / responsive / screen-mapping / **source-quality**.

**2026-08-06(P1.1~P1.4)에 바뀐 것 — 아래 기준이 이제 에이전트 프롬프트에 실제로 주입된다:**

| 기준 | 상태 | 주입 위치 |
|---|---|---|
| AI-Slop 19패턴 블랙리스트 | ✅ 주입됨 | static 축 |
| WCAG AA 임계값 표 | ✅ 주입됨 | lighthouse 축 |
| 디자이너 관점 10카테고리 | ✅ 주입됨 | responsive 축 |
| 터치타겟 2단(48dp / 24px) | ✅ 주입됨 | lighthouse · responsive 축 |
| 수치축 15개 · 한글 조판 규격 | ✅ 주입됨 | static 축 (`shared/design-tokens/design-axes.json`) |
| U-1~U-7 소스 레벨 검증 | ✅ 배선됨 | source-quality 축 (`ui-quality-checker` 에이전트) |
| L1.5 결정론 메트릭 | ✅ 가동 중 | `playwright-devtools-capture.mjs` **단일 chokepoint** |
| **6-Pillar adversarial (L3)** | ✅ **주입 + 배선됨**(2026-08-11) | `RUBRIC_PILLARS` → `l3-pillars` 축(`ui-quality-checker`) |
| **3-Layer 자동 심화 트리거** | ✅ **가동**(2026-08-11) | 5축 verdict ≠ PASS 시 L3 자동 스폰. L3 6.0 미만이면 FAIL 로 격상 |

**주입은 코드가 보장한다.** `workflow.js` 의 `<design-rubric:start>` 생성 블록이 이 문서에서 추출된다:
```bash
node shared/scripts/build-design-rubric.mjs --check   # 드리프트 시 exit 1
node --test shared/scripts/design-rubric.test.mjs      # 주입을 지우면 FAIL (역변조)
```
⚠️ 이 문서의 아래 세 절(`## WCAG AA 임계값` · `## 디자이너 관점 QA (10 카테고리)` ·
`## AI-Slop 블랙리스트 (19 패턴)`) **헤딩을 바꾸면 추출이 실패**하고 빌드가 exit 1 로 막힌다.
헤딩을 바꾸려면 `shared/scripts/design-rubric.mjs` 의 `SECTIONS` 상수도 함께 고친다.

⚠️ **여전한 한계** — 이 5축을 전부 통과해도 슬롭일 수 있다. 축들이 "균일성"을 보상하는데
균일성 자체가 슬롭 신호이고, 모션 축(7·8·10)은 JS 주도 모션에 구조적 false-negative 가 있다.
도달 가능한 것은 **"프로답게 틀리지 않는다"** 까지다(계획서 §3.5).

(이전 판정 근거: 2026-07-14 실측에서 `workflow.js` 83줄이 static 축에 주는 지시가 1줄뿐이었고
19패턴·대비율표·10카테고리가 프롬프트에 없었다. 그 갭이 P1.1 로 봉합됐다.)

---

## 역할

UI 품질 자동 검증 게이트. 정적 분석 / Lighthouse / 반응형 / 화면명세 매핑 4축으로 PASS / WARN / FAIL 판정을 반환한다.
(AI-Slop 19패턴 · WCAG AA · 디자이너 10카테고리 · 6-Pillar(L3) · 3-Layer 자동 심화 = **전부 주입·배선 가동 중**(2026-08-11) — 위 §구현 현황 표가 정본.)

> ⚠️ **이 설명문이 낡아 실제 오판을 낳았다**(2026-08-11): frontmatter description 이 "AI-Slop 미구현"으로
> 남아 있어, 한 세션이 그것만 읽고 **"이 게이트를 돌렸어도 AI-Slop 은 못 잡았을 것"이라는 거짓 결론**을
> 하네스 갭 리포트에 기재했다(G-DESIGN-06 초판). 본문 표는 ✅ 주입됨이라고 정확히 적고 있었다.
> **설명문과 본문 표가 어긋나면 설명문이 먼저 읽힌다** — 구현 상태를 바꾸면 description 도 같이 고친다.
> 재현: `node shared/scripts/build-design-rubric.mjs --check` → 상수 미소비 시 UNCONSUMED 로 실패한다.

---

## 실행 방법

`workflow.js`가 이 스킬의 실제 실행 엔진이다. 아래 스펙 중 **workflow.js에 구현된 4축만 실행된다.**
나머지는 모델 수동 판단용 참조 기준이며 자동 검증되지 않는다.

```
/forge-check-ui url=http://localhost:3000 projectRoot=.
```

---

## WCAG AA 임계값

### 색상 대비율

| 대상 | 최소 대비율 | 기준 |
|------|-----------|------|
| 일반 텍스트 (18px 미만, 볼드 14px 미만) | **4.5:1** | WCAG 2.1 AA §1.4.3 |
| 큰 텍스트 (18px 이상, 또는 볼드 14px 이상) | **3:1** | WCAG 2.1 AA §1.4.3 |
| UI 컴포넌트 경계 (버튼 테두리, 입력 필드) | **3:1** | WCAG 2.1 AA §1.4.11 |
| 그래픽 요소 / 아이콘 | **3:1** | WCAG 2.1 AA §1.4.11 |

### 포커스 가시성

- 키보드 포커스 인디케이터 반드시 시각적으로 구별 가능 (§2.4.7)
- `outline: none` / `outline: 0` = **즉시 FAIL** (대체 포커스 스타일 없는 경우)
- 포커스 링 최소 2px 이상, 배경 대비 3:1 이상 권장 (WCAG 2.2 §2.4.11)

### 대체 텍스트 의무

- 모든 `<img>` 태그 = `alt` 속성 필수 (장식 이미지는 `alt=""`)
- `<svg>` = `aria-label` 또는 `<title>` 필수 (장식 제외)
- `<input type="image">` = `alt` 필수
- 누락 시 **FAIL**

### Lighthouse a11y 점수 게이트

| 점수 | 판정 |
|------|------|
| 90 이상 | PASS |
| 70–89 | WARN |
| 70 미만 | FAIL |

> 수치 게이트는 `lighthouse` axis에서 판정. 세부 위반 항목은 findings에 기재.

---

## 디자이너 관점 QA (10 카테고리)

> gstack design-review L3-B BORROW 흡수 (~80항목 체크리스트). AI-slop 패턴 흡수율 5/11 (gstack 11개 중 5개 일치, 6개 forge-native 추가).

### Design Classifier (필수 선행)

UI를 다음 3가지 유형으로 분류 후, 해당 규칙 세트 적용:

- **MARKETING / LANDING PAGE**: 전환 유도 중심. CTA 명확성, 스크롤 내러티브, 소셜 증거 배치가 핵심.
- **APP UI**: 기능 중심. 탐색 일관성, 상태 표, 피드백 메커니즘이 핵심.
- **HYBRID**: 마케팅+앱 혼합. 양측 핵심 규칙 교집합 적용.

분류 결정을 findings 첫 줄에 반드시 명시.

---

### 카테고리 1: 타이포그래피 (Typography)

> **정량 측정은 L1.5로 이관(D1, 2026-07-05)**: 타입 스케일 비율(1.25/1.333) 정합 여부의 계산 가능한 채점은 `design-metrics.mjs` M1(§3-Layer L1.5)에서 결정론으로 수행한다. 여기서는 계산 불가한 정성 항목(폰트 종류 수·line-height·행 너비 등)만 평가한다.

- 폰트 종류 ≤ 3개 (웹폰트 포함)
- 본문 line-height ≥ 1.5x, 제목 ≥ 1.25x
- 본문 measure(행 너비) 45–75자
- 제목 계층 건너뜀 금지 (h1→h2→h3 순서, h1→h3 직행 금지)
- 텍스트 중앙 정렬은 3줄 이하에서만 허용 (긴 단락 = FAIL)
- 대문자 변환(`text-transform: uppercase`)은 레이블·캡션 한정

### 카테고리 2: 색상 (Color)

- 배경 대비율 4.5:1 (일반) / 3:1 (큰 텍스트·UI)
- 색상 단독으로 의미를 전달하지 않음 (아이콘·패턴·텍스트 보조 필수)
- 데이터 시각화: 색맹 친화 팔레트 (Viridis, IBM Accessible, Okabe-Ito)
- 랜덤 그라데이션 남용 금지 (§AI-Slop 참조)

### 카테고리 3: 간격 (Spacing)

> **정량 측정은 L1.5로 이관(D1, 2026-07-05)**: 8pt 그리드 정렬률의 계산 가능한 채점은 `design-metrics.mjs` M2(§3-Layer L1.5)에서 결정론으로 수행한다. 여기서는 계산 불가한 정성 항목(섹션 여백 규모·컴포넌트간 일관성 등)만 평가한다.

- 섹션 간 여백 ≥ 64px (랜딩), ≥ 32px (앱)
- 컴포넌트 내부 padding 일관성 (같은 컴포넌트 유형 ± 4px 이내)
- Tight stack(패딩 < 8px) = WARN

### 카테고리 4: 레이아웃 (Layout)

- 시각적 계층 명확: 1차 CTA / 2차 액션 / 3차 정보 분리
- 콘텐츠 너비: 본문 640–800px, 전체 레이아웃 max 1280px
- 그리드 불일치(열 배치 들쭉날쭉) = WARN
- 3칸 같은 크기 feature grid + 원형 아이콘 = AI-Slop (§9 참조)

### 카테고리 5: 컴포넌트 일관성 (Component Consistency)

- 같은 기능 = 같은 컴포넌트 패턴 (버튼 변형·색상 혼용 금지)
- 상호작용 상태 표 (Interaction State Coverage):

| 기능 | LOADING | EMPTY | ERROR | SUCCESS | PARTIAL |
|------|---------|-------|-------|---------|---------|
| 필수 명시 | ✓ | ✓ | ✓ | ✓ | 해당 시 |

- Empty state = 기능이다. 따뜻한 메시지 + 주요 액션 1개 필수.
- 로딩 상태 없는 비동기 컴포넌트 = WARN

### 카테고리 6: 이미지 & 미디어 (Images & Media)

- 실제 콘텐츠만 사용. "Lorem ipsum" / "Your text here" / placeholder 이미지 = **FAIL**
- 모킹이 있으면 그 텍스트를 추출해 사용
- 이미지 aspect-ratio 왜곡 = WARN
- `loading="lazy"` 폴드 이하 이미지에 적용 권장

### 카테고리 7: 반응형 (Responsive)

- Viewport: 375(mobile) / 768(tablet) / 1280(desktop) 3점 검증
- 수평 스크롤바 발생 = FAIL
- 텍스트 잘림(`overflow: hidden` + 고정 height) = WARN
- 터치 타겟 ≥ 44×44px (mobile)

### 카테고리 8: 접근성 (Accessibility)

- WCAG AA 대비율 기준 (§WCAG AA 임계값 참조)
- 키보드 포커스 가시성 (§WCAG AA 임계값 참조)
- alt / aria-label 의무 (§WCAG AA 임계값 참조)
- `prefers-color-scheme` media query 지원 여부 확인
- `prefers-reduced-motion` 미지원 자동 애니메이션 = WARN
- ARIA 역할 오용 (`role="button"` on `<div>` without `tabindex`) = WARN

### 카테고리 9: 감성·마감 (Finish Quality)

- 과도한 그림자(box-shadow 3겹 이상, 색상 드롭쉐도우) = WARN
- 글래스모피즘(backdrop-filter + 반투명 레이어) 과남용 = WARN
- 애니메이션: ease/ease-in-out 사용, 지속 150–400ms. 1000ms 초과 = WARN
- Hover 상태: 커서 변화(pointer) + 시각 피드백(색상·그림자 변화) 필수

### 카테고리 10: 콘텐츠 품질 (Content Quality)

- 마케팅 copy에 실제 수치·사용자명 사용 (generic 없음)
- 헤딩이 기능을 설명 ("Features" X → "3분 안에 할 수 있는 것들" O)
- CTA 버튼 텍스트: 동사+목적어 ("Get Started" X → "무료로 시작하기" O)
- 오타 / 혼재 언어 = WARN

---

## AI-Slop 블랙리스트 (19 패턴)

> gstack design-html BORROW + plan-design-review BORROW 통합 + gstack design-review 누락 6패턴 추가 + 이미지·모션 축 2패턴 추가(2026-07-05). 아래 패턴 발견 시 **즉시 FAIL** (해당 컴포넌트).

| # | 패턴 | 설명 |
|---|------|------|
| 1 | **보라-그라데이션 남용** | Purple / violet / indigo gradient를 기본 배경이나 히어로에 무조건 적용. 브랜드 색상 없이 generic 보라 = FAIL. |
| 2 | **3열 feature grid + 원형 아이콘** | 동일한 크기의 3칸 feature grid에 아이콘을 원형 배경에 넣은 패턴. AI 디자인의 전형적 slop. |
| 3 | **이모지 헤더** | 섹션 제목에 이모지(🚀✨💡) 사용. 제목 앞·뒤 이모지 = FAIL. |
| 4 | **가짜 대칭** | 실제로는 비대칭인 콘텐츠를 억지로 같은 크기로 강제. 텍스트 길이가 다른 카드를 동일 높이 고정. |
| 5 | **중앙 정렬 남용** | 모든 섹션을 text-align: center로 통일. 긴 단락(4줄 이상) 중앙 정렬 = FAIL. |
| 6 | **과도한 둥근 모서리** | border-radius ≥ 24px를 카드·버튼·이미지 등 전체에 균일 적용. |
| 7 | **Generic box-shadow** | `box-shadow: 0 4px 6px rgba(0,0,0,0.1)` 또는 유사 패턴을 모든 카드에 복붙. 색상 있는 glow shadow = 별도 평가. |
| 8 | **Lorem ipsum / placeholder** | "Lorem ipsum", "Your text here", "Coming soon" 등 placeholder 콘텐츠. |
| 9 | **과잉 CTA** | 한 뷰포트 내 동일 CTA 버튼 3개 이상. 주의를 분산시키는 버튼 중복. |
| 10 | **불필요한 아이콘 범람** | 모든 메뉴 항목·버튼·텍스트 옆에 아이콘 부착. 아이콘이 의미를 추가하지 않는 경우. |
| 11 | **Glassmorphism 기본값** | backdrop-filter + 반투명 레이어를 디자인 의도 없이 기본 카드 스타일로 적용. |
| 12 | **카드 좌측 컬러 보더** | 카드 강조 목적으로 `border-left: 3px solid <accent>` 적용. 시각 계층 없이 색상으로 중요도 표현. |
| 13 | **wavy SVG divider / decorative blob** | 섹션 전환에 wavy SVG 곡선, floating circle, decorative blob 사용. 콘텐츠 부족을 장식으로 대체. |
| 14 | **`system-ui` / `-apple-system` primary 폰트** | 디스플레이·본문 폰트로 시스템 기본 폰트 그대로 사용. 타이포그래피 포기 신호. 실제 서체 미지정 = FAIL. |
| 15 | **generic hero copy** | "Welcome to [X]", "Unlock the power of...", "Your all-in-one solution for..." 등 AI 생성 generic 영웅 문구. |
| 16 | **독립 컬러 서클 아이콘** | 3열 그리드 외 섹션 장식으로 아이콘을 컬러 원형 배경에 독립 배치. SaaS starter template 패턴. |
| 17 | **쿠키커터 섹션 리듬** | hero → 3 features → testimonials → pricing → CTA 균일 반복. 모든 섹션 동일 높이로 쌓기. |
| 18 | **Generic 스톡/AI 일러스트** | "다양한 사람들이 노트북 앞에" 류 제네릭 스톡사진, 추상 3D blob/그라디언트 일러스트 — 콘텐츠와 무관한 장식 이미지. (근거: 925studios 2026 — 17패턴에 이미지 축 자체가 없었음) |
| 19 | **모션 부재 또는 균일 `transition: all` 페이드** | 상태전환 없는 밋밋한 정적 UI, 또는 모든 요소에 동일 fade-in 적용(목적있는 상태별 모션 부재). (근거: Anti-Slop Framework — 17패턴에 모션/인터랙션 축 0개였음) |

> **판정 레이어**: #1~#17 및 #19의 `transition: all` 마커 = **L1 정적 grep** 탐지 가능. 단 #18(제네릭 스톡/AI 일러스트)·#19의 "모션 부재(absence)"는 grep 불가 → **L2/L3 Vision 레그 전용**(headless·정적 호출 시 미탐 — Vision 미가동 경로에선 이 2패턴 발효 안 됨).

---

## 3-Layer UI 품질 게이트

> WI-26 gsd-core ui-phase / ui-review / ui-audit 3-layer 구조. 단일 4축 검사에서 심층 감사 레이어로 확장.

### L1 — 정적 토큰 체크 (Static Token Check)

**트리거**: 모든 실행 시 자동.

**검사 대상**:
- CSS/Tailwind/styled-components에서 디자인 토큰(색상·간격·폰트) 직접 하드코딩 vs 토큰 변수 사용 비율
- `alt=""` 누락 img 태그 카운트
- AI-Slop 패턴 정적 마커 탐지 (클래스명·인라인 스타일 패턴 grep)
- `outline: none` / `outline: 0` 포커스 비활성화 패턴

**출력**: findings 리스트 + PASS/WARN/FAIL.

---

### L1.5 — 결정론 렌더 메트릭 (Deterministic Render Metrics)

> D1(2026-07-05, `2026-07-05-design-metrics-d1-plan.md`) — 계산 가능한 미학축(타이포 스케일·간격 그리드)을 Vision(L3 6-Pillar P2)에서 결정론 계층으로 이관. **advisory WARN, non-blocking — 종합 verdict에 가감 없음(로깅 전용)**. 이중 채점 방지: 카테고리1(타입스케일)·카테고리3(8pt그리드)의 정량축은 여기서만 채점되고 L3 P2는 잔여 정성만 평가한다(§카테고리 1·3 참조).
>
> **주의(잠정, Codex 적대검수 MEDIUM-3 gap-close)**: D1 이전에는 P2(6-Pillar)가 타입스케일/8pt그리드를 verdict에 (약하게나마) 반영하고 있었다. D1 이후 이 축은 advisory(로깅)로 **의도적으로 강등**되었다 — "무회귀"가 아니라 강제력을 명시적으로 낮춘 것이다. 강제력 복원(advisory→verdict 반영)은 `docs/qa/design-check.jsonl` 캘리브레이션 데이터가 쌓인 후 `~2026-07-19` enforce 승격 판정 시점(verify-tier advisory→enforce 선례와 동일 절차)에 별도 검토한다.

**트리거**: URL 접근 가능 시 자동(`extractComputedStyleBundle` — L2와 동일 렌더 전제 공유, canonical desktop 1440×900 단일 뷰포트).

**실행**:
1. `shared/scripts/playwright-devtools-capture.mjs`의 `extractComputedStyleBundle(page)`로 computed `font-size`/`padding`/`margin`/`gap` 전수 추출(px) + 요소 bbox(문서상대 px) 전수 추출.
2. `shared/scripts/design-metrics.mjs`의 `computeM1TypoScale(fontSizes)` · `computeM2GridAlign(spacings)` · `computeM3Alignment(bboxes)` · `computeM3Grid(bboxes)`로 순수함수 채점(부작용·LLM·랜덤 0, 동일 입력=동일 점수).
3. 결과를 `docs/qa/design-check.jsonl`에 append(FR-7 스키마: `ts/url/viewport/source/m1_typo_scale/m1_unique_sizes/m2_grid_align/m3a_alignment/m3_verdict/m3d_grid/m3d_verdict/verdict/capture_ok/skipped`).

**판정**: M1 score<0.8 또는 고유사이즈>8 → `warn`. M2 score<0.85 → `warn`. M3a score<0.7 → `warn`(요소<2개는 측정불가로 `pass` fail-open). M3d score<0.45 → `warn`(populated 컬럼<2개는 측정불가로 `pass` fail-open). 그 외 `pass`. **이 판정은 로깅·경고 목적이며 forge-check-ui 종합 verdict 계산에는 반영되지 않는다**(FR-6). M3a·M3d 모두 동일하게 advisory 로깅 전용(M3 v2 plan §5 NFR-1) — 종합 verdict 미반영.

**M3a 정렬 규칙성(Alignment Regularity, M3-v2 재설계 — Codex 적대검수 gap-close, 2026-07-05)**: 요소별 **left·top 위치앵커** 정렬 — 각 요소의 left(x)·top(y)가 소수의 공유 축(canonical 비닝, `Math.round(coord/2)` 고정원점 — 순서·클러스터링 무관)에 2개 이상 모이면 그 요소는 "aligned"로 채점한다(요소 단위 채점, K_MIN 3→2). v1의 4엣지(left/right/centerX/top) 방식은 right/centerX가 width에 종속돼 가변폭 좌측정렬 레이아웃에서 거짓-warn을 냈고 K_MIN=3이 2×2 그리드·3-across 같은 흔한 레이아웃을 죽여 재설계했다 — right-정렬(right-align)은 이 축으로는 크레딧되지 않는 소수 트레이드오프로 문서화한다. **직교성 명시(FR-7)**: M3a는 요소의 2D 위치(left/top)만 본다 — M1(폰트 크기 분포)·M2(간격 값 분포)와 직교(스칼라 값 vs 기하 위치), L3 P1 Visual Hierarchy(의미적 위계·행동 유도)와도 구별(기하적 정렬 vs 의미적 중요도).

**M3d 컬럼 폭 일관(Column Width Consistency, corpus-first 실측 유일 생존 구조 메트릭, 2026-07-05)**: corpus-first 실측(12사이트, `2026-07-05-m3-corpus-first-findings.md`)이 검증한 건 정확히 이 공식 그 자체다(std 0.147, 디자인-포워드 A_mean 0.52 > 제네릭 B_mean 0.40, +0.116 정방향 분리) — 재설계 없이 그대로 이식했다. `computeM3Grid`: 요소를 left-edge(x, TOL=2px)로 컬럼(bin)에 묶고, 요소수≥3(K_MIN)인 populated 컬럼 각각에서 width가 4px 토큰(`Math.round(w/4)`) 기준 소수(≤2종)에 수렴하면 그 컬럼을 "일관"으로 채점한다. m3d = 일관 컬럼 수 / populated 컬럼 수(populated<2는 측정불가 skip). marginal(분리폭 modest)이라 advisory·**~2026-07-19 RETIRE/캘리브레이션 게이트** 대상. 형제 M3b(수평균형)·M3c(리듬)는 死지표/역상관으로 미배선 유지. 직교: m3d는 컬럼 내 폭 일관(정렬·간격과 독립) — M3a(엣지정렬)·M2(간격값)·L3와 구별. **가변-span 그리드(3종+ 반응형 span) false-low 한계 알려짐** — 컬럼 내 폭 종류가 2종까지는 "일관"으로 남지만(col-4/col-8은 오판 아님) 3종 이상 실사용 반응형 span이 섞이면 의도된 그리드도 비일관으로 오판될 수 있다(코드 변형 금지 — 검증된 공식 보존, 한계는 캘리브레이션에서 처리).

**kill-switch**: `FORGE_DESIGN_METRICS=off` → 즉시 스킵(jsonl에 `skipped` 사유만 기록, fail-open).

**출력**: jsonl append 1행 + findings에 "L1.5 advisory: M1={score} M2={score} M3a={score} M3d={score} (verdict={verdict}, 종합판정 미반영)" 1줄.

---

### L2 — 렌더 비주얼 (Render Visual)

**트리거**: URL 접근 가능 시 자동. Lighthouse MCP / Playwright 활용.

**검사 대상**:
- Lighthouse a11y 점수 (게이트: 90↑ PASS / 70-89 WARN / 70↓ FAIL)
- 색상 대비율 자동 측정 (Lighthouse contrast audit)
- 반응형 3점(375/768/1280) 레이아웃 깨짐
- 스크린샷 증거 — 모든 FAIL 발견 시 스크린샷 경로 첨부 의무

**출력**: Lighthouse 점수 + 반응형 상태 + 스크린샷 경로.

---

### L3 — Adversarial 6-Pillar 감사 (Adversarial Audit)

**트리거**: L1 또는 L2에서 WARN 이상 발생 시 자동 심화. 또는 `layer=3` 명시 시.

**ui-quality-checker 에이전트 연계**: adversarial stance로 6-pillar 평가 수행.

**6-Pillar 채점 (각 0-10점)**:

| Pillar | 평가 기준 |
|--------|---------|
| **P1 Visual Hierarchy** | 시각적 계층이 사용자 행동을 유도하는가. 1차/2차/3차 액션이 구별되는가. |
| **P2 Design System Integrity** | *(2026-07-05 D1: 타이포 스케일·8pt 간격 그리드 정량축은 L1.5로 이관됨 — 여기서는 잔여 주관만 채점)* 토큰(색상 등) 일관성. 컴포넌트 변형이 규칙을 따르는가. 브랜드 정합·의도성. |
| **P3 Accessibility** | WCAG AA 준수. 포커스·대비·alt·ARIA 4대 요소 모두 충족. |
| **P4 Content Authenticity** | 실제 콘텐츠 vs placeholder. Copy가 기능을 설명하는가. |
| **P5 Interaction Coverage** | 모든 상호작용 상태(로딩·에러·빈 상태) 설계 여부. |
| **P6 Anti-Slop Compliance** | AI-Slop 블랙리스트 19패턴 미해당 여부 (이미지·모션 축 #18·#19 포함). |

**종합 점수**: 6-pillar 평균(변경 없음 — P2 정량축 제거 후에도 여전히 0~10 척도로 채점되는 잔여 주관 기준 1개 필러이므로 평균 산식·가중치 재분배 불필요). 8.0↑ = PASS / 6.0-7.9 = WARN / 6.0↓ = FAIL.

**Retroactive Contract Audit**: 
구현이 S3/S4 화면명세(oracle-manifest.json)와 계약을 사후 검증. 명세에 정의된 화면 ID vs 실제 라우트 1:1 매핑 누락 = FAIL 항목으로 기록.

---

## 판정 기준 (종합)

| 조건 | 최종 판정 |
|------|---------|
| 4축 모두 PASS + WCAG PASS + L3 8.0↑ | **PASS** |
| 4축 중 1개 이상 WARN, FAIL 없음 | **WARN** |
| 4축 중 1개 이상 FAIL OR L3 6.0↓ | **FAIL** |
| AI-Slop 블랙리스트 1개 이상 FAIL | **FAIL** |
| alt 누락 / outline:none 포커스 비활성 | **FAIL** |
| L1.5(M1/M2/M3a) warn | **advisory** — 종합 verdict 가감 없음, `docs/qa/design-check.jsonl` 로깅 전용(FR-6) |

---

## 레퍼런스 교차검증 (advisory, 신설)

> AI가 특정 디자인 스타일(뉴모피즘·글래스모피즘 등)을 추천·적용했을 때, 그 스타일이 실제 서비스에서 채택된 사례가 있는지 웹 검색으로 1회 교차확인하는 보조 축이다. **자동 FAIL 아님 — advisory WARN 신호로 findings에 첨부만 한다**(종합 판정 미반영, §L1.5 advisory 취급과 동일 원칙).

**실행 — 2단, 로컬 우선**(2026-08-07 개정). 카테고리 9(감성·마감) 또는 AI-Slop #11(Glassmorphism)·#6(과도한 둥근 모서리) 등 특정 스타일 트렌드가 적용/추천된 경우:

1. **로컬 craft 레퍼런스 대조(기본)** — `.claude/skills/frontend-design/data/refero-craft/anti-ai-slop.md` 에서 해당 패턴 절만 읽어 대조한다. 파일이라 결정론적이고 로그인 벽·검색 변동이 없다. findings 1줄 예: `레퍼런스 교차검증: refero-craft anti-ai-slop #2(CARDS EVERYWHERE) 해당 — advisory`.
2. **웹 실사례 검색(보조)** — 로컬에 해당 패턴 절이 **없을 때만** `WebSearch` 로 `site:mobbin.com {업종} {스타일}` 류 쿼리 1회. findings 1줄 예: `레퍼런스 교차검증: mobbin 검색 결과 {건수}건 — advisory`.

⛔ `styles.refero.design` 은 `robots.txt` 가 AI 크롤러를 전면 차단한다(2026-08-07 관측 — 재현: `curl -sSL https://styles.refero.design/robots.txt`). **이 축에서 자동 조회하지 않는다.**

**⚠️ 한계(반드시 함께 명시)**
- **1단(로컬)**: `refero-craft` 는 **영미권 웹/SaaS 소스**이고 9개 tell 만 다룬다. 우리 19패턴과 중복 2·부분중복 2·신규 5의 대조표가 `data/refero-craft/ATTRIBUTION.md` 에 있다. 로컬에 절이 없다고 "문제없음"이 아니다 — **커버리지 밖**일 뿐이다.
- **2단(웹)**: mobbin 등 레퍼런스 사이트는 로그인 벽으로 검색 엔진 인덱싱·크롤 결과가 부실할 수 있다. 단일 쿼리에서 결과가 적거나 없다고 해서 "업계에서 채택되지 않은 스타일"로 단정하지 말 것 — 검색 신호 부재는 비채택의 증거가 아니라 검색 한계일 수 있으므로 거짓 WARN을 유발할 수 있다.
- 두 단 모두 결과는 **참고용 신호로만** findings에 남기고, 판정 근거로 단독 사용하지 않는다. **이 축은 여전히 advisory 이며 종합 verdict 를 가감하지 않는다**(2026-08-07 개정에서 판정 규칙 무변경 — `dev-workflow-rules.md §E-3`).

---

## 운영 참고

- **oracle-manifest.json 없음**: screen-mapping axis = WARN ("oracle-manifest 없음 — 스킵") 자동 처리. FAIL 아님.
- **URL 미접근**: L2(Lighthouse/반응형) 스킵, L1·L3 정적 분석만 진행. findings에 "URL 미접근 — L2 스킵" 명시.
- **Gemini Vision**: Lighthouse axis는 Gemini 에이전트 경유. approve-worker 토큰 선발행 필수 (Phase 0 전제).
- **workflow.js**: 실제 4축 병렬 실행 엔진. 이 SKILL.md는 각 에이전트에 주입되는 기준 문서.
