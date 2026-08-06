# 데이터 수집 소스 상세 (6-Tier)

> SKILL.md에서 이관됨 — Wave 1 Teammate A~D가 각 Tier를 수집할 때 참조.

### Tier 1: AI 기업 공식 소스 (최고 신뢰도)

| 소스 | URL | 수집 대상 |
|------|-----|----------|
| Anthropic News | `anthropic.com/news` | 모델 발표, 제품 업데이트, 정책 |
| Anthropic Engineering | `anthropic.com/engineering` | 기술 심화 포스트 |
| Anthropic Research | `anthropic.com/research` | 연구 논문, 안전성 |
| Claude API Changelog | `docs.anthropic.com/en/docs/changelog` | API/SDK 변경사항 |
| Claude Code Releases | GitHub `anthropics/claude-code` | CLI 버전, 신기능 |
| MCP Spec/SDK | GitHub `modelcontextprotocol/*` | 프로토콜 변경, SDK 업데이트 |
| OpenAI Blog | `openai.com/blog` | GPT 업데이트, API 변경 |
| OpenAI API Changelog | `platform.openai.com/docs/changelog` | API 변경사항 |
| Google DeepMind Blog | `deepmind.google/blog` | Gemini, 연구 발표 |
| Google AI Blog | `blog.google/technology/ai` | 제품 AI 통합 |
| Meta AI (FAIR) | `ai.meta.com/blog` | Llama, 오픈소스 모델 |
| Microsoft AI Blog | `blogs.microsoft.com/ai` | Copilot, Azure AI |
| Hugging Face Blog | `huggingface.co/blog` | 오픈소스 모델, 트렌드 |

### Tier 2: GitHub 생태계

| 소스 | 수집 대상 |
|------|----------|
| GitHub Trending (daily, AI/ML) | 신규 인기 레포, 스타 급상승 |
| Claude Code Issues/Discussions | 커뮤니티 요청, 버그 리포트 |
| MCP Servers Registry | 신규 MCP 서버, 인기 서버 |
| LangChain/LangGraph Releases | 버전, 신기능 |
| CrewAI Releases | 멀티에이전트 프레임워크 |
| Vercel AI SDK Releases | 프론트엔드 AI 통합 |
| AutoGen/Semantic Kernel | Microsoft 에이전트 프레임워크 |
| VILA-Lab/Dive-into-Claude-Code | Claude Code 운영 프레임워크·test-time compute 연구 추적 |

### Tier 3: 개발자 커뮤니티

| 소스 | 수집 대상 |
|------|----------|
| Hacker News (front page AI) | AI 관련 탑 스토리 + 댓글 인사이트 |
| Reddit r/MachineLearning | 연구 논의, SOTA 결과 |
| Reddit r/LocalLLaMA | 로컬 모델, 양자화, 벤치마크 |
| Reddit r/ClaudeAI | Claude 사용자 경험, 팁, 이슈 |
| Reddit r/artificial | 범용 AI 뉴스 |
| Dev.to / Medium (AI 태그) | 실전 튜토리얼, 사례 |
| Twitter/X AI 커뮤니티 | 실시간 반응, 빠른 뉴스 전파 |
| Discord (Claude, MCP) | 커뮤니티 피드백, 미공개 팁 |

### Tier 4: YouTube 영상 콘텐츠

| 채널/검색 | 수집 대상 |
|----------|----------|
| Fireship | 주요 AI 뉴스 빠른 요약 |
| Two Minute Papers | 논문 시각적 해설 |
| AI Jason | AI 에이전트, 프레임워크 심화 |
| Matt Wolfe | AI 도구 리뷰, 트렌드 |
| Yannic Kilcher | 논문 심층 해설 |
| The AI Advantage | AI 실무 활용 |
| YouTube 검색: "Claude Code" | 최신 Claude Code 튜토리얼/리뷰 |
| YouTube 검색: "MCP server" | MCP 관련 신규 콘텐츠 |
| YouTube 검색: "AI agents 2026" | 에이전트 트렌드 |

### Tier 5: 학술/연구

| 소스 | 수집 대상 |
|------|----------|
| arXiv cs.AI | AI 일반 신규 논문 |
| arXiv cs.CL | 자연어처리, LLM 논문 |
| arXiv cs.SE | 소프트웨어 엔지니어링 + AI |
| arXiv cs.MA | 멀티에이전트 시스템 |
| Papers With Code (trending) | SOTA 벤치마크, 코드 포함 논문 |
| Semantic Scholar (trending) | 인용 급증 논문, 영향력 |

### Tier 6: 산업/미디어

| 소스 | 수집 대상 |
|------|----------|
| TechCrunch AI | 펀딩, 인수, 제품 출시 |
| VentureBeat AI | 엔터프라이즈 AI 동향 |
| The Verge AI | 소비자 AI 제품 |
| Product Hunt (AI 카테고리) | 신규 AI 제품/도구 |
| AI 전문 뉴스레터 | The Batch, TLDR AI, Import AI |
| a16z AI Blog | VC 관점 AI 트렌드 |
| 주식 워치리스트 (`stock-watchlist.json`) | 종목별 뉴스·공시·시황 — **daily 모드 = 경량(1~2줄, 최근 24~48h 헤드라인만)**. stock-research-analyst가 Collect 단계에서 병렬 스폰. 워치리스트 없으면 fail-open skip. |
