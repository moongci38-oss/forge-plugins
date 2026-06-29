# forge-game

Forge 게임 개발 파이프라인 플러그인. GodBlade/Unity 전용 GDD 작성, 게임 QA, 에셋 생성·관리.

> **버전**: v0.1.2 | **의존성**: forge-core, forge-design

---

## 설치

```bash
claude plugin marketplace add moongci38-oss/forge-plugins
claude plugin install forge-core      # 필수 (의존성)
claude plugin install forge-design    # 필수 (의존성)
claude plugin install forge-game
```

---

## 사전 요건

| 도구 | 용도 | 설정 |
|------|------|------|
| Unity MCP | game-qa (Unity run_tests 연동) | `~/.claude.json` mcpServers에 unity 등록 |
| `OPENAI_API_KEY` | 에셋 생성 (gpt-image-1, Codex) | `~/.bashrc` export |
| `GEMINI_API_KEY` | Gemini Vision 에셋 분석 | `~/.bashrc` export |
| .NET SDK | game-qa (.NET bot 빌드) | 시스템 패키지 설치 |

> Unity MCP 없이도 `game-asset-generate`·`game-asset-pipeline`·`asset-extract`는 동작합니다.

---

## 게임 개발 파이프라인

```
S1 아이디어 정의
    └─ gdd-writer 에이전트 → GDD 작성
S2 PRD 완성 (forge-plan)
    └─ /forge-spec → Spec 작성
S3 에셋 계획
    └─ /game-asset-pipeline → 에셋 생성 (Characters/Monsters/UI/Backgrounds/Effects)
Unity 프로젝트 통합
    └─ /asset-extract → 기존 스크린샷에서 에셋 추출
QA 단계
    └─ /game-qa → 자동화 QA (Unity MCP + C# 정적분석)
PR 생성
    └─ /forge-pr (forge-dev)
```

---

## 스킬 목록

### asset-extract

게임/앱 UI 스크린샷에서 배경·버튼·컴포넌트를 게임 사용 가능한 투명 PNG로 추출합니다.

**주요 기능**
- **배경 추출**: nanobanana edit_image (AI inpainting) — 오브젝트 제거 후 배경 복원
- **버튼/컴포넌트 추출**: /clip 템플릿 매칭 — 정밀 경계 탐지
- 투명 PNG (알파 채널 포함) 자동 생성
- 배치 처리: 디렉토리 내 스크린샷 전체 처리

**사용법**
```
/asset-extract ./screenshots/main-screen.png
/asset-extract ./screenshots/ --category ui          # 디렉토리 배치
/asset-extract ./ref/competitor-ui.png --type button # 버튼만 추출
```

**산출물**
```
AI_Generated/Extracted/
├── backgrounds/   — 배경 투명 PNG
├── buttons/       — 버튼 컴포넌트
└── ui-elements/   — 기타 UI 요소
```

---

### game-asset-generate

게임 에셋(스프라이트/VFX/배경/3D/UI/아이콘/오디오) 대량 생산 오케스트레이터입니다.

**주요 기능**
- **Library-First**: 기존 에셋 라이브러리 탐색 후 신규 생성 (MCP 비용 절감)
- **12요소 Soul 프롬프트**: 게임 아트 특화 품질 극대화 프롬프트
- **모델 어댑터**: FLUX / Gemini Imagen / Replicate 선택 지원
- **MAS P1**: Codex image_gen 직접 생성 + NanoBanana 병행
- **6-axis 크리틱 루프**: 품질·일관성·게임 적합성 자동 검증

**사용법**
```
/game-asset-generate character "Dark Mage" "검은 로브의 마법사, 지팡이 들고 있음, 측면 뷰"
/game-asset-generate monster   "Ice Golem" "얼음 재질의 골렘, 전신 뷰, 투명 PNG"
/game-asset-generate effect    "Fire Burst" "불꽃 폭발 VFX, 4프레임 애니메이션"
/game-asset-generate ui        "Health Bar" "체력바 UI, 빨간색, 게임 HUD 스타일"
```

> `style-guide.md`를 먼저 작성하면 아트 스타일 일관성이 대폭 향상됩니다.

---

### game-asset-pipeline

GodBlade 게임 에셋 5 카테고리 워크플로우 오케스트레이터. `game-asset-generate`를 경유하여 일관된 생성·검수·저장을 보장합니다.

**카테고리 & 경로**

| 카테고리 | 저장 경로 | 설명 |
|----------|----------|------|
| `Characters` | `AI_Generated/Characters/` | 플레이어, NPC, 영웅 |
| `Monsters` | `AI_Generated/Monsters/` | 몬스터, 보스, 미니보스 |
| `UI` | `AI_Generated/UI/` | HUD, 버튼, 메뉴 |
| `Backgrounds` | `AI_Generated/Backgrounds/` | 맵 배경, 스카이박스 |
| `Effects` | `AI_Generated/Effects/` | VFX, 파티클, 애니메이션 |

