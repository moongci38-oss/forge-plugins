# article — extraction-and-research

> 기사 추출·리서치 단계별 상세(JSON 스키마·검색 전략·재검색 흐름·심층 분석 방법). SKILL.md 각 Step 의 포인터가 가리키는 절만 읽는다.
> 원문 출처: `SKILL.md` 에서 **그대로 옮김**(이슈 #1014, 2026-09-24 목차화 — 내용 무변경).

## 목차

- Step 1 — 원본 JSON 필드 스키마 (구 SKILL.md L129-136)
- Step 2.8 — 검색 전략·결과 표 형식 (구 SKILL.md L195-198)
- Step 2.82 — completeness critic 재검색 흐름 (구 SKILL.md L214-219)
- Step 2.87 — 유형별 심층 분석 방법 (구 SKILL.md L271-273)
- Step 2.88 — 쉬운 설명 (구 SKILL.md L281-282)
- Step 2.88 — 근거·폐기조건 (구 SKILL.md L304-306)

---

## Step 1 — 원본 JSON 필드 스키마

   ```json
   {
     "url": "...", "title": "...", "author": "...", "published": "...",
     "fetched_at": "...", "domain": "...", "body": "...",
     "internal_links": [{"url": "...", "text": "...", "context": "..."}],
     "meta": {"description": "...", "og_image": "...", "tags": []}
   }
   ```

---

## Step 2.8 — 검색 전략·결과 표 형식

- `site:github.com`, `site:arxiv.org`, 최신 1-2년 필터
- 반대 의견/대안 관점도 검색

결과: `| 주제 | 출처 | 핵심 인사이트 | 기사와의 관계(일치/보완/반박) |` 테이블.

---

## Step 2.82 — completeness critic 재검색 흐름

```
completeness critic 1줄: "어떤 주장이 독립 2소스 미달인가" 명시
→ 재검색 round 1 실행
→ 여전히 미달이면 round 2 (cap)
→ round 2 후에도 미달 잔존: [신뢰도 낮음] 플래그 + Step 2.83 진행 (차단 X)
```

---

## Step 2.87 — 유형별 심층 분석 방법

1. **오픈소스**: WebFetch로 GitHub README + 핵심 코드 구조 + 의존성
2. **논문**: WebFetch로 Method/Results + arXiv PDF 다운로드 시도 → `01-research/articles/{date}/papers/`
3. **공식 문서 변경**: breaking change 상세 확인

---

## Step 2.88 — 쉬운 설명

쉽게 말하면 **"이건 나중에 알아보자"를 리포트에 적어 넘기지 않는다** — 검색 도구를 이미 손에
쥐고 있는 지금이 가장 싸게 알아볼 수 있는 순간이고, 넘긴 숙제는 대체로 아무도 안 한다.

---

## Step 2.88 — 근거·폐기조건

근거: Human 지시(2026-08-27) — *"분석 시 추가로 분석해야 할 항목 같은 건 검색 시 바로 추가로
확인하도록 해."*
폐기조건: 이월 항목이 2분기 연속 0건이면 이 절을 조건부로 되돌린다.
