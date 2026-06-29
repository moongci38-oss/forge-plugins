# forge-design

Forge 디자인·에셋 파이프라인 플러그인. Figma 동기화, AI 이미지 생성, 다형식 변환, 시각적 품질 검증.

> **버전**: v0.1.3 | **의존성**: forge-core

---

## 설치

```bash
claude plugin marketplace add moongci38-oss/forge-plugins
claude plugin install forge-core      # 필수 (의존성)
claude plugin install forge-design
```

---

## 사전 요건

| 도구 | 용도 | 설정 |
|------|------|------|
| Figma MCP | figma-design-sync | `~/.claude.json` mcpServers에 figma 등록 |
| `OPENAI_API_KEY` | image-orchestrate (gpt-image-1) | `~/.bashrc` export |
| `GEMINI_API_KEY` | visual-loop, Gemini Vision | `~/.bashrc` export |
| Playwright | visual-loop (브라우저 스크린샷) | `npx playwright install` |

> Figma MCP·OPENAI_API_KEY 없이도 `visual-loop`·`multiformat-image`는 단독 동작합니다.

---

## 스킬 목록

### figma-design-sync

Figma file URL을 입력받아 디자인 토큰·메타·스크린샷을 Figma MCP로 fetch하고 `CLAUDE-DESIGN-PROMPTS.md` + `figma-export/ANALYSIS-REPORT.md`를 갱신합니다. claude.ai/design 결과물의 정합도를 높이는 데 사용합니다.

**주요 기능**
- Figma MCP로 Variables/Styles/Component 메타 fetch
- `figma-export/variables.json` 원본 저장
- `CLAUDE-DESIGN-PROMPTS.md` 디자인 토큰 자동 갱신
- `figma-export/ANALYSIS-REPORT.md` 실측 diff 생성
- Figma MCP rate limit 시 Codex/Gemini Vision PNG 재분석 자동 폴백

**사용법**
```
/figma-design-sync https://www.figma.com/file/XXXXX/project-name
```

**산출물**
```
docs/design/
├── CLAUDE-DESIGN-PROMPTS.md      — 디자인 토큰 갱신
├── figma-export/
│   ├── variables.json             — Figma Variables 원본
│   └── ANALYSIS-REPORT.md         — 실측·diff 리포트
└── screenshots/                   — 컴포넌트 스크린샷
```

---

### image-orchestrate

GodBlade AI 이미지 생성 주 진입점. orchestrator.sh + nanobanana-wrapper.py를 래핑하여 카테고리별 경로 자동 라우팅과 품질 검증을 제공합니다.

**주요 기능**
- **Primary**: gpt-image-1 (DALL·E 3) 생성
- **Fallback**: nano-banana API 자동 폴백
- 카테고리별 경로 자동 라우팅 (`AI_Generated/{category}/`)
- path-safe-storage.sh: 특수문자 파일명 안전 처리
- quality-check.py: 생성 이미지 품질 자동 검증

**카테고리**

| 카테고리 | 저장 경로 | 예시 |
|----------|----------|------|
| `character` | `AI_Generated/Characters/` | 플레이어, NPC |
| `monster` | `AI_Generated/Monsters/` | 몬스터, 보스 |
| `ui` | `AI_Generated/UI/` | 버튼, HUD |
| `background` | `AI_Generated/Backgrounds/` | 맵, 배경화면 |
| `effect` | `AI_Generated/Effects/` | VFX, 파티클 |

**사용법**
```
/image-orchestrate character "Dark Knight" "전신 갑옷의 기사, 검정 바탕 투명 PNG"
/image-orchestrate monster  "Fire Dragon"  "불꽃 드래곤, 측면 뷰, 투명 PNG"
/image-orchestrate ui       "Main Button"  "빨간 테두리 버튼, 게임 UI 스타일"
```

> 비-GodBlade 일반 이미지 생성은 `/generate-image` 사용 권장.

---

### multiformat-image

