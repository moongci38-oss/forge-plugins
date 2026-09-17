---
name: pptx
description: "Manual-invocation only (/pptx) — automatic triggering is disabled. Handles .pptx work when explicitly called: creating/editing decks, pitch decks, presentations; reading/extracting text; combining/splitting slides; templates, layouts, speaker notes, comments."
context: fork
model: sonnet
disable-model-invocation: true   # 자동 발동 차단(2026-08-27) — 사용자 명시 호출(/pptx)은 그대로 동작
paths:
  - "**/*.pptx"
  - "**/*.ppt"
---

# PPTX Skill

## Quick Reference

| Task | Guide |
|------|-------|
| Read/analyze content | `python -m markitdown presentation.pptx` |
| Edit or create from template | Read [editing.md](editing.md) |
| Create from scratch | Read [pptxgenjs.md](pptxgenjs.md) |

---

## Reading Content

```bash
# Text extraction
python -m markitdown presentation.pptx

# Visual overview
python scripts/thumbnail.py presentation.pptx

# Raw XML
python scripts/office/unpack.py presentation.pptx unpacked/
```

---

## Editing Workflow

**Read [editing.md](editing.md) for full details.**

1. Analyze template with `thumbnail.py`
2. Unpack → manipulate slides → edit content → clean → pack

---

## Creating from Scratch

**Read [pptxgenjs.md](pptxgenjs.md) for full details.**

Use when no template or reference presentation is available.

---

## Design Principles

Three proven rules that prevent the most common slide failures:

**1. One Message Per Slide** — If you can't summarize a slide's point in one sentence, split it. Audiences read or listen, not both. (Garr Reynolds, *Presentation Zen*)

**2. Maximize Data-Ink Ratio** — On data slides, every pixel should show data. Remove gridlines, borders, legends, and decorations that don't convey information. A clean chart with 3 bars beats a decorated chart with 10. (Edward Tufte, *The Visual Display of Quantitative Information*)

**3. CRAP Check** — Before finalizing any slide, verify these four:
- **Contrast**: Is there a clear visual hierarchy? (title vs body, primary vs secondary)
- **Repetition**: Is the same motif/style used across all slides? (card style, icon treatment, colors)
- **Alignment**: Are elements on invisible grid lines, not scattered randomly?
- **Proximity**: Are related items grouped together, unrelated items separated?

