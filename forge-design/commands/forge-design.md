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
   # 프로젝트 루트에서 projectType 확인
   cat forge-workspace.json | jq -r '.projectType // empty'
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

## 위임 후 동작

- `/prd` — PRD 5 요소 기반 웹/앱 기획서 작성. 기존 `/prd` 동작 100% 보존.
- `/gdd` — GDD 게임 기획서 작성. 기존 `/gdd` 동작 100% 보존.

track 판별 후 해당 커맨드로 즉시 위임. 추가 변환 없음.
