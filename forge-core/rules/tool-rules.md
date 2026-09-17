# Tool Usage Rules

> 상세·근거·감량 전 원문 → `rules-on-demand/tool-rules-aux.md`(§tool-rules — L1 감량 전 원문)

## 스킬 발동 기준 (CRITICAL)

**둘 중 하나면 반드시 호출한다**: ①**사용자가 지목**(스킬명·`/x`·산출물 요구) ②**description 트리거가 지금 작업을 직접 지칭**(비슷한 게 아니라 같다).

**그 밖의 "혹시 될 수도"는 호출하지 않는다.** 호출했는데 맞지 않으면 그냥 진행한다.

**합리화 금지** — ①②에 해당하는데 "단순하다"·"이미 안다"·"과도하다"·"이번만"으로 건너뛰기 금지.

근거·구 규칙 전문 → `rules-on-demand/behavior-core-aux.md §스킬 1% 임계값 부록`

**Subagent 예외**: 파견된 subagent 는 주어진 태스크만 실행한다 — 재귀 체크는 오케스트레이터 책임, **내부 재귀 스킬 호출 금지**.

**Subagent 재중첩(agent-of-agent)**: subagent 가 다시 Agent 툴로 subagent 를 띄우지 않는다 — **깊이 2**(메인 → subagent)가 기본이다. ⚠️ 위 "재귀 **스킬** 호출 금지"와 **다른 축**. ⛔ 버스로 뜬 팀장의 일회성 워커는 버스 없이 자기 팀장에게만 보고한다 → `rules-on-demand/tool-rules-aux.md §Subagent 재중첩`

⚠️ **`name` 지정 스폰 = 결과 무반환**: 최종 보고서가 필요한 스폰에 `name` 을 붙이지 않는다 — 붙이면 in-process 팀원이 되어 결과 없이 idle 대기한다 → `rules-on-demand/tool-rules-aux.md`(§`name` 지정 스폰 절)

## 기사 URL → article 스킬
- 뉴스/블로그 기사 URL → `/article` 스킬(직접 WebFetch 분석 금지).

## Notion 인증 실패
- Notion 업로드 스킬(`/yt`·`/daily-system-review`·`/weekly-research` 등)이 인증 실패하면 즉시 **Tier 2(index.json 로컬 저장)**, 보고에 "Notion 미업로드" 한 줄만.

## RAG 검색
- 프로젝트 자료·근거 질문은 허락 없이 `rag-search` 호출.

## 스킬 생성
- 새 스킬 생성 시 반드시 `skill-creator` 사용 — SKILL.md 직접 작성 금지.

## 아티팩트 발행 — MD 원본 먼저
- Artifact 발행 시 **레포 안 MD 원본이 먼저**고 아티팩트는 사본이다(바뀌면 MD 를 먼저 고치고 재발행).
- ⚠️ 아티팩트는 **계정에 묶인다** — 계정이 바뀌면 URL 갱신·공유 불가, MD 원본이 유일한 복구 수단 → `rules-on-demand/tool-rules-aux.md §아티팩트 발행`

## 리포트 발행 = 커밋까지가 완료

**`forge-reports.pages.dev` 에 올렸으면 그 산출물을 반드시 커밋한다.** 정본은 `forge-outputs` 레포 — 커밋 없으면 팀원이 받을 방법이 없다.

- 범위 = 사이트가 읽는 레인만(`01-research/{daily,weekly,videos/analyses,articles}`). ⛔ `git add -A` 금지 — **남의 미커밋까지 커밋**한다.
- `report-site-publish.sh` 가 발행 직후 자동 커밋(끄기 `FORGE_PUBLISH_COMMIT=off`) · **수동 발행은 사람이 커밋.**
- ⚠️ 원격이 앞서면 커밋만 되고 푸시는 생략된다 — **커밋 = 팀 공유 아님.**
- 근거·재현 → `rules-on-demand/tool-rules-aux.md §리포트 발행 = 커밋까지` · 폐기조건: 발행이 레포를 안 거치면 삭제.

## /code-review ultra
- 자동화 파이프라인(Forge Check·hook) 배선 금지 · 고위험 PR 수동 호출만(과금) → `rules-on-demand/tool-rules-aux.md §/code-review ultra`

## UI/UX 작업
- **순위(작업 종류별 — 2026-09-15 사람 확정, 임의 변경 금지)**:
  - **이미지 작업 전부**(생성·편집·배너·일러스트·에셋) = ①**GPT Image 2.5**(Codex 내장 `image_gen`, **구독**) · ⚠️ `shared/scripts/generate-image.py`(API 종량 경로)를 **다른 팀원이 사용 중** — 스크립트·커맨드를 제거·변경하지 않는다 →②**Claude Design**
  - **퍼블리싱·HTML·프론트엔드**(시안 목업 코드 포함) = ①**Codex 쓰기 레인**(luna 사소·terra 일반·sol 복잡, astra=advisor 전용 2026-09-17 · 판정 `coder-lane-detect.sh`) →②**Claude Design** · ⚠️ 현재 `--coder codex:*` 구현은 검수 배선 갭으로 cr-final 통과 불가 — aux 참조
  - **디자인시스템·토큰** = ①**Codex**(위와 같은 판정) →②**Claude Design**(`/forge-claude-design`)
  - ⛔ **Stitch 사용 중단**(Gemini 철수와 같은 축 — `/forge-stitch` 새로 호출하지 않는다) · ⛔ **Figma 중단**.
  - 디자인 파이프라인(디자인시스템 → `DESIGN.md` 토큰 → 스타일가이드)은 **순위와 무관하게 먼저 거친다** — 1순위 모델은 그 토큰을 입력으로 쓴다.
- ⚠️ **MCP 목록만 보고 디자인 도구를 판단하지 마라** — Claude Design 은 MCP 가 아니고 `~/.claude.json` 에 없다.
- ⚠️ **`claude.ai/design`(웹) ≠ `frontend-design`(CLI 스킬)** — 전자는 시안·디자인시스템의 **웹 제품**, 후자는 CLI 에서 프런트 코드를 짜는 스킬. **서로 대체하지 않는다** — 프론트 구현의 1순위는 Codex 레인이다.
- ⚠️ **네이티브 `/design` 커맨드는 없다**(2026-09-06 실측) — 번들의 `"design"` 은 플러그인 **카테고리** 이름이다. 이름만 보고 단정하지 마라.
- 표·근거·재현·폐기조건 → `rules-on-demand/tool-rules-aux.md §디자인 도구 순위`

## 스크립트 경로
- Python/Bash 에서 CWD 상대경로 금지 — 항상 절대경로.

> DesignSync 범위·절대경로 근거 → `rules-on-demand/behavior-core-aux.md`
