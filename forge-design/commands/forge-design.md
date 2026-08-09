---
description: "PRD(web)|GDD(game) 기획서 작성 — track 분기 디스패처"
argument-hint: "[--track web|game] <기능설명>"
group: plan
---

> **⚠️ 실행 모드 확인**: 이 커맨드는 쓰기 모드에서만 정상 동작합니다. Plan mode 감지 시 즉시 [STOP] — "Escape로 plan mode 해제 후 재실행하세요. 내부 [STOP] 게이트가 승인 지점입니다."

# /forge-design — 기획서 작성 track 분기 디스패처

web 또는 game track을 판별해 `/prd` 또는 `/gdd`로 위임합니다.
기존 `/prd`·`/gdd` 동작은 100% 보존됩니다 — 이 명령은 디스패처일 뿐입니다.


## Step 0 — Brain recall (선행 필수, 회사 두뇌 계획서 §3.6 파이프라인 회수 배선 / A4-5)

기획서 작성 착수(dispatch) **전에 브레인 조회 1회**를 수행한다. 축적한 wiki·RAG 지식이 기획 중 잠들어 있는 구멍을 막는 스텝이다.

1. 기능 키워드로 `rag-search` 1회 + wiki 조회(`mcp__…__wiki_search` 또는 20-wiki Glob) 1회
2. **결과가 0건이어도 "조회함 + 0건"을 기록한다** — 브레인을 *안 물어본 것*과 *물어봤는데 없는 것*은 다르다
3. 기록(1줄):
   ```bash
   printf '{"ts":"%s","stage":"forge-design","query":"<키워드>","hits":<n>}\n' "$(date -u +%FT%TZ)" \
     >> "${FORGE_OUTPUTS:-$HOME/forge-outputs}/.claude/audit/brain-recall.jsonl"
   ```
4. 적중 건이 있으면 위임받은 `/prd`·`/gdd`에 "선행 지식" 항목으로 전달한다.

> T3 미연결(강등) 세션이면 조회 결과가 팀과 다를 수 있다 — 세션 시작 배너(`t2-degraded-banner.sh`) 경고를 그대로 신뢰하고, 중요한 근거는 T3 복구 후 재조회한다.

## Phase 0 — Readiness 판정 (경량 게이트)

→ 공통 헬퍼: `/readiness-gate` 참조 (forge-design 진입 계약 3요소)

입력(기능설명 인라인텍스트 또는 `--track` 인자)에서 3요소 스캔:

| 요소 | ok 조건 |
|------|---------|
| 컨셉/목표 | 만들려는 것의 목적·아이디어 언급 |
| 타깃 사용자 | 누구를 위한 기능인지 명시 또는 유추 가능 |
| 문제정의 | 해결하려는 문제·필요 언급 |

라우팅:
- 3요소 중 1개+ ok/derive → **PASS** (dispatch 진행)
- 전부 absent (완전 빈 입력) → **GUIDE-STOP** (`forge-design-readiness-{date}.md` 출력 후 정지)

⚠️ 경량 게이트: 최소 컨셉만 있으면 PASS. absent 판정은 완전 공백 입력만. PRD/GDD 완성도를 사전 요구 X.

## 분기 로직 (우선순위 순서)

> ⛔ **game 트랙 = 2026-08-07 부터 미지원(위임 대상 부재).** `/gdd` 는 게임 트랙 자산 14건과
> 함께 `commands-archived/` 로 이관됐다(커밋 `9cd2a811` — 사용자 확정 "한 번도 사용 안 함").
> 아래 game 분기는 **없는 커맨드를 호출한다** — 그래서 위임하지 않고 `[STOP]` 으로 멈춘다.
> 조용히 실패하는 것보다 멈추는 것이 낫다.
> ```
> [STOP] game 트랙 미지원 — /gdd 가 아카이브 이관됐습니다(2026-08-07).
>   복원: git mv .claude/commands-archived/gdd.md .claude/commands/gdd.md
>         git mv .claude/agents-archived/gdd-writer.md .claude/agents/gdd-writer.md
>         + .claude/plugin-manifest.json 에 forge-game 엔트리 재추가
>   진행하려면 위 복원 후 재실행하거나, --track web 으로 전환하십시오.
> ```
> 재현: `ls .claude/commands/gdd.md` → No such file (2026-08-07 관측)

