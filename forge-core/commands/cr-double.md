---
description: Codex + Gemini 2-worker 검수 (cr-multi --mode double 단축)
group: review
---

# /cr-double

`/cr-multi` `--mode double` 단축 래퍼.

```
/cr-double <target-file> [--stage plan|code|test|bugfix|final] [--cr on|degrade|off] [--no-codex] [--sol|--terra|--luna] [--gemini-max] [--repo-root <path>]
```

→ `/cr-multi <target-file> --mode double [--stage <stage>] [--cr <crMode>] [--sol|--terra|--luna] [--gemini-max] [--repo-root <path>]`

⚠️ **`--fable` 은 여기 없다 — double 모드에서 no-op 이기 때문이다.** `workflow.js` 실측:
`mode==='double'` 이면 `workers = codexEnabled ? [wCodex, wGemini] : [wGemini]` 로 **Claude 레그
(wOpus)가 아예 없다.** `--fable` 은 그 Claude 레그를 Fable 5 로 승격하는 스위치라 승격 대상이 없다.
(2026-08-20 PR #308 r3 검수 지적 — triple 패턴을 복사하며 잘못 끼워 넣었던 것을 뺐다.)
재현: `sed -n '1440,1446p' .claude/skills/cr-multi/workflow.js`

⚠️ **이 화살표가 폴백 경로의 실제 계약이다.** Workflow 를 못 쓸 때 에이전트는 이 줄을 읽고 CLI 인자를
만든다 — 여기 빠진 플래그는 **그 순간 사라진다.**
⚠️ **구 서술 폐기**: 종전에는 "`--repo-root`·`--gemini-max` 는 CLI 로 재전달하지 않는다"였다.
**2026-08-19 까지는 참이었고 지금은 거짓이다** — cr-multi 사용법에 두 플래그가 추가됐다.
이제 **전부 CLI 로 재전달**하고, Workflow 경로에서는 아래 각 규약대로 workflow args 로도 릴레이한다.
- 드리프트 고정: `bash shared/scripts/cr-multi-flag-parity.test.sh` 가 **이 화살표 줄까지** 검사한다.

**`repoRoot` (workflow args 릴레이 — 이 래퍼가 직접 계산해서 넘긴다)**: 검수 대상 **레포의 절대경로**.
안 넘기면 레그가 세션 CWD(낡은 워크트리일 수 있다)에서 파일을 찾아 **정반대 결론**을 낸다.
- 값: `git rev-parse --show-toplevel`(워크트리에서 호출하면 그 워크트리 절대경로가 정답) · `--repo-root <path>` 로 덮어쓰기 가능 · 취득 실패 시 null(fail-open).
- 폴백 동작은 `cr-triple` 과 **동일하다**(같은 workflow.js 를 호출한다) — 미지정 시 `[RepoRoot] pin=(미지정 …)` 로그 + 레그 자기보고 모드.
- ⚠️ 기본값은 **세션 CWD 기준**이라 대상이 다른 레포·워크트리면 `--repo-root` 로 명시해야 한다.
- 근거: `cr-multi.md §repoRoot` 는 args **필수**인데 이 래퍼는 `cr-triple` 과 **동일하게 릴레이하지 않았다**(2026-08-19 실측 — 두 래퍼 모두 `grep -c repoRoot` → 0). 상세 → `/cr-triple §repoRoot`.

**`--cr` / `--no-codex`**: codex-critic 워커 제어.
- `--cr on` (default): Codex + Gemini 2-worker
- `--cr degrade` 또는 `--no-codex`: Codex 제외 → Gemini 1-worker (rate-limit 보호 / Codex MCP 불가 환경 폴백)
- `--cr off`: 동일 (`degrade`와 동작 동일)

**`--sol`/`--terra`/`--luna`** (Human opt-in, 2026-07-15): Codex 검수 레그 승격. `--sol`→gpt-5.6-sol · `--terra`→gpt-5.6-terra · `--luna`→gpt-5.6-luna. 미지정 시 기본(gpt-5-mini) no-op. ChatGPT Plus 정액이라 추가 비용 0. 상세 → `/cr-triple §--sol`.

**`--gemini-max`** (Human opt-in — 2026-08-19): **Gemini 검수 레그 모델 승격**(Codex 불변).
`double` 모드도 **항상 Gemini 레그를 포함**하므로(`--cr degrade` 로 Codex 를 빼도 Gemini 는 남는다)
이 플래그가 여기서도 그대로 동작한다.
- 값 = `model-registry-resolve.sh gemini:max`(버전무관 — 모델 id 를 문서에 적지 않는다).
- 미지정 시 no-op(서버 env→기본값 경로). resolve 실패 시 null(fail-open).
- **자동 배선 금지 — Human 명시 시에만.** ⚠️ `--sol` 과 달리 **과금 여부가 미확인**이라
  확인 전까지 "기본값 무변경"이 계약이다. 상세 → `/cr-triple §--gemini-max`.
- 근거: 이 플래그는 **두 래퍼 모두 이번(2026-08-19)에 처음 생겼다** — `workflow.js` 는 이미
  `geminiModel` 을 받고 있었고 커맨드 레이어만 비어 있었다(계획서 P5). 다만 작업 순서상
  `cr-triple` 에 먼저 넣고 `cr-double` 을 빠뜨렸고, 그 비대칭을 cr-final 이 medium 으로 잡아
  이 PR 안에서 함께 맞췄다(형제 플래그 `--sol/--terra/--luna` 는 진작 양쪽에 대칭이었다).
  실사용 손해가 구체적이었다: 비용·rate-limit 때문에 `/cr-double` 을 고른 사용자가 Codex 레그는
  `--sol` 로 올릴 수 있는데 Gemini 레그만 기본값에 묶여 있었다.

## Workflow 실행 (계획서 P0-4)

```js
// CR_MODE = (--no-codex 있으면 'degrade') || (--cr 값) || 'on'
// --repo-root 파싱: REPO_ROOT = (args 중 '--repo-root <path>') || Bash(`git rev-parse --show-toplevel`) || null (fail-open)
// --gemini-max 파싱: GEMINI_MODEL = args 에 '--gemini-max' 있으면 Bash(`${FORGE_ROOT:-$HOME/forge}/shared/scripts/model-registry-resolve.sh gemini:max`) 결과, 없으면 null
//   null 이면 args 에서 생략한다(키 부재·명시적 null 모두 서버 기본값 경로 — 생략은 표기 취향).
// --sol/--terra/--luna 파싱: CODEX_TIER = sol→max·terra→high·luna→low.
//   CODEX_MODEL = CODEX_TIER 설정 시 Bash(`${FORGE_ROOT:-$HOME/forge}/shared/scripts/model-registry-resolve.sh codex:$CODEX_TIER`), 없으면 null (fail-open).
Workflow({
  script: Bash("cat $HOME/.claude/skills/cr-multi/workflow.js"),
  args: { slug: SLUG, targetPath: TARGET_PATH, mode: 'double', stage: STAGE, crMode: CR_MODE, codexModel: CODEX_MODEL, repoRoot: REPO_ROOT, ...(GEMINI_MODEL ? { geminiModel: GEMINI_MODEL } : {}) }
})
```

`REPO_ROOT` 는 workflow.js 가 레그 프롬프트 pin + `reviewedSha` 취득에 쓴다. null 이면 레그 자기보고 모드(차단 아님).

Agent Teams fallback: `CLAUDE_CODE_DISABLE_WORKFLOWS=1` 시 cr-multi 직접 실행.

✅ **폴백 경로의 플래그 소실은 2026-08-20 에 닫혔다.** `/cr-multi` 사용법에
`--sol`/`--terra`/`--luna`·`--repo-root`·`--gemini-max` 를 전부 추가하고, 위 릴레이 화살표도
같이 갱신했다. 이제 폴백을 타도 승격·pin 이 유지된다.
⚠️ **구 서술은 폐기한다** — 2026-08-19 까지는 참이었다(그때는 cr-multi 에 이 플래그가 **0개**였고,
폴백하면 모델은 기본값·repoRoot 는 미pin 이 됐다. repoRoot 미pin 은 PR #53 — 낡은 워크트리를 보고
확신에 찬 정반대 결론 — 과 같은 경로다).
- 드리프트 고정: `bash shared/scripts/cr-multi-flag-parity.test.sh`
- ⚠️ **이 검사가 못 잡는 것**: 사용법 줄·릴레이 줄에 적어놓고 본문 설명·args 매핑을 빠뜨린 경우.
  줄 단위 토큰 대조라 "적혀 있다"와 "동작한다"는 여전히 다르다.