(Robin Williams, *The Non-Designer's Design Book* — the most widely taught design framework)

---

## Design Ideas

**Don't create boring slides.** Plain bullets on a white background won't impress anyone. Consider ideas from this list for each slide.

### Before Starting

- **Pick a bold, content-informed color palette**: The palette should feel designed for THIS topic. If swapping your colors into a completely different presentation would still "work," you haven't made specific enough choices.
- **Dominance over equality**: One color should dominate (60-70% visual weight), with 1-2 supporting tones and one sharp accent. Never give all colors equal weight.
- **Dark/light contrast**: Dark backgrounds for title + conclusion slides, light for content ("sandwich" structure). Or commit to dark throughout for a premium feel.
- **Commit to a visual motif**: Pick ONE distinctive element and repeat it — rounded image frames, icons in colored circles, thick single-side borders. Carry it across every slide.

### Color Palettes

Choose colors that match your topic — don't default to generic blue. Use these palettes as inspiration:

| Theme | Primary | Secondary | Accent |
|-------|---------|-----------|--------|
| **Instagram Social** | `0095F6` (link-blue) | `FAFAFA` (light gray) | `D62976` (pink) |
| **Midnight Executive** | `1E2761` (navy) | `CADCFC` (ice blue) | `FFFFFF` (white) |
| **Forest & Moss** | `2C5F2D` (forest) | `97BC62` (moss) | `F5F5F5` (cream) |
| **Coral Energy** | `F96167` (coral) | `F9E795` (gold) | `2F3C7E` (navy) |
| **Warm Terracotta** | `B85042` (terracotta) | `E7E8D1` (sand) | `A7BEAE` (sage) |
| **Ocean Gradient** | `065A82` (deep blue) | `1C7293` (teal) | `21295C` (midnight) |
| **Charcoal Minimal** | `36454F` (charcoal) | `F2F2F2` (off-white) | `212121` (black) |
| **Teal Trust** | `028090` (teal) | `00A896` (seafoam) | `02C39A` (mint) |
| **Berry & Cream** | `6D2E46` (berry) | `A26769` (dusty rose) | `ECE2D0` (cream) |
| **Sage Calm** | `84B59F` (sage) | `69A297` (eucalyptus) | `50808E` (slate) |
| **Cherry Bold** | `990011` (cherry) | `FCF6F5` (off-white) | `2F3C7E` (navy) |

### For Each Slide

**Every slide needs a visual element** — image, chart, icon, or shape. Text-only slides are forgettable. 스톡 이미지가 없으면 **GPT Image 2.5(구독)** 로 생성한다 → §Generating Visuals. 레인이 실제로 불가할 때만(codex 부재·미로그인·쿼터) 도형·차트·타이포로 구성하거나 라벨 붙은 자리표시자를 둔다.

**Layout options:**
- Two-column (text left, illustration on right)
- Icon + text rows (icon in colored circle, bold header, description below)
- 2x2 or 2x3 grid (image on one side, grid of content blocks on other)
- Half-bleed image (full left or right side) with content overlay
- UI mockup showcase (Astra 코드 목업 캡처 + annotation callouts)
- Variant comparison (Astra 목업 2-3벌을 라벨 붙여 격자로)

**Data display:**
- Large stat callouts (big numbers 60-72pt with small labels below)
- Comparison columns (before/after, pros/cons, side-by-side options)
- Timeline or process flow (numbered steps, arrows)

**Visual polish:**
- Icons in small colored circles next to section headers
- Italic accent text for key stats or taglines

### Typography

**Choose an interesting font pairing** — don't default to Arial. Pick a header font with personality and pair it with a clean body font.

| Header Font | Body Font |
|-------------|-----------|
| SF Pro Display | SF Pro Text |
| Segoe UI | Segoe UI Light |
| Georgia | Calibri |
| Arial Black | Arial |
| Calibri | Calibri Light |
| Cambria | Calibri |
| Trebuchet MS | Calibri |
| Impact | Arial |
| Palatino | Garamond |
| Consolas | Calibri |

| Element | Size |
|---------|------|
| Slide title | 36-44pt bold |
| Section header | 20-24pt bold |
| Body text | 14-16pt |
| Captions | 10-12pt muted |

> **플랫폼별 폰트 가용성**: SF Pro Display는 macOS/iOS 전용. Windows에서는 Segoe UI로 자동 폴백. PptxGenJS는 폰트 파일을 임베드하지 않으므로 뷰어의 설치 폰트에 의존한다.

### Spacing

- 0.5" minimum margins
- 0.3-0.5" between content blocks
- Leave breathing room—don't fill every inch

### Avoid (Common Mistakes)

- **Don't repeat the same layout** — vary columns, cards, and callouts across slides
- **Don't center body text** — left-align paragraphs and lists; center only titles
- **Don't skimp on size contrast** — titles need 36pt+ to stand out from 14-16pt body
- **Don't default to blue** — pick colors that reflect the specific topic
- **Don't mix spacing randomly** — choose 0.3" or 0.5" gaps and use consistently
- **Don't style one slide and leave the rest plain** — commit fully or keep it simple throughout
- **Don't create text-only slides** — add images, icons, charts, or visual elements; avoid plain title + bullets
- **Don't forget text box padding** — when aligning lines or shapes with text edges, set `margin: 0` on the text box or offset the shape to account for padding
- **Don't use low-contrast elements** — icons AND text need strong contrast against the background; avoid light text on light backgrounds or dark text on dark backgrounds
- **NEVER use accent lines under titles** — these are a hallmark of AI-generated slides; use whitespace or background color instead

---

## 렌더링 레벨 (Rendering Quality Level)

슬라이드 비주얼 품질은 `shared/design-tokens/rendering-levels.md`의 레벨 체계를 따른다.
프로젝트 style-guide에 `Rendering Level` 필드가 있으면 해당 레벨을, 없으면 용도별 기본값을 적용한다.

| 용도 | 기본 레벨 |
|------|:-------:|
| 정부과제/공식 제안서 | L3 |
| 투자 IR | L3 ~ L4 |
| 내부 보고서 | L2 |
| 기술 데모 | L3.5c |

**적용 방식:**
- 이미지 생성 시 해당 레벨의 프롬프트 키워드 사전을 `--prompt` 에 삽입
- 슬라이드 도형/배경/아이콘 스타일을 레벨에 맞게 차등 적용
- L3 이상에서 다이어그램은 GPT Image 2.5(구독)로 생성하여 삽입 (도형 직접 구성 대신)

> ✅ 2026-09-15: 이미지 생성 레인 **재개**(§Generating Visuals — GPT Image 2.5). 구 ⛔ 중단 고지(2026-09-12)는
> 폐기됐다 — 중단 근거였던 "구독 수단 없음"이 오판이었다.

## Generating Visuals — GPT Image 2.5 (구독) · D9

> ✅ **레인 재개(2026-09-15, 사람 결정 D9).** 2026-09-12 의 중단 근거("구독 레인에 이미지 생성 수단이 없다")는
> **오판이었다** — `codex --help` 의 서브커맨드 목록만 보고 내린 결론인데 Codex **내장** 도구는 거기 안 나온다.
> 실측: `codex features list | grep image_generation` → `stable true` · 실생성 1254×1254 PNG 확인.
> **NanoBanana(Gemini)는 돌아오지 않는다** — Gemini 전면 철수(2026-09-07)와 같은 축이다.
>
> **지금 쓰는 경로**(건당 과금 없음 — 구독):
> ```bash
> bash "${FORGE_ROOT:-$HOME/forge}/shared/scripts/generate-image-codex.sh" \
>   --prompt "<무엇을 그릴지>" --output "<절대경로>/_assets/bg-title.png" --aspect 16:9
> ```
> stdout 마지막 줄 = 저장된 절대경로 · exit 0=성공/2=실패. 계약·경계는 그 스크립트 머리말이 정본이다.
>
> ⛔ **`/generate-image`·`shared/scripts/generate-image.py`(API 종량 경로)로 우회하지 마라** — 다른 팀원이
> 쓰는 별도 레인이고 과금 게이트가 따로 걸려 있다(사람 지시 2026-09-15 D7).
>
> **QA 채점 복원**: 중단 기간의 `N/A`·"감점 금지" 조항은 **해제한다.** 생성 경로가 살아 있으므로
> 제목/섹션 슬라이드에 생성 배경이 없으면 다시 감점 대상이다. 단 **레인이 실제로 불가할 때**
> (codex CLI 부재·미로그인·쿼터 소진)는 라벨 붙은 자리표시자가 그 줄을 통과시킨다 —
> 판정 축은 "이미지가 있나"가 아니라 **"쓸 수 있는 레인을 썼나"** 다.
>
> 근거: 계획서 `forge-outputs/11-platform/pipelines/plans/2026-09-15-astra-lanes-plan.md` D9·단계 4 ·
> 도구 순위 정본 `dev/global-rules/tool-rules.md §UI/UX 작업`(이미지 ①GPT Image 2.5 ②Claude Design).
> 폐기조건: Codex 내장 `image_gen` 이 사라지거나 이미지 1순위가 바뀌면 이 절을 그 경로로 다시 쓴다.

When stock images are unavailable, generate custom visuals with the subscription lane above.

### Slide Type → Image Guide

| Slide Type | What to Generate | Aspect Ratio | Resolution |
|------------|-----------------|:------------:|:----------:|
| Title / Section divider | Gradient background, theme illustration | 16:9 | 2K |
| Content | Concept illustration, icon set | 1:1 or 4:3 | 1K |
| Data / Chart | Infographic-style background | 16:9 | 1K |
| Ending / CTA | Brand visual, thank-you background | 16:9 | 2K |

### Prompt Patterns

- **Background**: `"Minimal abstract gradient background for presentation slide, [color palette from Design Ideas], no text, clean professional"`
- **Illustration**: `"Flat illustration of [concept], minimal style, [brand colors], transparent background, vector art style"`
- **Icon set**: `"Set of 4 flat icons for [topics], consistent style, [color], on transparent background"`
- **Decorative**: `"Abstract geometric pattern, [colors], subtle, presentation background, no text"`

### Workflow

1. Decide color palette (see Design Ideas above)
2. Generate background images for title + section divider slides via `generate-image-codex.sh` (구독)
3. Generate content illustrations for key slides (같은 스크립트, `--aspect 1:1`)
4. Save images to `_assets/` folder next to the output .pptx — `--output` 에 그 절대경로를 직접 준다
   (스크립트가 상대경로를 거부한다. 홈·레포 루트 **바로 아래**도 거부하므로 반드시 `_assets/` 안을 가리켜라)
5. Insert into slides using `slide.background` or `slide.addImage`
6. Run QA loop to verify visual consistency

### Image Storage

Save generated images next to the output file:
```
output/
├── presentation.pptx
└── _assets/
    ├── bg-title.png
    ├── bg-section.png
    ├── illust-concept.png
    └── ...
```

Clean up `_assets/` after final .pptx is confirmed (images are embedded in the file).

---

## UI Mockups & Layout — GPT 코더 (코드 목업 → 캡처) · D9

> ⛔ **Stitch 사용 중단(2026-09-15, 사람 결정)** — Gemini 전면 철수와 같은 축이다. `stitch` MCP 도
> `/forge-stitch` 도 **새로 호출하지 않는다**. 아래는 그 자리를 대신하는 경로다.
> 근거: `dev/global-rules/tool-rules.md §UI/UX 작업`(퍼블리싱·HTML·프론트엔드 ①GPT 코더 상황별 ②Claude Design — 2026-09-17, 구 표기 ①GPT-6 Astra 폐기).
> 폐기조건: 프론트 1순위가 바뀌면 이 절을 그 도구로 다시 쓴다.

Astra 는 **그림이 아니라 코드**로 목업을 만든다 — HTML/CSS 를 짜게 하고, 브라우저로 **캡처**해서 슬라이드에 넣는다.
그림 생성보다 나은 점: 토큰(색·폰트·간격)을 그대로 지킬 수 있고, 그 코드가 곧 구현 초안이 된다.

### Use Case 1: UI Mockup Slides (PRD/GDD presentations)

**Workflow:**
1. 디자인 토큰이 있으면 먼저 챙긴다(`DESIGN.md`) — 없으면 Design Ideas 팔레트를 쓴다.
2. Astra 에게 **자립형 HTML 1파일**을 짜게 한다 — 외부 CDN·폰트 금지, 스타일 인라인:
   ```bash
   # 모델: 2026-09-17 사람 지시 "advisor 에서만 최고급 모델 사용해" — 구 표기 gpt-6-astra 폐기 → sol(`/forge-mockup` 신호 없음 기본과 동일)
   codex exec --model gpt-5.6-sol --sandbox workspace-write \
     --cd "<목업 폴더 절대경로>" --skip-git-repo-check --ephemeral \
     -- "<화면 설명 + 토큰> 을 반영한 자립형 HTML 1파일을 screen.html 로 저장하라. 외부 요청 없이 렌더되어야 한다."
   ```
3. 캡처 → PNG: `/playwright-cli` 또는 `shared/scripts/` 의 캡처 경로를 쓴다(뷰포트를 슬라이드 비율에 맞춘다).
4. `slide.addImage` 로 삽입. **HTML 원본은 버리지 않는다** — 구현 단계의 입력이다.

**변형(variant) 비교 슬라이드**: 같은 프롬프트에 방향만 바꿔 2~3벌을 만들고 라벨을 붙여 격자로 배치한다.

**화면 종류**: Desktop(대시보드·관리자) · Mobile(반응형) · Tablet — 뷰포트 크기로 가른다(도구 옵션이 아니다).

**Slide patterns for UI mockups:**
- **Single mockup**: Full-width or half-bleed image with annotations on the side
- **Before/After**: Two mockups side by side showing improvements
- **Variant comparison**: 2-3 mockup variants in a grid with labels (pairs well with agent meeting comparison slides)
- **Mobile + Desktop**: Side by side showing responsive design

### Use Case 2: Slide Layout Reference

레이아웃 배치가 막히면 Astra 에게 배치안을 **코드로** 뽑게 하고 비율만 읽어 온다.
1. 슬라이드 내용을 주고 16:9 뷰포트 기준 HTML 배치안을 짜게 한다
2. 요소 배치 비율을 읽는다
3. PptxGenJS 좌표로 옮긴다
4. **참고용이다** — 실제 슬라이드는 PptxGenJS 로 만든다

---

## QA Pipeline (Required — Score ≥ 90/100)

**Assume there are problems. Your job is to find and fix them until the score hits 90+.**

Your first render is almost never correct. The QA pipeline scores every slide, identifies failures, fixes them, and re-scores — up to 3 iterations. Do not declare success below 90 points.

### Step 1: Content QA

```bash
python -m markitdown output.pptx
```

Check for missing content, typos, wrong order.

**Check for leftover placeholder text:**

```bash
python -m markitdown output.pptx | grep -iE "xxxx|lorem|ipsum|this.*(page|slide).*layout"
```

If grep returns results, fix them before proceeding to Visual QA.

### Step 2: Visual QA Scoring

**⚠️ USE SUBAGENTS** — even for 2-3 slides. You've been staring at the code and will see what you expect, not what's there. Subagents have fresh eyes.

Convert slides to images (see [Converting to Images](#converting-to-images)), then score using the 5-axis rubric below.

#### Scoring Rubric (5 axes × 20 points = 100)

**A. Layout & Alignment (20점)**

| Score | Criteria |
|:-----:|----------|
| 18-20 | All elements aligned, consistent gaps (0.3-0.5"), no overlaps, ≥0.5" edge margins |
| 14-17 | Minor alignment issues (1-2 elements off), gaps mostly consistent |
| 10-13 | Noticeable overlaps or cramped areas, inconsistent spacing |
| 0-9 | Major overlaps, text cut off, elements colliding |

Checklist:
- No overlapping elements (text through shapes, stacked elements)
- No text overflow or cut off at edges/box boundaries
- Elements not too close (< 0.3" gaps)
- Sufficient margin from slide edges (≥ 0.5")
- Columns/grids aligned consistently
- Text boxes wide enough (no excessive wrapping)

**B. Color & Contrast (20점)**

| Score | Criteria |
|:-----:|----------|
| 18-20 | Strong text-background contrast everywhere, palette consistent, dark/light sandwich structure |
| 14-17 | Minor contrast issues (1-2 elements), palette mostly consistent |
| 10-13 | Readable but dull, some low-contrast text or icons |
| 0-9 | Text unreadable on background, random color choices |

Checklist:
- All text has strong contrast against its background
- Icons have strong contrast (dark on light, or light circle behind dark icons)
- Background images have semi-transparent overlay for text readability
- Color palette consistent across all slides
- No default blue — colors match the topic

**C. Visual Richness (20점)**

| Score | Criteria |
|:-----:|----------|
| 18-20 | Every slide has visual elements (images, charts, diagrams, shapes), generated backgrounds on title/section slides (GPT Image 2.5 — 구독), Astra 코드 목업 캡처 where applicable |
| 14-17 | Most slides have visuals, 1-2 text-heavy slides remain |
| 10-13 | Half the slides are text-only or text+bullets |
| 0-9 | Mostly text-only slides, no images or charts |

Checklist:
- Title/section slides have generated background images (GPT Image 2.5 — 구독). ⚠️ **레인이 실제로 불가할 때만**(codex 부재·미로그인·쿼터 소진) 도형 배경 또는 라벨 붙은 자리표시자로 PASS — 그 사유를 리포트에 1줄 적는다
- Data slides have charts (BAR/PIE/LINE) not just tables
- Process slides have flow diagrams (cards + arrows)
- App/web presentations include UI mockups (Astra 코드 목업 → 캡처)
- No text-only slides (every slide has at least one visual element)
- Concept illustrations where applicable

**D. Typography (20점)**

| Score | Criteria |
|:-----:|----------|
| 18-20 | Clear size hierarchy (title 36+, body 14-16, caption 10-12), consistent font pairing, bold/accent used purposefully |
| 14-17 | Hierarchy present but minor inconsistencies (1-2 slides) |
| 10-13 | Flat hierarchy, titles don't stand out, inconsistent fonts |
| 0-9 | Single font size throughout, no hierarchy |

Checklist:
- Title ≥ 36pt bold, stands out from body text
- Body text 14-16pt, left-aligned (not centered)
- Captions/labels 10-12pt, muted color
- Consistent font pairing across all slides
- No accent lines under titles

**E. Cross-Slide Consistency (20점)**

| Score | Criteria |
|:-----:|----------|
| 18-20 | Unified visual motif repeated across slides, consistent card/shape styles, same color usage patterns |
| 14-17 | Mostly consistent, 1-2 slides deviate from the pattern |
| 10-13 | Each slide looks independently designed, no unifying motif |
| 0-9 | Random layouts, mixed styles, no coherence |

Checklist:
- Same visual motif (card style, border treatment, icon style) across slides
- Background treatment consistent (dark sandwich or all-dark)
- Same shadow/fill style for cards
- Layout variety without breaking consistency
- Slide transitions feel like one deck, not separate files

#### Critical Thinking Mandate

The scoring subagent MUST adopt an adversarial mindset. You are a **harsh design critic**, not a supportive colleague.

**Anti-Leniency Rules:**
- **Never round up.** If a slide is "almost" 18, it's 17.
- **Never give benefit of the doubt.** If you're unsure whether something is an issue, it IS an issue.
- **Compare against professional decks** (Apple keynotes, McKinsey reports, top-tier pitch decks), not against "AI-generated average."
- **18-20 means genuinely impressive** — would a professional designer approve this slide without changes? If not, cap at 17.
- **Inflation check:** If your first pass averages above 85, re-evaluate — you're probably being too generous. Recalibrate with stricter eyes.
- **Each deduction needs a reason.** Don't just score — explain WHY points were lost.

**Cognitive Biases to Guard Against:**
- **Creator bias**: "I made this so it must be good" — you didn't make it, judge it cold.
- **Effort bias**: "A lot of work went into this" — irrelevant. Judge the output, not the effort.
- **Anchoring**: Don't let the first slide's score influence the rest. Score each independently.
- **Comparison anchor**: Don't compare against the previous (worse) version. Judge against absolute standards.

#### Subagent Scoring Prompt

```
You are a harsh, professional design critic reviewing a presentation.
Score using the 5-axis rubric (each 0-20, total 100).

CRITICAL: Be adversarial. Your job is to FIND FLAWS, not to validate.
- A "decent" AI-generated deck scores 60-70.
- A "good" deck scores 75-85.
- "Excellent" (90+) means a professional designer would approve with minimal changes.
- If your average is above 85 on first pass, you are being too lenient. Re-evaluate.

For EACH slide, evaluate with specific deduction reasons:
A. Layout & Alignment: overlaps, gaps, margins, alignment
   → Deduct for: any overlap (-3), inconsistent gaps (-2), tight margins (-2), misaligned columns (-2)
B. Color & Contrast: text readability, palette consistency, icon contrast
   → Deduct for: any unreadable text (-4), inconsistent palette (-2), low-contrast icons (-2), no bg overlay on images (-3)
C. Visual Richness: images, charts, diagrams present (not just text+bullets)
   → Deduct for: text-only slide (-8), bullets without visuals (-4), no generated image on title (-3 — ⚠️ 레인이 실제로 불가했다고 리포트에 적혀 있으면 감점하지 않는다), data as table instead of chart (-3)
D. Typography: size hierarchy, font consistency, bold/accent usage
   → Deduct for: title < 36pt (-3), no size hierarchy (-4), centered body text (-2), accent lines under titles (-3)
E. Cross-Slide Consistency: unified motif, card styles, color patterns
   → Deduct for: different card styles (-3), inconsistent backgrounds (-3), no recurring motif (-4)

Output format:
| Slide | A | B | C | D | E | Total | Deduction Reasons |
|-------|---|---|---|---|---|-------|-------------------|
| 1     |   |   |   |   |   |       |                   |
| ...   |   |   |   |   |   |       |                   |
| AVG   |   |   |   |   |   | ??/100|                   |

Then answer:
1. TOP 3 most impactful fixes (each with expected score improvement)
2. Would a professional designer approve this deck? (Yes/No/With minor edits)
3. What is the single weakest slide and why?

Read and analyze these images:
1. /path/to/slide-01.jpg
2. /path/to/slide-02.jpg
...
```

### Step 3: Fix-and-Rescore Loop

```
Generate → Convert to images → Score (subagent)
    ↓
Score ≥ 90? → PASS ✅
    ↓ No
Fix top 3 issues → Re-render affected slides → Re-score
    ↓
Score ≥ 90? → PASS ✅
    ↓ No
Fix remaining issues → Re-render → Re-score (iteration 2)
    ↓
Score ≥ 90? → PASS ✅
    ↓ No
Final fix attempt → Re-render → Re-score (iteration 3, final)
    ↓
Score ≥ 85? → PASS with note ⚠️
Score < 85? → FAIL — report to Human for manual review
```

**Rules:**
- Maximum 3 fix iterations (prevent infinite loops)
- Each iteration focuses on the **top 3 highest-impact fixes** from the score report
- After fixing, only re-render and re-score **affected slides** (not the full deck)
- If score plateaus (same score twice), stop and report remaining issues
- Score ≥ 90 = PASS, 85-89 = PASS with caveats, < 85 = report to Human

### Axis-Specific Fix Strategies

| Low-Scoring Axis | Fix Strategy |
|-----------------|--------------|
| **A. Layout** | Adjust x/y/w/h coordinates, add margins, increase gaps between elements |
| **B. Color** | Add semi-transparent overlay on bg images, increase text color contrast, fix icon circles |
| **C. Visual Richness** | Add generated images (GPT Image 2.5 — `generate-image-codex.sh`), convert tables to charts (maximize data-ink ratio — remove gridlines/borders), add flow diagrams, generate Astra 코드 목업 캡처 |
| **D. Typography** | Increase title size, enforce font pairing, add bold/color to key terms |
| **E. Consistency** | Extract common styles into variables, apply same shadow/fill/motif to all slides |

---

## Converting to Images

Convert presentations to individual slide images for visual inspection:

```bash
python scripts/office/soffice.py --headless --convert-to pdf output.pptx
pdftoppm -jpeg -r 150 output.pdf slide
```

This creates `slide-01.jpg`, `slide-02.jpg`, etc.

To re-render specific slides after fixes:

```bash
pdftoppm -jpeg -r 150 -f N -l N output.pdf slide-fixed
```

---

## Spec 바인딩 모드 (게임/앱 기획서 → Spec 시각 요소 추출)

> 기획서 PPTX를 읽어 슬라이드별 시각 요소를 구조화 추출한다.
> Spec 작성 시 `forge-spec-visual-binding.md` B-1(슬라이드 매핑), B-2(시안 바인딩), A-2(디자인 토큰) 형식으로 출력한다.

### 트리거 조건
- Spec 작성 중 기획서 PPTX를 참조할 때
- 사용자가 "기획서에서 시각 요소 추출" 또는 "Spec 바인딩" 요청 시

### 워크플로우

1. `markitdown`으로 기획서 PPTX 텍스트 추출
2. 슬라이드별 시각 요소 식별 (UI 목업, 캐릭터 디자인, 이펙트 시안, 아이콘, 컬러 팔레트 등)
3. `_assets/` 폴더에 슬라이드 이미지가 있으면 → `/screenshot-analyze`로 자동 라우팅하여 상세 분석
4. 추출 결과를 아래 형식으로 구조화

### 출력 형식

#### forge-spec-visual-binding.md B-1 형식 (슬라이드 매핑)

| FR-ID | 기능 | 기획서 슬라이드 | 기획서 요소 |
|:-----:|------|:-------------:|-----------|

#### forge-spec-visual-binding.md B-2 형식 (시안 바인딩)

| FR-ID | 시안 이미지 | 참조 요소 |
|:-----:|-----------|----------|

#### forge-spec-visual-binding.md A-2 형식 (디자인 토큰)

| 토큰 | 값 | 출처 |
|------|-----|------|
| [예: color-primary] | [예: #0095F6] | [기획서 S12] |

#### 슬라이드 전체 요약

| 슬라이드 # | 제목 | 시각 요소 | 추출 컬러 (Hex) | 레이아웃 설명 | 대응 FR 후보 |
|:----------:|------|----------|:-------------:|-------------|:----------:|

### 주의사항
- `markitdown`은 텍스트만 추출 — 시각 요소(이미지, 도형, 색상)는 슬라이드 텍스트 맥락에서 추론
- `_assets/`에 슬라이드 이미지가 있으면 `/screenshot-analyze`로 정확한 시각 분석 수행
- 슬라이드 이미지가 없으면 텍스트 기반 추론만 가능 (정확도 제한됨을 명시)

---

## Dependencies

- `pip install "markitdown[pptx]"` - text extraction
- `pip install Pillow` - thumbnail grids
- `npm install -g pptxgenjs` - creating from scratch
- LibreOffice (`soffice`) - PDF conversion (auto-configured for sandboxed environments via `scripts/office/soffice.py`)
- Poppler (`pdftoppm`) - PDF to images
