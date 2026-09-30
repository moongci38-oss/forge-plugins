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

## 가드·GitHub 막힘 피하기 (#1613 — 2026-09-29 실측: 훅 경로 heredoc 차단 · rm 복합 명령 거부 · GraphQL 한도로 board-sync 교착 #1549)
- 가드가 잡는 문자열(훅 경로 등)이 든 본문은 heredoc·명령치환에 넣지 말고 **임시 파일에 쓴 뒤 `--body-file`**(gh)·스크립트 파일 실행으로 넘긴다.
- `rm` 은 **단독 호출**로 — 다른 명령과 `&&`·`;` 로 섞으면 권한 프리픽스 매칭이 깨져 거부된다.
- GraphQL 한도(`API rate limit`·`RESOURCE_LIMITS_EXCEEDED`)면 **재시도하지 말고** `gh api repos/<o>/<r>/...` REST 로 바꾼다.
- REST 까지 끊기면(`dial tcp …:443 i/o timeout`) 그 자리에서 기다리지 않는다 — 코멘트·라벨·닫기·보드·PR 생성은 `bash ~/forge/shared/scripts/gh-q.sh api …`(큐 · 끊김이면 데몬이 보관했다가 다시 보낸다) · push 는 로컬 커밋까지 해 두고 다음 일을 계속한 뒤 회복되면 push · 머지는 회복 뒤 head sha 재확인 후(#1673).
- 공유 체크아웃이 막히면 stash·rebase 대신 임시 워크트리 — `dev-workflow-rules.md §Git` 그대로.
- diff 가 `pr-size-gate.sh` 한도 근처면 PR 을 올리기 **전에** 나눈다(떨어진 뒤 쪼개지 않는다).
