---
name: forge-check-ui
description: UI 품질 게이트 — 5축(static/lighthouse/responsive/screen-mapping/source-quality) 자동검증 + AI-Slop 패턴·WCAG AA 판정. UI 코드를 고친 뒤 품질 게이트를 돌릴 때 쓴다.
model: sonnet
arguments:
  url: "검증 대상 URL (기본: http://localhost:3000)"
  projectRoot: "프로젝트 루트 경로 (기본: .)"
---

**역할**: UI 품질 자동 검증 게이트 — 5축(static·lighthouse·responsive·screen-mapping·source-quality)으로 PASS/WARN/FAIL 을 판정한다. **컨텍스트**: UI 코드를 고친 뒤 품질 게이트를 돌릴 때 부른다(`/forge-check-ui url=… projectRoot=…` · QA 품질 축에서도 실행). **출력**: 축별 findings + 종합 판정(5축 ≠ PASS 면 L3 축을 자동 스폰하고 L3 6.0 미만은 FAIL 격상).

## 실행
- 엔진 = `workflow.js`: 5축 static / lighthouse / responsive / screen-mapping / source-quality(`ui-quality-checker`, U-1~U-7) 병렬. 5축 verdict ≠ PASS → `l3-pillars` 축(L3) 자동 스폰, L3 6.0 미만이면 FAIL 격상.
- 호출: `/forge-check-ui url=http://localhost:3000 projectRoot=.` · 수치축 15개·한글 조판 = `shared/design-tokens/design-axes.json`(static 축) · L1.5 메트릭 = `playwright-devtools-capture.mjs` 단일 chokepoint.
- 아래 4절(`## WCAG AA 임계값` · `## 디자이너 관점 QA (10 카테고리)` · `## AI-Slop 블랙리스트 (19 패턴)` · `## 3-Layer UI 품질 게이트`)은 `workflow.js` `<design-rubric:start>` 블록으로 추출·주입된다. 헤딩을 바꾸면 `shared/scripts/design-rubric.mjs` `SECTIONS` 도 함께. 본문을 고치면 재생성·검증:
```bash
node shared/scripts/build-design-rubric.mjs --write   # 생성 블록 재생성
node shared/scripts/build-design-rubric.mjs --check   # 드리프트 시 exit 1
node --test shared/scripts/design-rubric.test.mjs
```
- 한계: 전 축 통과해도 슬롭일 수 있다(균일성 보상 · JS 모션 false-negative) — "프로답게 틀리지 않는다" 까지.

## WCAG AA 임계값

| 대상 | 최소 대비율 | 기준 |
|------|-----------|------|
| 일반 텍스트 (18px 미만, 볼드 14px 미만) | **4.5:1** | WCAG 2.1 AA §1.4.3 |
| 큰 텍스트 (18px 이상, 또는 볼드 14px 이상) | **3:1** | WCAG 2.1 AA §1.4.3 |
| UI 컴포넌트 경계 · 그래픽/아이콘 | **3:1** | WCAG 2.1 AA §1.4.11 |

- 포커스(§2.4.7): 인디케이터 시각 구별 필수. 대체 스타일 없는 `outline: none` / `outline: 0` = **즉시 FAIL**. 링 ≥2px·배경 대비 3:1 권장(WCAG 2.2 §2.4.11).
- 대체 텍스트: `<img>` `alt` 필수(장식 `alt=""`) · `<svg>` `aria-label`/`<title>`(장식 제외) · `<input type="image">` `alt`. 누락 = **FAIL**.
- Lighthouse a11y 점수(lighthouse 축): 90 이상 PASS / 70–89 WARN / 70 미만 FAIL. 세부 위반은 findings.

