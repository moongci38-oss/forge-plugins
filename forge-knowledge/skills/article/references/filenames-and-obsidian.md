# article — filenames-and-obsidian

> 산출물 파일명 컨벤션(wiki-sync 호환)과 Obsidian 연동 흐름.
> 원문 출처: `SKILL.md` 에서 **그대로 옮김**(이슈 #1014, 2026-09-24 목차화 — 내용 무변경).

## 목차

- 파일명 컨벤션 (wiki-sync 호환 필수) (구 SKILL.md L465-473)
- Obsidian 연동 (구 SKILL.md L477-484)

---

## 파일명 컨벤션 (wiki-sync 호환 필수)

```
{YYYY-MM-DD}-{domain-slug}-{title-slug}-{suffix}.{ext}
```

- `{domain-slug}`: `news.hada.io` → `news-hada-io` (점 → 하이픈)
- `{title-slug}`: 한글 기사는 영문 주제 키워드 추출 + kebab-case, 50자 이내
- `{suffix}`: `article` (원본 JSON) / `analysis` (분석) / `dashboard` (HTML)
  — `comparison`·`apply-plan` 은 2026-09-03 생산 중단(옛 회차 파일은 그대로 남는다)
- 이 규칙은 `/yt`와 동일해야 `/wiki-sync` Step 2 매칭 로직이 작동함

---

## Obsidian 연동

`/article`는 Raw 레이어만 만든다. Wiki 레이어는 사용자가 별도로 `/wiki-sync`를 실행해서 Human 승인 루프로 수동 반영.

```
[/article <URL>]
    → 01-research/articles/YYYY-MM-DD/...-analysis.md (Raw)
    → [/wiki-sync 실행]
    → 20-wiki/topics/{주제}.md (Obsidian vault)
```
