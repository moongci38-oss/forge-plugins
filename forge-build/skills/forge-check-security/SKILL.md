---
name: forge-check-security
description: "코드베이스 보안 취약점 스캔 — 15-phase OWASP Top10+CI/CD+STRIDE+익스플로잇 감사. 출력: docs/qa/security/{branch-slug}.md. 트리거: QA T6 단계, PR 전 보안게이트, /forge-check-security 수동 호출."
---

# forge-check-security — 보안 취약점 스캔

**역할**: 15-phase CSO 심층 감사 — OWASP Top 10 + CI/CD + STRIDE 위협 모델 + 익스플로잇 패턴 + 트렌드 추적.
**게이트**: CRITICAL → FAIL (즉시 차단) / HIGH → WARN / MEDIUM/LOW → 리포트만.
진입점: `/forge-check-security`(커맨드) 및 qa T6. 절차 SSoT = 본 문서.

## 컨텍스트

QA Phase 1 T6(보안 WARN 게이트)에서 자동 트리거되거나 `/forge-check-security` 직접 호출 시 실행. 입력은 프로젝트 루트 경로(기본값 CWD)이며 PR 생성 전 보안 게이트로도 사용된다.

## 출력

`docs/qa/security/<branch-slug>.md`(CRITICAL/HIGH/MEDIUM/LOW 등급별 finding + 공격 시나리오 + 수정 방법) + PASS/WARN/FAIL 판정.

