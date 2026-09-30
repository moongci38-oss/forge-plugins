# 미학 가이드 (frontend-design 상세)

> SKILL.md 에서 옮긴 본문 — 원문(Anthropic 반입판) + Forge 보강.

## Design Thinking

Before coding, understand the context and commit to a BOLD aesthetic direction:
- **Purpose**: What problem does this interface solve? Who uses it?
- **Tone**: Pick an extreme: brutally minimal, maximalist chaos, retro-futuristic, organic/natural, luxury/refined, playful/toy-like, editorial/magazine, brutalist/raw, art deco/geometric, soft/pastel, industrial/utilitarian, etc. There are so many flavors to choose from. Use these for inspiration but design one that is true to the aesthetic direction.
- **Constraints**: Technical requirements (framework, performance, accessibility).
- **Differentiation**: What makes this UNFORGETTABLE? What's the one thing someone will remember?

**CRITICAL**: Choose a clear conceptual direction and execute it with precision. Bold maximalism and refined minimalism both work - the key is intentionality, not intensity.

Then implement working code (HTML/CSS/JS, React, Vue, etc.) that is:
- Production-grade and functional
- Visually striking and memorable
- Cohesive with a clear aesthetic point-of-view
- Meticulously refined in every detail

## Frontend Aesthetics Guidelines

Focus on:
- **Typography**: Choose fonts that are beautiful, unique, and interesting. Avoid generic fonts like Arial and Inter; opt instead for distinctive choices that elevate the frontend's aesthetics; unexpected, characterful font choices. Pair a distinctive display font with a refined body font.
- **Color & Theme**: Commit to a cohesive aesthetic. Use CSS variables for consistency. Dominant colors with sharp accents outperform timid, evenly-distributed palettes.
- **Motion**: Use animations for effects and micro-interactions. Prioritize CSS-only solutions for HTML. Use Motion library for React when available. Focus on high-impact moments: one well-orchestrated page load with staggered reveals (animation-delay) creates more delight than scattered micro-interactions. Use scroll-triggering and hover states that surprise.
- **Spatial Composition**: Unexpected layouts. Asymmetry. Overlap. Diagonal flow. Grid-breaking elements. Generous negative space OR controlled density.
- **Backgrounds & Visual Details**: Create atmosphere and depth rather than defaulting to solid colors. Add contextual effects and textures that match the overall aesthetic. Apply creative forms like gradient meshes, noise textures, geometric patterns, layered transparencies, dramatic shadows, decorative borders, custom cursors, and grain overlays.

NEVER use generic AI-generated aesthetics like overused font families as standalone brand fonts (Inter, Roboto, Arial) — system-ui/-apple-system 폴백 스택에서 Roboto 사용은 허용 — cliched color schemes (particularly purple gradients on white backgrounds), predictable layouts and component patterns, and cookie-cutter design that lacks context-specific character.
텍스트 UI에 이모지를 아이콘 대용으로 쓰지 말 것 — lucide-react/heroicons 등 아이콘 라이브러리를 사용(내비게이션·액션 아이콘 한정, 콘텐츠 이모지는 별개).


- **한국어 프로젝트 기본값**: 한국어 텍스트가 포함된 UI는 `Pretendard` 폰트를 기본으로 사용한다 (`@font-face` 또는 CDN). 아이콘은 `Iconify` (오픈소스, 200k+ 아이콘)를 우선 적용한다. Inter/Noto Sans KR 대신 Pretendard를 선택하면 한국어 가독성과 자간 품질이 즉시 개선된다.

- **Forge Default Reference**: Instagram Design Language — `#FFFFFF`/`#FAFAFA` 배경, `#0095F6` CTA, 5-color 브랜드 그라데이션 (`#FEDA75→#FA7E1E→#D62976→#962FBF→#4F5BD5`), Squircle(22%) 아이콘 코너, SF Pro Display 타이포그래피(-0.02em). 소셜/라이트 UI 구축 시 참고.

Interpret creatively and make unexpected choices that feel genuinely designed for the context. No design should be the same. Vary between light and dark themes, different fonts, different aesthetics. NEVER converge on common choices (Space Grotesk, for example) across generations.

**IMPORTANT**: Match implementation complexity to the aesthetic vision. Maximalist designs need elaborate code with extensive animations and effects. Minimalist or refined designs need restraint, precision, and careful attention to spacing, typography, and subtle details. Elegance comes from executing the vision well.

Remember: Claude is capable of extraordinary creative work. Don't hold back, show what can truly be created when thinking outside the box and committing fully to a distinctive vision.

### Last-Mile (70→100 마감)

- **생성과 마감을 분리된 pass로**: AI는 80%까지 빠르나 마지막 20%는 별도 편집 pass — 한 번에 끝내려 하면 80% 정체.
- **정밀 수치 지시**: "타이포 개선" 대신 "body leading 1.4→1.6, letter-spacing -0.02em" 같은 광학 보정 수치로 지시·검토한다.
- **실 콘텐츠 주입**: Lorem ipsum 제거, 실제 카피/스크린샷으로 교체한 상태에서 최종 마감을 판단한다.
- **모션 = 필수 인프라**: 균일 fade 아닌 상태별 목적있는 모션(spring physics 등)을 마감 단계에서 별도 점검한다.

