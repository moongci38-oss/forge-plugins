---
description: "PRD(web)|GDD(game) 기획서 작성 — track 분기 디스패처"
argument-hint: "[--track web|game] <기능설명>"
group: plan
---

> **⚠️ 실행 모드 확인**: 쓰기 모드에서만 동작. Plan mode 감지 시 즉시 [STOP] — "Escape로 plan mode 해제 후 재실행하세요. 내부 [STOP] 게이트가 승인 지점입니다."

# /forge-design — 기획서 작성 track 분기 디스패처

web/game track을 판별해 `/prd`로 위임한다. 디스패처일 뿐 — `/prd` 동작 100% 보존, 추가 변환 없음.

## Step 0 — Brain recall (선행 필수 — dispatch 전 1회)

1. 기능 키워드로 `rag-search` 1회 + wiki 조회(`mcp__…__wiki_search` 또는 20-wiki Glob) 1회
2. 조회는 `bash "${FORGE_ROOT:-$HOME/forge}/shared/scripts/recall-context.sh" --stage forge-design --query "<키워드>"` 로 한다(조회 기록 자동, 0건이어도 남는다).
3. 적중 건은 `/prd`에 "선행 지식" 항목으로 전달한다.

> T3 미연결(강등) 세션이면 세션 시작 배너(`t2-degraded-banner.sh`) 경고를 신뢰하고, 중요한 근거는 T3 복구 후 재조회.

## Phase 0 — Readiness 판정 (경량 게이트)

→ 공통 헬퍼: `/readiness-gate` (forge-design 진입 계약 3요소)
| 요소 | ok 조건 |
|------|---------|
| 컨셉/목표 | 만들려는 것의 목적·아이디어 언급 |
| 타깃 사용자 | 누구를 위한 기능인지 명시 또는 유추 가능 |
| 문제정의 | 해결하려는 문제·필요 언급 |

- 1개+ ok/derive → **PASS** (dispatch 진행)
- 전부 absent(완전 빈 입력) → **GUIDE-STOP** (`forge-design-readiness-{date}.md` 출력 후 정지)
- 최소 컨셉만 있으면 PASS. PRD 완성도를 사전 요구하지 않는다.

## 분기 로직 (우선순위 순서)

⛔ **game 트랙 미지원** — `/gdd`는 `commands-archived/`로 이관됐다. game 분기는 위임하지 않고 멈춘다:
```
[STOP] game 트랙 미지원 — /gdd 가 아카이브 이관됐습니다.
  복원: git mv .claude/commands-archived/gdd.md .claude/commands/gdd.md
        git mv .claude/agents-archived/gdd-writer.md .claude/agents/gdd-writer.md
        + .claude/plugin-manifest.json 에 forge-game 엔트리 재추가
  진행하려면 위 복원 후 재실행하거나, --track web 으로 전환하십시오.
```

판별은 스크립트 1줄(인자 최우선 → `forge-workspace.json` CWD→devTarget 역매핑, `projectType` 우선·`type` 폴백):
`bash "${FORGE_ROOT:-$HOME/forge}/shared/scripts/forge-design-track.sh" [--track <값>]` → `TRACK=` · `SOURCE=arg|workspace|none|error` · `PROJECT_TYPE=`

1. **`--track` 인자 최우선** (`SOURCE=arg`): `TRACK=web` → `/prd` 위임, `TRACK=game` → **`[STOP]` 위 고지**
2. **인자 없을 시 — `forge-workspace.json` 감지** (`SOURCE=workspace`):
   - `TRACK=web`(`"web"` 또는 `"webapp"`) → `/prd` 위임
   - `TRACK=game` → **`[STOP]` game 트랙 미지원**(위 고지) — 자동 감지로도 `/gdd`를 부르지 않는다
3. **둘 다 없을 시 (`TRACK=none`, 또는 rc 2·`TRACK=unknown` 판정 불가) — [STOP] Human 확인 (임의 기본값 절대 금지)**:
   ```
   [STOP] track을 감지할 수 없습니다.
   --track 인자로 명시해주세요:
     /forge-design --track web <기능설명>   → PRD (웹/앱)
   (game 트랙은 미지원 — /gdd 는 commands-archived/ 로 이관됐다)
   ```

## 사용법

```
/forge-design --track web  "소셜 로그인 기능"   → /prd 로직 그대로 실행
/forge-design --track game "전투 시스템 설계"    → [STOP] 미지원
/forge-design "신기능 설명"                      → forge-workspace.json 감지 → 없으면 [STOP]
```

## Advisor 조언 (조건부)

`FORGE_ADVISOR_AUTO`가 `"off"`가 아니고 **아키텍처/접근 선택이 비자명**(동등 선택지 2+: REST vs GraphQL 등) **또는 핵심 trade-off 충돌**이 있으면 호출. 자명·단일 선택지면 스킵.

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
→ 조언 수령 후 dispatch 진행.

## 위임 후 동작

- `/prd` — PRD 5 요소 기반 웹/앱 기획서 작성. track 판별 후 즉시 위임.
- 규모 판정은 `/prd` 레인이 소유한다(`/autoplan` 3관점 리뷰 MANDATORY). 이 디스패처는 규모를 판정하지 않는다.
