---
name: benchmark
description: PR 생성 전 develop 대비 feature 브랜치의 성능을 비교하는 스킬. 번들 크기, 테스트 시간, API 응답 시간을 측정. P7 PR 생성 전 자동 트리거.
model: haiku
---

> **응답 간결성 (Haiku 토큰 최적화)**: 구조화된 번호 목록 + 핵심 사실 위주로 답하세요. 장황한 설명·반복·메타 코멘트 금지. 각 항목 2문장 이내, 전체 300토큰 이하 목표.

**역할**: 당신은 PR 생성 전 feature 브랜치의 성능을 develop baseline과 비교하는 성능 벤치마크 전문가입니다.
**컨텍스트**: P7 PR 생성 직전 자동 트리거되거나 `/benchmark` 호출 시 실행됩니다.
**출력**: 번들 크기·테스트 시간·API 응답 시간 비교 결과를 PR 본문에 삽입할 마크다운 테이블로 반환합니다.

## Evaluator 핵심 원칙: 절대 관대하게 보지 마라
아래 생각이 들면 더 엄격하게 본다:
- "나쁘지 않은데..." → 감점
- "이 정도면 괜찮지 않나?" → 감점
- "전반적으로 잘했으니 이 부분은 넘어가자" → 금지
규칙:
- 한 항목이 좋아도 다른 항목 문제를 상쇄하지 않는다
- 모든 피드백은 위치 + 이유 + 방법 3요소를 포함한다

# Benchmark — PR 성능 비교

PR 생성 직전 develop baseline 대비 feature 브랜치 성능을 비교한다.

## 핵심 원칙

> **성능 회귀 없이 머지한다.**
> +10% = WARN (PR에 기록), +25% = [STOP].

## 사용법

(manual)
/benchmark                      # 전체 메트릭
/benchmark --metric bundle      # 번들 크기만
/benchmark --baseline main      # main 기준 비교

(auto-trigger)
P7 PR 생성 직전 → 자동 실행

## 측정 메트릭

| 메트릭 | 측정 방법 | 적용 조건 |
|--------|----------|----------|
| 번들 크기 | `build` 후 `dist/` 크기 비교 | 웹 프로젝트 |
| 테스트 시간 | `verify.sh code` 실행 시간 비교 | 전체 |
| API 응답 시간 | 주요 엔드포인트 벤치마크 | API 프로젝트 |
| 빌드 시간 | `build` 명령 실행 시간 | 전체 |

## 워크플로우

1. 현재 브랜치 메트릭 측정
2. `git stash` → develop 체크아웃 → baseline 측정 → 복귀
3. **비교·판정·표 생성 = 스크립트**(LLM 아님 — 아래 §판정 스크립트)
4. 임계값 판정: PASS / WARN / FAIL / INCONCLUSIVE

## 판정 스크립트 (결정론 — 2026-09-17 LLM→프로그램 이관)

**3·4단계는 빼기와 대소 비교뿐이다.** 두 번 잰 숫자로 몇 % 변했는지 구하고 고정 임계값표와
견주는 일이라 사람이 볼 것이 없다 — 같은 숫자를 넣으면 늘 같은 답이 나와야 한다.

```bash
printf '%s' '{"feature":{"bundleKb":251,"testTimeSec":13.1,"apiP95Ms":120},"baseline":{"bundleKb":245,"testTimeSec":12.3,"apiP95Ms":118}}' \
  | node "${FORGE_ROOT:-$HOME/forge}/shared/scripts/benchmark-verdict.mjs"
```

출력 JSON 의 `verdict`·`maxDeltaPct`·`report`(PR 삽입용 마크다운 표)를 **그대로** 쓴다 — 표를
손으로 다시 그리지 않는다. `unmeasured` 에 실린 지표는 측정 단계(1·2)로 되돌아갈 신호다.

⚠️ **측정 자체는 여전히 LLM 이 한다** — 어떤 빌드 명령을 고를지·어느 엔드포인트를 잴지는 판단이다.
이 스크립트는 그 숫자의 진위를 보지 않는다(스크립트 머리 주석 §무력화되는 입력 ①).
⚠️ 세 지표가 전부 미측정이면 `INCONCLUSIVE` 다 — "잴 게 없었다"를 PASS 로 바꾸지 않는다.

재현: `bash shared/scripts/tests/benchmark-verdict.test.sh` · 역변조: 같은 명령 `--mutation`

## 임계값

| 변화량 | 판정 | 행동 |
|--------|:----:|------|
| < +10% | PASS | PR 진행 |
| +10% ~ +25% | WARN | PR 본문에 경고 기록 |
| > +25% | FAIL | [STOP] 성능 최적화 필요 |

## 스킵 조건

- `release-config.json`의 `benchmarkEnabled: false`
- Hotfix 규모
- docs/config만 변경된 PR

## 산출물

PR 본문에 인라인 삽입:

```
## Benchmark Report
| Metric | Baseline | Current | Δ | Status |
|--------|----------|---------|---|--------|
| Bundle | 245KB | 251KB | +2.4% | ✅ PASS |
| Tests | 12.3s | 13.1s | +6.5% | ✅ PASS |
```

---

## Core Web Vitals 런타임 게이트

브라우저 런타임 성능 회귀를 번들/테스트 시간 게이트와 **병렬**로 측정한다. 웹 프로젝트(`benchmarkEnabled: true`)에서 자동 활성화.

### 임계값 (industry standard)

