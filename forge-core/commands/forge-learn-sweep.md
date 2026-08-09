---
description: "이번 세션의 misfire 를 훑어 로컬 학습 store 에 기록한다(플러그인 사용자용, 로컬 전용). 트리거: /forge-learn-sweep, 세션 끝 '이번에 뭐가 잘못됐는지 남겨줘'."
argument-hint: "[--skill <name>] [--purge-older-than <days>]"
allowed-tools: Read, Bash
group: ops
---

> **L3 도구 화이트리스트 (FR-006)** — 위 `allowed-tools` 는 전사 읽기 + 로컬 파일 append 에
> 필요한 것만 선언한다. **네트워크 도구(WebFetch·WebSearch·MCP)는 포함하지 않는다.**
> ⚠️ 정직한 한정: 이것은 **프레임워크 수준 선언**이며, 그 세션에 네트워크 도구가 존재하지
> 않음을 증명하지는 않는다(FR-006 §L3). 이 기능이 전송 코드를 갖지 않는다는 것만 보증한다.

# /forge-learn-sweep

**이번 세션에서 틀어진 것**을 훑어 사용자 머신에만 남는 로컬 학습 store 에 기록한다.

- SPEC: `SPEC-LOOPB-P1` FR-004 (W2). 스토어 계약은 FR-001/002/007 = `forge-plugin-learn.sh`.
- **로컬 전용**: 저장 위치는 `$HOME/.claude/forge-plugin/learnings.jsonl` 하나뿐이다. 네트워크 전송·업로드·텔레메트리 없음. 파일을 지우면 완전히 폐기된다.
- 우리 팀 내부 학습(`/learn`, git 전파)과 **별개 계보**다 — id 접두가 `PL-` 로 다르다.

```bash
/forge-learn-sweep                 # 세션 전체
/forge-learn-sweep --skill qa      # 특정 스킬 호출분만
/forge-learn-sweep --purge-older-than 180
```

## 실행

### 0. opt-out·가용성 확인 (선행, 조용히)

```bash
SCRIPT="$HOME/.claude/scripts/forge-plugin-learn.sh"
[ -f "$SCRIPT" ] || SCRIPT="${FORGE_ROOT:-$HOME/forge}/shared/scripts/forge-plugin-learn.sh"
[ -f "$SCRIPT" ] || { echo "forge-plugin-learn.sh 없음 — sweep 불가"; exit 0; }
[ "${FORGE_PLUGIN_LEARN:-on}" = "off" ] && { echo "FORGE_PLUGIN_LEARN=off — 사용자가 끔. 종료."; exit 0; }
```

둘 다 **조용한 종료(exit 0)** 다. 학습 기능이 사용자 작업을 막지 않는다.

### 1. 후보 추출 — 이번 대화 트랜스크립트만

**이 세션의 대화만** 본다(Phase 1은 크로스세션 스캔 없음). 아래 신호를 찾는다:

| 신호 | 예 |
|---|---|
| 교정 후속이 붙은 스킬 재호출 | "아니 그거 말고", "다시 해줘", "틀렸어" |
| 사용자가 명시한 실수 | "그건 내가 말한 게 아닌데" |
| 세션 중 표면화된 게이트·검수 거부 | cr-* FAIL, 게이트 BLOCK/WARN |
| 우회로 넘어간 도구 에러 | 명령 실패 후 다른 방법으로 우회 |

`--skill <name>` 이 주어지면 그 스킬 호출 구간으로 범위를 좁힌다.

**후보가 0건이면** `0 candidates, nothing to sweep` 1줄 출력 후 종료(exit 0). 에러 아니다.

### 2. **[게이트] 확인 프로토콜 — 4경로** (FR-004, 필수)

⚠️ **추측 내용을 무단 기록하지 않는다.** `summary`/`apply` 에는 가능한 한 **사용자 본인의 표현**이 들어가야 한다.

1. **대화형(기본)** — 후보를 **1줄 요약 목록**으로 제시하고 각각 승인·편집·거절을 받는다. 승인/편집된 것만 append.
2. **다중 후보** — 제시 상한 **5건**. 초과 시 최근순으로 자르고 `N건 더 있음` 1줄 고지. **후보별 독립 판정**이다 — "전부 승인하시겠습니까?" 식 일괄 강요 금지.
3. **거절** — 거절된 후보는 **어디에도 기록하지 않는다.** 거절 이력 파일도 만들지 않는다(Phase 1 최소 표면).
4. **비대화형·중단** — 확인 응답을 받을 수 없는 맥락(비대화형 호출, 사용자 미응답, 세션 종료·인터럽트)에서는 **fail-closed**: 아무것도 append 하지 않고 `0 appended (unconfirmed)` 만 보고한다.

