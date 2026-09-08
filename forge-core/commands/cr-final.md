---
description: Codex 적대적 최종 리뷰 — PR 머지 직전 (blocking, xhigh effort)
argument-hint: "<PR-N or branch> [--cr <on|degrade|off>]"
group: verify
---

# /cr-final

`/codex-review --stage final --effort xhigh` 단축 래퍼.

## 사용

```
/cr-final PR-1234
/cr-final feature/auth-refactor
```

## 동작

```bash
# --cr 파싱: $ARGUMENTS에서 --cr <mode> 추출 후 전달
CR_ARG=$(echo "$ARGUMENTS" | grep -oP '(?<=--cr )\S+' || true)
TARGET=$(echo "$ARGUMENTS" | sed 's/--cr[[:space:]]\+\S\+//g' | xargs)
/codex-review --stage final --target "$TARGET" --effort xhigh --blocking ${CR_ARG:+--cr "$CR_ARG"}
```

- 모델: gpt-6-astra (xhigh effort, 적대적) — 2026-09-06 상향(구: gpt-5.6-sol / xhigh)
  ⚠️ 구 표기 "모델: gpt-5.6-sol (2026-08-22 상향)" 은 2026-09-06 폐기 — 현행 `gpt-6-astra`.
  ⚠️ `--sol`/`--terra`/`--luna` 는 이제 **전부 하향 스위치**다. 구 표기 "`--sol` 은 no-op(이미 기본)" 폐기 —
     사다리 재지정으로 sol 은 astra 한 칸 아래(codex:high)가 됐다. sol/terra/luna 는 **정식 지원 중**이다(폐지 아님).
  ⚠️ 로컬 codex CLI **0.153.4 이상** 필요 — 그 아래는 astra 를 HTTP 400 으로 거부한다.
     재현: `codex --version` → `0.153.4` (2026-09-06 관측)
- Blocking: YES (FAIL → PR 차단)
- 결과: `forge-outputs/docs/reviews/final/{date}-{slug}.{md,json}`

## ⚠️ 함정 — 대상이 크면 **번들 1개로 인라인**하라 (2026-09-02 실측)

MCP 도구는 **900초 상한**이 있다. 대상을 「경로」로만 주면 모델이 레포를 탐색하느라
그 안에 못 끝내고 **`timed out after 900s`** 로 죽는다. 실패 메시지는 무엇을 줄이라고
말해 주지 않는다.

**우회**: 검수 대상 파일의 **전문을 한 파일로 묶어** 프롬프트에 그 경로 하나만 준다.

```bash
OUT=/tmp/cr-bundle.txt
{ for f in <대상파일들>; do
    printf '\n########## FILE: %s ##########\n' "$f"
    git show <커밋>:"$f" | nl -ba -w5 -s'  '
  done; } > "$OUT"
# 프롬프트: "레포를 탐색하지 마라. $OUT 하나만 읽어라."
```

**실측(DHS 2026-09-02)**: 73파일 경로 지정 → **900초 타임아웃 2회**.
같은 검수를 번들 인라인으로 바꾸니 **2분**에 완료. 2파일·xhigh 에서도 타임아웃이 났으므로
**파일 수가 적어도** 탐색을 막는 것이 핵심이다.

⚠️ 번들이 커지면(수십만 자) 그것대로 못 읽는다 — 그때는 **검수 축을 쪼개 2회로 나눈다**.

## 리뷰 포커스

통합 검수 — PR 전체 관점:
- Spec 추적성 (FR ↔ 구현 ↔ 테스트 매핑)
- 롤백 가능성 (forward-only migration 등 비가역 변경 식별)
- UX 일관성 (디자인 토큰 위반, 3-state 누락)
- 보안 (인증·권한·시크릿)
- 성능 회귀 (벤치마크 +10% 초과)
- 마이그레이션 안전성 (다운타임, 데이터 손실)

## 비용

$0.00 (ChatGPT 구독 3계정, gpt-6-astra — OAuth 호출 가능) / 비상 폴백(apikey 시): xhigh effort 는 종량. 단순 변경은 자동 스킵.

## Completeness Critic (P-6)

`stage=final` 진입 시 completeness critic이 **default-on** 자동 활성 (2026-06-19). 명시적 `crCompleteness:false` 또는 `'off'` 전달 시 비활성(롤백). 비-final 스테이지는 기존 opt-in(기본 off) 유지.

## 관련

- 본명령: `/codex-review --stage final --effort xhigh --blocking`
- Forge Dev P7 Check 7-X에서 자동 호출
- 정책: `${FORGE_ROOT:-$HOME/forge}/dev/rules/codex-review-policy.md`