PNG를 WebP/sprite-ready 형식으로 변환합니다. PIL(Pillow) 또는 ImageMagick 사용.

**주요 기능**
- PNG → WebP 변환 (파일 크기 최소화, 품질 조정 가능)
- 스프라이트시트 생성 (여러 PNG → 단일 시트, 행·열 지정)
- 게임 에셋 형식 변환 (BMP, TGA, DDS 등)
- 배치 변환 지원 (디렉토리 전체 처리)

**사용법**
```
/multiformat-image ./assets/characters/         # 디렉토리 전체 WebP 변환
/multiformat-image ./frames/ --sprite 4x4       # 16장 PNG → 4×4 스프라이트시트
/multiformat-image ./ui/ --format webp --quality 85
```

> 이미지 생성 필요 시 → `/image-orchestrate` 사용.

---

### visual-loop

프론트엔드 변경 시 정적 분석 + 실제 렌더링 스크린샷(Playwright) + Gemini Vision 분석을 조합하여 closed loop 시각 검증을 수행합니다.

**주요 기능**
- 정적 코드 분석 (CSS/TS/JSX 변경 감지)
- Playwright로 실제 브라우저 렌더링 스크린샷 캡처 (WSL2 지원)
- Gemini Vision으로 UI 변경 품질 자동 분석
- 피드백 루프: 분석 결과 → 코드 수정 → 재캡처 → 재분석
- Boris Cherny Chrome 확장 패턴의 WSL2 환경 대체 구현

**사용법**
```
/visual-loop                          # 현재 브랜치 변경사항 자동 감지 후 실행
/visual-loop --url http://localhost:3000/dashboard
/visual-loop --diff HEAD~1            # 직전 커밋 대비 검증
```

**권장 사용 시점**
- `forge-design-review` 커맨드 내 자동 실행 (forge-dev 연동)
- 디자인 시스템 컴포넌트 변경 후 회귀 검증
- PR 생성 전 UI 품질 확인

---

## 에이전트

| 에이전트 | 역할 |
|----------|------|
| `doc-writer` | 소스 코드 → Markdown 문서 자동 생성. 모듈·API·클래스·함수 문서화 전담. |
| `gemini` | Gemini 2.5 Flash Vision/PDF 분석 + 광폭 컨텍스트 구조 리뷰. `mcp__gemini__analyze_media` / `mcp__gemini-text__generate_text` 연동. |

---

## 커맨드

forge-design 단독 커맨드는 없으며, **forge-dev**의 다음 커맨드와 연동됩니다:

| 커맨드 (forge-dev) | 설명 |
|-------------------|------|
| `/forge-design-review` | 디자인 검수 facade — forge-check-ui(게이트) → CRITICAL 시 visual-loop 실행 → 통합 리포트 |
| `/forge-check-ui` | UI/UX 품질 검수 단독 실행 (Lighthouse/a11y 기준) |

---

## 빠른 시작

```bash
# 1. Figma 디자인 토큰 동기화
/figma-design-sync https://www.figma.com/file/XXXXX/my-app

# 2. 게임 캐릭터 이미지 생성
/image-orchestrate character "Hero Warrior" "용감한 전사, 금빛 갑옷, 투명 PNG"

# 3. 생성된 PNG를 WebP로 배치 변환
/multiformat-image ./AI_Generated/Characters/ --format webp

# 4. 프론트엔드 변경 후 시각적 회귀 검증
/visual-loop --url http://localhost:3000
```

---

## Changelog

### v0.1.3
- visual-loop: WSL2 Playwright 지원 안정화
- image-orchestrate: gpt-image-1 primary + nano-banana fallback 개선
- figma-design-sync: rate limit 시 Gemini Vision 폴백 추가

### v0.1.2
- multiformat-image 추가 (PNG→WebP/sprite 변환)
- figma-design-sync: variables.json 원본 저장 추가

### v0.1.1
- image-orchestrate: path-safe-storage.sh 통합
- 초기 Figma MCP 연동
