# Tool Usage Rules (요약)

> 원문(근거: · 폐기조건: · 디자인 도구 순위·리포트 발행) → `rules-on-demand/tool-rules-full.md`

- **스킬 호출**: 사용자가 지목했거나(`/x`·스킬명) description 이 지금 작업을 직접 가리킬 때만. "혹시"로는 부르지 않는다.
- Subagent 는 다시 subagent 를 띄우지 않는다(깊이 2). 결과가 필요한 스폰에 `name` 을 붙이지 않는다.
- 기사 URL → `/article` · 프로젝트 자료 질문 → `rag-search` · 새 스킬 → `skill-creator`.
- **세컨드 브레인**: 규칙·지식 문서 위치를 모르면 `echo "<주제·지침>" | bash ~/forge/shared/scripts/brain-route.sh`.
- **찾기 도구 — 담는 것이 서로 다르다(묻지 말고 쓴다 · #2621)**. 색인 유무·뒤처짐은 `/forge-start` 의 `INDEX_LINE`:

  | 알고 싶은 것 | 도구 | 담는 것 | 여기에 묻지 않는다 |
  |---|---|---|---|
  | 코드 바꾸기 전 영향·호출자 / 이름 바꾸기 / 커밋 전 | GitNexus `impact`·`context` / `rename` / `detect_changes` — 점 폴더(`.claude/**`)는 색인 밖이라 `index-coverage.sh` 가 경고하면 grep 으로 확인 · 판정 코멘트의 `영향 범위:` 1줄은 **손으로 쓰지 않는다**: `bash ~/forge/shared/scripts/impact-line.sh <PR 번호>` 출력을 그대로 붙인다 | 코드 심볼·호출 그래프 | bash·점 폴더(색인 밖 → grep 호출처 전수) |
  | 처음 보는 레포·구조·"어디 있나" | `graphify query "<질문>"`(없으면 `graphify update .`) | 레포 지도 — 파일·폴더·파일 안 구조(bash·설정 포함 · 문서 제외) | 호출처 전수(스크립트끼리 부르는 줄은 거의 못 잡는다 → grep) · 문서 내용 |
  | 프로젝트 자료·과거 결정·리서치 | `rag-search` | 산출물 저장소 문서(위키 포함 · 의미 검색) | 코드 · 레포 안 문서(→ `brain-route.sh`·Grep) |
  | 정리된 지식을 **남길** 때 | `/wiki-sync` | 위키 = 사람이 승인한 정리본(색인이 아니라 원본 — 찾을 때는 `rag-search`) | — |
  | 색인이 없을 때만 | Grep — "색인 없음" 사실을 1줄 적는다 | — | — |

  **고치기 전 조회를 훅이 본다**(#2659): 코드 파일을 고칠 때 이 세션에 조회 흔적(위 도구 · 색인 밖이면 그 파일 이름 grep)이 없으면 `impact-before-edit` 훅이 막는다 — 조회한 뒤 다시 하면 통과.

- Notion 인증 실패 → 로컬 저장 후 "Notion 미업로드" 1줄.
- 이미지 = GPT Image(Codex `image_gen`) → Claude Design · Stitch·Figma 사용 중단.
- 리포트 사이트에 올렸으면 산출물을 커밋까지 한다(`git add -A` 금지).

## 가드·GitHub 막힘 피하기
- 가드가 잡는 문자열(훅 경로 등)이 든 본문은 heredoc·명령치환에 넣지 말고 **임시 파일에 쓴 뒤 `--body-file`**·스크립트 파일 실행으로 넘긴다.
- `rm` 은 **단독 호출**로 — 다른 명령과 `&&`·`;` 로 섞지 않는다.
- GraphQL 한도(`API rate limit`·`RESOURCE_LIMITS_EXCEEDED`)면 **재시도하지 말고** `gh api repos/<o>/<r>/...` REST 로 바꾼다.
- REST 까지 끊기면 기다리지 않는다 — 코멘트·라벨·닫기·PR 생성은 `bash ~/forge/shared/scripts/gh-q.sh api …`(큐) · push 는 로컬 커밋까지 해 두고 회복 뒤 · 머지는 회복 뒤 head sha 재확인 후.
- diff 가 `pr-size-gate.sh` 한도 근처면 PR 을 올리기 **전에** 나눈다.