**사용법**
```
# 단일 에셋
/game-asset-pipeline Characters "Iron Knight" "강철 갑옷의 기사"

# 배치 생성 (목록 파일)
/game-asset-pipeline --batch ./asset-list.json

# 카테고리 전체 재생성
/game-asset-pipeline Monsters --regen-all
```

**배치 파일 형식** (`asset-list.json`)
```json
[
  { "category": "Characters", "name": "Hero", "desc": "주인공 캐릭터, 금발, 검사" },
  { "category": "Monsters",   "name": "Slime", "desc": "초록 슬라임, 둥근 형태" }
]
```

---

### game-qa

Unity 게임 클라이언트 + 게임 서버 QA 자동화. GodBlade/바둑이/맞고 전용.

**주요 기능**
- **Unity MCP**: `run_tests` 호출 → Unity Test Runner 결과 수집
- **.NET bot 빌드**: 봇 클라이언트 컴파일 및 소켓 스모크 테스트
- **C# 정적분석**: NullRef 위험, 미사용 코드, 아키텍처 위반 감지
- **자동 브랜치**: QA 브랜치 자동 생성 후 작업
- **bug-report 연동**: 발견 버그 → BUG-NNN 포맷 자동 생성
- **healer 라우팅**: 자동 수정 가능 버그 → healer로 즉시 위임
- **cr-* 연동**: 수정 코드 → 적대적 검수 자동 실행
- **develop 자동 머지**: QA PASS 시 develop 브랜치 자동 머지

**실행 흐름** (Phase A~H, forge-dev /qa와 동일 패턴)
```
Phase A: QA 브랜치 생성
Phase B: Unity 빌드 + Test Runner 실행
Phase C: .NET bot 빌드 + 소켓 스모크
Phase D: C# 정적분석
Phase E: 버그 리포트 생성 (BUG-NNN)
Phase F: healer 병렬 수정
Phase G: cr-* 코드 검수
Phase H: develop 머지
```

**사용법**
```
/game-qa                          # 전체 QA 실행
/game-qa --scope=unit             # 단위 테스트만
/game-qa --scope=integration      # 통합 테스트만
/game-qa --no-auto-merge          # 수동 머지 (자동 머지 비활성)
```

---

## 에이전트

### gdd-writer

Game Design Document(GDD) 전문 작성 에이전트. 완전한 GDD를 자동 생성합니다.

**포함 섹션**
- 게임 컨셉 & 장르 정의
- 핵심 메커닉 설계
- 시스템 설계 (전투/레벨/경제/UI)
- 화면 플로우 & UX 다이어그램
- 밸런싱 계획 (수치 설계)
- 수익화 모델

**사용법**
```
# 에이전트 직접 스폰
[Claude Code에서] "gdd-writer 에이전트로 [게임명] GDD 작성해줘"

# forge-plan의 /forge-design 커맨드 내 자동 실행 (game track)
/forge-design game
```

---

## 빠른 시작

```bash
# 1. GDD 작성 (기획 단계)
"gdd-writer 에이전트로 카드 배틀 RPG GDD 작성해줘"

# 2. Spec 작성 (forge-plan 연동)
/forge-spec 카드 배틀 전투 시스템

# 3. 에셋 배치 생성
/game-asset-pipeline Characters "Fire Mage" "불꽃 속성 마법사, 빨간 로브"
/game-asset-pipeline Monsters   "Shadow Wolf" "그림자 늑대, 검정 털, 붉은 눈"

# 4. Unity 통합 후 QA
/game-qa

# 5. 버그 수정 후 PR
/forge-pr
```

---

## 연관 플러그인

| 플러그인 | 연동 방식 |
|----------|----------|
| **forge-core** | cr-* 검수, 세션 관리 |
| **forge-design** | image-orchestrate, asset-extract 의존 |
| **forge-plan** | GDD 기반 /forge-spec → Spec 작성 |
| **forge-dev** | /forge-qa, /forge-pr, /healer 연동 |

---

## Changelog

### v0.1.2
- game-qa: C# 정적분석 Phase 추가
- game-asset-pipeline: 배치 JSON 지원
- asset-extract: /clip 템플릿 매칭 정밀도 향상

### v0.1.1
- game-asset-generate: 6-axis 크리틱 루프 도입
- gdd-writer: 수익화 모델 섹션 추가

### v0.1.0
- 초기 릴리스 (game-qa, game-asset-pipeline, asset-extract)
