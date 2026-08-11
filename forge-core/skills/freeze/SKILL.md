---
name: freeze
disable-model-invocation: true
description: "⛔ DEPRECATED(2026-08-11) — 유지보수 중단. Use when user says /freeze to lock files/dirs from AI edits this session. /freeze <path>, /unfreeze. Triggers: \"파일 잠금\", \"편집 제한\", \"guard(careful)\". Session-scoped only, auto-clears on session end."
---
> **⛔ DEPRECATED(2026-08-11) — 유지보수가 중단된 스킬입니다.**
>
> 원본 시스템(forge SSoT)에서 2026-08-11 에 미사용으로 제거됐습니다. 이 플러그인에는
> **기존 설치자를 깨뜨리지 않기 위해 남겨 둡니다** — 계속 동작하지만 더 이상 고쳐지지 않습니다.
>
> **대체 없음** — 같은 일을 하는 다른 스킬이 없습니다. 없는 것을 가리키지 않으려고 비워 둡니다.
>
> 다음 릴리스에서 제거될 수 있습니다. 계속 필요하면 알려 주십시오.


# /freeze — Session-Scoped 편집 잠금

## 개요

현재 세션에서 특정 파일/디렉토리를 편집 금지 영역으로 선언한다. AI가 Edit/Write 전 freeze 목록을 확인하고 위반 시 즉시 [STOP].

## 실행 명령

### /freeze

```
/freeze <path-or-glob> [--reason <사유>]
```

**예시**:
```
/freeze ${FORGE_ROOT:-$HOME/forge}/.claude/hooks/          # hooks 전체 잠금
/freeze ${FORGE_ROOT:-$HOME/forge}/.claude/settings.json   # 파일 하나 잠금
/freeze ${FORGE_ROOT:-$HOME/forge}/dev/**                  # dev 하위 전체
/freeze --all                           # 현재 작업 디렉토리 외 전체
```

실행 시 AI가 응답:
```
🔒 FREEZE 등록:
  경로: {path}
  사유: {reason 또는 "명시 없음"}
  범위: session-scoped (이 세션 종료 시 자동 해제)
```

### /unfreeze

```
/unfreeze <path-or-glob>   # 특정 경로 해제
/unfreeze --all             # 전체 해제
```

## Edit Guard — 편집 전 체크

**모든 Edit/Write 호출 전 AI 자가 점검**:

```
1. freeze 목록에 대상 파일 포함 여부 확인
2. 포함 → [STOP] "해당 파일은 freeze 상태입니다. /unfreeze 후 진행하거나 Human 확인 필요."
3. 미포함 → 정상 진행
```

freeze 목록은 세션 내 메모리에만 유지. 외부 파일 기록 X.

## Careful 모드

`/freeze --careful <path>` = 잠금이 아닌 **추가 확인 요청** 모드:

- 해당 경로 Edit/Write 시 → 먼저 "이 파일은 careful 구역입니다. 변경 내역: {요약}. 진행할까요?" [STOP]
- Human 승인 후 → 진행 허용

**Careful 모드 자동 적용 영역** (명시 없어도):
- `$HOME/.claude/rules/` (모든 세션 cascade)
- `${FORGE_ROOT:-$HOME/forge}/.claude/hooks/` (훅 편집 = 시스템 영향)
- `${FORGE_ROOT:-$HOME/forge}/.claude/settings.json` (잠금 대상, 편집 원칙 불가)

## Freeze 상태 확인

```
/freeze --status
```

출력:
```
🔒 현재 Freeze 목록:
  1. {path} — {reason} — {모드: LOCK|CAREFUL}
  2. ...
세션 종료 시 자동 해제.
```

## 원칙

- Session-scoped 전용: 영구 잠금은 OS 권한 또는 `.gitattributes`로 처리
- AI self-enforcement: hook 없이 AI가 자발적으로 guard 준수
- 위반 시 [STOP] 즉시: 추측 "괜찮겠지" 진행 금지
- forge SSoT 경로(`${FORGE_ROOT:-$HOME/forge}/.claude/`)는 forge-sync 가드가 이미 있음 — 이중 잠금 허용

## 사용 시나리오

| 상황 | 명령 | 이유 |
|------|------|------|
| 훅 편집 실수 방지 | `/freeze ${FORGE_ROOT:-$HOME/forge}/.claude/hooks/` | hooks 배포 후 실수 방지 |
| 설정 파일 보호 | `/freeze settings.json --careful` | 의도치 않은 수정 방지 |
| 완료 파일 잠금 | `/freeze {완성된 스킬}/` | 리뷰 전 변경 차단 |
| 병렬 작업 충돌 방지 | `/freeze {파일} --reason "worker-A 작업 중"` | 충돌 방지 |
