# Tool Usage Rules (요약)

> 원문(근거: · 폐기조건: · 디자인 도구 순위·리포트 발행) → `rules-on-demand/tool-rules-full.md`

- **스킬 호출**: 사용자가 지목했거나(`/x`·스킬명) description 이 지금 작업을 직접 가리킬 때만. "혹시"로는 부르지 않는다.
- Subagent 는 다시 subagent 를 띄우지 않는다(깊이 2). 결과가 필요한 스폰에 `name` 을 붙이지 않는다.
- 기사 URL → `/article` · 프로젝트 자료 질문 → `rag-search` · 새 스킬 → `skill-creator`.
- **세컨드 브레인**: 규칙·지식 문서 위치를 모르면 `echo "<주제·지침>" | bash ${FORGE_ROOT:-$HOME/forge}/shared/scripts/brain-route.sh`.
- **찾기 도구**: 영향·호출자 = GitNexus(`impact`·`detect_changes` — 점 폴더는 `index-coverage.sh` 가 경고하면 grep) · 레포 지도 = `graphify query` · 자료 = `rag-search` — 표 → `tool-rules-full.md §찾기 도구`. **고치기 전 조회를 훅이 본다** — 조회 없이 고치면 `impact-before-edit` 가 막는다(#2659).

- Notion 인증 실패 → 로컬 저장 후 "Notion 미업로드" 1줄.
- 이미지 = GPT Image(Codex `image_gen`) → Claude Design · Stitch·Figma 사용 중단.
- 리포트 사이트에 올렸으면 산출물을 커밋까지 한다(`git add -A` 금지).

## 가드·GitHub 막힘 피하기
- 가드가 잡는 문자열(훅 경로 등)이 든 본문은 heredoc·명령치환에 넣지 말고 **임시 파일에 쓴 뒤 `--body-file`**·스크립트 파일 실행으로 넘긴다.
- `rm` 은 **단독 호출**로 — 다른 명령과 `&&`·`;` 로 섞지 않는다.
- GraphQL 한도(`API rate limit`·`RESOURCE_LIMITS_EXCEEDED`)면 **재시도하지 말고** `gh api repos/<o>/<r>/...` REST 로 바꾼다.
- REST 까지 끊기면 기다리지 않는다 — 코멘트·라벨·닫기·PR 생성은 `bash ${FORGE_ROOT:-$HOME/forge}/shared/scripts/gh-q.sh api …`(큐) · push 는 로컬 커밋까지 해 두고 회복 뒤 · 머지는 회복 뒤 head sha 재확인 후.
- diff 가 `pr-size-gate.sh` 한도 근처면 PR 을 올리기 **전에** 나눈다.
