---
name: forge-check-security
description: "코드베이스 보안 취약점 자동 스캔 스킬. 15-phase CSO 심층 감사(OWASP Top 10 + CI/CD + STRIDE + 익스플로잇 패턴 + 트렌드). 입력: 프로젝트 루트 경로(기본값 CWD). 출력: docs/qa/security-report.md (CRITICAL/HIGH/MEDIUM/LOW 등급 리포트 + PASS/WARN/FAIL 판정). QA Phase 1 T6(보안 WARN 게이트)로 자동 트리거되거나 /forge-check-security 직접 호출. 트리거: QA T6 단계, PR 생성 전 보안 게이트, 수동 보안 검수."
---

# forge-check-security — 보안 취약점 스캔

**역할**: 15-phase CSO 심층 감사 — OWASP Top 10 + CI/CD + STRIDE 위협 모델 + 익스플로잇 패턴 + 트렌드 추적.
**게이트**: CRITICAL → FAIL (즉시 차단) / HIGH → WARN / MEDIUM/LOW → 리포트만.
진입점: `/forge-check-security`(커맨드) 및 qa T6. 절차 SSoT = 본 문서.

## 컨텍스트

QA Phase 1 T6(보안 WARN 게이트)에서 자동 트리거되거나 `/forge-check-security` 직접 호출 시 실행. 입력은 프로젝트 루트 경로(기본값 CWD)이며 PR 생성 전 보안 게이트로도 사용된다.

## 출력

`docs/qa/security-report.md`(CRITICAL/HIGH/MEDIUM/LOW 등급별 finding + 공격 시나리오 + 수정 방법) + PASS/WARN/FAIL 판정.

## 컨텍스트

QA Phase 1 T6(보안 WARN 게이트)에서 자동 트리거되거나 `/forge-check-security` 직접 호출 시 실행. 입력은 프로젝트 루트 경로(기본값 CWD)이며 PR 생성 전 보안 게이트로도 사용된다.

## 출력

`docs/qa/security-report.md`(CRITICAL/HIGH/MEDIUM/LOW 등급별 finding + 공격 시나리오 + 수정 방법) + PASS/WARN/FAIL 판정.

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
| S7 | 취약 의존성 (Python) | HIGH | pip-audit / OSV 취약 Python 의존성 |
| S8 | Git 히스토리 시크릿 | HIGH | `git log -p -S <keyword>` — 커밋 이력 속 하드코딩 비밀 고고학 (삭제된 시크릿 포함) |
| S9 | LLM 보안 | MEDIUM | LLM 출력→innerHTML/dangerouslySetInnerHTML/eval 미검증, 무제한 LLM 호출, AI API 키 노출 |
| S10 | CI/CD 파이프라인 보안 | HIGH | `.github/workflows/*.yml` secrets 노출·`pull_request_target` 무단 트리거·privileged runner·외부 action 버전 미고정 |
| S11 | STRIDE 위협 모델 | HIGH | Spoofing(인증 위조)·Tampering(데이터 변조)·Repudiation(부인)·Info Disclosure·DoS·Elevation of Privilege — 주요 진입점별 위협 열거 |
| S12 | API 보안 심화 | HIGH | rate limit 없음·`Access-Control-Allow-Origin: *` 과대 허용·BOLA/IDOR(권한 없는 객체 직접 참조)·경계 입력 검증 누락 |
| S13 | 컨테이너/인프라 보안 | HIGH | Dockerfile `USER root`·`COPY .env`·`--privileged`·불필요 포트 노출·non-root 사용자 미설정 |
| S14 | 익스플로잇 패턴 | CRITICAL/HIGH | path traversal(`../../../`)·SSRF(사용자 제어 URL fetch)·prototype pollution·XXE(외부 엔티티 XML)·안전하지 않은 역직렬화 |
| S15 | 트렌드/신흥 위협 | MEDIUM | AI 공급망 공격·프롬프트 인젝션(AI-facing 코드)·최근 CVE 패턴(사용 라이브러리 버전 대조)·slopsquatting/의존성 컨퓨전 |

### 3. 등급 판정

| 등급 | 조건 | QA 게이트 행동 |
|------|------|--------------|
| CRITICAL | S1 하드코딩 / S2 고위험 / S14 path traversal·SSRF | FAIL — Phase 1 즉시 [STOP] |
| HIGH | S2 중위험 / S3 인증 누락 / S6·S7 취약 의존성 / S8 Git 히스토리 / S10 CI/CD / S11 STRIDE / S12 API / S13 컨테이너 / S14 저위험 익스플로잇 | WARN — Phase 4 Human 확인 |
| MEDIUM | S4 로그 노출 / S5 XSS / S9 LLM 보안 / S15 트렌드 | 리포트 기록만 |
| LOW | 경고성 패턴 | 리포트 기록만 |

### 공급망 보안 가드 (P2 gsd WI-15/20)

신규 의존성 추가·PR 병합 시:
- 패키지명 오타(slopsquatting/typosquatting) 확인 — npm/PyPI 공식명 대조
- 주간 다운로드 < 1,000 = 수동 확인 필수
- package.json/requirements.txt 변경 감지 시 S8 추가 트리거

### 4. 리포트 생성 (docs/qa/security-report.md)

```
# Security Report — {프로젝트명}
일시: {date} | 판정: PASS / WARN ({N}건 HIGH) / FAIL ({N}건 CRITICAL)

CRITICAL (N건) — 즉시 차단
# | 파일:라인 | 패턴 ID | 설명 | 공격 시나리오 | 수정 방법

HIGH (N건) — WARN
# | 파일:라인 | 패턴 ID | 설명 | 공격 시나리오 | 수정 방법

**공격 시나리오 작성 의무 (HIGH 이상)**: 각 finding에 1~2줄로 실제 공격 경로를 서술한다.
예시 — S1(하드코딩 시크릿): "공격자가 GitHub 공개 저장소 또는 Docker 이미지 레이어에서 API 키 추출 →
즉시 외부 서비스 무단 사용 가능. 비용 폭탄 또는 데이터 유출."
예시 — S8(git 히스토리): "이미 삭제된 파일이라도 git clone 후 log -p 로 시크릿 복원 가능.
퇴직 개발자 접근 이력 보유 시 더 심각."

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
병렬/다단계 실행 = Workflow 도구로 컨텍스트 격리 + resume 지원. 패턴: parallel() S1~S7 7종 보안 스캔 → 집계.
실행: `Workflow({ script: Bash("cat ~/.claude/skills/forge-check-security/workflow.js"), args: { target } })`
`CLAUDE_CODE_DISABLE_WORKFLOWS=1` 시 기존 check-security.sh 방식 fallback.
