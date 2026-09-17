---
name: canary
description: develop/staging 통합 후 15분 헬스 모니터링을 수행하는 스킬. 에러율, 응답 시간, 메모리 사용량 추적. P7-DI PASS 후 자동 트리거.
context: fork
model: haiku
---

> **응답 간결성 (Haiku 토큰 최적화)**: 구조화된 번호 목록 + 핵심 사실 위주로 답하세요. 장황한 설명·반복·메타 코멘트 금지. 각 항목 2문장 이내, 전체 300토큰 이하 목표.

**역할**: 당신은 develop/staging 통합 후 헬스 모니터링을 수행하는 배포 안정성 검증 전문가입니다.
**컨텍스트**: P7 develop 통합 후 자동 트리거되거나 `/canary` 호출 시 실행됩니다.
**출력**: 에러율·응답 시간·메모리 사용량 모니터링 결과를 `docs/canary/YYYY-MM-DD-canary-report.md`로 저장합니다.

# Canary — 배포 후 헬스 모니터링

develop/staging 통합 후 일정 시간 헬스 모니터링을 수행한다.

## 핵심 원칙

> **배포 후 침묵은 안전이 아니다.**
> 능동적으로 모니터링하여 문제를 조기 감지한다.

### 알림 운영 원칙 (Alert on Changes, Not Absolutes)

- **절대값 단독 경보 금지**: 에러율 0.8% 자체가 아니라 **이전 기준선 대비 급변** 을 기준으로 경보한다.
- **연속 위반 기준**: 단일 폴링 위반은 transient spike로 간주. **2회 연속** 임계값 초과 시에만 WARN 발행.
- **Wolf Guard**: 한 세션에서 WARN이 3회 이상 발행되면 "경보 피로" 위험 — 마지막 WARN에 "경보 반복" 표시 추가.
- **스크린샷 증거**: FAIL 판정 시 헬스체크 응답 원본(HTTP body 또는 로그 스니펫)을 리포트에 첨부한다.

## 사용법

(manual)
/canary                         # 기본 15분
/canary --duration 30           # 30분 모니터링
/canary --env staging           # 스테이징 환경

(auto-trigger)
P7-DI PASS → canaryEnabled 시 자동 실행

## 모니터링 항목

| 항목 | 소스 | 임계값 |
|------|------|--------|
| 에러율 | 서버 로그 / 모니터링 API | > 1% → WARN, > 5% → FAIL |
| 응답 시간 | 헬스체크 엔드포인트 | > 500ms p95 → WARN |
| 메모리 사용량 | 프로세스 모니터링 | > 80% → WARN |
| HTTP 상태 | 헬스체크 엔드포인트 | non-200 → FAIL |

## 워크플로우

1. `release-config.json`에서 `canaryEnabled`, `healthCheckUrl`, `monitoringDuration` 확인
2. 모니터링 시작 (기본 15분, 1분 간격 폴링)
3. 각 체크포인트에서 메트릭 수집
4. 모니터링 완료 → **결정론 판정 스크립트** 호출 (2026-09-16: LLM 에이전트에서 이관)

   ```bash
   printf '%s' '{"healthCheckUrl":"…","errorRate":0.8,"p95Latency":210,"memoryPercent":64,"httpStatus":200}' \
     | node "${FORGE_ROOT:-$HOME/forge}/shared/scripts/canary-judge.mjs"
   ```
   - 입력: 수집된 메트릭(에러율 %, p95 ms, 메모리 %, HTTP 상태) + 선택적 `baseline`
   - 출력: `{verdict, mode, failedChecks, warnings, specGaps, unverified, rollbackRecommended, recommendation}`
   - **FAIL**: "롤백 권고 — `/forge-rollback` 명령으로 즉시 롤백하세요." · **WARN**: 모니터링 지속 권장
   - **PASS**: "배포 안정. platform층(Release) 진행 가능." · **INCONCLUSIVE**: 헬스 미측정 → 자동 진행 금지
   - ⚠️ 임계값 정본은 여전히 `.claude/agents-archived/canary-judge.md` §판정 기준이다(2026-09-16 검수 다이어트 §B1 — 스폰 0건이라 에이전트는 아카이브, 정본 역할만 유지. 구 경로 `.claude/agents/canary-judge.md` 는 폐기) — 스크립트는 그것을 옮긴 것이고,
     `shared/scripts/canary-judge.test.mjs` 의 드리프트 가드가 두 곳이 갈라지면 FAIL 시킨다.
