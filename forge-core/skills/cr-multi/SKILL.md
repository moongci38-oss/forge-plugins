---
name: cr-multi
description: "Multi-worker 검수(Codex+Gemini Double / Opus+Codex+Gemini Triple). 트리거: /cr-multi, /cr-double, /cr-triple, plan/spec 저장 후 자동, plateau 3회 자동승격."
---

## 게이트 증거 — 발행 주체는 **훅**이다 (안 A, 2026-08-09 / D1-B 관측·판정 분리 유지)

쉬운 설명: 검수 답안지를 시험 본 사람(LLM)에게 제출시키던 걸 그만뒀다. 이제
**감독관(훅 스크립트)이 시험 기록부를 읽어 대신 제출한다.** 워크플로는 감사 저장소에
어떤 경로로도 쓰지 않는다.

워크플로는 **관측한 raw legs 만** 남긴다. **판정(verdict·score)·바인딩(base_sha·
diff·provenance)은 쓰지 않는다** — 그건 게이트가 계산한다.

```
발행자: .claude/hooks/cr-evidence-emit.py   (SubagentStop + Stop 경유, 결정론 코드)
소스  : <project>/<session>/workflows/wf_<runId>.json   (워크플로 실행 기록)
착지  : ${FORGE_OUTPUTS:-$HOME/forge-outputs}/.claude/audit/cr-evidence/{stage}/{slug}-{stage}.json
원장  : ${FORGE_OUTPUTS:-$HOME/forge-outputs}/.claude/audit/cr-evidence/emit-log.jsonl
포맷: {legs[{worker,score,summary,issue_count,critical,high}], mode, expected_legs, stage, run_id, head_sha}
      + provenance {emitted_by, emitted_at, head_sha_at, wf_run_id, wf_finished_at, repo_root}
```

- `head_sha` = **훅이 `git -C <repoRoot> rev-parse HEAD` 로 직접 취득한 full 40자**.
  LLM 이 넘긴 값은 어떤 경로로도 쓰지 않는다. `qa-event-router.sh` 의 cr-final 바인딩
  검사가 이 값을 소비한다. 없으면 그 게이트는 상시 미바인딩 WARN
  (`FORGE_CR_EVIDENCE_STRICT=1` 이면 상시 차단)이 된다.

