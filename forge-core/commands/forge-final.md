---
description: Codex 적대적 최종 리뷰 — PR 머지 직전 (blocking, xhigh effort)
argument-hint: "<PR-N or branch> [--cr <on|degrade|off>]"
group: verify
---

# /forge-final

> 구 이름 `/cr-final`. 헬퍼 스크립트 파일명·감사로그·증거 경로(`cr-evidence/`)는 옛 이름 그대로 둔다.

`/codex-review --stage final --effort xhigh` 단축 래퍼.

## 사용

```
/forge-final PR-1234
/forge-final feature/auth-refactor
```

## 동작

```bash
# --cr 파싱: $ARGUMENTS에서 --cr <mode> 추출 후 전달
CR_ARG=$(echo "$ARGUMENTS" | grep -oP '(?<=--cr )\S+' || true)
TARGET=$(echo "$ARGUMENTS" | sed 's/--cr[[:space:]]\+\S\+//g' | xargs)
/codex-review --stage final --target "$TARGET" --effort xhigh --blocking ${CR_ARG:+--cr "$CR_ARG"}
```

- 모델: **`codex:high`** 티어(xhigh effort, 적대적) — astra 미사용. id·하향 스위치(`--terra`/`--luna`) 정본 = `commands/codex-review.md §Step 2`.
- Blocking: YES — 단 **차단선은 `verdict` 가 아니라 `severity` 다**.
  `verdict=FAIL` 이어도 **critical/high 0건이면 WARN 으로 강등**하고 진행한다(medium/low 는 권고).
  ⛔ 강등에는 **자격 조건**이 있다 — `.issues` 가 배열이고, severity 가 전부 규격 4값이고,
  1건 이상이어야 한다. 셋 중 하나라도 어긋나면 **판정 불가**이므로 강등하지 않고 그대로 차단한다
  (`verdict=FAIL` + `issues:[]` 는 "통과" 가 아니라 "검수를 못 했다" 이다).
  로직 정본 → `codex-review.md §Step 7`.
  ⚠️ 이 강등은 **이 레인(codex-review) 한정**이다. `/forge-pr §Step 3` 이 부르는 정규 경로
  (`/forge-multi`)는 `combined<60` 기준을 따로 쓰고 그 FAIL 은 `[STOP]` 이다.
- 결과: `forge-outputs/docs/reviews/final/{date}-{slug}.{md,json}`

## ⚠️ 함정 — 대상이 크면 **번들 1개로 인라인**하라

MCP 도구는 **900초 상한**. 대상을 경로로만 주면 레포 탐색으로 **`timed out after 900s`** 로 죽는다(파일 수가 적어도).
**우회**: 검수 대상 파일 전문을 한 파일로 묶어 그 경로 하나만 준다.

```bash
OUT=/tmp/cr-bundle.txt
{ for f in <대상파일들>; do
    printf '\n########## FILE: %s ##########\n' "$f"
    git show <커밋>:"$f" | nl -ba -w5 -s'  '
  done; } > "$OUT"
# 프롬프트: "레포를 탐색하지 마라. $OUT 하나만 읽어라."
```

번들이 수십만 자로 커지면 **검수 축을 쪼개 2회로 나눈다**.

## 리뷰 포커스

통합 검수 — PR 전체 관점:
- Spec 추적성 (FR ↔ 구현 ↔ 테스트 매핑)
- 롤백 가능성 (forward-only migration 등 비가역 변경 식별)
- UX 일관성 (디자인 토큰 위반, 3-state 누락)
- 보안 (인증·권한·시크릿)
- 성능 회귀 (벤치마크 +10% 초과)
- 마이그레이션 안전성 (다운타임, 데이터 손실)

## 비용

$0.00 (ChatGPT 구독 3계정, gpt-6-sol — OAuth 호출 가능) / 비상 폴백(apikey 시): xhigh effort 는 종량. 단순 변경은 자동 스킵.

## Completeness Critic (P-6)

`stage=final` 진입 시 completeness critic이 **default-on** 자동 활성. 명시적 `crCompleteness:false` 또는 `'off'` 전달 시 비활성(롤백). 비-final 스테이지는 기존 opt-in(기본 off) 유지.

## 관련

- 본명령: `/codex-review --stage final --effort xhigh --blocking`
- Forge Dev P7 Check 7-X 통합 지점이지만 **자동 호출 기본 off** — `CODEX_REVIEW_AUTO_STAGES` 에 `final` 을 넣거나 `all` 이어야 게이트가 돈다(`.claude/hooks/codex-gate-enforce.sh`). 평소엔 **수동 호출 전용**. 자동 트리거 훅은 없다.
- `/forge-pr §Step 3` 의 cr-final(= `/forge-multi`)은 **다른 레인** — 이 스위치와 무관하게 돈다.
- 정책: `~/forge/dev/rules-on-demand/codex-review-policy.md`