> 4번이 이 커맨드에서 가장 중요한 규칙이다. 확인을 못 받았는데 "그럴듯하니 저장" 하면 store 가
> 사용자가 동의한 적 없는 추측으로 채워진다 — 그건 학습이 아니라 오염이다.

### 3. 중복 판정 — append 전 필수

승인된 후보마다 **먼저** 돌린다:

```bash
bash "$SCRIPT" dedup-check --summary "<후보 summary>" --skill "<스킬명>"
# exit 0 = 중복 → append 하지 말고 deduped 로 집계
# exit 1 = 신규 → 4단계 append
```

같은 skill 안에서 정규화 substring 포함 또는 토큰 중복 ≥60% 면 중복이다. **카운터를 올리지 않는다** — store 는 엄격 append-only 라 중복은 그냥 안 쓴다.

### 4. append

```bash
bash "$SCRIPT" append \
  --category <process|forbidden-pattern|gate-false-positive|skill-misbehavior> \
  --summary "<무엇이 어떻게 틀어졌나 1줄 — 사용자 표현 우선>" \
  --apply   "<다음엔 이렇게 1~2줄>" \
  --trigger "<이 상황이 또 오면 무엇을 볼 것인가>" \
  --evidence "<관측된 것 — 스킬명·에러문구·발췌>" \
  --skill "<스킬/커맨드명>" \
  --source sweep
```

- `--source sweep` 고정(자동탐지·사용자선언과 구분).
- evidence 는 **원문 전사를 붙여넣지 않는다.** 길이 상한(500자)과 시크릿 리댁션이 스크립트에 있지만, 그건 1차 선별이지 보증이 아니다 — 애초에 짧게 요약해 넣는 것이 1차 방어다.
- **rc 로 착지를 판정하지 말 것**: 이 스크립트는 fail-open 이라 lock 실패·opt-out 도 exit 0 이다. 착지 증거는 stderr 의 `→ <경로>` 다.

### 5. 보고 — 1줄 요약만

```
sweep: 후보 {N}건 · 기록 {A}건 · 중복 skip {D}건 · 미확인 {U}건
store: $HOME/.claude/forge-plugin/learnings.jsonl
```

레코드 **전문을 stdout 에 출력하지 않는다**(레코드당 1줄 요약까지). 방금 정리한 내용을 컨텍스트에 되붓는 것은 이 커맨드의 목적과 반대다.

## `--purge-older-than <days>`

보존기간 초과분 **물리 삭제**. 평소 reader 는 오래된 레코드를 선택에서 제외만 하고 지우지 않는다(append-only 유지) — 이 경로가 유일한 삭제 수단이다.

```bash
bash "$SCRIPT" purge --older-than <days>          # 1) dry-run — 몇 건 지워지는지만
# → 사용자에게 건수를 보여주고 확인을 받는다 (확인 없으면 여기서 중단)
bash "$SCRIPT" purge --older-than <days> --yes    # 2) 확인 후에만 실제 교체
```

- **확인 프롬프트는 이 커맨드의 책임이다.** 스크립트는 `--yes` 없이는 절대 지우지 않는다.
- 교체는 같은 디렉터리 temp → `os.replace` 원자 교체이고 새 파일도 `0600` 이다. 중단돼도 정본은 안 바뀐다.
- 날짜 파싱이 안 되는 라인은 **삭제하지 않는다**(판정 불가 ≠ 삭제 대상).

## 경계

| 하려는 것 | 쓸 것 |
|---|---|
| 우리 팀 내부 학습(git 전파) | `/learn` · `learnings.sh append --global` |
| 이 세션 종료·인계 | `/forge-end` |
| store 를 통째로 없애기 | `rm $HOME/.claude/forge-plugin/learnings.jsonl` (2차 사본·인덱스 없음) |

**Phase 1 범위 밖**: 크로스세션 스캔 · 익명 집계 전송 · 사용자 간 공유 · 플러그인 자체 SKILL.md 자동 편집. 개인화는 **컨텍스트 주입 전용**이고 파일을 고치지 않는다.
