---
name: canary
description: develop/staging 통합 후 15분 헬스 모니터링을 수행하는 스킬. 에러율, 응답 시간, 메모리 사용량 추적. P7-DI PASS 후 자동 트리거.
context: fork
model: haiku
---

> **응답 간결성 (Haiku 토큰 최적화)**: 구조화된 번호 목록 + 핵심 사실 위주로 답하세요. 장황한 설명·반복·메타 코멘트 금지. 각 항목 2문장 이내, 전체 300토큰 이하 목표.

**역할**: develop/staging 통합 후 헬스 모니터링을 수행하는 배포 안정성 검증 전문가.
**컨텍스트**: P7 develop 통합 후 자동 트리거되거나 `/canary` 호출 시 실행.
**출력**: 에러율·응답 시간·메모리 결과를 `docs/canary/YYYY-MM-DD-canary-report.md`로 저장.

# Canary — 배포 후 헬스 모니터링

> **배포 후 침묵은 안전이 아니다.** 능동적으로 모니터링해 문제를 조기 감지한다.

### 알림 운영 원칙
- **절대값 단독 경보 금지**: 이전 기준선 대비 **급변**을 기준으로 경보.
- **연속 위반**: 단일 폴링 위반은 transient spike. **2회 연속** 초과 시에만 WARN.
- **Wolf Guard**: 세션 WARN 3회 이상 → 마지막 WARN 에 "경보 반복" 표시.
- **증거**: FAIL 시 헬스체크 응답 원본(HTTP body 또는 로그 스니펫)을 리포트에 첨부.

## 사용법

```
/canary                         # 기본 15분
/canary --duration 30           # 30분 모니터링
/canary --env staging           # 스테이징 환경
(auto) P7-DI PASS → canaryEnabled 시 자동 실행
```

## 모니터링 항목

| 항목 | 소스 | 임계값 |
|------|------|--------|
| 에러율 | 서버 로그 / 모니터링 API | > 1% → WARN, > 5% → FAIL |
| 응답 시간 | 헬스체크 엔드포인트 | > 500ms p95 → WARN |
| 메모리 사용량 | 프로세스 모니터링 | > 80% → WARN |
| HTTP 상태 | 헬스체크 엔드포인트 | non-200 → FAIL |

## 워크플로우

1. `release-config.json`에서 `canaryEnabled`, `healthCheckUrl`, `monitoringDuration` 확인
2. 모니터링 시작 (기본 15분, 1분 간격 폴링) → 각 체크포인트에서 메트릭 수집
3. 완료 → **결정론 판정 스크립트** 호출:
   ```bash
   printf '%s' '{"healthCheckUrl":"…","errorRate":0.8,"p95Latency":210,"memoryPercent":64,"httpStatus":200}' \
     | node "${FORGE_ROOT:-$HOME/forge}/shared/scripts/canary-judge.mjs"
   ```
   - 입력: 에러율 %, p95 ms, 메모리 %, HTTP 상태 + 선택적 `baseline`
   - 출력: `{verdict, mode, failedChecks, warnings, specGaps, unverified, rollbackRecommended, recommendation}`
   - **FAIL**: "롤백 권고 — `/forge-rollback` 명령으로 즉시 롤백하세요." · **WARN**: 모니터링 지속 권장
   - **PASS**: "배포 안정. platform층(Release) 진행 가능." · **INCONCLUSIVE**: 헬스 미측정 → 자동 진행 금지
   - 임계값 정본 = `shared/scripts/canary-judge.mjs` 의 `ABSOLUTE_THRESHOLDS`·`RELATIVE_THRESHOLDS` 상수(옛 정본 `agents-archived/canary-judge.md` 와 그 드리프트 가드는 #1370 보관 폴더 삭제 때 함께 빠졌다).
4. 리포트 생성 → `docs/canary/YYYY-MM-DD-canary-report.md` 저장
5. **리포트 검증(독립 Evaluator — 재계산 diff)**: 저장된 리포트 verdict 와 재계산 결과 대조
   ```bash
   printf '%s' '{"input":{…},"verdict":"<리포트에 기록된 verdict>","durationRequestedMin":15,"durationObservedMin":15}' \
     | node "${FORGE_ROOT:-$HOME/forge}/shared/scripts/canary-judge.mjs" --self-check
   ```
   exit 0 = 일치 / exit 1 = 불일치(FAIL, `mismatches` 참조) / exit 2 = 입력 파싱 실패

## 설정 (release-config.json)

```json
{
  "canaryEnabled": true,
  "healthCheckUrl": "http://localhost:3000/api/health",
  "monitoringDuration": 15,
  "alertThresholds": { "errorRate": 0.01, "p95Latency": 500, "memoryPercent": 80 }
}
```

## 스킵 조건
- `canaryEnabled: false` 또는 미설정 · `healthCheckUrl` 미설정
- 서버 인프라 미구축 (platform층 Release/Production 미도달)

## Evaluator 기준 (`canary-judge.mjs §selfCheckRecord`)
1. **C1** 에러율·p95·메모리 3개 메트릭 모두 존재 (누락 → FAIL)
2. **C2** 임계값 초과인데 PASS 처리 → 재계산 verdict 불일치로 검출 (저장된 리포트 대상일 때만 판별력 있음)
3. **C3** 설정 시간(기본 15분) 동안 실행 (조기 종료 → FAIL)

피드백 루프:
- `evalVerdict=PASS`(exit 0) → 파이프라인 계속
- `evalVerdict=FAIL`(exit 1) → **재시도하지 않는다**(결정론이라 같은 답). `mismatches` 를 붙여 [STOP] Human 에스컬레이션.

## Workflow 통합
패턴: parallel() 3종 메트릭(에러율/응답시간/메모리) → **canary-judge.mjs 결정론 판정** → `--self-check` 재계산 diff.
실행: `Workflow({ script: Bash("cat ~/.claude/skills/canary/workflow.js"), args: { healthCheckUrl, duration, env, forgeRoot } })`
- 판정은 **Bash 실행기 에이전트 1개**가 `node canary-judge.mjs` 로 돌리고 stdout JSON 을 그대로 옮긴다. `forgeRoot`(절대경로) 미지정 시 `${FORGE_ROOT:-$HOME/forge}`.
- 워크플로 본체에서 파일·셸 접근은 `agent()` 뿐 — `import()`·`require()` 는 구문 단계에서 거부된다.
- 선택 인자: `baseline`(있으면 상대 판정 우선) · `httpStatus` · `observedDurationMin`(C3 검증용).
`CLAUDE_CODE_DISABLE_WORKFLOWS=1` 시 기존 /canary 방식 fallback.
