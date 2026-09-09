# Tool Usage Rules

> 상세·근거·표는 `rules-on-demand/tool-rules-aux.md` 로 내렸다(2026-08-27 L1 슬림화 — 삭제 아님, 이동).

## 스킬 발동 기준 (CRITICAL — 2026-08-11 현실화, 구 "1% 임계값" 대체)

**둘 중 하나면 반드시 호출한다:**
1. **사용자가 지목** — 스킬명·슬래시(`/x`)로 부르거나 그 스킬의 산출물을 요구했다.
2. **description 의 트리거 문구가 지금 작업을 직접 지칭** — "언제 쓰라"에 적힌 상황과 현재 작업이 같다(비슷한 게 아니라 같다).

**그 밖의 "혹시 될 수도"는 호출하지 않는다.** 호출하지 않은 것을 보고에 적을 필요도 없다.

**합리화 금지 패턴** — 위 1·2 에 해당하는데 아래 이유로 건너뛰는 것은 여전히 금지다:
- "이 질문은 너무 단순하다" · "기억에 이미 있다" · "스킬이 과도하다" · "이번만 예외"

스킬을 호출했는데 맞지 않으면 그냥 진행한다.

근거: 구 "1% 임계값"은 실측상 사문화 상태였다(2026-08-11: 세션당 0.05회, 100개 중 28개만 호출).
폐기조건: 미호출로 인한 재작업이 분기 3건 이상이면 조건 2를 넓힌다.
구 규칙 전문·실측치·판단 근거 → `rules-on-demand/behavior-core-aux.md §스킬 1% 임계값 부록`

**Subagent 예외**: 오케스트레이터가 파견한 subagent는 주어진 태스크를 직접 실행한다. 스킬 발동 임계값 재귀 체크는 오케스트레이터(메인 세션) 책임 — subagent 내부에서 재귀 스킬 호출 금지.

**Subagent 재중첩(agent-of-agent)**: subagent 가 다시 Agent 툴로 subagent 를 띄우지 않는다 — **깊이 2**(메인 → subagent)가 기본이다. 더 필요하면 메인이 직접 분해해서 띄운다. ⚠️ 바로 위 "재귀 **스킬** 호출 금지"와 **다른 축**이다(그건 스킬, 이건 에이전트). ⛔ 버스로 뜬 팀장의 일회성 워커는 버스(`session-bus send`)를 쓰지 않고 자기 팀장에게만 보고한다.
왜·상세·폐기조건 → `rules-on-demand/tool-rules-aux.md §Subagent 재중첩 — 상세`

⚠️ **`name` 지정 스폰 = 결과 무반환 (2026-08-13 실증)**: 최종 보고서가 필요한 스폰에는 `name` 을 붙이지 않는다 — 이름을 붙이면 in-process 팀원이 되어 결과를 반환하지 않고 idle 로 대기한다(실패가 조용하다).
상세·재현 → `rules-on-demand/tool-rules-aux.md §name 지정 스폰 = 결과 무반환`

## 기사 URL → article 스킬
- 사용자가 뉴스/블로그 기사 URL 전송 시 → `/article` 스킬로 분석
- 직접 WebFetch 분석 금지

## Notion 인증 실패
- `/yt`, `/daily-system-review`, `/weekly-research` 등 Notion 업로드 스킬에서 인증 실패 시
  → 묻지 말고 즉시 Tier 2(index.json 로컬 저장)로 자동 전환
  → 최종 보고에 "Notion 미업로드" 한 줄만 명시

## RAG 검색
- 프로젝트 자료·근거 질문에는 사용자 허락 없이 `rag-search` 자율 호출

## 스킬 생성
- 새 스킬 생성 시 반드시 `skill-creator` 스킬 사용. 직접 SKILL.md 작성 금지.

## 아티팩트 발행 — MD 원본 먼저 (2026-08-19 Human 지시)
- 문서·계획서·리포트를 Artifact 로 발행할 때는 **레포 안 MD 원본이 먼저**고 아티팩트는 그 사본이다. 내용이 바뀌면 MD 를 먼저 고치고 재발행한다.
- ⚠️ 아티팩트는 **계정에 묶인다** — 계정이 바뀌면 기존 URL 을 갱신·공유할 수 없다. MD 원본이 그때의 유일한 복구 수단이다.
- 착지 경로·근거·폐기조건 → `rules-on-demand/tool-rules-aux.md §아티팩트 발행 — MD 원본 먼저`

## 리포트 발행 = 커밋까지가 완료 (Human 지시 2026-09-06)

