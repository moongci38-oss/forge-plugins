# Tool Usage Rules (요약)

> 원문(디자인 도구 순위·리포트 발행·근거) → `rules-on-demand/tool-rules-full.md`

- **스킬 호출**: 사용자가 지목했거나(`/x`·스킬명) description 이 지금 작업을 직접 가리킬 때만. "혹시"로는 부르지 않는다.
- Subagent 는 다시 subagent 를 띄우지 않는다(깊이 2). 결과가 필요한 스폰에 `name` 을 붙이지 않는다.
- 기사 URL → `/article` · 프로젝트 자료 질문 → `rag-search` · 새 스킬 → `skill-creator`.
- **세컨드 브레인**: 규칙·지식 문서가 어디 있는지·어느 주제인지 모르면 `echo "<주제·지침>" | bash ~/forge/shared/scripts/brain-route.sh` (12주제 목록 `~/forge/.claude/brain/`).
- **레포 지도**: 처음 보는 레포·전체 구조·서브시스템 파악 → 그 레포의 `graphify-out/` 을 먼저 보고, 없으면 `graphify update .`(코드는 로컬 파싱, 비용 0) · 문서까지 묶으려면 `/graphify` · 변경 영향 범위는 GitNexus.
- Notion 인증 실패 → 로컬 저장(Tier 2) 후 "Notion 미업로드" 1줄.
- 이미지 = GPT Image(Codex `image_gen`) → Claude Design · Stitch·Figma 사용 중단.
- 리포트 사이트에 올렸으면 산출물을 커밋까지 한다(`git add -A` 금지).
- 스크립트 경로는 절대경로.
