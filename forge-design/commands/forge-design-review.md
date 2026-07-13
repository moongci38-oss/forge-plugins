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

`forge-check-ui` 스킬을 호출해 정적(U-1~U-5) + Lighthouse/반응형(U-6) 검증을 실행하고
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

- 가용 시: `Skill(visual-loop, args="$URL")` — 라이브 3-viewport + Gemini Vision + 독립 Evaluator (최대 2사이클).
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

## Advisor 자문 (advisory-only · non-blocking · Opus)

설계 리뷰에서 되돌리기 어려운 트레이드오프·아키텍처 분기 결정 시 `advisor-strategist`(Opus) 조언을 구한다. **advisory-only — 게이트 차단 아님. 미가용·실패 시 기본 흐름 진행(fail-open).**

```
Agent(subagent_type="advisor-strategist", prompt="설계안·핵심 결정·검토된 대안 맥락 3-5줄. 질문: 이 설계의 비가역 트레이드오프와 놓친 대안 2-3개는?")
```

- 트리거: 되돌리기 어려운 설계 결정·아키텍처 분기 시
- 반환 조언은 참고만 — 최종 판단·실행은 커맨드가 수행.
- **Fable 5 미배선** — Human 수동 에스컬레이션 전용(자동분기는 forge-fix T4 한정). `advisor-model-resolve` 호출 금지.
- 모델 라우팅: 본 커맨드 작업=Sonnet · 탐색=Haiku · advisor/결정=Opus.

## 비고

- 내부 체인은 파이프라인이 P2/P3/P5에서 자동 수행 중. 본 커맨드는 **수동 단일 진입 UX**용 facade.
- 비용 계층(게이트=싼 정적, 루프=비싼 라이브) 보존이 설계 핵심 — 무조건 라이브 루프 금지.
- 실패 시 [[pev-self-correction]] 적용.