- 경로 계산(이 명령 그대로): `FORGE_SEC_SLUG=$(git branch --show-current | sed 's#[^A-Za-z0-9._-]#-#g')` → `docs/qa/security/${FORGE_SEC_SLUG}.md`. 브랜치명이 비면(detached HEAD) 스캔 전에 브랜치를 만든다.
- ⛔ **구 경로 `docs/qa/security-report.md` 에 쓰지 않는다** — 읽기 전용(하위호환)이다. 단일 롤링 파일이라 병렬 PR 끼리 항상 충돌했고(2026-09-14 하루 5회), 덮어쓰기로 다른 PR 의 "배포 전 필수" 절이 유실됐다(PR #60 r4b).
- 소비처(같은 규칙으로 찾는다): `/forge-pr` 신선도 검사 `shared/scripts/security-report-freshness.sh` · 머지 게이트 `qa-event-router.sh`(브랜치별 → 구 경로 순). 슬러그 드리프트는 `shared/scripts/tests/security-report-path-parity.test.sh` 가 막는다.
- 근거: harness-gaps/2026-09-15-cr-final-review-loop-non-convergent.md G-5 · 폐기조건: 리포트가 레포 밖(PR 코멘트 등)으로 옮겨가면 이 경로 규칙을 그 포인터로 바꾼다.

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
| S8 | Git 히스토리 시크릿 | HIGH | `git log -p HEAD <base>` — 현재 브랜치 도달 이력 + base 이력 속 하드코딩 비밀 고고학 (삭제된 시크릿 포함). base = `FORGE_SECURITY_BASE` → origin/develop → origin/main → develop → main. 타 브랜치까지 = `FORGE_SECURITY_S8_ALL=1`. 값에 `sk-test`·`not-real`·`dummy`·`fake` 가 든 더미는 제외. 매치엔 커밋 SHA·포함 브랜치 표기, git 없음/HEAD 없음 = LOW `S8-UNVERIFIED` |
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

### 4. 리포트 생성 (docs/qa/security/<branch-slug>.md)

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

## Evaluator (독립 검증 — 실제 호출)

<!-- root-cause(skills-1/S1-06, 2026-08-03 관측): 원래 있던 "자동 평가(eval-rubric 통합)"·"Evaluator (Wave 2.5)" 두 절은 8개 SKILL.md에 동일 문구로 복제된 산문이었고 "자동 누적"이라 썼지만 실행하는 hook/Agent() 호출이 0건이었다(재현: `grep -rn "eval-rubric\|eval_cases" .claude/hooks .claude/settings.json` → 무관 hit뿐). forge-check-security는 보안 판정(FAIL/PASS 오판 시 취약점 누락으로 직결)이라 독립 검증 가치가 크므로 이 스킬만 실제 Agent() 호출로 승격했다(나머지 6개는 제거만 — asset-extract/SKILL.md 등 참조). -->

`docs/qa/security/<branch-slug>.md` 생성 직후, 독립 Evaluator subagent로 판정의 구조적 완결성을 확인한다:

```python
Agent(
  subagent_type="general-purpose",
  model="haiku",  # 탐색·기계적 검증 tier — model-routing.md §워커 tier
  prompt=f"""아래 보안 리포트 하나만 읽고 PASS/WARN/FAIL 중 하나와 근거 1줄만 답하라.
파일: {report_path}
PASS: 15-phase 항목 전부 결과 기재(PASS/FAIL/N-A 중 하나) + CRITICAL/HIGH 발견 시 근거·재현경로 존재
WARN: 일부 phase 결과 누락 또는 N/A 처리에 근거 부족
FAIL: 파일 부재 / phase 결과 대부분 누락 / CRITICAL 발견인데 근거 없음
"""
)
```

판정 결과를 `~/.claude/skills/forge-check-security/eval_cases.jsonl`에 `{"case_id":"EC-forge-check-security-{N}", "verdict":"PASS|WARN|FAIL", "note":"..."}` 형태로 이어서 기록한다(자동 훅 없음 — 이 스텝에서 직접 append). 통합 패턴 정본 → `eval-rubric/references/skill-integration.md`.

## STRIDE 선언 대비 구현 대조 (스크립트 배선 — 2026-09-17, 구 phase-security-auditor 이관)

S11 은 위협을 **열거**한다. 그런데 계획서가 이미 선언해 둔 STRIDE 표가 실제 코드로 구현됐는지는
아무도 보지 않았다. 그 대조를 한다.

쉽게 말하면 **"위험 목록을 새로 쓰는 일"과 "약속한 자물쇠가 진짜 달렸는지 확인하는 일"은 다르다.**
지금까지는 뒤쪽이 통째로 비어 있었다.

**발동 조건**: 대상에 STRIDE 선언 표(`| T-{slug}-NN | ... | Disposition |`)를 가진 계획서·spec 이
있을 때만. 없으면 건너뛴다 — 선언이 없으면 대조할 대상도 없다.

⚠️ 이 대조는 **grep 카운트 판정일 뿐**이다(2026-09-17 LLM→프로그램 전수조사 우선순위 1위 —
`stride-defense-check.py` 머리 주석의 "정직성 주석" 참조). PASS = 방어 코드가 있다는 증명이
아니라 지정 키워드가 코드 어딘가에 매치했다는 뜻뿐이다. 판단이 필요 없어 **Agent 호출을 스크립트
실행으로 대체했다** — Opus/Sonnet 을 더 쓸 이유가 없었다.

```bash
python3 shared/scripts/stride-defense-check.py \
  --spec-glob "**/*.md" \
  --code "<target_code>" \
  --json /tmp/stride-result.json \
  --md /tmp/stride-result.md
```

`--spec-glob` 은 기존 `Grep(pattern=r"T-[a-z0-9-]+-\d\d\s*\|", glob="**/*.md")` 선언 탐지와 동일 패턴을
스크립트 내부에서 재현한다(구체적 spec 경로를 안다면 `--spec <path>` 로 직접 지정해도 된다).
출력 JSON 의 `verdict` 필드가 PASS/WARN/FAIL/MISSING 3+1단계 판정이고, `items[].evidence` 에
`파일:라인` 이 담긴다.

판정 결과는 위 Evaluator 와 같은 `eval_cases.jsonl` 에 이어 기록한다.

⚠️ **이 배선이 무력화되는 입력**: 계획서가 STRIDE 를 표가 아니라 **산문으로만** 적으면 위 Grep 이
못 잡고 조용히 건너뛴다 — 표 형식을 지키는 것이 이 배선의 나머지 절반이다. 또한 주석 안에
`authenticate` 같은 단어만 있어도 PASS 로 뜬다(스크립트 내부 주석 참조) — MISMATCH 없음이
"방어가 있다"의 증명이 아니다.

근거: 2026-08-22 ACHCE 감사 M-11(이 에이전트 언급 4곳·실호출 0건) + 2026-09-17 LLM→프로그램
전수조사(`~/forge-outputs/11-platform/pipelines/plans/2026-09-17-llm-to-program-inventory.md` ②-1) —
판정 로직이 이미 "정규식 grep → 개수 분류"로 100% 결정론이라 Agent 호출 자체가 불필요했다.
재현: `bash shared/scripts/tests/stride-defense-check.test.sh`
폐기조건: STRIDE 선언 관행 자체가 폐지되면 이 절과 스크립트를 함께 아카이브한다.

## Workflow 통합 (계획서 P1)
병렬/다단계 실행 = Workflow 도구로 컨텍스트 격리 + resume 지원. 패턴: parallel() S1~S7 7종 보안 스캔 → 집계.
실행: `Workflow({ script: Bash("cat ~/.claude/skills/forge-check-security/workflow.js"), args: { target } })`
`CLAUDE_CODE_DISABLE_WORKFLOWS=1` 시 기존 check-security.sh 방식 fallback.