- **왜 판정을 안 쓰나**: 에이전트가 `verdict:PASS` 를 파일로 써넣는 행위가 위조와
  구분되지 않아 안전 분류기에 반복 차단됐다(실측 3회 연속).
  ⚠️ **2026-08-08 정정 — 종전 이 자리에 있던 "raw legs(관측)는 통과한다"는 반증됐다.**
  분류기는 payload 의 필드 이름이 아니라 *에이전트가 감사 저장소에 리뷰 결과를 손으로
  쓰는 행위 자체*를 본다. raw-legs write 도 `[cr-evidence-emit] blocked` 로 2건 차단됐다
  (PR #186·#188). `verdict` 필드를 빼는 것으로는 해결되지 않는다 — 그래서 주체를 옮겼다.
  근거: `harness-gaps/2026-08-08-cr-multi-evidence-emit-rootcause.md` §F-7·§3-1.
- **누가 판정하나**: `codex-gate-enforce.sh` 가 `review-evidence-verdict.py --compute` 로
  verdict 를 재계산하고, base_sha·diff 는 gh/git 에서 자체 취득한다.
- **트리거**: `SubagentStop`(워크플로가 subagent 로 돈 경우) + `Stop`(Human 이 메인
  세션에서 `/forge-pr`·`/cr-final` 을 **직접** 부른 경우 — G-3, 2026-08-09). Stop 등록은
  `bash shared/scripts/register-forge-hooks.sh`(사람 1스텝)가 담당한다.
- **발행 조건**: stage ∈ {code,test,bugfix,final} + 워크플로 `status=completed`
  + `repoRoot` 인자 존재 + 워크플로 종료 후 1시간 이내(`CR_EVIDENCE_MAX_AGE_S`).
  - **종결/재시도 구분(G-1)**: `SKIP_NOT_COMPLETED`(아직 진행 중)·일시 오류는 **재시도
    가능**이라 나중에 완료되면 발행된다. `EMITTED`·영구 스킵만 종결로 잠긴다 — 워커가
    먼저 끝나 미완료 스캔이 나와도 그 런이 영영 미발행되지 않는다.
  - **덮어쓰기 경쟁(G-2)**: 같은 slug/stage 에 다른 런의 증거가 있으면 **더 새 런일 때만**
    교체하고, 오래됐거나 판단 불가면 보존한다(원장에 근거 기록).
  - **동시 발행 경쟁(H-2 / C-1·C-2)**: 잠금은 최종 경로가 **아니라** sentinel
    (`<증거>.json.claim`)에 건다. 잠금 안에서 판정→쓰기→원자적 교체→사후확인을 모두 하므로
    최종 경로에는 **완성된 내용만** 나타난다(0바이트 증거가 원리적으로 불가능).
    잠금이 잡히지 않으면 `SKIP_LOCK_BUSY`, 사후확인이 남의 런을 보면 `SKIP_LOST_RACE` —
    둘 다 **재시도 가능**이라 다음 스캔에서 다시 판정한다(영구 잠김 아님).
  같은 `wf_run_id` 는 **절대 재발행하지 않는다** — 한 번 종결(EMITTED 등)로 기록되면
  그 뒤 어떤 줄이 붙어도 잠금이 유지된다(sticky, H-1). 재발행하면 리뷰하지 않은 커밋에
  바인딩을 날조하게 되기 때문이다.
  **발행/스킵/실패/비활성(off) 전부 원장 1줄** — 침묵 실패 없음.
  ⚠️ 단 이 보장은 **발행기가 실제로 실행된 경우**에 한한다. 훅은 세션의 workflows
  디렉터리가 있을 때만 발행기를 띄우므로(비용 가드), cr-multi 를 한 번도 안 돌린 세션은
  원장에 아무 줄도 남지 않는다 — 그 세션엔 애초에 발행 대상이 없다.
  ⚠️ **PR 컨텍스트 요건은 폐지됐다**(종전 `gh pr view` 선행 조건). 그 조건이 CWD 불일치
  시 조용한 skip 의 주 원인이었고(rootcause §4-2), 게이트는 어차피 head_sha 로 매칭하므로
  PR 밖 리뷰 증거가 있어도 해롭지 않다. 오히려 exact 바인딩 표본이 늘어 STRICT 승격이 빨라진다.
- kill-switch: `FORGE_CR_EVIDENCE_EMIT=off`(off 여도 원장에 `DISABLED` 1줄 — G-6).
  fail-open(AD-168) — 발행 실패가 검수·머지를
  막지 않는다.
- ⚠️ **게이트가 소비하는 증거는 이 경로뿐이다.** `/cr-code`·`/cr-final` 등 `/codex-review`
  래퍼는 `docs/reviews/` 에 쓰므로 이 게이트를 통과시키지 못한다 — 게이트 stage 충족은
  `/cr-triple`·`/cr-double`(= cr-multi) 경유로만 된다.
- 자동 게이트는 기본 off(`CODEX_REVIEW_AUTO_STAGES`, `.env`). 검수 판정은 Workflow
  반환값(combined/verdict)으로 사람이 읽는다.


## Quick Start

```bash
# Double (기본 — Codex + Gemini)
/cr-double ${FORGE_OUTPUTS:-$HOME/forge-outputs}/11-platform/pipelines/plans/my-plan.md

# Triple (plateau 자동 승격 또는 중요 spec)
/cr-triple ${FORGE_OUTPUTS:-$HOME/forge-outputs}/02-product/forge-platform/specs/my-spec.md
```

## Phase 0.5 — 과거 리뷰 회상 (advisory, fail-open — 2026-07-10)

워커 스폰 전 1회, 대상 파일명·도메인 키워드로 내부 지식을 회상한다:

```
/rag-search "{대상 slug} {도메인 키워드}" --top-k 5
```

- 히트 중 `docs/reviews/` 원문·wiki 노트가 있으면 **과거 지적 요약 3줄 이내**를 각 워커 프롬프트에 "이전 리뷰에서 지적된 패턴(재발 검사 대상)"으로 주입 — 같은 결함의 재발을 리뷰어가 우선 확인.
- 결과 없음/rag 미가용 = 그대로 진행(fail-open, 비차단). 회상이 리뷰 범위를 좁히는 데 쓰여선 안 됨 — 추가 렌즈일 뿐.
- 각 워커 프롬프트 상단에 **repo identity 1줄**(repo 이름 + 현재 HEAD SHA, 예: `# review-target: <repo>@<short-sha>`)을 주입해 워커가 어느 레포/커밋을 리뷰 중인지 앵커링 (cross-repo 혼선 방지, harness-gaps 2026-07-23 G-3).
- ⚠️ **stale review 배너 (2026-07-26 G2)**: 회상된 과거 리뷰 결과(`wf_<runId>.json` 의
  `result` 또는 그 인용)에 `reviewedSha`(아래 §산출물)가 있으면 현재 `git rev-parse HEAD`
  와 대조한다. 불일치하면 그 지적을 **"⚠️ STALE REVIEW: <reviewedSha 앞 8자> 시점 검수 —
  현재 HEAD 와 다르다, 재검증 없이 그대로 신뢰 금지"** 배너와 함께 참고용으로만 인용한다
  (실측 사례: run `wf_c3463a41-531` 의 지적 근거 코드가 이미 커밋 `a4572f8` 로 제거된 채
  그대로 재사용돼 이미 해소된 결함을 "수정"하는 데 워커가 투입될 뻔했다). `reviewedSha`
  가 없는 과거 결과(이 필드 도입 이전 실행분)는 최신성 **비교 불가**로 취급 — stale 아님과
  동일시하지 말 것.
  대상이 diff/파일이었으면 `reviewedTargetHash`(대상 sha256)도 대조한다 — **SHA 가 같아도
  같은 HEAD 위에서 다른 diff 를 검수한 결과일 수 있다**(cr-final pr267-chunk2 HIGH). 해시가
  다르면 같은 SHA 라도 stale 로 취급한다.

## Corpus(대량 문서) 검수 — 3레그 필수화 (2026-07-23 HG-7)

외부 인용이 많은 산출물(yt/daily/weekly 등 리서치 리포트, 코퍼스 전반)을 `/cr-multi`로
적대적 검수할 때는 아래 3가지를 **필수화**한다. 코드가 아니라 검수 절차 표준이다.

**발화 사실**: 1차 corpus 검수가 `full_text`만 공급하고 웹 팩트체크 없이 내부 일관성만
봤다가, (a) 타임스탬프 8/8을 false-positive로 오판(`timestamped_text` 미공급이 원인), (b)
daily의 실존 버전명("Gemini 3.6"·"v2.1.217"·"Kimi K3")을 '날조'로 오판(웹검증하니 전부
CONFIRMED — 실제 결함은 provenance 미기재였을 뿐), (c) 설명란에 실재하는 수치를 '조작'으로
오판, (d) 실제 출처가 있으나 연도·귀속이 뒤섞인 인용("Faros 2025→2026", "4.6배=LinearB")을
'날조'로 과대 규정했다. **결과: '정정'이 오히려 참인 사실을 거짓으로 라벨링했고, 코퍼스
오염 위험이 실제로 발생했다**(사후 롤백함).

**필수 3레그**

1. **완전소스 공급** — 검수 프롬프트에는 보존된 소스 **전량**을 인라인한다
   (`full_text` + `timestamped_text` + `comments` + `description_links` 등, yt 기준). 부분
   공급 시 부재축은 "검수범위 외"로 명시하고 그 축에 대한 판정을 내리지 않는다. 없는
   자료를 근거로 "확인 불가하니 틀렸다"고 판정하는 것이 이 갭의 핵심 실패 패턴이다.
2. **웹-verify 레그** — 실제 웹 검색으로 인용·수치·버전명을 CONFIRMED/REFUTED/출처불명
   중 하나로 판정하는 레그를 별도로 둔다. 원문 대조 없이 "그럴듯하지 않다"는 인상만으로
   내리는 판정은 이 레그의 몫이 아니다.
3. **레포 sys-verify 레그** — 시스템/코드 관련 주장(존재 여부·설정값 등)은 레포를 직접
   열어 대조하는 레그가 맡는다(내부 문서·rag만으로 판정하지 않는다).

**라벨 규율**: `'날조'`/`'조작'` 라벨은 **웹-verify 레그가 REFUTED로 확정했을 때만** 붙인다.
raw 자료가 애초에 수집되지 않았거나 부분 공급된 경우는 `'날조'`가 아니라
**`'provenance 결함'`**으로 분리해 명명한다 — 두 라벨을 섞으면 "확인 못 했다"가
"거짓이다"로 승격돼 참인 사실이 오염된다.

## 모드

| 모드 | Worker | 합산 |
|------|--------|------|
| Double | Codex + Gemini | `codex×0.6 + gemini×0.4` |
| Triple | Opus + Codex + Gemini | `opus×0.35 + codex×0.35 + gemini×0.3` |

## 산출물

1. **Workflow 반환값** — 사람이 읽는 검수 결과(`verdict`/`combined`/`issues[]`/`degraded`/
   `evidence_tier`/`reviewedSha`). 판정은 여기서 확인한다.
2. **게이트 raw-legs**(위 §게이트 증거) — 관측 데이터만, PR 컨텍스트 + gate stage 한정.

> ⚠️ 구 `docs/reviews/{stage}/{slug}-cr-multi.json`(AD-90 증거 JSON) 발행은 **폐지됐다**
> (2026-07-24 v2에서 workflow.js의 파일 발행 제거 — 현재 이 경로를 쓰는 코드는 없다).
> 게이트가 소비하는 증거는 raw-legs 경로뿐이다.

**`INVALID_INPUT` — 입력 실패는 품질 판정이 아니다 (2026-07-29, A-1b 세션 실발화)**

대상을 읽지 못했을 때 `verdict:'INVALID_INPUT'` + `score:null` + `inputRejected:true`가 반환된다.
과거에는 이 경우도 `verdict:'FAIL'`/`score:0`이었고, 실제로 **읽지도 못한 코어를 "0점"으로 오독**했다.

| `issues[].code` | 뜻 | 대응 |
|---|---|---|
| `too_large` | 청크 로더 상한(600줄)과 폴백 상한(256KB)을 **동시** 초과 | 논리 단위로 나눠 개별 호출 |
| `not_found` | 경로를 에이전트 셸에서 읽지 못함 | 존재 여부 + 경로 표기 확인(백슬래시는 슬래시로 정규화됨) |
| `content_mismatch` | 확보한 내용이 원문과 불일치(폴백이 요약했거나 리뷰 중 파일이 바뀜) | 나눠서 재호출 |

⚠️ **`INVALID_INPUT`은 PASS도 WARN도 FAIL도 아니다** — 머지·진행 판단의 근거로 쓰지 말고
입력을 고쳐 **재호출**한다. 점수를 인용하지 말 것(`score`는 숫자가 아니라 `null`이다).
`combined`·`scores`·`results`는 이 반환에 **없다**(검수가 수행되지 않았으므로) — 소비자는 null-safe로 다룰 것.

**degraded 표기 의무 (Batch 3 증거등급 정직화)**: `degraded=true`(worker 정족수 미달 — 외부 워커 Codex/Gemini 미가용으로 동일 모델 대체 등)면 사람이 보는 최종 결과(Workflow 반환값)에 `degradedBanner`("⚠️ DEGRADED: N/M worker 생존 — 근거등급 낮음") 필드가 additive로 포함된다. 이 검수 결과를 인용·보고할 때 배너를 함께 표기할 것 — "3-LLM 적대 검수"로 재현하지 않는다.

**`evidence_tier` (증거등급, Batch 3-2)**: `degraded`·워커 생존 수 **그리고 원문 확보 등급**에서 파생되는 필드(신규 판정 로직 아님 — 두 입력의 낮은 쪽을 따른다).

| tier | 의미 |
|------|------|
| `full` | 정족수 충족 — 전 레그 참여, 가중합산 |
| `degraded` | 일부 워커 생존(2/3) — 균등평균으로 강등 계산. **3-LLM 합의 아님** |
| `unverified` | 단일 워커 이하 — 근거등급 최하 |

**tier가 `full`이 아니면 WARN + 고지**한다. **[STOP] 게이트가 아니다** — 흐름은 계속하되, 점수만 보고 "3-LLM 검수 통과"로 오독하는 것을 막는 것이 목적이다. 이 검수를 인용할 때 tier를 함께 표기하라.

**`content_integrity` (원문 확보 등급, 2026-08-18 — 갭 마감 §제안 B)**: 검수 대상 파일을
**실제로 얼마나 확실하게 읽었는지**를 말하는 필드. 위 `evidence_tier` 에 **상한**으로 걸린다.

쉽게 말하면 — 종전에는 시험지를 절반만 받고 채점해놓고 "전부 확인함"이라 적을 수 있었다.
이 필드가 "절반만 받았음"을 적게 만든다. 점수 계산식은 건드리지 않는다.

| `content_integrity` | 뜻 | `evidence_tier` 상한 | 머지 |
|---|---|---|---|
| `verified` | 청크 검증 로더가 전량 확보(바이트 정확 일치 + CRC) | 없음 | 진행 |
| `unverified` | 폴백 스냅샷으로 확보 — **캡처 시점 바이트 대조는 통과**, 출처 검증 없음 | `degraded` | 진행(고지) |
| `unchecked` | File Pre-load 로 확보 — **캡처 시점 대조가 아예 없음** | `unverified` | ⛔ [STOP] |
| `lost` | 청크 유실 후 폴백도 실패 — **원문 없이 낸 판정** | `unverified` | ⛔ [STOP] |
| `none` | `targetPath` 없음(staged changes 모드) | 없음 | 진행 |

⚠️ **`unchecked` 와 `unverified` 를 한 칸에 넣지 않는다**(2026-08-18 신설). 원문 확보 경로는 셋이고
(청크 로더 → 폴백 스냅샷 → File Pre-load), 마지막 경로만 **캡처 시점 대조가 없다**. 둘을 같은
이름표로 부르면 "느슨하게라도 확인했다"로 읽혀 실제보다 후하게 보고된다.
쉽게 말하면 — *"검사해보니 괜찮았다"* 와 *"검사를 안 했다"* 를 같은 칸에 적지 않는 것이다.
근거: PR #282 cr-final 2차 HIGH(codex 레그) — 코드가 `unverified` 를 쓰는데 이 표의 정의는
"대조는 통과"였다. 정의와 코드가 어긋난 채로 두면 게이트가 아니라 장식이 된다.

⚠️ **`lost` 는 `PASS` 를 낼 수 없다 — 자동으로 `WARN` 으로 낮추고, `/forge-pr` 이 [STOP] 한다.**

이 두 겹이 **둘 다 필요하다.** 처음엔 verdict 강등 하나로 닫았다고 생각했는데, PR #282 의 cr-final
검수가 그게 **아무것도 막지 못한다**고 적발했다(HIGH): `forge-pr.md` 의 자동 머지 조건이
`PASS/WARN → 자동 머지`라서, `PASS` 를 `WARN` 으로 낮춰봐야 **똑같이 머지된다.** 오직 `FAIL` 만 멈춘다.
그래서 `forge-pr.md §Step 3` 에 `content_integrity` 처리표를 따로 넣었다(산문 지시 — 아래 ⚠️ 참조).

쉽게 말하면 — 문에 자물쇠를 달았다고 생각했는데, 그 문이 애초에 늘 열려 있는 문이었다.
자물쇠(verdict)만으로는 안 되고 문틀(forge-pr 게이트)을 같이 고쳐야 했다.

`FAIL` 이 아니라 `WARN` 인 이유는 코드가 나쁘다는 증거가 없어서다 — 우리가 못 읽었을 뿐이다.
차단은 verdict 가 아니라 전용 게이트가 담당한다. 강등 사유는 `content_integrity_reason` 에 실려 나간다.

⚠️ **`unverified` 는 의도적으로 verdict 를 막지 않는다** — 상한(`degraded`)만 건다. 폴백으로라도
원문을 손에 넣었고 바이트 대조를 통과한 상태라, 여기서까지 머지를 세우면 정상 경로가 상시 막힌다.
다만 **CRC 미검증이라 "동일 길이 치환"(T5 가 증명하는 그 구멍)은 못 잡는다** — 이 위험은 남아 있고,
`evidence_tier=degraded` 표기로만 알린다. 근거: PR #282 cr-final MEDIUM 지적, 의도적 미채택.
폐기조건: `unverified` 상태에서 놓친 결함이 실제로 관측되면 `lost` 와 같은 취급으로 올린다.

근거: base64 청크 차단 갭(2026-08-17) — 58 레그 중 44 가 대상을 못 읽었는데 판정은 `PASS` 로 나갔다.
차단 자체는 평문 전환으로 없앴지만 **"유실돼도 PASS 가 나가는 구조"** 는 그대로였고 그게 이 갭의 본체다.
회귀 테스트: `tests/plaintext-chunk-integrity.test.mjs` T11~T13 (재현: `node --test .claude/skills/cr-multi/tests/plaintext-chunk-integrity.test.mjs`).
폐기조건: 청크 로더가 폴백 없이 항상 전량 확보를 보장하게 되면 `lost`/`unverified` 분기를 재검토한다.

**`reviewedSha` (검수 대상 SHA 기록, 2026-07-26 G2)**: `repoRoot`가 pin됐을 때만
`git -C <repoRoot> rev-parse HEAD` 를 **경량 레그(haiku)에 시켜** 취득해 반환값에 싣는 40자 hex
git SHA. `repoRoot` 미pin이거나 취득 실패면 `null`(오손값을 진짜처럼 싣지 않음 — 필드
부재가 오손값보다 안전). 이 결과를 나중에 재사용할 때(§Phase 0.5 과거 리뷰 회상 등)
현재 HEAD와 대조해 불일치면 stale로 취급한다.
⚠️ **pin↔toplevel 일치 게이트(2026-08-20)**: 같은 명령 묶음에서 `rev-parse --show-toplevel` 을
함께 받아 pin 과 **문자열이 일치할 때만** SHA 를 싣는다. 불일치·공백이면 `null` + `[ReviewedSha][WARN]`
배너다. 쉽게 말하면 **심부름꾼이 지정한 방에 못 들어갔으면 빈손으로 돌아오게** 만든 것이다 —
종전에는 못 들어가자 **자기가 서 있던 방 번호**를 적어 왔고(교차 워크트리 격리 가드가 `git -C` 를
정상 차단한 상황), 40자 hex 형식이 완벽해서 아무도 걸러내지 못했다. 실측: PR #299 r4 의
`reviewedSha=213bd55c…` 가 검수 대상(pr-b)이 아니라 **pr-d 브랜치**의 커밋이었다.
근거: `harness-gaps/2026-08-19-reviewed-sha-wrong-branch-under-worktree-guard.md`.
회귀 테스트: `tests/reviewed-sha.test.mjs` (재현: `node --test .claude/skills/cr-multi/tests/reviewed-sha.test.mjs`).
운영 지침은 그대로 유효하다 — **검수를 띄웠으면 결과를 받을 때까지 워크트리를 옮기지 않는다**
(백그라운드 레그는 띄운 시점이 아니라 **그때그때의 세션 cwd** 를 따라간다).
⚠️ **게이트(`_cr_final_evidence_ok`)의 head_sha 와는 별개다** — 게이트 값은
`cr-evidence-emit.py` 훅이 워크플로 종료 *후* 독립적으로 다시 구한 것이고(안 A, LLM
자기보고 불신), 이 `reviewedSha`는 워크플로 실행 *중* 자기보고한 값이다. 게이트 판정에는
이 필드를 신뢰 입력으로 쓰지 않는다 — 게이트 밖에서 결과를 직접 재사용하는 사람/세션을
위한 필드다.
**`reviewedTargetHash` (검수 대상 내용 해시, cr-final pr267-chunk2)**: 대상이 파일(diff 등)일 때
그 sha256 을 같은 방식으로 각인한 64자 hex. SHA 는 repoRoot HEAD 만 식별하므로 같은 HEAD 위
서로 다른 diff 검수를 이 필드로 구별한다. `null` = staged 모드이거나 취득 실패(내용 대조 불가).
트러스트 경계는 `reviewedSha` 와 동일 — 정보 계층이며 게이트 신뢰 입력이 아니다.

**`inconclusive_legs` (미응시 레그, 2026-08-11 · 2026-08-20 확장)**: 레그가 스스로 "나는 검수를
수행하지 못했다"고 선언하면 그 레그는 **분모에서 빠진다**(빵점과 미응시는 다르다). 선언 자리는
두 곳뿐이다 — **summary 첫 줄** 또는 **issue description 선두**, 형태는 `INCONCLUSIVE(<사유>)`.
자유 텍스트 아무 곳의 "inconclusive"는 신호가 아니다.
⚠️ **2026-08-20 확장**: summary 첫 줄 선언은 **점수와 무관하게** 인정한다. 종전에는 `score>0`이면
선언을 읽기도 전에 "검수했다"로 단정해서, 레그가 `50`을 **"미평가 자리표시자"**라고 본문에 적어도
그 50이 평균에 산입됐다(실측 r5: `scores=[92,78,50]` · `inconclusive_legs=[]` · combined 73.3 —
**응시하지 않은 채점자의 백지 답안이 판정을 끌어내렸다**).
⚠️ **제외가 게이트를 느슨하게 만들지는 않는다** — ①실질 지적(critical/high/medium)이 하나라도
있으면 선언해도 제외하지 않고(그 레그는 검수를 한 것이다) ②`_gateLegs`가 제외분까지 보므로
critical/high 는 그대로 판정에 살아남는다.
근거: `harness-gaps/2026-08-19-reviewed-sha-wrong-branch-under-worktree-guard.md` §관측②.
회귀 테스트: `shared/scripts/cr-multi-inconclusive-leg.test.js` T13
(재현: `node shared/scripts/cr-multi-inconclusive-leg.test.js`).
폐기조건: 레그 스키마에 `performed:boolean` 같은 명시 필드가 생기면 문자열 판별을 버린다.

**집계 자가대조 (Batch 3-3)**: 리포트 헤더·요약의 **집계 숫자는 본문 항목표에서 기계 도출**(`grep -c` 등)하거나 작성 직후 자가 대조한다. **헤더 숫자는 그 자체가 검증 대상이다** — 눈으로 센 값을 쓰지 마라. (목록형 산출물의 헤더 집계 오류 4회 실증. 이 세션에서도 harness-diet가 `skills_count: -97`이라는 허구 수치를 보고했다.)

## 보안

- Secret 사전 스캔 (전송 전 차단)
- `CR_MULTI_AUTO=off` 기본 (명시 opt-in 필요)
- 감사 로그: `${FORGE_OUTPUTS:-$HOME/forge-outputs}/.claude/audit/cr-multi-calls.jsonl`

## Cache Stats 로깅 (AD-105 H2)

cr-multi 실행 후 usage 데이터 기록:
```bash
bash $HOME/.claude/scripts/cache-stats-logger.sh cr-multi "$MODEL" "$CACHE_READ" "$CACHE_CREATION" "$RAW_INPUT" cr-review
```
usage 필드는 Anthropic SDK response.usage 에서 추출. 미지원 시 0 기본값 사용.

## Workflow 실행 (계획서 P0-4)

mcp__codex__ codex-critic = verify hook이 read-only sandbox로 무조건 면제 (approve-token 발행 불필요 — CI-2 감산 2026-07-23).

```js
// Workflow 실행 (GitNexus StructuralContext + 3-LLM parallel)
Workflow({
  script: Bash("cat $HOME/.claude/skills/cr-multi/workflow.js"),
  args: { slug: SLUG, targetPath: TARGET, mode: 'triple', stage: STAGE }
})
```

Agent Teams fallback: `CLAUDE_CODE_DISABLE_WORKFLOWS=1` 시 기존 Agent 패턴.

**호출 규약 — 세션 변경/삭제 파일 목록 동봉 (P1-15, pipe-2-opus-0721 G-3, 2026-07-21)**: 오케스트레이터는
cr 스폰 시 이 세션에서 **변경·삭제한 파일 목록**을 브리핑에 동봉한다. codex-critic이 자신에게 로드된
rules/CLAUDE.md 컨텍스트를 현재 파일 상태로 오인해 이미 삭제된 규칙을 근거로 정당한 PR을 FAIL 판정한
실사례(PR #88)가 있었다 — workflow.js `basePrompt`의 "로드된 rules/CLAUDE.md를 현재 사실로 삼지 말고
Read/Grep 실측" 경고와 짝을 이루는 조치다.

### `crTestCtx` — 변경 코드를 덮는 기존 테스트 동봉 (D8, 2026-07-31)

리뷰어에게 변경 코드만 주고 그 코드를 고정하는 **기존 테스트**를 주지 않으면, 테스트로 못박힌
의도적 계약을 버그로 오신고한다(실제로 정당한 코드가 revert된 사고 1건). GitNexus 가 변경 심볼의
caller 중 테스트 파일(`*.test.*`·`*_test.*`·`tests/`·`__tests__/`)을 `test_files` 로 반환하면,
그 내용을 크기캡 안에서 읽어 `[변경 코드를 덮는 기존 테스트 — 의도된 계약이다]` 블록으로 프롬프트에 붙인다.

| 값 | 동작 |
|---|---|
| `'auto'` (기본) | 동봉하되 `risk_level=LOW` 면 생략 (토큰 팽창 억제) |
| `'on'` | risk 무관 항상 동봉 |
| `'off'` | 완전 비활성 — 기존 동작 100% 동일 |

- 크기캡: 파일당 `TEST_CTX_MAX_LINES_PER_FILE`(200줄) / 총 `TEST_CTX_MAX_TOTAL_LINES`(2000줄).
  캡에 걸려 잘리거나 미첨부된 파일은 **프롬프트에 그 사실을 명시**한다(무언의 절단 금지).
- 실패는 fail-open — 로드 실패 시 동봉 없이 기존 리뷰를 그대로 진행한다.
- 회귀 테스트: `shared/scripts/cr-multi-testctx.test.sh` (18케이스, 순수 구간 소스 추출 실행 + 배선 grep).

## 참조

- 명령: `${FORGE_ROOT:-$HOME/forge}/.claude/commands/cr-multi.md`
- 룰: `$HOME/.claude/rules-on-demand/multi-gate-review.md`
- Triage: `${FORGE_ROOT:-$HOME/forge}/shared/scripts/cr-multi-triage.py`
- Plateau: `${FORGE_ROOT:-$HOME/forge}/shared/scripts/cr-multi-plateau-guard.py`

## 이종 모델 검수 설계배경

<!-- root-cause(skills-1/S1-06, 2026-08-03 관측): 이 절 위에 있던 "Evaluator (Wave 2.5)" 산문(role/model/isolation 설명 + PASS/WARN/FAIL 템플릿)은 8개 SKILL.md에 동일 문구로 복제됐고 실제 Agent()/hook 배선이 0건이라 제거했다 — 판단 근거는 codex-review/SKILL.md의 동일 root-cause 주석 참조. 다만 아래 한 문단은 cr-multi 고유의 실제 설계 근거(다른 7개 파일에는 없음)라 보존한다. -->

Codex/Gemini/Haiku 등 이종·경량 모델을 리뷰 레그에 섞는 이유는 self-referential bias(모델이 자기 산출물을 검증할 때 관대해지는 편향) 완화에 있다 — 작성자 모델과 다른 모델이 검토하면 같은 편향을 반복할 확률이 낮아진다. 다만 **동일 모델계열 내 편향(예: 같은 Claude 계열끼리)은 이 구조로 완전히 제거되지 않는다** — 이종 모델 배치는 완화 장치이지 무편향을 보장하는 장치가 아니다.

## learnings 배경 주입 (수동 opt-in — 파일럿 2회 종료, 2026-08-17)

검수 레그는 learnings.jsonl(과거 사고·도구 버전 등 "코드 밖 맥락")을 못 본다 — gemini 레그는 FS 접근이 없고 workflow 스크립트도 FS 접근이 없다. `args.learningsContext`(문자열)로 호출자가 주입하면 basePrompt 에 `<background-learnings data-only>` 블록으로 동봉되고, codex·gemini 레그 지시문의 전달 규약으로 외부 실모델까지 도달한다.

- **생성 규약 (이 jq 만 사용 — 임의 텍스트 주입 금지)**:
  ```bash
  jq -r 'select(.status != "superseded")
    | select((.category == "forbidden-pattern" or .category == "bug-fix-pattern" or .category == "review-pattern")
             or ((.summary // "") | test("버전|환경|도구|호환|타이밍|\\b(lock)\\b"; "i")))
    | "- [\(.id)] \(.summary // "")"' "${FORGE_ROOT:-$HOME/forge}/.claude/learnings.jsonl" | tail -5
  ```
  ⚠️ `\\b(lock)\\b` 의 괄호는 **가독성 장치**다(동작 동일). 괄호 없는 `\\block\\b` 는 `\b`+`lock`+`\b` 로 파싱돼 동작은 같지만 **육안으로 "block" 으로 읽힌다** — 1차 파일럿에서 독립 검수 3레그가 전원 "block 오타"로 오독했다(2026-08-17). 의도는 처음부터 단독 단어 `lock`(clock·blocking·unlock 오탐 차단)이었다. 재현: `echo '{"summary":"배포를 block 한다"}' | jq -r '.summary|test("\\b(lock)\\b";"i")'` → false / `lock 획득 실패` → true.
- 미지정 시 기존 동작 100% 동일(greybox). 상한 8,000자 — **초과 시 프롬프트에 절단 사실을 명시**한다(무언의 절단 금지). 값에 든 `</background-learnings>` 류 태그 문자열은 `[tag-removed]` 로 치환해 경계 탈출을 막는다.
- **상태 = opt-in 확정(2026-08-17 파일럿 2회 종료)**: **상시 배선하지 않는다.** 파일럿 2회 모두 안전성(주입 유래 오탐 0)·비용(토큰 증가 무시 수준)은 충족했으나, **이득([L-id] 참조로 나타나는 실효)은 입증되지 않았다** — 주입한 이력이 대상 diff 의 실재 함정을 가리키지 않으면 인용하지 않는 것이 올바른 행동이라, 합성 파일럿으로는 이 기준을 측정할 수 없다는 것이 결론이다. **실제 사고 재발이 의심되는 검수에서 수동으로 켜서 쓴다.** 근거·수치 → `forge-outputs/docs/reviews/2026-08-17-articles-0816-must-apply-verdict.md §파일럿 2차 결과`.
- ⚠️ 이 방어가 무력화되는 입력: 규약 밖 생성(명령형 문장이 든 임의 텍스트) — data-only 래핑이 완화하지만 계약의 절반은 "문서화된 jq 만 쓴다"이다.

## Plateau 조기 감지 (AD-118 SkillOps)

연속 2라운드 score 진전 <5점 = plateau 신호. 즉시 4 옵션 제시 (A 추가 라운드 / B AD-50 override(게이트 격하 1회 면제, Human 승인 필수 — pipeline.md AD-50) / C 폐기 / D 극단 단순화). D 우선 권고 (over-engineering 거부 — enforcement-theater-prevention 정합).

## 연속 실행 원칙 (No-Pause)

cr-multi 실행 중 중간 확인 요청 금지:
- 오케스트레이터는 Codex → Gemini → Opus 레그를 **중간 Human 확인 없이 연속 실행**한다.
- 각 레그 결과가 반환되면 즉시 다음 레그를 스폰한다 (중간 출력 보고 금지).
- BLOCKED 판정이 반환되면 그 시점에만 [STOP] Human 에스컬레이션. 나머지는 자동 진행.

## 금지 행동

cr-multi 워크플로 및 각 검수 레그가 반드시 준수해야 할 금지 사항:

① **점수 조작 목적의 이슈 추가 금지** — 점수를 올리거나 내리기 위해 근거 없는 이슈를 생성하지 않는다.
② **이전 라운드와 동일 이슈 재제기 금지** — plateau 라운드에서 같은 이슈를 새 언어로 반복하는 것은 찾은 척(fabrication). 새 근거 없으면 해소된 것으로 간주.
③ **Spec 범위 외 enterprise 기능 요구 금지** — SME(중소규모)·MVP 스코프에서 분산 트랜잭션·HA·다중 테넌시 등 미요구 기능을 critical로 요구하는 것은 over-spec.
④ **구현 의도 무시한 전면 재설계 요구 금지** — 작성자의 설계 방향을 이해하지 않고 아키텍처 전면 변경을 BLOCK 조건으로 내거는 것은 금지.
⑤ **플래그 없는 외부 소스 코드 복사 권장 금지** — 라이선스·출처 미확인 코드 그대로 붙여넣기를 권고하지 않는다.

## 리뷰 요청자 행동 규칙

cr-multi를 호출하는 requester(오케스트레이터·Human)가 준수해야 할 규칙:

⑥ **"간단한 변경이라" 리뷰 생략 금지** — 변경 크기와 무관하게 리뷰 단계 준수.
⑦ **Critical 이슈 무시 후 진행 금지** — Critical 미수정 = FAIL verdict 자동 발행 (기계 차단). 수동 override 시 Human 승인 필수 (AD-50).
⑧ **High severity 이슈 잔존 시 검토 의무** — verdict=WARN 수신 시 high 이슈 목록 확인 후 진입 여부 결정 (자동 차단 없음, 검토 의무 — prose rule).
⑨ **유효한 기술 피드백 무비판 동의 금지** — 피드백 내용을 실제로 검토 후 수용/거부 판단.

## 리뷰 워커 출력 요건

⑩ **미커버 실패 시나리오 명시 의무** — 각 리뷰 워커는 통과 보고된 검증이 커버하지 않는 실패 시나리오를 최소 1개 명시한다(해당 사항 없으면 "없음"으로 명시). 검증 커버리지의 사각지대를 리뷰어 스스로 적대적으로 자문하게 해, 통과 판정에 안주하는 것을 방지하기 위함이다.

