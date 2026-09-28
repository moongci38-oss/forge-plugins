# R2 러너 분기 · shadow 분기 (구 `/cr-triple` 본문에서 이관 — #1378)

> `/forge-multi` 커맨드 §R2 가 가리키는 상세. 이 파일이 정본이다.

# R2 러너 분기 — **기본 = new** (T8, 2026-09-24 · ENGINE 2.15.0 — 구 T6 "new 일 때만" 절을 본문 흐름으로 올렸다)

**이 절이 러너 선택의 정본이다**(`/forge-pr`·`/cr-double`·`/forge-multi`·`forge-multi/SKILL.md`·`codex-review/SKILL.md` 는 여기를 가리킨다).
- **기본(스위치 미설정) = new** — 샌드박스 밖에서 봉인한 번들을 `bundlePath` 로 넘긴다(아래 1~3).
- **되돌리기 = `FORGE_CR_ENGINE_RUNNER=legacy` 한 줄**(재배포 불필요) — `cr-run.sh pre` 가 `runner=legacy` 한 줄만 내고, 이 커맨드가 args 에 `runner: 'legacy'` 를 **명시**로 싣는다.
  엔진(2.15.0)은 번들 없이 runner 를 빠뜨린 호출도 legacy 로 fail-open 하지만, 롤백은 명시 릴레이가 계약이다(번들 조각이 섞여 와도 명시 legacy 가 이긴다).
- `shadow` 는 아래 §shadow 분기. 허용값 밖 값 = legacy(WARN).
(구 이름 `FORGE_CR_RUNNER` 는 `cr-trigger-run.py` 큐 러너 on/off 스위치라 겹친다 — 엔진 args 키 `runner` 만 그대로 쓴다. 사람 결정문의 `FORGE_CR_RUNNER=legacy` 는 이 `FORGE_CR_ENGINE_RUNNER` 를 뜻한다.)

1. **args 조각 확보** — `RUNNER_ARGS`:
   - `--runner-args <file>` 가 있으면 Bash(`cat <file>`) 를 JSON 파싱한 객체(= `/forge-pr §3.0` 이 `cr-run.sh pre` 로 만든 조각). 이 경우 post 는 부른 쪽이 한다.
   - `--runner legacy|shadow` 가 있으면 pre 를 부르지 않고 `RUNNER_ARGS = { runner: '<그 값>' }`(= `/forge-pr` 의 pre 가 `runner=legacy|shadow` 를 낸 경우). post 없음.
   - 둘 다 없으면 직접 pre: Bash(`bash ${FORGE_ROOT:-$HOME/forge}/shared/scripts/cr-run.sh pre --repo-root "$REPO_ROOT" --allow-unbound-final [--target <TARGET_PATH 의 레포 상대경로>] [--base <ref>] [--round-args <ROUND_ARGS>]`)
     → `rc≠0` 이면 **Workflow 를 부르지 않고 멈춘다**(`1` 차단: HEAD 이동·봉인 불일치·cap · `2` 판정불가 — 명시 `new` 에서만 난다).
     `rc=0` 출력으로 가른다: `runner=new` → `args_file=` 파일의 JSON · `runner=legacy`(스위치 또는 **자동 폴백** — `fallback=<사유>` 줄 동봉) → `{ runner: 'legacy' }` · `runner=shadow` → `{ runner: 'shadow' }`.
   - **자동 legacy 폴백**(기본 모드만 — 명시 `new` 는 폴백 없이 엄격): 분할 라운드 조각 round-args · 봉인 불가(too_large·dirty·레포 밖 대상) · 엔진 원문 청크 예산 밖(봉인은 되는 대형 diff) · cr-pre 판정불가(rc 2).
     대형 PR 에서 파이프라인이 멈추지 않게 하는 장치다 — 그 경우 legacy 가 `too_large` 를 내면 `/forge-pr §3.0` **분할 라운드** 경로로 간다. cr-pre **차단**(rc 1)은 폴백하지 않는다.
2. **병합** — 위 Workflow `args` 의 **맨 끝**에 `...RUNNER_ARGS` 를 붙인다(new: `runner`·`bundlePath`·`bundleSha`·`repoRoot`·`ssotVersion`·`reviewRunKey`|`allowUnboundFinal` / legacy·shadow: `runner` 한 키).
   ⛔ 번들 **내용**을 args 에 인라인하지 않는다 — args 는 호출자 모델의 도구 호출 본문으로 운반돼 대형 PR 번들(750KB)을 실어 나를 수 없다.
   엔진이 `bundlePath` 옆 사본(`.head.json`·`.target`)을 읽어 번들을 재조립하고 봉인 해시로 대조한다(어긋나면 `bundle_invalid` · 레그 0).
