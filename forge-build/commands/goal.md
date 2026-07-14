---
description: "[DEPRECATED alias] /forge-fix --loop 로 흡수됨 — 자율 PEV 루프 (AD-93 §갭 9, 버그수정 파이프라인 통합 plan v1.1 §5-8/D6)"
group: qa
---

# /goal — DEPRECATED alias → `/forge-fix --loop`

> **DEPRECATED alias**: `/goal`의 PEV 루프 기능은 `/forge-fix --loop "<종료조건>"`로 흡수됐다(버그수정 파이프라인 통합 plan v1.1 §2 D6).
> 이 커맨드는 진입점으로 유지되되 실제 실행은 **`/forge-fix --loop`로 위임**한다. 신규 사용 시 `/forge-fix --loop "<종료조건>"`을 직접 호출할 것.
> 아래 종료조건 표·PEV 설명은 **참조용**(엔진 동작 이해)으로 남긴다 — 진입은 forge-fix --loop.

# /goal — 자율 종료 조건 PEV 루프 (참조용 — 진입은 `/forge-fix --loop`)

**입력**: 종료 조건 문자열 (예: `scope=auth 모든 시나리오 PASS`)

**동작**: PEV (Plan → Execute → Verify) 자율 반복

```
/goal "scope=auth 모든 시나리오 PASS"
  │
  ├─ Plan: 현재 qa-report.md 상태 분석 + 다음 액션 결정
  ├─ Execute: /qa 또는 healer 직접 실행
  ├─ Verify: qa-report.md PASS/FAIL 판정
  └─ Loop: 종료 조건 미충족 시 반복
```

**종료 조건 (하나라도 충족 시 즉시 종료)**:

| 조건 | 결과 |
|------|------|
| 모든 시나리오 PASS (oracle-manifest 없음 시, 또는 fr-verdict.json stale) | END(SUCCESS) |
| oracle-manifest 충족: FR매핑100%+미매핑0+테스트GREEN+화면매핑100%(파일존재 proxy)+회귀0 — **구현됨(2026-06-26): `check_oracle_manifest()` 배선. manifest 없음/fr-verdict stale → coarse 폴백 유지.** ⚠️ **한계: unmappedFRs→forge-implement 자동 라우팅 미구현** — FR-gap 프로젝트는 plateau/cycle-cap STOP됨 (auto-routing = 별도 backlog). 화면매핑 = 파일존재 proxy, 진짜 검증은 forge-check-ui Check 8.6 별도 수행 | END(SUCCESS) |
| same-issue 3회 (sha256 트리플 키) | END(STOP) |
| 총 6사이클 초과 | END(STOP) |
| plateau 2연속 (진전 없음) | END(STOP) |
| 회귀 감지 (baseline PASS→FAIL) | END(STOP) |
| 보안 CRITICAL 발견 | END(STOP) |

> call-budget(tool-call 횟수)는 goal-pev STOP이 아니라 **hook `qa-event-router.sh` check_call_cap의 WARN-only**(아래 표). goal-pev은 payload SID를 못 얻어 STOP_CALL_CAP이 구조적으로 불가(cr-double 4R) → 제거.

> **oracle-PEV 라우팅**: unmappedFRs → **[ORACLE-ADVISORY] 로그로 `/forge-implement --spec <spec경로>` 권고** (옵션A — 자동 실행 X, Human 판단. 2026-06-26 배선) / 버그RED=healer / 디자인위반=직접Edit. 디자인 세부(style-guide) = **WARN만** (Goodhart 방지 — blocking X).

> **구현 배선 (P4c-3, loop-kernel §1/§2 conformance)** — 이전엔 same-issue/plateau/token이 선언만 되고 미발화(orphan)였음. 현재 `goal-pev.py`에 실배선 + E2E 검증:
> | stop-condition | 데이터 소스 (producer) | 판정 (consumer) |
> |---|---|---|
> | same-issue 3연속 사이클 | `same-issue-key.py` fingerprint 함수 **in-process import**(SSoT, sha256 트리플키 file:symbol:error_class — kernel §2 구조화id). goal-pev가 매 사이클 bug-report의 Bug #N → **deduped present set** | `state.same_issue_count`={fp:연속카운트}. present는 +1, absent는 drop(reset). max ≥ 3 → STOP_SAME_ISSUE. (단조 `/tmp` tracker 미사용 — collision-inflation·run간 누수 방지) |
> | plateau 2연속 | `state.history[].fail`(check_qa_report fail_count 매 사이클 기록) | 최근 3 fail의 Δ 2개 모두 < ε(QA_PLATEAU_EPSILON=5) → STOP_PLATEAU. Δ<0(회귀)도 진전없음으로 포함 |
> | call-budget (B2 tool-call-count) — **hook WARN-only, goal-pev STOP 아님** | producer: `loop-call-accum.sh` PostToolUse 훅이 payload `.session_id`로 `${PWD}/.claude/agent-budget/${SID}.calls`에 tool-call **실측 횟수** 누적 | consumer: **hook `qa-event-router.sh` check_call_cap** — payload `.session_id` 우선 도출로 `.calls` 읽어 ≥ CAP(기본 600) → **WARN**(비차단). goal-pev STOP_CALL_CAP은 **제거**됨 — goal-pev은 payload 없는 스크립트라 producer가 키잉한 SID를 신뢰성있게 못 얻어(CLAUDE_SESSION_ID unset 빈번) STOP이 dead거나 타세션 오살(cr-double 4R 반복지적). call-budget 가드는 payload SID를 가진 hook에 단일화. ⚠️ 토큰(output_tokens)은 PostToolUse payload에 부재라 theater여서 tool-call 횟수로 전환. 훅 미등록 시 `.calls` 부재→WARN 미발화(안전, max_cycles가 결정론 bound 1순위). 등록 = settings.json PostToolUse(AD-168 Human). enforcement-theater 2단계(WARN-first→1주 메트릭→BLOCK 승격)와 정합 |

> **FOP 종료조건 (데이터 변경 버그 — advisory, 2026-07-01)**: 데이터 변경/CRUD 버그의 진정한 "완료" = 버그별 **FOP PASS**(`fop-validate.py`). qa-report PASS만으로는 증상 계층 통과일 수 있어 false-green 잔존 가능. 현재 = **advisory**: 각 버그 FOP verdict를 goal-loop 로그에 기록(INCOMPLETE/FAIL이면 WARN), 아직 루프 STOP 게이트는 아님(1주 metrics 후 "INCOMPLETE 있으면 END(SUCCESS) 차단"으로 승격 예정). SSoT: `11-platform/pipelines/forge-dev/2026-07-01-v1-fix-outcome-gate/plan.md`.

**출력**: `docs/qa/goal-loop-{ts}.log` + `docs/qa/goal-loop-state.json`

**구현**: `scripts/goal-pev.py` 직접 호출 또는 메인 컨텍스트 PEV 패턴 실행

```bash
# 직접 실행
python3 ~/forge/.claude/skills/qa/scripts/goal-pev.py \
  --condition "scope=auth 모든 시나리오 PASS" \
  --scope auth

# /qa와 통합
/qa --scope=auth  # Phase A~H 자동 → /goal이 종료 조건 모니터링
```

**Ralph Loop 연동**: qa-event-router.sh SubagentStop 시 check_ralph_loop가 남은 FAIL + 사이클 조건 검사 → 자동 재주입 (goal-loop-state.json 소비)
