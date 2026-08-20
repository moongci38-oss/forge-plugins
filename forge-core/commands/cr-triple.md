---
description: Opus + Codex + Gemini 3-worker 검수 (cr-multi --mode triple 단축). plateau 자동 승격 또는 중요 spec에 사용.
group: review
---

# /cr-triple

`/cr-multi` `--mode triple` 단축 래퍼.

```
/cr-triple <target-file> [--stage plan|code|test|bugfix|final] [--cr on|degrade|off] [--no-codex] [--fable] [--sol|--terra|--luna] [--gemini-max] [--repo-root <path>]
```

→ `/cr-multi <target-file> --mode triple [--stage <stage>] [--cr <crMode>] [--fable] [--sol|--terra|--luna] [--gemini-max] [--repo-root <path>]`

⚠️ **이 화살표가 폴백 경로의 실제 계약이다.** Workflow 를 못 쓸 때 에이전트는 이 줄을 읽고 CLI 인자를
만든다 — 여기 빠진 플래그는 **그 순간 사라진다.** 사용법 줄만 고치고 이 줄을 안 고치면 "문서는 고쳤는데
동작은 그대로"가 된다(2026-08-20 PR #308 cr-final HIGH 로 실제 적발됨).
⚠️ **구 서술 폐기**: 종전에는 "`--repo-root`·`--gemini-max` 는 CLI 로 재전달하지 않는다 — cr-multi
사용법에 그런 플래그가 없다"였다. **2026-08-19 까지는 참이었고 지금은 거짓이다** — 두 플래그가
cr-multi 사용법에 추가됐다. 이제 **전부 CLI 로 재전달**하고, Workflow 경로에서는 아래 각 규약대로
workflow args 로도 릴레이한다(두 경로가 같은 값을 받는다).
- 드리프트 고정: `bash shared/scripts/cr-multi-flag-parity.test.sh` 가 **이 화살표 줄까지** 검사한다.