5. 리포트 생성 → `docs/canary/YYYY-MM-DD-canary-report.md` 저장
6. **리포트 검증(재계산 diff)** — 저장된 리포트의 verdict 가 재계산 결과와 같은지 대조:
   ```bash
   printf '%s' '{"input":{…},"verdict":"PASS","durationRequestedMin":15,"durationObservedMin":15}' \
     | node "${FORGE_ROOT:-$HOME/forge}/shared/scripts/canary-judge.mjs" --self-check
   ```
   exit 0 = 일치 / exit 1 = 불일치(FAIL, `mismatches` 참조) / exit 2 = 입력 파싱 실패

## 설정 (release-config.json)

```json
{
  "canaryEnabled": true,
  "healthCheckUrl": "http://localhost:3000/api/health",
  "monitoringDuration": 15,
  "alertThresholds": {
    "errorRate": 0.01,
    "p95Latency": 500,
    "memoryPercent": 80
  }
}
```

## 스킵 조건

- `canaryEnabled: false` 또는 미설정
- `healthCheckUrl` 미설정
- 서버 인프라 미구축 (platform층 Release/Production 미도달)

## 산출물

`docs/canary/YYYY-MM-DD-canary-report.md`

---

## 독립 Evaluator (하네스) — 재계산 diff

> **원칙**: 생성자 ≠ 평가자. 자기평가 편향 방지.

**2026-09-16 변경(계획서 §2 B2)**: 종전에는 **LLM 판정을 또 LLM(sonnet Agent)으로 재검증**했다.
판정이 결정론 스크립트가 된 뒤로 그 일은 **`재계산 결과 == 기록된 결과` 대조 한 줄**이 된다 —
사람이 지어낼 수도, 모델이 흔들릴 수도 없다.

```bash
printf '%s' '{"input":{…},"verdict":"<리포트에 기록된 verdict>","durationRequestedMin":15,"durationObservedMin":15}' \
  | node "${FORGE_ROOT:-$HOME/forge}/shared/scripts/canary-judge.mjs" --self-check
```

원본 Evaluator 3기준은 `canary-judge.mjs §selfCheckRecord` 에 **그대로** 옮겨져 있다:
1. **C1** 에러율·응답시간(p95)·메모리 3개 메트릭이 모두 있는가 (하나라도 누락 → FAIL)
2. **C2** 임계값 초과가 있는데 PASS 로 처리됐는가 → 재계산 verdict 와의 불일치로 잡힌다
3. **C3** 설정 시간(기본 15분) 동안 실행됐는가 (조기 종료 → FAIL)

피드백 루프:
- `evalVerdict=PASS`(exit 0) → 파이프라인 계속
- `evalVerdict=FAIL`(exit 1) → **재시도하지 않는다.** 판정이 결정론이라 같은 입력을 다시 돌리면
  반드시 같은 답이 나온다(재판정 재시도 = loop theater). 불일치는 입력·기록이 틀렸다는 뜻이므로
  `mismatches` 를 붙여 [STOP] Human 에스컬레이션.

⚠️ **C2 의 판별력이 나오는 자리**: 워크플로 내부에서는 verdict 가 방금 그 스크립트의 출력이라
C2 가 구조적으로 항상 일치한다(거기서는 C1·C3 만 실효). C2 는 **저장된 리포트**를 대상으로
`--self-check` 를 돌릴 때 의미가 생긴다 — 위 워크플로 6단계가 그 경로다.

## Workflow 통합 (계획서 P1)
병렬/다단계 실행 = Workflow 도구로 컨텍스트 격리 + resume 지원.
패턴: parallel() 3종 메트릭(에러율/응답시간/메모리) → **canary-judge.mjs 결정론 판정** → `--self-check` 재계산 diff.
실행: `Workflow({ script: Bash("cat ~/.claude/skills/canary/workflow.js"), args: { healthCheckUrl, duration, env, forgeRoot } })`

- 판정 스크립트는 **Bash 실행기 에이전트 1개**가 `node canary-judge.mjs` 로 돌리고 stdout JSON 을 그대로
  옮긴다(판정은 스크립트가, 에이전트는 실행만). `forgeRoot`(절대경로)를 넘기면 그 레포의 스크립트를 쓰고,
  안 주면 `${FORGE_ROOT:-$HOME/forge}` 다. ⚠️ 워크플로 스크립트 본체에서 파일·셸에 닿는 수단은 `agent()` 뿐이다 —
  `import()`·`require()` 는 런타임이 **구문 단계에서 거부**한다(2026-09-17 실측, 구 "동적 import 경로 A" 폐지).
- 선택 인자: `baseline`(있으면 상대 판정 우선) · `httpStatus` · `observedDurationMin`(C3 검증용).
`CLAUDE_CODE_DISABLE_WORKFLOWS=1` 시 기존 /canary 방식 fallback.