3. **post** — 1에서 직접 pre 를 불렀고 `runner=new` 였을 때만 Workflow 뒤 Bash(`bash ${FORGE_ROOT:-$HOME/forge}/shared/scripts/cr-run.sh post --repo-root "$REPO_ROOT" --allow-unbound-final --wf-run <runId>`).
   `rc≠0`(`stage=post-check`) = 레그 도중 HEAD 이동·번들 불일치 — **결과를 쓰지 않는다**. legacy·shadow·폴백이면 post 를 부르지 않는다.
- ⚠️ 이 절이 무력화되는 입력: ①1을 건너뛰고 조각을 손으로 만든 호출 — 엔진은 봉인 무결성만 보고 디스크·HEAD 진정성은 못 본다(원장 런이면 nonce 부재 = `unadmitted`).
  ②`runner=legacy` 출력을 args 로 옮기지 않은 호출 — 엔진이 번들 없는 미지정을 legacy 로 fail-open 해 같은 경로가 된다(WARN 한 줄).
- 재현: `bash shared/scripts/tests/cr-t8-default-switch.test.sh`(기본 new·롤백 한 줄·자동 폴백) · `bash shared/scripts/tests/cr-run.test.sh` · `bash shared/scripts/tests/cr-runner-branch.test.sh`(P절)
- 폐기조건: T9(구 엔진 제거) 때 legacy 되돌리기·자동 폴백 서술을 지운다(분할 라운드가 R2 러너에 배선된 뒤).

# shadow 분기 — `FORGE_CR_ENGINE_RUNNER=shadow` 일 때 (T7, 2026-09-24 · ENGINE 2.14.0)

판정: `FORGE_CR_ENGINE_RUNNER=shadow` 일 때(위 §R2 1의 pre 가 `runner=shadow` 를 낸다 — 2.15.0 부터 미설정 기본은 new). **pre/post 는 부르지 않는다**(`cr-run.sh` 는 shadow 에서 no-op — 봉인이 필요 없다).
- Workflow `args` 맨 끝에 `runner: 'shadow'` **한 키만** 붙인다(`bundle`·`bundlePath`·`reviewRunKey` 없음). 나머지는 legacy 흐름(위 Workflow 본문) 그대로다.
- 엔진은 판정·머지를 legacy 와 **바이트 동일**하게 내고, 같은 레그 출력으로 new 경로 판정(classifyLegs → computeVerdict)만 계산해 payload `shadow_compare` 로 싣는다(레그·심부름 재실행 0).
- 기록: `/forge-pr §3.0` 의 `cr-review-round.py record` 가 `${FORGE_OUTPUTS}/.claude/state/cr-shadow/<owner>__<repo>__pr-<N>-r<R>.json` 로 떨군다(rc·결정 무영향). 집계 = `python3 shared/scripts/cr-shadow-report.py`(rc 0 충족 · 1 불일치 · 2 판정 불가).
- ⚠️ 이 절이 무력화되는 입력: record 를 안 거치는 호출(`/cr-triple` 단독 · PR 없는 final) — 비교는 payload 에만 남고 파일은 안 생긴다(표본에서 빠질 뿐 불일치로 오판되지는 않는다).
- 재현: `bash shared/scripts/tests/cr-shadow.test.sh` · 폐기조건: T8 전환 뒤 구 엔진 제거(T9) 때 이 절을 지운다.
`ROUND_ARGS` 는 **`/forge-pr` 가 cr-final 을 부를 때** `cr-review-round.py prepare` 로 만든 파일이다. 없으면 r1 전수 리뷰(종전 동작).
`MACHINE_CHECKS` 는 같은 자리에서 `/forge-pr §3 (b)` 가 forge-lint·mutation-run 을 돌려 만든 `{ran, summary}` 파일이다(2026-09-16, ENGINE 2.4.0).
없으면 엔진이 제외 목록 없이 레그에게 전 축을 맡긴다 — 구멍은 없고 토큰만 더 쓴다.
⚠️ 이 키를 빠뜨리면 r2 도 무기억 전수 리뷰가 되어 **수렴 규칙이 조용히 꺼진다**(G-2 재발).
Claude 레그는 **Fable 5.1**(2026-09-24 #1025 기본 — 옵션 없음). `--no-frontier` 로 kill-switch 를 켠 런만 Sonnet 으로 내려간다.