**`forge-reports.pages.dev` 에 올렸으면 그 산출물을 반드시 커밋한다.** 사이트는 접근 인증이 걸려 있고 정본은 `forge-outputs` 레포다 — 커밋을 안 하면 **팀원이 `git pull` 로 받을 방법이 없다**(벽보만 붙이고 원본은 서랍에 안 넣은 셈).

- 범위 = 사이트가 읽는 레인만(`01-research/{daily,weekly,videos/analyses,articles}`). ⛔ `git add -A` 금지 — 공유 트리라 **남의 미커밋까지 커밋**한다.
- `report-site-publish.sh` 가 발행 직후 자동 커밋한다(끄기 `FORGE_PUBLISH_COMMIT=off`). **수동 발행이면 사람이 같은 범위를 커밋한다.**
- ⚠️ 원격이 앞서면 커밋만 되고 푸시는 생략된다 — **커밋 = 팀 공유 아님.** 로그 사유를 보고 sync 한다.

근거: 2026-09-06 실측 — 사이트 엔트리 1,772건인데 리포트 레인 미커밋 **41건**(전날 발행분 포함)이 쌓여 팀 공유가 끊겨 있었다.
재현: `git -C ${FORGE_ROOT:-$HOME/forge}-outputs status --porcelain -- 01-research/daily 01-research/videos/analyses`
폐기조건: 발행이 레포를 거치지 않는 구조로 바뀌면 삭제한다.

## /code-review ultra (구명 /ultrareview)
- 자동화 파이프라인(Forge Check, hook 등)에 배선 금지 · 고위험 PR에서만 수동 호출(사용자 트리거·과금).
- 재표적 근거·폐기조건 → `rules-on-demand/tool-rules-aux.md §/code-review ultra — 재표적 근거`

## UI/UX 작업
- **순위(임의로 바꾸지 않는다)**: ①**Claude Design**(claude.ai/design, `/forge-claude-design`) = 모든 UI/UX 작업의 시작점 → ②**Stitch**(`/forge-stitch`) = Human 명시 호출 전용 보조 → ⛔ **Figma 사용 중단**(새로 제안하지 않는다).
- ⚠️ **MCP 목록만 보고 디자인 도구를 판단하지 마라** — 1순위 Claude Design 은 MCP 가 아니라 `$HOME/.claude.json` 에 안 나온다(2026-08-14 실사고).
- ⚠️ **`claude.ai/design`(웹)과 `frontend-design`(CLI 스킬)은 다른 것이다 (P2-3, 2026-09-06)**: 위 순위표의 ①은 **웹 제품**(브라우저에서 시안·디자인시스템을 만들고 `/forge-claude-design` 으로 왕복)이고, `frontend-design` 은 **이 CLI 안에서 프런트 코드를 직접 짜는 스킬**이다. **역할이 다르니 서로 대체하지 않는다** — 시안·토큰을 정하는 자리가 ①이고, 그 결정을 코드로 옮기는 자리가 `frontend-design` 이다. 순위표는 **전자만** 규정한다(후자는 순위 밖 구현 도구라 ①을 건너뛰는 근거가 되지 않는다).
  ⚠️ **네이티브 `/design` 슬래시 커맨드는 없다**(2026-09-06 실측, CLI 2.1.261). 번들의 `"design"` 은 플러그인 **카테고리** 이름이고 `/design` 문자열은 `claude.ai/design` 같은 URL 조각이다 — 이름만 보고 있다고 단정하지 마라.
  재현: `grep -aoE '"design"' "$(readlink -f "$(command -v claude)")" | wc -l` → 카테고리 목록 안에서만 나온다 · `ls ${FORGE_ROOT:-$HOME/forge}/.claude/commands/ | grep -x 'design.md'` → 0
  근거: 순위표가 ①을 "모든 UI/UX 작업의 시작점"으로 못박는데, 이름이 비슷한 구현 스킬을 그것과 같은 것으로 읽으면 시작점을 건너뛴다. 폐기조건: 네이티브 `/design` 이 실제로 생기면 이 각주를 그 역할 설명으로 교체한다.
- 표·근거·레퍼런스 소스 → `rules-on-demand/tool-rules-aux.md §디자인 도구 순위 — 표·근거`

## 스크립트 경로
- Python/Bash 스크립트에서 CWD 상대경로 절대 금지
- 항상 절대경로 사용

> DesignSync 범위 주의·절대경로 근거 → `rules-on-demand/behavior-core-aux.md`