**`repoRoot` (workflow args 릴레이 — 이 래퍼가 직접 계산해서 넘긴다)**: 검수 대상 **레포의 절대경로**.
쉽게 말하면 **"어느 폴더를 보고 판정하라"는 주소표**다 — 안 주면 레그가 자기가 서 있는 자리(세션 CWD)에서
파일을 찾는데, 그게 같은 레포의 **낡은 워크트리**면 경로가 전부 해석돼 **확신을 갖고 정반대 결론**을 낸다
(실사례 PR #53 → `/cr-multi §repoRoot`).
- 값: `git rev-parse --show-toplevel`. **워크트리에서 호출하면 그 워크트리 절대경로가 정답**이다.
- `--repo-root <path>` 로 덮어쓸 수 있다(대상 레포가 CWD 밖일 때).
- ⚠️ **이 기본값은 세션 CWD 기준이다** — 검수 대상 파일이 **다른 레포·다른 워크트리**에 있으면
  엉뚱한 레포의 HEAD 가 조용히 pin 된다(그 값이 `reviewedSha` 로 기록된다). 대상이 CWD 밖이면
  반드시 `--repo-root` 로 명시한다. 이 CWD 의존은 `cr-multi.md` 의 기존 패턴을 그대로 따른 것이라
  이번 변경이 만든 회귀가 아니라 **잔존 갭**이다(2026-08-19 cr-final medium 지적).
- 취득 실패 시 차단하지 않는다(fail-open) — `[RepoRoot] pin=(미지정 …)` 로그 + 레그 자기보고 모드.
- 근거: `cr-multi.md §repoRoot` 는 args **필수**로 규정하는데 이 래퍼는 릴레이하지 않았다(2026-08-19 실측 — 검수 2라운드가 각각 HIGH 지적). 재현: `grep -c 'repoRoot' ${FORGE_ROOT:-$HOME/forge}/.claude/commands/cr-triple.md` → 수정 전 0 / 후 1+.

**`--cr` / `--no-codex`**: codex-critic 워커 제어.
- `--cr on` (default): Opus + Codex + Gemini 3-worker
- `--cr degrade` 또는 `--no-codex`: Codex 제외 → Opus + Gemini 2-worker (rate-limit 보호 / 대량루프 / Codex MCP 불가 환경 폴백)
- `--cr off`: 동일 (`degrade`와 동작 동일)

**`--fable`** (Human 수동 전용 — 비가역·최고위험 검수만): Claude 레그를 **Fable 5로 승격**(Codex·Gemini 불변). **자동 발동 없음 — 사용자가 명시할 때만.** 종량 $10/$50·org usage-credits 필수. forge-pr/자동 게이트 배선 금지. 상세 → `/cr-multi §--fable`.

**`--sol`/`--terra`/`--luna`** (Human opt-in — 2026-07-15): **Codex 검수 레그 모델 승격**(Claude·Gemini 불변). `--sol`→codex:max(gpt-5.6-sol, 프런티어) · `--terra`→codex:high(gpt-5.6-terra, 균형) · `--luna`→codex:low(gpt-5.6-luna, 효율). 미지정 시 기본(gpt-5-mini) 유지 = no-op. **ChatGPT Plus 정액이라 추가 비용 0** (Fable과 달리 종량 아님). `--fable --sol` 동시 = 최상위 검수(claude:max + codex:max + gemini). 모델 id는 `model-registry.json` SSoT 소유(버전무관).

**`--gemini-max`** (Human opt-in — 2026-08-19): **Gemini 검수 레그 모델 승격**(Claude·Codex 불변).
쉽게 말하면 **세 검수자 중 Gemini 한 명만 상급자로 바꿔 앉히는 스위치**다.
- 미지정 시 **no-op** — workflow.js 가 `geminiModel` 을 안 받으면 model 파라미터를 **생략**해
  MCP 서버가 `GEMINI_REVIEW_MODEL` env → 서버 기본값(`gemini-3.5-flash`) 순으로 정한다.
  즉 기본값을 이 래퍼가 하드코딩하지 않는다(우선순위: per-run arg > 서버 env > 서버 기본).
- 지정 시 `geminiModel` = `model-registry-resolve.sh gemini:max` 결과(**버전무관** — registry SSoT 가 해석).
  ⚠️ 모델 id 를 이 문서에 적지 않는다. `--sol` 과 같은 규약이다.
- **자동 배선 금지 — Human 이 명시할 때만.** `--fable` 과 같은 이유이나 **비용 축은 다르다**:
  Gemini 승격의 과금 여부는 **미확인**이라, 확인 전까지는 "기본값 무변경"이 계약이다.
  (`--sol` 은 ChatGPT Plus 정액이라 추가 비용 0 이 확인된 케이스다 — 혼동 금지.)
- resolve 실패 시 `null`(서버 기본 유지, fail-open) — 차단하지 않는다.
- 근거 ①(배선 실재): `workflow.js` 가 `geminiModel` arg 를 **이미 수용**한다 — 파싱
  `const geminiModel = _a?.geminiModel || null`, 주입 `geminiModelDirective`.
  재현: `grep -n 'geminiModel' ${FORGE_ROOT:-$HOME/forge}/.claude/skills/cr-multi/workflow.js`
  ⚠️ 줄번호는 편집마다 밀리므로 적지 않는다(구 표기 `:327,1386` 은 diff 적용 **전** 기준이라
  머지 직후 이미 어긋나 있었다 — 2026-08-19 cr-final 지적).
  커맨드 레이어만 비어 있었다(브리프 0-D "나중 숙제"). 계획서 P5.
  재현: `grep -c 'gemini-max' ${FORGE_ROOT:-$HOME/forge}/.claude/commands/cr-triple.md` → 수정 전 0 / 후 1+.
- 폐기조건: Gemini 레그 기본 모델이 max 로 올라가면 이 플래그를 삭제한다.

## 트리거 조건

- `/cr-double` 3회 plateau 감지 후 자동 승격
- P7 (Merge 직전) 중요 spec
- 사용자 명시 요청

## Workflow 실행 (계획서 P0-4)

```js
// --cr 파싱: CR_ARG = args 중 '--cr <val>' 또는 '--no-codex' 감지
// CR_MODE = (--no-codex 있으면 'degrade') || (--cr 값) || 'on'
// --fable 파싱: FABLE = args에 '--fable' 있으면 true (Human 수동 전용 — Claude 레그 Fable 5 승격)
// --sol/--terra/--luna 파싱 (Codex 검수 레그 tier 승격, model-registry SSoT):
//   CODEX_TIER = --sol→'max' · --terra→'high' · --luna→'low' · (없으면 미설정)
//   CODEX_MODEL = CODEX_TIER 설정 시 Bash(`${FORGE_ROOT:-$HOME/forge}/shared/scripts/model-registry-resolve.sh codex:$CODEX_TIER`) 결과, 없으면 null
//     → registry가 버전무관 해석(codex:max→gpt-5.6-sol 등). resolve 실패 시 null(기본 gpt-5-mini 유지, fail-open).
// --gemini-max 파싱 (Gemini 검수 레그 승격, model-registry SSoT — Human opt-in):
//   GEMINI_MODEL = '--gemini-max' 있으면 Bash(`${FORGE_ROOT:-$HOME/forge}/shared/scripts/model-registry-resolve.sh gemini:max`) 결과, 없으면 null
//     → null 이면 args 에서 생략한다.
//       ⚠️ 생략 · 명시적 null · 빈 문자열 · false 는 workflow.js 에서 **전부 동치**다
//         (`_a?.geminiModel || null` — 넷 다 falsy 라 같은 null 로 떨어진다). 즉 생략은 계약이 아니라
//         표기 취향이다. (2026-08-19 정정: 종전 주석은 빈 문자열·false 를 'truthy 라 금지'라 적었는데
//          둘 다 falsy 라 사실이 반대였다.)
// --repo-root 파싱 (repoRoot 릴레이 — cr-multi.md §repoRoot 가 args 필수로 규정):
//   REPO_ROOT = (args 중 '--repo-root <path>') || Bash(`git rev-parse --show-toplevel`) 결과 || null
//     → 워크트리에서 호출하면 그 워크트리 절대경로가 나온다(그게 맞는 값). 취득 실패 시 null = fail-open.
// 외부 토큰 선발행 후 Workflow 실행 (cr-multi workflow.js 위임)
Workflow({
  script: Bash("cat $HOME/.claude/skills/cr-multi/workflow.js"),
  args: { slug: SLUG, targetPath: TARGET_PATH, mode: 'triple', stage: STAGE, crMode: CR_MODE, fable: FABLE, codexModel: CODEX_MODEL, repoRoot: REPO_ROOT, ...(GEMINI_MODEL ? { geminiModel: GEMINI_MODEL } : {}) }
})
```
`FABLE`이 `true`이면 workflow.js가 Claude 레그(기본 Sonnet)를 `claude-fable-5`로 승격. 미지정(false)이면 기존 3-LLM 동작 100% 동일.
`CODEX_MODEL`이 설정되면(--sol/terra/luna) workflow.js가 codex-critic에 model override directive를 주입해 Codex 레그를 승격. 미지정(null)이면 기본 gpt-5-mini 유지.

`GEMINI_MODEL` 은 설정됐을 때만 args 에 실린다. ⚠️ **기능상 필수는 아니다** — workflow.js 는
`_a?.geminiModel || null` 이라 키 부재와 명시적 `null` 을 **똑같이** 다룬다(어느 쪽이든 model 파라미터를
생략하고 서버 기본값 경로로 간다). 조건부 생략은 "보내지 않는 값은 아예 싣지 않는다"는 **표기 취향**이다
— 형제 필드 `codexModel` 은 null 이어도 그냥 싣는다. 둘 중 어느 쪽으로 바꿔도 동작은 같다.
(구 서술은 이것을 필수 요건처럼 적었다 — 2026-08-19 cr-final 지적.)
`REPO_ROOT` 는 workflow.js 가 레그 프롬프트에 pin 으로 주입하고 `reviewedSha` 취득 근거로 쓴다. null 이면 레그 자기보고 모드로 떨어진다(차단 아님).

`crMode`가 `'on'`(default) 이면 workflow.js는 기존 3-LLM 동작 유지.
`crMode`가 `'degrade'`/`'off'` 이면 codex-critic 워커 및 ApproveWorker를 건너뛰고 Opus+Gemini만 실행.

Agent Teams fallback: `CLAUDE_CODE_DISABLE_WORKFLOWS=1` 시 cr-multi 직접 실행.

✅ **폴백 경로의 플래그 소실은 2026-08-20 에 닫혔다.** `/cr-multi` 사용법에
`--sol`/`--terra`/`--luna`·`--repo-root`·`--gemini-max` 를 전부 추가하고, 각각의 args 매핑
(`codexModel`·`geminiModel`·`repoRoot`)을 그 문서에 명시했다. 이제 폴백을 타도 승격·pin 이 유지된다.
⚠️ **구 서술은 폐기한다** — 2026-08-19 까지는 참이었다(그때는 `/cr-multi` 에 이 플래그가 **0개**였고,
폴백하면 모델은 기본값·repoRoot 는 미pin 이 됐다. repoRoot 미pin 은 PR #53 — 낡은 워크트리를 보고
확신에 찬 정반대 결론 — 과 같은 경로다).
- 드리프트 고정: `bash shared/scripts/cr-multi-flag-parity.test.sh` (전건 PASS 여야 한다)
  ⚠️ **여기에 통과 개수를 박지 않는다.** 검사를 하나 추가할 때마다 숫자가 바뀌는데 문서 갱신을
  빠뜨리기 쉽다 — 실제로 이 줄은 한 PR 안에서 두 번 어긋났다("3 FAIL"→구버전 기준 · "12/0"→검사
  +1 후 13/0). **정본은 수치가 아니라 명령이다** — 개수가 궁금하면 위 명령을 돌린다.
  래퍼 목록(`cr-triple`·`cr-double`)을 돌며 ①사용법 줄 ②릴레이 화살표 줄 ③화살표 직후의 거짓
  근거 잔존을 검사한다. 제외는 명시 선언: `--mode`(고정값) 양쪽 / `--no-codex`(→`--cr degrade`
  정규화 별칭) 릴레이 줄만.
  판별력 실증(실측): cr-multi 사용법에서 플래그 2종 제거 → **2 FAIL**(래퍼 2개가 각각 잡는다) ·
  cr-double 릴레이 줄에서 2종 제거 → **1 FAIL**.
  ⚠️ 종전에 여기 적혀 있던 "3 FAIL" 은 **구버전 테스트(플래그별 개별 check) 기준**이라 지금은
  틀린 수치다 — 테스트를 토큰 집합 비교로 재설계하면서 갱신을 빠뜨렸다(같은 PR r2 검수에서 적발).
- ⚠️ **이 검사가 못 잡는 것**: 줄들은 맞게 적어놓고 본문 설명·args 매핑을 빠뜨린 경우.
  줄 단위 토큰 대조라 "적혀 있다"와 "동작한다"는 여전히 다르다.
