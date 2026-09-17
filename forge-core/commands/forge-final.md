---
description: Codex 적대적 최종 리뷰 — PR 머지 직전 (blocking, xhigh effort)
argument-hint: "<PR-N or branch> [--cr <on|degrade|off>]"
group: verify
---

# /forge-final

> ⚠️ 구 이름 **"/cr-final"** 는 2026-09-07 개명했다. 헬퍼 스크립트 파일명·감사로그·증거
> 경로(`cr-evidence/`)는 **그대로 둔다** — 쌓인 증거가 그 이름으로 묶여 있어서다.
> 근거: 간판만 바꾸고 배달 주소를 바꾸면 옛 증거가 통째로 안 보이게 된다.
> 폐기조건: 옛 증거를 더 안 읽어도 되면 헬퍼 파일명까지 후속 개명한다.

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

- 모델: gpt-5.6-sol (codex:high, xhigh effort, 적대적) — 2026-09-17 하향(구: gpt-6-astra). 최고급 astra 는 advisor 전용(사람 지시).
  ⚠️ 구 표기 "모델: gpt-6-astra (2026-09-06 상향) · `--sol` 도 하향 스위치" 는 2026-09-17 폐기 —
     이제 `--sol` 은 no-op(이미 기본), `--terra`/`--luna` 가 하향 스위치다. 실행 경로 정본 = `commands/codex-review.md §Step 2`.
- Blocking: YES — 단 **차단선은 `verdict` 가 아니라 `severity` 다**(2026-09-13 변경).
  `verdict=FAIL` 이어도 **critical/high 0건이면 WARN 으로 강등**하고 진행한다(medium/low 는 권고).
  ⛔ 강등에는 **자격 조건**이 있다 — `.issues` 가 배열이고, severity 가 전부 규격 4값이고,
  1건 이상이어야 한다. 셋 중 하나라도 어긋나면 **판정 불가**이므로 강등하지 않고 그대로 차단한다
  (`verdict=FAIL` + `issues:[]` 는 "통과" 가 아니라 "검수를 못 했다" 이다).
  로직 정본 → `codex-review.md §Step 7`.
  ⚠️ 이 강등은 **이 레인(codex-review) 한정**이다. `/forge-pr §Step 3` 이 부르는 정규 경로
  (`/cr-triple` = forge-multi)는 `combined<60` 기준을 따로 쓰고 그 FAIL 은 `[STOP]` 이다.
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

$0.00 (ChatGPT 구독 3계정, gpt-5.6-sol — OAuth 호출 가능) / 비상 폴백(apikey 시): xhigh effort 는 종량. 단순 변경은 자동 스킵.

## Completeness Critic (P-6)

`stage=final` 진입 시 completeness critic이 **default-on** 자동 활성 (2026-06-19). 명시적 `crCompleteness:false` 또는 `'off'` 전달 시 비활성(롤백). 비-final 스테이지는 기존 opt-in(기본 off) 유지.

## 관련

- 본명령: `/codex-review --stage final --effort xhigh --blocking`
- Forge Dev P7 Check 7-X 의 통합 지점이지만 **자동 호출은 기본 off** — `CODEX_REVIEW_AUTO_STAGES` 에 `final` 을 넣거나 `all` 로 켜야 게이트가 돈다. 평소에는 **수동 호출 전용**이다.
  ⚠️ 구 표기 "Forge Dev P7 Check 7-X에서 **자동 호출**" 은 2026-09-17 폐기 — 스위치가 꺼진 채로 "자동으로 돈다" 고 광고하고 있었다.
  근거: `.claude/hooks/codex-gate-enforce.sh:117` 이 `[ "${CODEX_REVIEW_AUTO_STAGES:-off}" = "off" ] && exit 0` 로 미설정=off 처리한다. 실측 2026-09-17 — 이 머신 env·양쪽 settings.json `env` 모두 미설정.
  재현: `echo "[${CODEX_REVIEW_AUTO_STAGES:-미설정}]"` → `[미설정]`
  ⚠️ `/forge-pr §Step 3` 의 cr-final(= `/cr-triple`)은 **다른 레인**이라 이 스위치와 무관하게 돈다 — 그쪽은 `forge-pr.md` 가 하드코딩 호출한다.
- **자동 트리거 훅 `cr-final-auto-trigger.sh` = ⚫ 2026-09-17 폐기(아카이브됨)**. 이 커맨드를 자동으로 띄워 주는 장치는 **없다**.
  사람 결정으로 `.claude/hooks-archived/cr-final-auto-trigger.sh` 로 **이동**했다(삭제 아님 — `git mv` 로 되돌릴 수 있다).
  이동 전 실측: 라이브 `settings.json` 양쪽(`~/forge/.claude/`·`~/.claude/`) 모두 0회 등장 · `settings.local.json` 도 0 ·
  `shared/scripts/register-forge-hooks.sh` 의 **DEPRECATED 목록**에 이미 등재돼 있었다("참조하는 마커(cr-final-passed-*)를 만드는 코드가 레포에 0건 — 항상 안내문만 내는 죽은 넛지, 2026-09-07").
  같은 날 `dev/scripts/forge-sync.mjs` 의 `HOOKS_ALLOWLIST` 에서도 뺐다. ⚠️ 미러(`~/.claude/hooks/`)의 기존 사본은 남는다(AD-168 사람 전용).
  ⚠️ `wiring-check.sh` 의 "배선 N곳" 수치는 라이브 등록 수가 아니다(하네스 갭 HG-1).
  재현: `bash shared/scripts/register-forge-hooks.sh --verify` → "폐기 목록인데 등록됨: 0개" · `ls .claude/hooks/cr-final-auto-trigger.sh` → 없음
  근거: "있는 줄 알았던 자동화" 를 문서가 계속 광고하면 다음 사람이 수동 호출을 건너뛴다.
  폐기조건: 이 훅을 되살려 라이브 등록하면 이 항을 갱신한다.
- 정책: `~/forge/dev/rules-on-demand/codex-review-policy.md`
