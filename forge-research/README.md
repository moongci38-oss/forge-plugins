# forge-research

Forge 리서치·분석 플러그인 — YouTube 영상, 뉴스 기사, 웹 사이트 심층 분석과 주간 리서치 파이프라인, 비즈니스 아이템 검증을 지원합니다.

> **버전**: v0.1.4 | **의존성**: forge-core

---

## 설치

```bash
claude plugin marketplace add moongci38-oss/forge-plugins
claude plugin install forge-core   # 필수 선행 설치
claude plugin install forge-research
```

### 권장 MCP 서버 (선택)

Gemini Vision 분석 및 Tavily 검색을 사용하려면 MCP 서버를 설정하세요.

```bash
# ~/.bashrc 또는 ~/.zshrc
export GEMINI_API_KEY="AIza..."
export TAVILY_API_KEY="tvly-..."
```

---

## 스킬 목록

| 스킬 | 설명 |
|------|------|
| `site-deep-analyze` | 사이트 URL 정밀 분석 → 재구현 가이드 생성 |
| `yt` | YouTube 영상 종단간 분석 |
| `yt-analyze` | ⚠️ DEPRECATED — `/yt` 사용 권장 |

### site-deep-analyze

사이트 URL을 입력하면 7단계 정밀 분석 후 재구현 가이드를 생성합니다. 코드 직접 복제가 아닌 **영감 기반 자체 구현** 가이드만 생성합니다.

**분석 방법**:
- Playwright 크롤링 (DOM 구조, 컴포넌트 패턴)
- CSS 토큰 추출 (색상, 타이포그래피, 간격)
- API 엔드포인트 추론 (네트워크 요청 분석)
- Gemini Vision 시각 분석
- Tavily 시맨틱 추출

**산출물 7종**:
1. `analysis-report.md` — 전체 분석 리포트
2. `screenshots/` — 페이지 스크린샷
3. `style-guide.md` — 디자인 토큰 가이드
4. `components.md` — UI 컴포넌트 패턴
5. `api-schema.md` — API 엔드포인트 추론
6. `network-trace.md` — 네트워크 요청 로그
7. `reconstruction-spec.md` — 재구현 명세서

```
/site-deep-analyze https://linear.app
/site-deep-analyze https://notion.so --depth=deep
```

### yt

YouTube 영상을 종단간 분석합니다. 트랜스크립트·댓글·링크 추출부터 AI 분석, GTC 검증, ACHCE 개선 제안까지 전 과정을 자동화합니다.

**분석 단계**:
1. transcript + 댓글 + description 링크 추출 (yt-analyzer.py)
2. AI 분석 — 핵심 포인트, 비판적 평가, 팩트체크
3. 웹 리서치 — 주장 검증, 추가 맥락
4. GTC(Goal-Task-Check) 검증
5. ACHCE 개선 제안

멀티 영상 병렬 분석을 지원합니다.

```
/yt https://youtube.com/watch?v=dQw4w9WgXcQ

# 여러 영상 동시 분석
/yt https://youtu.be/abc123 https://youtu.be/def456
```

### yt-analyze ⚠️ DEPRECATED

기존에 수집된 JSON 데이터를 재분석할 때만 사용하세요. 신규 분석은 `/yt` 스킬을 사용하세요. `/yt`가 수집+분석 전 파이프라인을 통합 제공합니다.

---

## 커맨드 목록

| 커맨드 | 사용법 | 설명 |
|--------|--------|------|
| `/article` | `/article <URL>` | 웹 기사 URL 심층 분석 |
| `/yt` | `/yt <URL>` | YouTube 영상 심층 분석 |
| `/site-deep-analyze` | `/site-deep-analyze <URL>` | 사이트 정밀 분석 |
| `/weekly-research` | `/weekly-research` | 주간 리서치 파이프라인 |
| `/forge-find-item` | `/forge-find-item` | 비즈니스 아이템 검증 |

### /article

웹 기사 URL을 심층 분석합니다. 본문 추출부터 내부 링크 파고들기, 시스템 비교, 적용 계획서 생성까지 4-Wave Agent Teams로 실행합니다.

- 50페이지 이상 긴 문서 → Gemini Pro 자동 라우팅
- Sonnet 1M 기본, Gemini Pro 폴백

