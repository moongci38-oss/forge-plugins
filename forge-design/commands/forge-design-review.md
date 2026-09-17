---
description: 디자인 검수 단일 진입 facade — forge-check-ui(게이트) → CRITICAL이면 visual-loop(라이브 루프) → 통합 리포트 1장. 내부 2단 비용 계층은 유지하고 입구만 하나로.
argument-hint: "[url-or-path] [--url=http://localhost:3000] [--no-loop]"
allowed-tools: Bash, Read, Grep, Glob, Skill, Agent, ToolSearch
model: sonnet
group: verify
---

# /forge-design-review — 디자인 검수 단일 진입 facade

UI/디자인 검수를 **입구 하나**로 실행합니다. 물리적으로 합치지 않고, 기존 2단 체인
(`forge-check-ui` 싼 게이트 → `visual-loop` 비싼 라이브 루프)을 오케스트레이션해 **통합 리포트 1장**을 냅니다.

> ⚠️ 범용 판정기 `eval-rubric`은 디자인 전용이 아니므로 본 facade에 포함하지 않습니다(텍스트 산출물용).

## 인자

- `$1` = 검수 대상 (변경 스코프 경로 또는 URL). 미지정 시 현재 변경분(git diff) 대상.
- `--url=` (선택) = 라이브 검증 URL (예: `http://localhost:3000/dashboard`). 있으면 visual-loop 단계 활성.
- `--no-loop` (선택) = CRITICAL이어도 visual-loop 에스컬레이션 생략(정적 게이트만).

## 절차

### Step 1 — 게이트 (싼 정적+Lighthouse 우선)

`forge-check-ui` 스킬을 호출해 **4축**(static / lighthouse / responsive / screen-mapping) 검증을 실행하고
PASS/WARN/FAIL 판정 + CRITICAL 개수 + 발견 목록을 수집한다.

```
Skill(forge-check-ui, args="<$1 또는 변경 스코프>")
```

판정 파싱: `verdict ∈ {PASS, WARN, FAIL}`, `critical_count`, `findings[]`(severity·category·file·evidence).

### Step 2 — 에스컬레이션 (CRITICAL일 때만 비싼 라이브 루프)

다음 **모두** 충족 시에만 `visual-loop`를 호출한다 (비용 계층 보존):
1. `critical_count ≥ 1` (게이트 FAIL), AND
2. `--no-loop` 미지정, AND
3. 라이브 검증 가능 — `--url` 제공됐거나 dev 서버 응답.

```bash
# dev 서버 가용성 (URL 있을 때만)
[ -n "$URL" ] && curl -sf --max-time 3 -o /dev/null "$URL" && echo "server OK" || echo "server 미가동/URL 없음"
```

- 가용 시: `Skill(visual-loop, args="$URL")` — 라이브 3-viewport + **GPT-5.6 Sol Vision**(`codex-critic` 에이전트) + 독립 Evaluator (최대 2사이클).
  ⚠️ 구 표기 "Gemini Vision" 은 2026-09-07 폐기 — Gemini 전면 철수, Vision 레그는 GPT-6 Astra(`codex-critic`)로 단일화됐다.
  근거: `model-routing.md §세션 운영 모델`(Gemini 전면 철수) · `.claude/agents/codex-critic.md`(Vision 위임 담당 명시).
  폐기조건: Vision 레그 벤더가 바뀌면 이 줄을 그 벤더로 교체한다.
- 불가 시: visual-loop **SKIP**(부재 아님 — 서버 필요). 리포트에 "라이브 검증 생략(dev 서버 없음)" 명시 + 사용자에게 `npm run dev` 안내. **대기 금지.**

> CRITICAL=0(PASS/WARN)이면 Step 2 전체 생략 — 싼 게이트로 종료.

### Step 3 — 통합 리포트 1장

게이트 결과 + (있다면) visual-loop 결과를 **하나의 리포트**로 합쳐 저장:
`docs/qa/design-review-{YYYY-MM-DD}.md`

리포트 필수 섹션:
- **최종 판정**: PASS / WARN / FAIL (게이트 + 라이브 종합, 더 엄격한 쪽)
- **게이트 발견**(forge-check-ui): severity별 findings + AI-Slop 위반
- **라이브 검증**(visual-loop): viewport별 스크린샷 경로 + Vision delta + auto-fix 적용분 (생략 시 사유)
- **잔존 액션**: 미해결 CRITICAL/HIGH 목록

## 종료 기준

- 게이트 PASS/WARN(CRITICAL=0) → 리포트 후 종료.
- 게이트 FAIL → visual-loop 2사이클 후 잔존 CRITICAL 있으면 **[STOP]**(Human), 0이면 PASS로 종료.
- dev 서버 부재로 라이브 생략 시 → 게이트 결과만으로 판정 + 라이브 보강 권고 명시.

## Advisor 자문 (advisory-only · non-blocking · 리졸버 기본 = **GPT-6 Astra**)

설계 리뷰에서 되돌리기 어려운 트레이드오프·아키텍처 분기 결정 시 `advisor-strategist` 조언을 구한다(모델 = `advisor-model-resolve.sh` 출력, **기본 `gpt-6-astra`**). **advisory-only — 게이트 차단 아님. 미가용·실패 시 기본 흐름 진행(fail-open).**

