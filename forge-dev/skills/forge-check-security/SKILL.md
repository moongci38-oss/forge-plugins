---
name: forge-check-security
description: "코드베이스 보안 취약점 자동 스캔 스킬. OWASP Top 10 패턴 기반 정적 분석 + 하드코딩 시크릿 검출. 입력: 프로젝트 루트 경로(기본값 CWD). 출력: docs/qa/security-report.md (CRITICAL/HIGH/MEDIUM/LOW 등급 리포트 + PASS/WARN/FAIL 판정). QA Phase 1 T6(보안 WARN 게이트)로 자동 트리거되거나 /forge-check-security 직접 호출. 트리거: QA T6 단계, PR 생성 전 보안 게이트, 수동 보안 검수."
---

# forge-check-security — 보안 취약점 스캔

**역할**: OWASP Top 10 기반 정적 분석으로 코드베이스 보안 취약점 탐지.
**게이트**: CRITICAL → FAIL (즉시 차단) / HIGH → WARN / MEDIUM/LOW → 리포트만.

## 실행 순서 (4단계)

### 1. 스캔 대상 결정

기본값: CWD. `--target <path>` 로 특정 디렉토리 지정.
기본 제외: node_modules/ vendor/ .git/ dist/ build/ coverage/

### 2. 보안 스캔 실행

`scripts/check-security.sh` 실행:

```
bash ~/forge/.claude/skills/forge-check-security/scripts/check-security.sh "$TARGET"
# JSON 결과: /tmp/security-scan-results.json
```

스캔 항목 (OWASP A01~A09):

| ID | 항목 | 등급 | 패턴 |
|----|------|------|------|
| S1 | 하드코딩 시크릿 | CRITICAL | password/secret/api_key 하드코딩 |
| S2 | SQL 인젝션 | HIGH | 문자열 concat SQL |
| S3 | 인증 누락 | HIGH | auth 미들웨어 없는 보호 라우트 |
| S4 | 민감 데이터 로그 | MEDIUM | console.log + password/token |
| S5 | XSS 위험 | MEDIUM | innerHTML 미검증 입력 |
| S6 | 취약 의존성 | HIGH | npm audit CRITICAL/HIGH |

### 3. 등급 판정

| 등급 | 조건 | QA 게이트 행동 |
|------|------|--------------|
| CRITICAL | S1 하드코딩 / S2 고위험 | FAIL — Phase 1 즉시 [STOP] |
| HIGH | S2 중위험 / S3 인증 누락 / S6 취약 의존성 | WARN — Phase 4 Human 확인 |
| MEDIUM | S4 로그 노출 / S5 XSS | 리포트 기록만 |
| LOW | 경고성 패턴 | 리포트 기록만 |

### 4. 리포트 생성 (docs/qa/security-report.md)

```
# Security Report — {프로젝트명}
일시: {date} | 판정: PASS / WARN ({N}건 HIGH) / FAIL ({N}건 CRITICAL)

CRITICAL (N건) — 즉시 차단
# | 파일:라인 | 패턴 ID | 설명 | 수정 방법

HIGH (N건) — WARN
# | 파일:라인 | 패턴 ID | 설명 | 수정 방법

MEDIUM / LOW
# | 파일:라인 | 패턴 ID | 설명

판정 근거
CRITICAL N건 → FAIL/없음
HIGH N건 → WARN/없음
최종 판정: PASS / WARN / FAIL
```

## QA T6 배선

/qa Phase 1 T6에서 서브에이전트로 호출 (1레벨 — AD-92-1 준수):

- FAIL → Phase 1 즉시 [STOP], CRITICAL 항목 Human에게 명시
- WARN → Phase 4 PR 본문에 HIGH 항목 목록 추가, Human 확인 후 머지
- PASS → Phase 1 계속 진행

## 자동 평가 (eval-rubric 통합)

호출 시점: docs/qa/security-report.md 생성 직후

절차:
1. /eval-rubric --target docs/qa/security-report.md
2. verdict + 4축 점수 수신
3. eval_cases.jsonl append — case_id: EC-forge-check-security-{N}

자동 비활성: EVAL_RUBRIC_AUTO=off

## Evaluator (Wave 2.5)

독립 Evaluator subagent가 산출물 품질을 검증합니다.

```
Evaluator 역할: 산출물 독립 검증
모델: claude-haiku-4-5 (경량, 편향 최소화)
격리: 메인 컨텍스트 오염 방지
```

판정 기준:
- PASS: 모든 핵심 기준 충족, 즉시 사용 가능
- WARN: 사용 가능하나 개선 권장, 사용자 확인 후 진행
- FAIL: 핵심 기준 미충족, 재실행 필요

eval_cases.jsonl에 결과 자동 누적.

## Workflow 통합 (계획서 P1)
병렬/다단계 실행 = Workflow 도구로 컨텍스트 격리 + resume 지원. 패턴: parallel() S1~S6 6종 보안 스캔 → 집계.
실행: `Workflow({ script: Bash("cat ~/.claude/skills/forge-check-security/workflow.js"), args: { target } })`
`CLAUDE_CODE_DISABLE_WORKFLOWS=1` 시 기존 check-security.sh 방식 fallback.
