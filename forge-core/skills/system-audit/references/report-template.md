> 출처: system-audit/SKILL.md Step 5 의 보고서 틀.

## 통합 보고서 작성 (SKILL.md Step 5)

**저장 위치:** `${FORGE_OUTPUTS:-$HOME/forge-outputs}/docs/reviews/audit/{date}-system-audit[-{target}].md`
(`target`이 `system`이면 suffix 생략)

**보고서 형식:**

```markdown
# 12축 통합 시스템 감사 보고서

**대상**: {target} | **날짜**: {date}

## 0. 실행 방식과 한계

| 항목 | 이번 회차 |
|---|---|
| 실행 주체 | 단독 실측(한 세션 또는 에이전트 1개 — #1415) |
| 측정 원문 | `<audit-dir>/{date}-measure.txt`(measure.sh 출력 — Step 6 린트 `--measure`) |
| 평가자 | 린트 + 2단계 판정(PASS/FAIL/미판정 residual) |
| 측정 오염 | 감사 명령이 남긴 로그 등 (없으면 "없음") |

## Executive Summary

**감사 총평: {통과|통과 아님}** — 보안 축 CRITICAL {n} · HIGH {n} (1건이라도 있으면 통과 아님 · 점수와 상쇄하지 않는다)

**전체 점수(점수 10축 가중): {전체점수}/100** · Security {통과|통과 아님} · Bloat {통과|통과 아님} · 필수 13항목 통과 {n}/13

| 축 | 점수 | 등급 | 핵심 발견 |
|----|:----:|:----:|---------|
| Agentic | {A}/100 | ⭐~⭐⭐⭐⭐⭐ | |
| Context | {C}/100 | | |
| Harness | {H}/100 | | |
| Cost | {Co}/100 | | |
| Human-AI | {E}/100 | | |
| Prompt | {P}/100 | | |
| Loop | {L}/100 | | |
| Graph | {G}/100 | | |
| Compound | {Cp}/100 | | |
| Distribution | {D}/100 | | |

> 등급 기준: 90+ ⭐⭐⭐⭐⭐ / 75+ ⭐⭐⭐⭐ / 60+ ⭐⭐⭐ / 45+ ⭐⭐ / <45 ⭐ · Security·Bloat 은 점수 없이 판정만(위 줄)

## 1. 축별 감사 결과 요약

### 1.1 Agentic (자율성·도구·멀티에이전트)
{요약 + 발견 ≥2 (위치·이유·방법·재현 명령)}

### 1.2 Context (컨텍스트 엔지니어링)
{요약 + 발견 ≥2 (위치·이유·방법·재현 명령)}

### 1.3 Harness (측정·제어 — 보안은 1.12)
{요약 + 발견 ≥2 (위치·이유·방법·재현 명령)}

### 1.4 Cost (비용 효율)
{요약 + 발견 ≥2 (위치·이유·방법·재현 명령)}

### 1.5 Human-AI (경계 설계)
{요약 + 발견 ≥2 (위치·이유·방법·재현 명령)}

### 1.6 Redundancy (중복/drift 감지)
| 유형 | 항목 | 권고 | 위험도 |
|------|------|-----|:-----:|
| 스킬 중복 | {names} | merge | LOW |
| orphan agent | {names} | archive | MED |
| deprecated | {names} | archive | LOW |
| hook theater | {files} | fix | MED |
| rule overlap | {files} | merge | LOW |

요약: 중복 {N}건 / orphan {N}건 / deprecated {N}건 / theater {N}건

### 1.7 Prompt (지시문 품질 — 정의서 §1)
{요약 + 발견 ≥2 (위치·이유·방법·재현 명령)}

### 1.8 Loop (반복이 멈추고 수렴하는가 — §5)
{요약 + 발견 ≥2 (위치·이유·방법·재현 명령)}

### 1.9 Graph (작업 흐름 그래프: 노드·엣지·상태 — §6 · 지식그래프 사용률 아님)
{요약 + 발견 ≥2 (위치·이유·방법·재현 명령)}

### 1.10 Compound (한 일이 다음 일을 쉽게 만드는가 — §7)
{요약 + 발견 ≥2 (위치·이유·방법·재현 명령)}

### 1.11 Distribution (전 PC 에 발효되는가 — §8)
{요약 + 발견 ≥2 (위치·이유·방법·재현 명령)}

### 1.12 Security (보안 — 독립 축 · 다른 축과 평균 내지 않는다)

**판정: {통과|통과 아님}** · CRITICAL {n} · HIGH {n}

| ASI | 위험 | 측정 줄 | 실측값 | 판정 | 등급 |
|---|---|---|---|---|---|
| ASI01 | Agent Goal Hijack | `SEC_GUARD`(인젝션 차단) | | | |
| ASI02 | Tool Misuse | `SEC_ALLOW_BROAD_N` · `SEC_GUARD`(파괴 명령·강제 푸시·DB 대상) · `SEC_BYPASS_JOBS_N` | | | |
| ASI03 | Identity & Privilege Abuse | `SEC_GUARD`(민감 파일·명령·env·시크릿) · `SEC_GITLEAKS` · `SEC_KEY_PATTERNS_*` · `SEC_CRED_FILE` · `SEC_GH_SCOPES` | | | |
| ASI04 | Agentic Supply Chain Vulnerabilities | `SEC_MCP_N` · `SEC_PLUGINS_N` · `SEC_SKILLS_FOREIGN_N` · `SEC_MODS_N` | | | |
| ASI05 | Unexpected Code Execution | `SEC_EXEC_PATTERNS_N` · `SEC_SANDBOX` | | | |
| ASI06 | Memory & Context Poisoning | `SEC_NOT_MEASURED` → 아래 표 | | | |
| ASI07 | Insecure Inter-Agent Communication | `SEC_NOT_MEASURED` → 아래 표 | | | |
| ASI08 | Cascading Failures | `SEC_NOT_MEASURED` → 아래 표 | | | |
| ASI09 | Human-Agent Trust Exploitation | `SEC_NOT_MEASURED` → 아래 표 | | | |
| ASI10 | Rogue Agents | `SEC_GUARD`(설정 잠금·훅 변조·배포 브랜치·세션 범위) · `SEC_MANAGED_GUARDS` · `SEC_PERMISSION_MODE` | | | |
| 설정 변경 감시 | 세션 중 설정 변경 기록·차단 | `SEC_CONFIG_CHANGE_HOOK` | | | |

> 실측값에 `NA` 가 든 줄(예: 시험 없는 가드 `tests=NA`)은 그 줄 이름을 측정 줄 칸에 적고 판정 `통과 아님`. 가드는 등록만이 아니라 시험 통과까지 봐야 통과다.

#### 기계가 못 잰 항목 (SEC_NOT_MEASURED — 항목마다 세션 판정)

| 항목 | 세션 판정 | 근거·재현 명령 |
|---|---|---|
| {measure 원문의 SEC_NOT_MEASURED 항목 이름 그대로 — 줄마다 1행} | {판정 + 등급} | {파일:줄 · 명령} |

### 1.13 Bloat (군살 — 판정 축)

**판정: {통과|통과 아님}** — 안 도는 훅(`BLOAT_HOOKS_DEAD_N`) > 0 · 백업·보관(`BLOAT_BACKUP_PROJECT_N`·`BLOAT_BACKUP_GLOBAL_N`) > 0 · 또는 `NA` 이면 통과 아님

| 범위 | 이름 | 파일 | KB | git 추적 | 직전 대비 |
|---|---|---|---|---|---|
| {BLOAT_ENTRY 줄마다 1행 — 목록을 고르지 않는다} | | | | | |

{발견 — 큰 지침·주석 비중·백업 목록·사본 고아·워크트리·학습 기록 (위치·이유·방법·재현 명령)}

## 필수 점검 13항목

| # | 점검 항목 | 측정 줄 | 실측값 | 직전 대비 | 판정 |
|---|---|---|---|---|---|
| 1 | `.claude`·`$HOME/.claude` 전체 폴더·낱개 파일 수·용량 | `BLOAT_ENTRY` · `BLOAT_PROJECT_KB` · `BLOAT_GLOBAL_KB` | | | |
| 2 | 지침 문서 크기·같은 규칙 되풀이·뒤집힌 옛 규칙 잔존 | `BLOAT_RULES_BIG_N` · 규칙 중복률 | | | |
| 3 | 어디서도 읽지 않는 지침·스킬·에이전트·프롬프트·커맨드 | | | | |
| 4 | 훅 등록·안 도는 훅 | `BLOAT_HOOKS_DEAD_N` | | | |
| 5 | 훅 크기·주석 비중·겹치는 구현·실행 시간 | `BLOAT_HOOKS_KB` · `BLOAT_HOOKS_COMMENT_PCT` | | | |
| 6 | 백업·보관·덤프 | `BLOAT_BACKUP_PROJECT_N` · `BLOAT_BACKUP_GLOBAL_N` | | | |
| 7 | 원본↔사본 일치·사본 고아·이중 로드 | `BLOAT_COPY_*` · `BLOAT_DOUBLE_LOAD_N` | | | |
| 8 | git 밖 누적·치우는 장치가 도는지 | `BLOAT_UNTRACKED_KB` · `BLOAT_WORKTREES_*` · `BLOAT_WORKTREE_GC_LAST` | | | |
| 9 | 학습 기록(사용 기록 비중·기한 넘은 줄·등급 미기재·GC 적용일) | `BLOAT_LEARN_*` | | | |
| 10 | 이슈 관리(열린 이슈 양식 위반·묶음 허브 꼴) | | | | |
| 11 | 에이전트·방 지시문 역할 카드·겹침 | | | | |
| 12 | 감사 자체 — 미등록·미측정을 "정상"으로 넘기는 판정 | `BLOAT_HOOKS_DEAD_N` · 이 표의 `NA` 행 | | | |
| 13 | 보안 | 1.12 절 | CRITICAL {n} · HIGH {n} | | |

> 측정 줄이 없는 행은 실측값 `NA(측정 줄 없음)` · 판정 `통과 아님`. `NA` 는 0 이 아니고 통과도 아니다.

## 2. 축간 트레이드오프 분석

| 트레이드오프 | 현재 균형 | 권장 방향 |
|------------|:--------:|---------|
| Cost vs Harness | | |
| Agentic vs Human-AI | | |
| Context vs Cost | | |
| Loop vs Cost | | |
| Distribution vs Harness | | |

## 3. 정량 지표 대시보드

| 축 | 지표 | 측정값 | 기준값 | 측정 유형 | 판정 |
|----|------|:-----:|:-----:|:--------:|:---:|
| Agentic | evals 보유율 | | > 70% | 실측 | |
| Context | 세션 시작 토큰 | | < 12,000 | 추정 | |
| Context | MEMORY 항목 수 | | < 30 | 실측 | |
| Context | 규칙 중복률 | | < 10% | 추정 | |
| Context | 프롬프트 구조 포함률 | | > 70% | 실측 | |
| Harness | Hook 커버리지 | | > 70% | 실측 | |
| Harness | OWASP 커버리지 | | > 50% | 실측 | |
| Cost | 모델 계층화율 | | > 60% | 실측 | |
| Cost | 조건부 로딩률 | | > 50% | 실측 | |
| Human-AI | 게이트 커버리지 | | 100% | 실측 | |

> 제외 지표(행을 만들지 않는다): 도구 커버리지·게이트 승인/rubber-stamp·override rate(#1416) · 캐시 히트율(#1418).

### 재현 명령 모음

```bash
# 이 회차 수치를 다시 재는 명령 — SKILL.md Step 1 스크립트 + 판정을 뒤집은 주장별 명령
```

## 4. 트렌드 비교 (이전 감사 대비)

| 축 | 이전 | 현재 | Δ | 방향 |
|----|:----:|:----:|:--:|:---:|

> 이전 감사 없으면 "첫 감사 — 베이스라인 설정" 표기
> 이전 보고서에 없는 축은 이전 `—` · Δ `N/A(신설)` · 방향 `—` · 축 구성이 바뀌었으면 전체 점수 Δ 옆에 그 사실을 적는다

**이슈 해소율**: N/A (또는 이전 이슈 대비 해결률)

## 5. 통합 이슈 목록

### CRITICAL (즉시 대응)
### HIGH (이번 주)
### MEDIUM (이번 달)
### LOW (모니터링)

## 6. 강점 요약

## 7. 통합 개선 로드맵

### P0 — 즉시 (이번 주)
### P1 — 단기 (이번 달)
### P2 — 중기 (다음 분기)

## 6. 재감사 권장 시점

- CRITICAL 이슈 해결 후 즉시
- 정기 감사: 분기 1회 권장

## 참조
- $FORGE_OUTPUTS/docs/tech/2026-03-16-5-axis-ai-analysis-framework.md
- 축 정의서: `${FORGE_ROOT:-$HOME/forge}/shared/docs/2026-03-30-four-engineering-disciplines.md` §1~§8
- 보안 축 틀: OWASP Top 10 for Agentic Applications 2026(ASI01~ASI10)
```
