# 접근성 트리 ref 프로토콜 (상세)

> SKILL.md 에서 옮김. 핵심 규칙은 SKILL.md §ref 규칙.

## (a) 접근성 트리 획득 — role+name 기반 안정 selector

`playwright-cli snapshot` 실행 시 내부적으로 `page.accessibility.snapshot()`이 실행되어 ARIA 역할 트리가 YAML로 반환된다. 반환된 트리의 각 노드는 `role`·`name` 쌍으로 식별되며 `@e{n}` ref 토큰(예: `@e1`, `@e2`)으로 접근한다.

```bash
# 접근성 트리 획득 → ref 목록 확인
playwright-cli snapshot

# 트리 예시 출력 (YAML)
# - button "로그인" @e3
# - textbox "이메일" @e5
playwright-cli click e3
playwright-cli fill e5 "user@example.com"
```

**우선 순위**: WCAG role(button/textbox/link/checkbox/…) → name → `@e{n}` ref. `data-testid`나 CSS 클래스 selector보다 접근성 role 우선 사용.

## (b) @e{n} ref 토큰 해석 규칙

- `@e{n}` = snapshot 응답의 n번째 접근 가능 요소. 스냅샷 갱신 시 번호 재할당.
- 명령에서 `e3`, `e5` 형태로 사용 (앞 `@` 생략).
- `@c{n}` = cursor ref — ARIA 트리에 노출되지 않는 커스텀 컴포넌트(div + cursor:pointer 기반 Radix/shadcn 등) 좌표 폴백. `page.evaluate` 스캔으로 `cursor:pointer` 노드 탐지 후 할당.

## (c) stale 감지 fast-fail

ref는 navigation 또는 React 리렌더링 후 stale(무효)될 수 있다. **무한 대기 금지** — stale 감지 시 즉시 재snapshot 후 새 ref 사용.

```bash
# 페이지 전환 또는 DOM 변경 후 반드시 재snapshot
playwright-cli goto https://example.com/dashboard
playwright-cli snapshot          # ← 반드시 재획득 (이전 ref 무효)
playwright-cli click e7          # 새 ref 사용
```

- ref 무효(요소 없음) 에러 수신 시 → 즉시 `playwright-cli snapshot` 후 ref 재확인. 3회 연속 실패 시 [STOP] Human 에스컬레이션.
- 페이지 navigation(`goto`, `go-back`, `go-forward`, `reload`) 직후 = ref 전량 무효 처리.

## (d) @c cursor fallback (좌표 클릭 최후수단)

접근성 트리에 노출되지 않는 커스텀 컴포넌트(Radix, shadcn, headless UI 등):

```bash
# 1차 시도: 접근성 ref
playwright-cli click e12

# 실패 시 2차: @c cursor ref (playwright-cli 내부 page.evaluate 스캔)
# — snapshot 재실행 시 @c{n} ref가 할당된 경우
playwright-cli snapshot
playwright-cli click c1

# @c도 없을 경우 최후수단: 좌표 클릭
playwright-cli mousemove 450 320
playwright-cli mousedown
playwright-cli mouseup
```

좌표 클릭은 **화면 크기 변경 시 깨짐** — 가능한 한 `resize` 후 동일 크기 보장 후 사용.