## 디자이너 관점 QA (10 카테고리)
**Design Classifier(필수 선행)**: MARKETING/LANDING(CTA 명확성·스크롤 내러티브·소셜 증거) / APP UI(탐색 일관성·상태 표·피드백) / HYBRID(교집합). 분류를 findings 첫 줄에 명시.
- **카테고리 1 타이포**: 폰트 ≤3종 · 본문 line-height ≥1.5x, 제목 ≥1.25x · 행 너비 45–75자 · 제목 계층 건너뜀 금지(h1→h3) · 중앙 정렬은 3줄 이하만(긴 단락 FAIL) · uppercase 는 레이블·캡션 한정. (타입 스케일 비율은 L1.5 M1)
- **카테고리 2 색상**: 대비 4.5:1 / 3:1 · 색 단독 의미 전달 금지 · 차트 = 색맹 친화 팔레트(Viridis·IBM Accessible·Okabe-Ito) · 랜덤 그라데이션 남용 금지.
- **카테고리 3 간격**: 섹션 여백 ≥64px(랜딩) / ≥32px(앱) · 같은 컴포넌트 padding ±4px · 패딩 <8px = WARN. (8pt 그리드는 L1.5 M2)
- **카테고리 4 레이아웃**: 1차 CTA / 2차 액션 / 3차 정보 분리 · 본문 640–800px, 전체 max 1280px · 그리드 불일치 WARN · 3칸 동일 feature grid + 원형 아이콘 = AI-Slop.
- **카테고리 5 컴포넌트 일관성**: 같은 기능 = 같은 패턴 · 상태 LOADING/EMPTY/ERROR/SUCCESS 필수(PARTIAL 해당 시) · Empty state = 따뜻한 메시지 + 주요 액션 1개 · 로딩 없는 비동기 WARN.
- **카테고리 6 이미지·미디어**: Lorem ipsum / "Your text here" / placeholder 이미지 = **FAIL**(모킹 텍스트 추출 사용) · aspect-ratio 왜곡 WARN · 폴드 아래 `loading="lazy"` 권장.
- **카테고리 7 반응형**: 375/768/1280 3점 · 수평 스크롤 FAIL · `overflow: hidden` + 고정 height 잘림 WARN · 터치 타겟 ≥44×44px(mobile).
- **카테고리 8 접근성**: §WCAG AA 임계값 · `prefers-color-scheme` 지원 확인 · `prefers-reduced-motion` 미지원 자동 애니메이션 WARN · `tabindex` 없는 `<div role="button">` WARN.
- **카테고리 9 감성·마감**: box-shadow 3겹+ · 색 드롭섀도 WARN · 글래스모피즘 과남용 WARN · 애니메이션 ease/ease-in-out 150–400ms(1000ms 초과 WARN) · hover = pointer + 시각 피드백 필수.
- **카테고리 10 콘텐츠 품질**: 실제 수치·사용자명 · 헤딩이 기능 설명("Features" X) · CTA = 동사+목적어("무료로 시작하기") · 오타/혼재 언어 WARN.

## AI-Slop 블랙리스트 (19 패턴)
발견 시 해당 컴포넌트 **즉시 FAIL**.

| # | 패턴 | 설명 |
|---|------|------|
| 1 | **보라-그라데이션 남용** | 브랜드 색 없이 generic purple/violet/indigo gradient 를 배경·히어로에 기본 적용 |
| 2 | **3열 feature grid + 원형 아이콘** | 동일 크기 3칸 grid + 원형 배경 아이콘 |
| 3 | **이모지 헤더** | 섹션 제목 앞·뒤 이모지(🚀✨💡) |
| 4 | **가짜 대칭** | 길이가 다른 카드를 동일 높이로 강제 |
| 5 | **중앙 정렬 남용** | 전 섹션 center, 4줄 이상 단락 중앙 정렬 |
| 6 | **과도한 둥근 모서리** | border-radius ≥24px 를 카드·버튼·이미지 전체 균일 적용 |
| 7 | **Generic box-shadow** | `0 4px 6px rgba(0,0,0,0.1)` 류 복붙(색 glow 는 별도 평가) |
| 8 | **Lorem ipsum / placeholder** | "Lorem ipsum", "Your text here", "Coming soon" |
| 9 | **과잉 CTA** | 한 뷰포트에 동일 CTA 3개+ |
| 10 | **불필요한 아이콘 범람** | 의미 없는 아이콘을 모든 항목에 부착 |
| 11 | **Glassmorphism 기본값** | 의도 없이 backdrop-filter + 반투명을 기본 카드로 |
| 12 | **카드 좌측 컬러 보더** | `border-left: 3px solid <accent>` 로 중요도 표현 |
| 13 | **wavy SVG divider / decorative blob** | 콘텐츠 부족을 곡선·blob·floating circle 장식으로 대체 |
| 14 | **`system-ui` / `-apple-system` primary 폰트** | 실제 서체 미지정 |
| 15 | **generic hero copy** | "Welcome to [X]", "Unlock the power of...", "Your all-in-one solution for..." |
| 16 | **독립 컬러 서클 아이콘** | 컬러 원형 배경 아이콘을 장식으로 독립 배치(SaaS starter 패턴) |
| 17 | **쿠키커터 섹션 리듬** | hero → 3 features → testimonials → pricing → CTA 동일 높이 반복 |
| 18 | **Generic 스톡/AI 일러스트** | 노트북 앞 사람들 스톡, 추상 3D blob — 콘텐츠 무관 장식 이미지 |
| 19 | **모션 부재 또는 균일 `transition: all` 페이드** | 상태전환 없는 정적 UI 또는 전 요소 동일 fade-in |

