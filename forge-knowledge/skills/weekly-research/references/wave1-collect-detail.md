# weekly-research — Wave 1 수집 상세 (SKILL.md 에서 옮긴 참조 본문)

> `weekly-research/SKILL.md` 의 Wave 1~1.5 에서 **포인터가 가리킬 때만** 해당 절을 Read 한다.
> (2026-09-24 #1014 분리 — SKILL.md 500줄 규정. 문장은 한 글자도 바꾸지 않고 옮겼다.
>  ⛔/⚠️/금지 문구와 Wave 실행 순서의 뼈대는 SKILL.md 에 그대로 남아 있다 — cron 무인 실행 보존.)

## 목차

- §Subagent A — 스폰 프롬프트 항목
- §Subagent B — 스폰 프롬프트 항목
- §Wave 1.2 도입 경위 (HG-3)
- §Wave 1.2 raw-data.json 스키마
- §Wave 1.5 판정 기준 표 (completeness critic)
- §Wave 1.5 재검색 절차 · [신뢰도 낮음] 플래그 · critic 1줄 출력

## Subagent A — 스폰 프롬프트 항목

<!-- 원본: SKILL.md L171-183 (2026-09-24 이동) -->

프롬프트에 아래를 포함하여 스폰:
- 분석 기준 날짜: `$ARGUMENTS`
- WebSearch: 최근 7일 AI/게임/웹 개발 뉴스
- **Brave Search 활용**: 공식 소스 우선 검색 시 `brave_web_search` 사용 (도메인 필터 예: `site:anthropic.com`, `site:openai.com`)
- **필수 확인 소스** (WebFetch 직접 접속):
  - `https://www.anthropic.com/news` — Anthropic 공식 뉴스/블로그
  - `https://docs.anthropic.com/en/docs/changelog` — Claude API 변경 로그
  - `https://www.anthropic.com/engineering` — 엔지니어링 블로그
  - `https://semianalysis.com` — AI 하드웨어 인프라 심층 분석 (GPU/TPU/데이터센터, 유료 게이트 시 요약만)
  - `https://epochai.org/blog` — AI 역량 추세 + 컴퓨팅 인프라 연구 (오픈 리서치)
- 3개 카테고리별 뉴스 + 신뢰도 표기 + 출처 + 액션 아이템
- 파일 직접 저장: `01-research/weekly/{date}/tech-trends.md`
- 저장 완료 후 종료

## Subagent B — 스폰 프롬프트 항목

<!-- 원본: SKILL.md L187-193 (2026-09-24 이동) -->

프롬프트에 아래를 포함하여 스폰:
- 분석 기준 날짜: `$ARGUMENTS`
- WebSearch: SaaS/스타트업, 인디해커/1인기업, Product Hunt
- **Brave Search 활용**: `brave_web_search`로 SaaS/스타트업 동향 검색. 예: `site:indiehackers.com`, `site:producthunt.com`, `site:techcrunch.com SaaS 2026`
- 시장 동향 + 과금 모델 변화 + 성공 사례 + 액션 아이템
- 파일 직접 저장: `01-research/weekly/{date}/biz-trends.md`
- 저장 완료 후 종료

## Wave 1.2 도입 경위 (HG-3)

<!-- 원본: SKILL.md L223-226 (2026-09-24 이동) -->

> **HG-3(2026-07-23 cr-triple corpus review)**: weekly `raw-data.json`이 22개 폴더 중 21개에서
> 부재해 `/weekly-analyze` 재분석 진입점이 사실상 작동 불능이었다. Wave 0가 raw-data.json 존재를
> 전제로 재분석 분기를 타는데, Wave 1이 그 파일을 실제로 만든 적이 없었던 게 원인이다.
> 재현: `find ${FORGE_OUTPUTS:-$HOME/forge-outputs}/01-research/weekly -mindepth 2 -iname raw-data.json | wc -l`

## Wave 1.2 raw-data.json 스키마

<!-- 원본: SKILL.md L234-247 (2026-09-24 이동) -->

```json
{
  "schema_version": "1.0",
  "pipeline": "weekly-research",
  "source": "wave1-agent-collected",
  "target_date": "{date}",
  "collected_at": "{ISO8601 UTC}",
  "stats": { "tech_items": 0, "biz_items": 0, "s1_sources": 0, "stock_items": 0, "total": 0 },
  "items": [
    { "category": "tech|biz|s1|stock", "title": "...", "url": "...", "published": "YYYY-MM-DD|unknown", "confidence": "High|Medium|Low" }
  ],
  "claude_search_needed": []
}
```

## Wave 1.5 판정 기준 표 (completeness critic)

<!-- 원본: SKILL.md L290-296 (2026-09-24 이동) -->

| 체크 | 조건 | 재검색 트리거 |
|------|------|-------------|
| 신뢰도 카운트 | High+Medium 소스 < 2건 | 해당 토픽 재검색 |
| 소스 모달리티 | 논문·연구보고서 0건 | arxiv·연구소 사이트 타겟 재검색 |
| 소스 모달리티 | 오픈소스 레포/GitHub 링크 0건 | GitHub·패키지 사이트 타겟 재검색 |
| 소스 모달리티 | 뉴스·블로그 기사 0건 | 뉴스 미디어 타겟 재검색 |
| **마켓 표면**(2026-08-19 신설 — **`biz-trends.md`·사업 아이템 산출물에만 적용**) | 마켓 리스팅(가격·리뷰수·설치수) 직접 실측 **0건** | 마켓 표면 체크리스트 3개+ 타겟 재검색 |

## Wave 1.5 재검색 절차 · [신뢰도 낮음] 플래그 · critic 1줄 출력

<!-- 원본: SKILL.md L302-321 (2026-09-24 이동) -->

```
Round 1:
  - 신뢰도 < 2 → 해당 토픽 전체 재검색
  - 모달리티 미달 → 미달 모달리티 타겟 재검색 (예: "논문 0건이면 arxiv만 재검색")
  → 파일 추가 업데이트 후 Round 2 판정

Round 2:
  - 동일 기준 재확인
  - 미달 잔존 시 → [신뢰도 낮음] 플래그 추가 후 Wave 2 진행 (차단 X)
```

**[신뢰도 낮음] 플래그** (2라운드 후에도 모달리티 미달인 섹션에 삽입):
```markdown
> [신뢰도 낮음] 논문/repo/news 중 일부 모달리티 미수집 — 정보의 다양성이 제한될 수 있습니다.
```

**completeness critic 1줄 출력** (Wave 2 취합 보고에 포함):
```
커버리지 결과: tech-trends [논문:O/repo:X/news:O → round1재검색] biz-trends [논문:O/repo:O/news:O → OK]
```