1. **`--track` 인자 최우선**: `--track web` → `/prd` 위임, `--track game` → **`[STOP]` 위 고지**
2. **인자 없을 시 — `forge-workspace.json` 감지**:
   ```bash
   # forge-workspace.json = $FORGE_ROOT canonical 단일 파일 (프로젝트별 사본 없음 — health-check.sh/forge-paths.sh/deploy-symlinks.sh와 동일 관례) → CWD 무관 절대경로로 조회
   # 스키마 실측: 타입 키가 트랙별로 이원화 — 게임 프로젝트는 projects.<명>.projectType("game"), 웹/API 프로젝트는 projects.<명>.type("web"). top-level 아님. 둘 다 없는 프로젝트(portfolio-admin 등)는 아래 [STOP]로 Human 확인.
   # 현재 프로젝트 = CWD가 속한 devTarget으로 역매핑(forge-qa.md의 CWD→매핑 관례, project_knowledge_sync.py의 load_project_map()과 동일 패턴). projectType 우선, 없으면 type 폴백.
   cat "${FORGE_ROOT:-$HOME/forge}/forge-workspace.json" | jq -r --arg cwd "$PWD" '
     .projects | to_entries[]
     | select(.value.devTarget != null)
     | (.value.devTarget) as $dt
     | select($cwd == $dt or ($cwd | startswith($dt + "/")))
     | (.value.projectType // .value.type) // empty
   ' | head -1
   ```
   - `"web"` 또는 `"webapp"` → `/prd` 위임
   - `"game"` → **`[STOP]` game 트랙 미지원**(위 고지) — 자동 감지로도 `/gdd` 를 부르지 않는다
3. **둘 다 없을 시 — [STOP] Human 확인 (임의 기본값 절대 금지)**:
   ```
   [STOP] track을 감지할 수 없습니다.
   --track 인자로 명시해주세요:
     /forge-design --track web <기능설명>   → PRD (웹/앱)
     /forge-design --track game <기능설명>  → GDD (게임)
   ```

## 사용법

```
/forge-design --track web  "소셜 로그인 기능"   → /prd 로직 그대로 실행
/forge-design --track game "전투 시스템 설계"    → [STOP] 미지원(/gdd 아카이브 이관, 2026-08-07)
/forge-design "신기능 설명"                      → forge-workspace.json 감지 → 없으면 [STOP]
```

## Advisor 조언 (조건부) — 아키텍처 접근 비자명 판단점

**Advisor 조언 (조건부)** — `FORGE_ADVISOR_AUTO` 환경변수가 `"off"`가 아니고 아래 트리거 충족 시 `advisor-strategist` 호출:
- 트리거: **아키텍처/접근 선택이 비자명** (동등한 선택지 2+: REST vs GraphQL, 모놀리식 vs 분리, 단일 서비스 vs 마이크로서비스 등) **또는 핵심 trade-off 충돌**이 기능 설명에 내포됨
- PASS(자명한 단일 접근 / 선택지 명시된 경우) → 스킵

```
Agent(
  subagent_type="advisor-strategist",
  prompt="""<설계 맥락 500토큰 이내>
기능 설명: {기능 설명}
track: {web|game}
비자명 결정점: {동등 선택지 또는 trade-off 목록}
제약: {기존 스택, NFR, 일정 등}

질문: 이 결정점에서 권장 접근 + 핵심 근거 1~2개만."""
)
```

→ 400~700토큰 전략 조언 수령 후 dispatch 진행. PASS(자명/단일 선택지)는 스킵.

## 위임 후 동작

- `/prd` — PRD 5 요소 기반 웹/앱 기획서 작성. 기존 `/prd` 동작 100% 보존.
- ~~`/gdd`~~ — **2026-08-07 `commands-archived/` 이관으로 위임 불가**(위 분기 로직의 `[STOP]` 참조). 복원 시 이 줄을 되살린다.

track 판별 후 해당 커맨드로 즉시 위임. 추가 변환 없음.