판정 레이어: #1~#17·#19 `transition: all` = L1 정적 grep. #18·#19 "모션 부재" = L2/L3 Vision 전용(Vision 미가동 경로에선 미탐).

## 3-Layer UI 품질 게이트
**L1 정적 토큰(매 실행)**: 토큰 하드코딩 vs 변수 비율 · `alt` 누락 img 수 · AI-Slop 정적 마커 grep · `outline: none/0`. 출력 findings + PASS/WARN/FAIL.
**L1.5 결정론 렌더 메트릭(URL 접근 시 · advisory — 종합 verdict 미반영)**:
1. `shared/scripts/playwright-devtools-capture.mjs` `extractComputedStyleBundle(page)` — desktop 1440×900, computed `font-size`/`padding`/`margin`/`gap` + bbox 추출.
2. `shared/scripts/design-metrics.mjs` `computeM1TypoScale` · `computeM2GridAlign` · `computeM3Alignment` · `computeM3Grid` 순수함수 채점.
3. `docs/qa/design-check.jsonl` append(`ts/url/viewport/source/m1_typo_scale/m1_unique_sizes/m2_grid_align/m3a_alignment/m3_verdict/m3d_grid/m3d_verdict/verdict/capture_ok/skipped`).
- warn: M1<0.8 또는 고유사이즈>8 · M2<0.85 · M3a<0.7(요소<2 = pass) · M3d<0.45(populated 컬럼<2 = pass). M3a = left/top 앵커가 공유 축(`Math.round(coord/2)`)에 2개+ 모이면 aligned. M3d = left-edge(TOL 2px) 컬럼(요소≥3)별 width 4px 토큰 ≤2종이면 일관(가변 span 3종+ 은 false-low).
- kill-switch `FORGE_DESIGN_METRICS=off`(jsonl 에 `skipped` 사유). findings 1줄: "L1.5 advisory: M1={score} M2={score} M3a={score} M3d={score} (verdict={verdict}, 종합판정 미반영)".
**L2 렌더 비주얼(URL 접근 시, Lighthouse MCP / Playwright)**: a11y 게이트 90↑/70-89/70↓ · contrast audit · 반응형 375/768/1280 깨짐 · 모든 FAIL 에 스크린샷 경로 첨부 의무.
**L3 Adversarial 6-Pillar(L1/L2 WARN 이상 시 자동, 또는 `layer=3`)** — `ui-quality-checker` adversarial stance, 각 0-10점: **P1 Visual Hierarchy**(1차/2차/3차 액션 구별) · **P2 Design System Integrity**(색 토큰 일관·컴포넌트 변형 규칙·브랜드 의도성 — 타입스케일·8pt 는 L1.5) · **P3 Accessibility**(포커스·대비·alt·ARIA) · **P4 Content Authenticity**(실제 콘텐츠·기능 설명 copy) · **P5 Interaction Coverage**(로딩·에러·빈 상태) · **P6 Anti-Slop Compliance**(19패턴, #18·#19 포함). 평균 8.0↑ PASS / 6.0-7.9 WARN / 6.0↓ FAIL. Retroactive Contract Audit: oracle-manifest.json 화면 ID ↔ 실제 라우트 1:1 누락 = FAIL.

## 판정 기준 (종합)
- **PASS**: 4축 모두 PASS + WCAG PASS + L3 8.0↑ · **WARN**: 1축+ WARN, FAIL 없음.
- **FAIL**: 1축+ FAIL · L3 6.0↓ · AI-Slop 1개+ · alt 누락 · outline:none 포커스 비활성.
- L1.5·레퍼런스 교차검증 = advisory(종합 verdict 가감 없음, `docs/qa/design-check.jsonl` 로깅).

## 레퍼런스 교차검증 (advisory)
카테고리 9 또는 AI-Slop #6·#11 등 특정 스타일이 적용/추천되면: ①로컬 `.claude/skills/frontend-design/data/refero-craft/anti-ai-slop.md` 해당 절 대조(기본) ②그 절이 없을 때만 `WebSearch` `site:mobbin.com {업종} {스타일}` 1회. findings 1줄로만 남기고 단독 판정 근거 금지(커버리지 밖·검색 부재 ≠ 비채택). ⛔ `styles.refero.design` 자동 조회 금지(robots.txt 가 AI 크롤러 전면 차단).

## 운영 참고
- oracle-manifest.json 없음 → screen-mapping 축 WARN("oracle-manifest 없음 — 스킵"). URL 미접근 → L2 스킵, L1·L3 만("URL 미접근 — L2 스킵" 명시).
- Lighthouse 축은 `codex-critic`(GPT-5.6 Sol) 경유 — approve-worker 토큰 선발행 필수.