> ⚠️ **아래 예시는 리졸버가 `claude-*` 를 냈을 때의 형태다.** 스폰 모델은 항상 `advisor-model-resolve.sh` 가 정한다 — `claude-fable-5-1`→`model:"fable"`, `claude-opus-5`→`model:"opus"`, **`gpt-6-astra`(대체 기본)·`gpt-5.6-sol` 같은 `gpt-*` 면 Agent 가 아니라 `mcp__codex__codex`(sandbox=read-only)**. 분기표 → `agents/advisor-strategist.md §비용 특성`. 리졸버를 건너뛰면 kill-switch·일일캡·미가용 폴백이 전부 우회된다.
```
Agent(subagent_type="advisor-strategist", prompt="설계안·핵심 결정·검토된 대안 맥락 3-5줄. 질문: 이 설계의 비가역 트레이드오프와 놓친 대안 2-3개는?")
```

- 트리거: 되돌리기 어려운 설계 결정·아키텍처 분기 시
- 반환 조언은 참고만 — 최종 판단·실행은 커맨드가 수행.
- **advisor 모델 = `advisor-model-resolve.sh` 출력**(**기본 `gpt-6-astra`** · Fable 5.1 은 `FORGE_ADVISOR_MODEL=fable` 또는 `FORGE_ADVISOR_EXECUTOR=codex|gpt`(벤더 교차) 일 때만 · `FORGE_ADVISOR_MODEL=opus` 로 Opus 고정). 출력이 `gpt-*` 면 Agent 가 아니라 `mcp__codex__codex`(sandbox=read-only)로 스폰한다.
  ⚠️ 2026-08-12 이전 문구 **"Fable 5 미배선 — Human 수동 에스컬레이션 전용 · `advisor-model-resolve` 호출 금지"는 폐기**했다 — 이 커맨드에 advisor 자문 레그가 실재하는데 리졸버 호출을 금지해 라우팅이 서로 어긋났다(cr-final HIGH). 정본 → `rules/model-routing.md §Advisor 전략 상시 가동`
- 모델 라우팅: 본 커맨드 작업=Sonnet · 탐색=Haiku · advisor=`advisor-model-resolve.sh` 출력(**기본 `gpt-6-astra`** · CLI<0.153.4 면 `gpt-5.6-sol` 로 하향).
  ⚠️ **구 표기 "기본 Fable 5.1 · 대체 gpt-6-astra" 는 2026-09-17 폐기** — 2026-09-07 Human 지시(advisor 기본 Fable→Astra)를 이 파일이 따라오지 못했다. 문서는 fable, 리졸버는 astra 를 내고 있었다.
  실측 재현: `bash shared/scripts/advisor-model-resolve.sh` → `gpt-6-astra` · `bash shared/scripts/advisor-spawn-guard.sh resolve` → `gpt-6-astra` (2026-09-17 관측).
  근거: 문서가 조언자 벤더를 틀리게 적으면 "실행자와 다른 벤더에게 묻는다" 는 교차 규율을 사람이 손으로 뒤집는다. 정본 → `rules/model-routing.md §세션 운영 모델`.
  폐기조건: 사람이 기본 조언자를 다시 정하면 이 줄을 갱신한다.

## 비고

- 내부 체인은 파이프라인이 P2/P3/P5에서 자동 수행 중. 본 커맨드는 **수동 단일 진입 UX**용 facade.
- ⚠️ **자동 호출자 0곳 · 산출물 1건(2026-07-17)** — 2026-09-17 실측. 이 커맨드를 부르는 스킬·훅·스크립트·cron·CI·플러그인이 **하나도 없다**. 레포에서 이름이 나오는 곳은 자기 자신과 문서 2건(`rules-on-demand/claude-design-workflow.md`·`rules-on-demand/team-routing.md`)뿐이다.
  ⚠️ 이것은 **결함이 아닐 수 있다** — 위 줄이 밝힌 대로 설계 의도 자체가 "수동 단일 진입 facade" 다. 다만 **"파이프라인이 자동으로 돌려준다"로 읽지 마라** — 자동으로 도는 것은 내부 체인(P2/P3/P5)이지 이 문패가 아니다.
  실측 재현:
  ```
  grep -rl -- "/forge-design-review" .claude shared dev planning
  #   → .claude/rules-on-demand/claude-design-workflow.md · .claude/rules-on-demand/team-routing.md · .claude/commands/forge-design-review.md
  find ~/forge-outputs -name 'design-review-*' -not -path '*/worktrees/*'
  #   → 02-product/test-home-page/docs/qa/design-review-2026-07-17.md  (1건, 테스트 프로젝트)
  ```
  근거: 배선 0 을 적어 두지 않으면 다음 감사가 같은 조사를 처음부터 다시 한다. 존폐 판정은 사람이 "최근 3개월 이 커맨드를 직접 부른 적 있나" 에 답해야 난다 — **AI 가 자율 폐기하지 않는다**.
  폐기조건: 이 커맨드에 자동 호출자가 생기거나 사람이 폐기를 결정하면 이 항을 지운다.
- 비용 계층(게이트=싼 정적, 루프=비싼 라이브) 보존이 설계 핵심 — 무조건 라이브 루프 금지.
- 실패 시 [[pev-self-correction]] 적용.