> 근거: Last-Mile Design / Micro-graphics 2026 트렌드.

## Generator 원칙: Rubric 선행 + Museum Quality

코딩을 시작하기 전에 FD_SPEC.md의 Rubric을 먼저 읽고 내면화한다:

| 항목 | 기준 |
|------|------|
| **Typography** | Inter/Roboto 단독 사용 금지 — 독창적 서체 페어링 필수 |
| **Color** | 보라 그라데이션+흰 배경 금지 — 맥락에 맞는 팔레트 커밋 |
| **Layout** | 예측 가능한 카드 그리드 지양 — 비대칭/오버랩/대각선 흐름 검토 |
| **Motion** | 산발적 마이크로인터랙션 지양 — 고임팩트 포인트 1개 집중. ⚠️ 이 원칙이 금지하는 것은 *산발적* 마이크로인터랙션이지 *강한 표현*이 아니다 — **고임팩트 1개는 배경 셰이더 1장(ambient background)으로 채워도 된다**(배경 레이어는 레이아웃·인터랙션 수를 늘리지 않으므로 정합). 부품: `data/ui-ux-pro-max/stacks/shaders.csv` · `motion.csv` No 17~19 |
| **AI Slop** | 라이브러리 기본값, 틀에 박힌 그림자, 과잉 rounded-corners 금지 |

**Museum Quality 목표**: "이 UI를 박물관에 전시해도 부끄럽지 않은가?"
- 라이브러리 기본값을 그대로 쓴 부분이 있는가? → 제거
- AI 슬롭 패턴(뻔한 Hero 레이아웃, 예측 가능한 카드 3열)이 남아 있는가? → 교체
- Rubric으로 자체 채점 후 3.5점 미만 항목 개선

## Brainstorm-First (복잡한 UI 요청 선행 절차)

요구사항이 복잡하거나(다중 화면, 새로운 톤 앤 매너, 사용자 취향이 불명확한 경우) 바로 본구현(React 등)에 들어가면 재작업 비용이 크다. 이런 경우 코드 작성 전에 저비용 시안 라운드를 먼저 거친다:

1. **설명**: 요구사항에서 가능한 방향성 2~3개를 짧게 구술(톤/레이아웃/컬러 축으로 구분).
2. **시안 생성**: 각 방향을 HTML/Artifact로 저비용 목업 2~3개 생성(본구현 프레임워크로 바로 만들지 않는다).
3. **리뷰**: 사용자에게 시안을 제시하고 선택 또는 조합 지시를 받는다.
4. **빌드**: 선택된 방향을 기준으로 본 하네스(Planner-Generator-Evaluator)를 통해 실제 구현(React 등)으로 전환한다.

단순 컴포넌트 1개 수정처럼 범위가 명확한 요청은 이 절차를 생략하고 바로 구현한다.


## 업종별 조건부 디자인 룰

동일한 "세련된 디자인"이라도 업종에 따라 정반대 선택이 정답일 수 있다. 좋은 디자인의
관건은 **참조 가능한 레퍼런스의 폭**이므로, 아래 4업종 표는 손으로 쓴 *예시*일 뿐이고
실제 판단은 §레퍼런스 데이터 조회의 데이터셋(업종 192 · 스타일 84 · UI 결정규칙 161 ·
기술스택 22종)에서 해당 행을 뽑아 근거로 삼는다.

| 업종 | 컬러 | 모션 | 금지 |
|------|------|------|------|
| 금융/핀테크 | 다크모드 선호, 절제된 뉴트럴 + 신뢰형 포인트 컬러 | 느린·과시적 애니메이션 지양(신뢰감 저해) | 유희적 일러스트, 장난스러운 카피 톤 |
| 키즈 앱 | 높은 채도, 원색 계열 | 활발하고 즉각적인 피드백 모션 | 차분한 톤/저채도 팔레트(연령대 몰입 저해) |
| 명상/웰니스 앱 | 파스텔, 저대비 | 느리고 부드러운 전환(호흡 리듬형) | 고채도 원색, 급격한 모션 |
| 럭셔리/프리미엄 | 절제된 팔레트 + 여백 극대화 | 절제된 모션(존재감보다 여운) | 과잉 장식, 산만한 마이크로인터랙션 |

- **로컬라이제이션 가드**: 외부 소스(영미권)의 폰트 페어링을 한글에 그대로 채택 금지 — 한글 프로젝트는 Pretendard/Noto Sans KR 등 한글 최적화 폰트로 치환 후 대비 원칙만 재적용.
- **검증 가드**: 업종 룰은 무검증 복붙 금지 — 대조 후 채택한다. 대조 소스는 **①`data/refero-craft/`
  (로컬·결정론적, 아래 §craft 레퍼런스) → ②실사례 웹 검색(Mobbin 등)** 순이다. ②는 로그인 벽 때문에
  신호가 비어도 "미채택"의 증거가 아니다(검색 부재≠미채택).
