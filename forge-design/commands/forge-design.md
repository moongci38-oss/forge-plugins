---
description: "PRD(web)|GDD(game) 기획서 작성 — track 분기 디스패처"
argument-hint: "[--track web|game] <기능설명>"
group: plan
---

> **⚠️ 실행 모드 확인**: 이 커맨드는 쓰기 모드에서만 정상 동작합니다. Plan mode 감지 시 즉시 [STOP] — "Escape로 plan mode 해제 후 재실행하세요. 내부 [STOP] 게이트가 승인 지점입니다."

# /forge-design — 기획서 작성 track 분기 디스패처

web 또는 game track을 판별해 `/prd` 또는 `/gdd`로 위임합니다.
기존 `/prd`·`/gdd` 동작은 100% 보존됩니다 — 이 명령은 디스패처일 뿐입니다.


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

1. **`--track` 인자 최우선**: `--track web` → `/prd` 위임, `--track game` → `/gdd` 위임
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
   - `"game"` → `/gdd` 위임
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
/forge-design --track game "전투 시스템 설계"    → /gdd 로직 그대로 실행
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
- `/gdd` — GDD 게임 기획서 작성. 기존 `/gdd` 동작 100% 보존.

track 판별 후 해당 커맨드로 즉시 위임. 추가 변환 없음.