| 메트릭 | Good | Needs Improvement | Poor(FAIL) |
|--------|------|------------------|------------|
| LCP (Largest Contentful Paint) | < 2.5s | 2.5s ~ 4.0s | > 4.0s |
| FID / INP (Interaction to Next Paint) | < 100ms | 100ms ~ 300ms | > 300ms |
| CLS (Cumulative Layout Shift) | < 0.1 | 0.1 ~ 0.25 | > 0.25 |
| FCP (First Contentful Paint) | < 1.8s | 1.8s ~ 3.0s | > 3.0s |
| TTFB (Time to First Byte) | < 0.8s | 0.8s ~ 1.8s | > 1.8s |

판정 기준: Good = PASS / Needs Improvement = WARN (PR 본문에 기록) / Poor = FAIL([STOP]).

### 측정 방법 — Playwright perf API

```javascript
// playwright run-code 로 CWV 수집
playwright-cli run-code "async page => {
  await page.goto(TARGET_URL, { waitUntil: 'networkidle' });
  const entries = await page.evaluate(() => {
    const nav = performance.getEntriesByType('navigation')[0];
    const paint = performance.getEntriesByType('paint');
    const lcp = performance.getEntriesByType('largest-contentful-paint').at(-1);
    const cls = performance.getEntriesByType('layout-shift')
      .reduce((sum, e) => sum + e.value, 0);
    return {
      ttfb: nav?.responseStart - nav?.requestStart,
      fcp: paint.find(e => e.name === 'first-contentful-paint')?.startTime,
      lcp: lcp?.startTime,
      cls: cls,
    };
  });
  return entries;
}"
```

### baseline 대비 회귀 WARN

1. PR 전 baseline 측정 → `cwv-baseline.json` 저장
2. feature 브랜치 측정 → 비교
3. 절댓값 임계 초과 **또는** baseline 대비 +25% 초과 시 WARN/FAIL

```bash
# baseline 캡처 (develop 브랜치)
playwright-cli eval "JSON.stringify(performance.getEntriesByType('navigation')[0])" > cwv-baseline.json

# 비교 리포트 포맷 (기존 번들 리포트와 병렬 출력)
## Benchmark Report — Core Web Vitals
| Metric   | Baseline | Current | Δ       | Status      |
|----------|----------|---------|---------|-------------|
| LCP      | 1.8s     | 2.1s    | +16.7%  | ⚠️ WARN    |
| INP      | 68ms     | 72ms    | +5.9%   | ✅ PASS    |
| CLS      | 0.05     | 0.04    | -20%    | ✅ PASS    |
```

### 스킵 조건

기존 번들/테스트 스킵 조건과 동일 + 로컬 dev 서버 미기동 시(`localhost` 접근 불가) 자동 스킵 후 WARN 기록.

---

## 독립 Evaluator (재계산 diff — LLM 없음)

> **원칙**: 생성자 ≠ 평가자. 다만 **판정이 결정론이 된 뒤로는 "다시 세는 것"이 곧 독립 검증**이다.

구 Evaluator 3기준은 전부 존재·산술이었다("3개 지표가 있나 / % 가 있나 / 판정이 붙었나").
그래서 LLM 을 한 번 더 부르지 않고, **같은 입력으로 다시 계산해 기록과 맞춰본다**:

```bash
printf '%s' '{"feature":{...},"baseline":{...},"recorded":{"verdict":"WARN","maxDeltaPct":15}}' \
  | node "${FORGE_ROOT:-$HOME/forge}/shared/scripts/benchmark-verdict.mjs" --self-check
```

- 종료코드 `0` = 기록과 재계산 일치 → 파이프라인 계속
- 종료코드 `1` = **불일치** → [STOP]. 판정이 결정론이라 불일치는 "입력이나 기록이 틀렸다"는 뜻이다
  — 재시도로 덮지 않는다(같은 입력이면 같은 답이 나온다 = 재시도는 loop theater).
- 종료코드 `2` = 입력 오류 → 판정이 아니다. 입력 JSON 을 고쳐 다시 실행한다.
- `evaluator.evalVerdict` = 구 3기준(C1 지표 3종 측정 / C2 변화율 존재 / C3 판정 적용) 판정을
  **무손실로 옮긴 것**이다. `FAIL` 이면 측정 단계(워크플로 1·2)로 돌아간다.

⚠️ 이 검증이 무력화되는 입력: 워크플로 **안에서** 바로 이어 돌리면 방금 그 스크립트의 출력과
대조하는 셈이라 구조적으로 항상 일치한다(그때는 C1~C3 만 실효). 판별력은 **저장된 리포트**를
대상으로 `--self-check` 를 돌릴 때 나온다.

근거: 2026-09-17 스킬 LLM→프로그램 전수조사(G2) · 선례 = canary `canary-judge.mjs --self-check`
폐기조건: benchmark 판정이 다시 주관 축(예: "이 회귀가 수용 가능한가")을 갖게 되면 LLM 레그를 되살린다.

## Workflow 통합 (계획서 P1)
병렬/다단계 실행 = Workflow 도구로 컨텍스트 격리 + resume 지원. 패턴: sequential (git stash/checkout 직렬 필수).
실행: `Workflow({ script: Bash("cat ~/.claude/skills/benchmark/workflow.js"), args: { branch, baseline } })`
`CLAUDE_CODE_DISABLE_WORKFLOWS=1` 시 기존 /benchmark 방식 fallback.