```
/article https://techcrunch.com/2026/06/29/...
/article https://blog.anthropic.com/...
```

### /yt

YouTube 영상 심층 분석 커맨드 (yt 스킬 래핑).

```
/yt https://youtube.com/watch?v=...
```

### /site-deep-analyze

사이트 정밀 분석 커맨드 (site-deep-analyze 스킬 래핑).

```
/site-deep-analyze https://vercel.com
/site-deep-analyze https://figma.com --components-only
```

### /weekly-research

매주 실행하는 주간 리서치 파이프라인입니다. 기술/비즈니스 뉴스를 수집하고 사업 아이템 제안 3종을 생성합니다.

```
/weekly-research
/weekly-research --topic "AI 에이전트 인프라"
```

### /forge-find-item

비즈니스 아이템 후보를 5가지 신호로 검증하여 실패 위험을 최소화합니다.

**검증 프레임워크**:
- Reject 룰 4가지 (즉각 탈락 조건)
- Moat 4종 (지속 가능한 경쟁 우위)
- Mike Hill 5 원칙
- 카테고리별 실패 패턴

산출물은 Obsidian forge-vault에 자동 적재됩니다. 50페이지 이상 시장 리포트는 Gemini Pro가 자동 처리합니다.

```
/forge-find-item
# 대화식으로 아이템 후보 입력 후 검증 진행
```

---

## 에이전트

| 에이전트 | 역할 |
|----------|------|
| `academic-researcher` | 학술 논문·피어리뷰·학술 문헌 분석 전문가 |
| `article-analyst` | 웹 기사 분석 — TL;DR·핵심 포인트·팩트체크 대상 도출 |
| `fact-checker` | 사실 검증·출처 신뢰도·오정보 탐지 |
| `weekly-research-analyst` | 주간 심층 분석 — raw-data.json + Claude 결과 기반 3종 산출물 |
| `yt-cross-analyst` | YouTube 영상 클러스터 비교분석 — 합의점/분기점/종합 인사이트 |
| `yt-research-followup` | YouTube 분석 리포트 "추가 리서치 필요" 항목 실제 조사 (비즈니스 관련성 4+ 영상만) |
| `yt-video-analyst` | YouTube 트랜스크립트 분석 → 구조화 요약 (Agent Teams 병렬 분석용) |

---

## 빠른 시작 예시

```
# 뉴스 기사 분석
/article https://techcrunch.com/2026/06/29/some-article

# YouTube 영상 요약
/yt https://youtube.com/watch?v=abcdef

# 경쟁사 사이트 분석
/site-deep-analyze https://competitor.com

# 주간 리서치 실행
/weekly-research

# 사업 아이템 검증
/forge-find-item
```

---

## 리서치 워크플로우

```
외부 소스
├── YouTube 영상    → /yt          → 01-research/videos/
├── 뉴스/블로그     → /article     → 01-research/articles/
└── 웹 사이트       → /site-deep-analyze → 01-research/sites/
         ↓
/weekly-research    → 주간 종합 리포트 (기술 트렌드 + 비즈니스 아이템)
         ↓
/forge-find-item    → 아이템 검증 (5 신호 프레임워크)
         ↓
/wiki-sync (forge-brain) → 20-wiki/ 지식 베이스 축적
```

---

## 의존 플러그인

| 플러그인 | 필수 여부 | 용도 |
|---------|----------|------|
| forge-core | ✅ 필수 | rag-search, 세션관리 |
| forge-brain | 권장 | 리서치 결과 wiki 동기화 |

---

## Changelog

### v0.1.4 (2026-06-23)
- `yt-analyze` DEPRECATED 표기 (yt 스킬이 전 파이프라인 통합)
- Gemini Pro 자동 라우팅 (50p+ 문서)
- MAS P1: Codex Vision + Gemini Vision 이중 폴백

### v0.1.2 (2026-06-05)
- `yt-analyze` 스킬 제거 예고 (Tier C 개인 워크플로우)
- 주간 리서치 파이프라인 SHA-256 테스트 증명 적용

### v0.1.0 (2026-06-02)
- 최초 패키징: site-deep-analyze, yt, article
- weekly-research, forge-find-item 커맨드
- 리서치 에이전트 7종
