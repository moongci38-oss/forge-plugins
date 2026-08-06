---
name: dungeon-play-loop
description: "dungeon-play-loop 루프 실행. 트리거: /dungeon-play-loop 호출 시만. 종료조건: 4던전(일반/균열/초월/레이드) 입장→플레이→클리어→보상 E2E 4/4 PASS + 콘솔예외0 + 스펙FR 전항목 충족."
disable-model-invocation: true
---

# dungeon-play-loop

## Goal

**Exit predicate:** 4던전(일반/균열/초월/레이드) 각각 입장→플레이→클리어→보상 E2E 4/4 PASS + 콘솔 예외 0 + 스펙 FR 체크리스트 전항목 충족 (verifier exit 0)

루프는 이 조건이 충족될 때까지 실행됩니다. 매 이터레이션 후 verifier가 predicate를 검사합니다.

---

## Conventions

> **이 파일은 runtime read-only입니다. 상태(카운터·타임스탬프·진행 결과)를 여기에 쓰지 마세요.**

- 변경 상태는 모두 `${GODBLADE_ROOT}/loops/dungeon-play-loop/STATE.md`에 저장
- 이 파일은 cold-start 시 디스크에서 새로 로드됨 — 여기 쓴 상태는 다음 실행 시 초기화됨
- Durable 정보만: goal predicate, action 절차, verifier 호출, stop criteria

## Pattern: pev

| Step | 내용 |
|------|------|
| 1. Read state | `${GODBLADE_ROOT}/loops/dungeon-play-loop/STATE.md` 로드 → 이전 진행 상태 복원 |
| 2. Discover | 아래 §Durable references의 스펙 2종+기획서+보상테이블을 STATE.md 커서와 대조 → 던전별 FR 갭 매트릭스 도출 (첫 이터레이션 필수, 이후엔 미해결 갭만 갱신) |
| 3. Act | 갭 1건씩 분류 라우팅 — **버그 → `/forge-fix` 4-스테이지(RED→리포트→수정→GREEN)** / **미구현 기능 → `/forge-implement` (스펙 FR 기반)**. worker tier: 단순=sonnet, 복잡=opus (오케스트레이터 위임, 메인 직접 구현 금지) |
| 4. Verify | `node ${GODBLADE_ROOT}/loops/dungeon-play-loop/scripts/dungeon-e2e-verify.mjs` — Unity script-execute로 4던전 자동 주행 + 콘솔 오라클 + FR 대조. 던전별 PASS/FAIL, exit 0=전부 PASS |
| 5. Write state | `${GODBLADE_ROOT}/loops/dungeon-play-loop/STATE.md` 갱신 (던전별 FR 진행·갭 커서·사이클 수·reviewed_sha) |
| 6. Check predicate | 4던전 E2E 4/4 PASS + 콘솔 예외 0 + FR 전항목 충족 시 STOP, 아니면 반복 |

### Durable references (매 실행 read-only)

| 자료 | 경로 |
|------|------|
| UI 리뉴얼 스펙 (트랙A) | `src/.specify/specs/dungeon-ui-rework.spec.md` (v0.9.2) |
| 보상 스케줄 스펙 (트랙B) | `src/.specify/specs/dungeon-reward-schedule.spec.md` (v0.2) |
| 기획서 | `src/docs/gameDesign/던전UI리뉴얼_v0.7.2.pptx`, `던전UI기획서_0.2.pptx` |
| 보상테이블 | `src/docs/gameDesign/뽑기확률테이블_v3.xlsx` (던전 패턴 시트) |
| 갭 분석 선행자료 | `src/docs/planning/active/dungeon-ui-rework/00-analysis-gap-matrix.md` |

### Unity 런타임 절차 (durable — 검증된 패턴)

- 재생 재시작: stop → `AssetDatabase.ImportAsset(ForceUpdate)`로 컴파일 강제 → `isCompiling` 폴링 → play (play-before-compile 레이스 방지)
- 자동로그인 ~80s, 캐릭터선택 멈춤 시 `EodUICharacterSelect.OnStartGamePlay` 리플렉션 호출
- 팝업류는 UILabel "확인" 탐색 → `UICamera.Notify(OnClick)`으로 닫기
- ScreenCapture 경로는 Windows 형식(`E:/...`) 필수
- MCP: unity-game-developer(IvanMurzak) 사용 (unity-mcp-godblade는 revoked)
- 신규 위젯은 `NGUITools.AddChild` + UITexture 패턴 (별도 Instantiate는 panel 재바인딩 거부)

verifier exit 1 시 즉시 중단. 상태 파일에 실패 이유 기록 후 HUMAN-GATES.md G2 gate 대기.

---

## Stop Conditions (loop-kernel §1)

| 조건 | 결과 |
|------|------|
| rubric_all_pass | SUCCESS |
| max_cycles (≥ 12) | STOP |
| same_issue × 3 | STOP |
| plateau (net gain ≤ 5, 2연속) | STOP |
| oscillation (pass→fail × 2) | STOP |
| regression | STOP |
| security_crit | STOP |
| budget_advisory | advisory STOP |

---

## Budget

| 항목 | 상한 |
|------|------|
| max-iter | 12 |
| call-budget | 2000 (hook WARN-only) |
| wall-clock | 6시간 |

---

## How to run

```
/goal "4던전(일반/균열/초월/레이드) 각각 입장→플레이→클리어→보상 E2E 4/4 PASS + 콘솔 예외 0 + 스펙 FR 체크리스트 전항목 충족 (verifier exit 0)"
```

첫 실행 전 HUMAN-GATES.md G1 gate 완료 필수.
