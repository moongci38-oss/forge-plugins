---
description: 이번 세션의 misfire를 로컬 학습 메모로 캡처 (로컬 전용·전송 없음). 다음 세션 스킬 컨텍스트에 반영됩니다.
allowed-tools: Read, Grep, Glob, Bash(python3 "${CLAUDE_PLUGIN_ROOT}/hooks/lib/plugin_learn.py":*)
---

<!-- ⚠️ allowed-tools 를 넓히지 말 것 (cr-final HIGH 2026-07-25).
     인터프리터를 와일드카드로 열어두면(예: 인터프리터 이름만 쓰고 인자 전체를 `*`로)
     임의 코드 실행이 되고, 그 순간 FR-006 의 "네트워크 도구 미선언" 주장이 공허해진다.
     이 커맨드에 필요한 것은 store 헬퍼 호출뿐이므로 그 스크립트 프리픽스로만 허용한다.
     privacy-scan.sh 의 L3 검사가 이 조건을 기계적으로 확인한다.
     (여전히 프레임워크 수준 선언이지 세션 전체의 무네트워크 증명은 아니다 — 스펙 §1.1) -->


# /forge-learn-sweep

이번 **대화 세션**에서 무엇이 잘못 굴러갔는지(misfire) 찾아, 사용자 확인을 받은 것만
`~/.claude/forge-plugin/learnings.jsonl` 에 append 한다. 저장된 메모는 다음 세션
시작 시 참고 노트로 주입되어 **그 사용자의 스킬이 그 사용자에게 맞게** 나아진다.

> **로컬 전용**: 이 커맨드는 네트워크로 아무것도 보내지 않는다. 허용 도구
> (`allowed-tools`)에 네트워크 도구(WebFetch/WebSearch/MCP)가 **선언되어 있지 않다**
> (FR-006 L3). 저장 파일은 사용자 소유의 단일 JSONL이며 삭제하면 완전히 사라진다.

## 사용법

```
/forge-learn-sweep                      # 이번 세션 전체 스윕
/forge-learn-sweep --skill <name>       # 특정 스킬 호출 구간만
/forge-learn-sweep --purge-older-than <days>   # 오래된 메모 정리(확인 후 원자적 교체)
```

## 실행 절차

### 0. opt-out / 준비
- `FORGE_PLUGIN_LEARN=off` 여도 이 커맨드는 **동작한다** — 명시적 사용자 호출은 그 자체로
  동의이기 때문(ambient reminder/injection만 opt-out 대상, FR-006).
- 라이브러리 경로: `${CLAUDE_PLUGIN_ROOT}/hooks/lib/plugin_learn.py`

### 1. 후보 수집 (이번 세션 전사만 — cross-session 스캔 안 함)
다음 신호를 찾는다:
- 같은 스킬을 연달아 호출했는데 두 번째가 교정 성격("아니 그게 아니라", "다시", "redo")
- 사용자가 명시적으로 실수를 지적한 발화
- 세션 중 표면화된 게이트·리뷰 거절 출력
- 도구 오류 후 우회로 해결한 흔적

`--skill <name>` 이 있으면 그 스킬 호출 구간으로 범위를 좁힌다.

### 2. 중복 제거 (append 전)
각 후보의 `summary` 를 정규화(소문자·공백 축약)해 기존 레코드와 비교한다.
**같은 `skill` + (정규화 substring 포함 OR 토큰 중복 ≥60%)** 이면 **기록하지 않고 skip**.
카운터 증가·기존 행 수정은 하지 않는다 — store는 **엄격 append-only**다.

판정은 라이브러리에 위임한다(직접 재구현 금지):
```bash
python3 "${CLAUDE_PLUGIN_ROOT}/hooks/lib/plugin_learn.py" count   # 현재 레코드 수
```

### 3. 확인 프로토콜 (4경로 — 이 단계를 건너뛰지 말 것)

1. **대화형(기본)**: 후보를 **1줄 요약 목록**으로 제시하고 각각 승인/편집/거절을 받는다.
   승인·편집된 것만 append 한다. 추측 내용을 그대로 쓰지 말고, **사용자의 표현**이
   `summary`/`apply` 에 들어가게 한다.
2. **다중 후보**: 최대 5건까지만 제시(초과 시 최근순 절단 + "N건 더 있음" 1줄 고지).
   후보별로 독립 판정한다 — 일괄 승인을 강요하지 않는다.
3. **거절**: 거절된 후보는 **어디에도 기록하지 않는다**(거절 이력 파일도 만들지 않음).
4. **비대화형/중단**: 확인 응답을 받을 수 없는 맥락(비대화형 호출, 무응답, 세션 종료·
   인터럽트)에서는 **fail-closed — 아무것도 append 하지 않고** `0 appended (unconfirmed)`
   만 보고한다. 추측 내용의 무단 기록은 금지다.

### 4. 기록
승인된 후보마다 1회 호출한다(리댁션·길이 상한·권한·락·dedup 전부 라이브러리가 처리):

```bash
python3 "${CLAUDE_PLUGIN_ROOT}/hooks/lib/plugin_learn.py" append \
  --summary "<사용자가 확인한 1줄 요약>" \
  --apply   "<다음에 이렇게 한다 1~2줄>" \
  --trigger "<이 상황이 재발할 때 볼 신호>" \
  --skill   "<관련 forge 스킬/커맨드 이름>" \
  --category "process|forbidden-pattern|gate-false-positive|skill-misbehavior" \
  --source  sweep
```
출력은 `appended` / `deduped` / `skipped (...)` 중 1줄이다.

> `evidence` 는 선택이며, 넣더라도 전사 원문을 대량 복사하지 말 것 — 500자 상한으로
> 잘리고 시크릿 패턴은 `***` 로 치환된다(리댁션 실패 시 그 필드는 아예 기록되지 않음).

### 5. 정리 (`--purge-older-than <days>`)
보존기간이 지난 메모를 지운다. **확인 프롬프트를 먼저 띄우고**, 승인 시에만 실행한다:
```bash
python3 "${CLAUDE_PLUGIN_ROOT}/hooks/lib/plugin_learn.py" purge <days>
```
새 파일로 원자적 교체하며, 최신 레코드는 보존된다.

### 6. 보고 (success is silent)
다음 1줄 요약만 출력한다 — 레코드 전문을 다시 쏟지 않는다:

```
candidates: N / appended: A / deduped: D / unconfirmed: U
store: ~/.claude/forge-plugin/learnings.jsonl
```

후보가 0건이면 `0 candidates, nothing to sweep` 만 출력하고 종료한다(에러 아님).

## 하지 않는 것

- 확인 없이 자동 기록하지 않는다(§3-4 fail-closed).
- 기존 레코드를 수정·삭제하지 않는다(§2, append-only). 정리는 §5 명시 실행뿐이다.
- 네트워크로 아무것도 보내지 않는다. 통계·텔레메트리 전송 경로가 없다.
- 플러그인이 shipped 한 SKILL.md·게이트·안전 규칙을 바꾸지 않는다(주입은 additive 텍스트뿐).
