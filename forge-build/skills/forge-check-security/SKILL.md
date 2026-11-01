---
name: forge-check-security
description: "보안 스캔(OWASP·STRIDE). 트리거: PR 전 보안 게이트·QA T6."
---

# forge-check-security — 보안 취약점 스캔

**역할**: 15-phase 심층 감사(OWASP Top 10 + CI/CD + STRIDE + 익스플로잇 + 트렌드). **게이트**: CRITICAL → FAIL(즉시 차단) / HIGH → WARN / MEDIUM·LOW → 리포트만.
**컨텍스트**: 진입점 = `/forge-check-security`(커맨드)·qa T6·PR 전 보안 게이트. 입력 = 프로젝트 루트(기본 CWD). 절차 SSoT = 본 문서.

**출력**: `docs/qa/security/<branch-slug>.md`(등급별 finding + 공격 시나리오 + 수정 방법) + PASS/WARN/FAIL 판정.

- 경로 계산(그대로): `FORGE_SEC_SLUG=$(git branch --show-current | sed 's#[^A-Za-z0-9._-]#-#g')` → `docs/qa/security/${FORGE_SEC_SLUG}.md`. 브랜치명이 비면(detached HEAD) 스캔 전에 브랜치를 만든다.
- ⛔ 구 경로 `docs/qa/security-report.md` 에 쓰지 않는다(읽기 전용·하위호환).
- 소비처(같은 규칙으로 찾음): `/forge-pr` `shared/scripts/security-report-freshness.sh`(브랜치별 → 구 경로 순).

## 1. 스캔 실행

대상 기본 CWD · `--target <path>` 지정. 제외: node_modules/ vendor/ .git/ dist/ build/ coverage/

```bash
bash ${FORGE_ROOT:-$HOME/forge}/.claude/skills/forge-check-security/scripts/check-security.sh "$TARGET"   # JSON: /tmp/security-scan-results.json
```

| ID | 항목 | 등급 | 패턴 |
|----|------|------|------|
| S1 / S2 / S3 | 하드코딩 시크릿 / SQL 인젝션 / 인증 누락 | CRITICAL / HIGH / HIGH | password·secret·api_key 하드코딩 / 문자열 concat SQL / auth 미들웨어 없는 보호 라우트 |
| S4 / S5 | 민감 로그 / XSS | MEDIUM | console.log + password·token / innerHTML 미검증 입력 |
| S6 | 취약 의존성 | HIGH | lockfile 로 매니저 선택 — `package-lock.json`→`npm audit` · `pnpm-lock.yaml`→`pnpm audit` · `yarn.lock`→`yarn audit`/`yarn npm audit`(berry). CRITICAL+HIGH 합계. 못 재면(lockfile·도구 없음·실패) MEDIUM `S6-UNMEASURED` + `S6=UNMEASURED` · `package.json` 없음 = `S6=N/A` |
| S7 | 취약 의존성(Python) | HIGH | pip-audit / OSV |
| S8 | Git 히스토리 시크릿 | HIGH | 기본 `git log -p <merge-base(base, HEAD)>..HEAD`(삭제된 시크릿 포함). base = `FORGE_SECURITY_BASE` → origin/develop → origin/main → develop → main, base 를 못 찾거나 merge-base 가 없으면 좁히지 않고 전체 범위(fail-closed). 전체 감사 `--s8-full`(= `FORGE_SECURITY_S8_FULL=1`) · 타 브랜치까지 `FORGE_SECURITY_S8_ALL=1`. 범위는 JSON `s8_scope`. `sk-test`·`not-real`·`dummy`·`fake` 더미 제외. 매치엔 커밋 SHA·포함 브랜치 표기. git/HEAD 없음 = LOW `S8-UNVERIFIED` |
| S9 | LLM 보안 | MEDIUM | LLM 출력→innerHTML/dangerouslySetInnerHTML/eval, 무제한 호출, AI 키 노출 |
| S10 / S11 | CI/CD / STRIDE | HIGH | `.github/workflows/*.yml` secrets 노출·`pull_request_target`·privileged runner·action 미고정 / 진입점별 S·T·R·I·D·E 위협 열거 |
| S12 | API 보안 | HIGH | rate limit 없음·`Access-Control-Allow-Origin: *`·BOLA/IDOR·경계 입력 검증 누락 |
| S13 | 컨테이너/인프라 | HIGH | `USER root`·`COPY .env`·`--privileged`·불필요 포트·non-root 미설정 |
| S14 | 익스플로잇 패턴 | CRITICAL/HIGH | path traversal·SSRF·prototype pollution·XXE·안전하지 않은 역직렬화 |
| S15 | 트렌드/신흥 위협 | MEDIUM | AI 공급망·프롬프트 인젝션·최근 CVE·slopsquatting/의존성 컨퓨전 |

**억제**: 줄 단위만(디렉터리·확장자 제외 없음) — 기본은 그 줄의 `#`/`//` 주석 안 `forge-sec: allow <ID> <사유>`(문자열 값 속 문구 불인정), 표식을 달 수 없는 줄만 지문 허용목록 `.claude/forge-sec-allowlist.tsv`(ID·경로·줄 원문 sha256·사유 — 내용·파일이 바뀌면 다시 잡힘). 억제는 `[allow] … (suppressed via inline|fingerprint)` 줄 + `suppressed=N` + JSON `suppressed_findings` 로 드러난다. `suppressed>0` 이면 `sc-3=UNDECIDED` → 아래 LLM 검토 강제.

**공급망 가드**(신규 의존성 추가 시): 패키지명 오타(slopsquatting) 공식명 대조 · 주간 다운로드 < 1,000 = 수동 확인 · package.json/requirements.txt 변경 시 S8 추가 트리거.

## 2. 등급 판정 · QA T6 배선

| 등급 | 조건 | 행동 |
|------|------|------|
| CRITICAL | S1 / S2 고위험 / S14 path traversal·SSRF | FAIL — Phase 1 즉시 [STOP], CRITICAL 항목 Human 에게 명시 |
| HIGH | S2 중위험 / S3 / S6·S7 / S8 / S10~S13 / S14 저위험 | WARN — PR 본문에 HIGH 목록 추가, Phase 4 Human 확인 후 머지 |
| MEDIUM·LOW | S4 / S5 / S9 / S15 · 경고성 패턴 | 리포트만 |
/qa Phase 1 T6 에서 서브에이전트로 호출(1레벨). FAIL → 즉시 [STOP] · WARN → Phase 4 확인 · PASS → 계속.

## 3. 리포트 (docs/qa/security/<branch-slug>.md)

```
# Security Report — {프로젝트명}
일시: {date} | 판정: PASS / WARN ({N}건 HIGH) / FAIL ({N}건 CRITICAL)
원시 스캔 요약(그대로): Scan complete: {verdict} (CRITICAL=N HIGH=N MEDIUM=N LOW=N) suppressed=N S6={MEASURED|UNMEASURED|N/A}
CRITICAL (N건) — 즉시 차단 / HIGH (N건) — WARN
# | 파일:라인 | 패턴 ID | 설명 | 공격 시나리오 | 수정 방법
MEDIUM / LOW
# | 파일:라인 | 패턴 ID | 설명

판정 근거: CRITICAL N건 → FAIL/없음 · HIGH N건 → WARN/없음 · 최종 판정: PASS / WARN / FAIL
```

HIGH 이상은 finding 마다 실제 공격 경로 1~2줄 필수. 원시 스캔(레포 전체)과 PR 판정은 따로 적는다(`원시 CRITICAL 2 + PR PASS` 정상).

## 4. Evaluator (리포트 생성 직후)

```bash
python3 "${FORGE_ROOT:-$HOME/forge}/shared/scripts/skill-report-lint.py" \
  --skill forge-check-security --report "docs/qa/security/<branch-slug>.md" > /tmp/sec-lint.json; LINT_RC=$?
```
- 축: `sc-1` 판정 토큰(없으면 FAIL) · `sc-2` 15-phase 기재(일부면 UNDECIDED) · `sc-3` 판정↔건수(CRITICAL·HIGH·suppressed 전부 0 일 때만 기계 확정) · CRITICAL/HIGH 근거 충분성 = LLM.
- `rc=1` → FAIL 축만 고친다(재생성 금지) · `rc=0` + `llm_needed=false` → 확정, Agent 안 띄움 · `rc=0|2` + `llm_needed=true` → 아래 Agent 가 `residual` 축만.
```python
lint = json.load(open("/tmp/sec-lint.json"))
if lint["llm_needed"]:                      # 조건부 — 상시 호출 금지
  Agent(subagent_type="general-purpose", model="haiku",
    prompt=f"""아래 보안 리포트에서 기계가 확정하지 못한 축만 보고 PASS/WARN/FAIL 과 근거 1줄만 답하라.
파일: {report_path}
남은 축(residual): {json.dumps(lint["residual"], ensure_ascii=False)}
판정 토큰·phase 개수·0/0/suppressed=0 일관성은 이미 봤다 — 다시 보지 마라.
중점: 억제 표식·지문이 진짜 finding 을 숨기는지 / 원시 CRITICAL/HIGH 가 PR 변경분 밖인지 / 빠진 phase 가 diff 범위 밖인지 / 근거·재현경로가 실질적인지.""")
```
결과를 `$HOME/.claude/skills/forge-check-security/eval_cases.jsonl` 에 직접 append: `{"case_id":"EC-forge-check-security-{N}", "verdict":"PASS|WARN|FAIL|UNDECIDED", "note":"..."}` (⛔ UNDECIDED 를 PASS·FAIL 로 접지 않는다).

## 5. STRIDE 선언 대비 구현 대조

발동: 대상에 STRIDE 선언 표(`| T-{slug}-NN | ... | Disposition |`)를 가진 계획서·spec 이 있을 때만(없으면 건너뜀).
```bash
python3 shared/scripts/stride-defense-check.py --spec-glob "**/*.md" --code "<target_code>" \
  --json /tmp/stride-result.json --md /tmp/stride-result.md
```
- spec 경로를 알면 `--spec <path>`. JSON `verdict` = PASS/WARN/FAIL/MISSING, `items[].evidence` = `파일:라인`. 결과는 같은 `eval_cases.jsonl` 에 append.
- grep 카운트 판정일 뿐 — PASS ≠ 방어 증명. 산문으로만 적힌 STRIDE 는 못 잡는다(표 형식 필수).

## Workflow 통합
병렬 실행: `Workflow({ script: Bash("cat $HOME/.claude/skills/forge-check-security/workflow.js"), args: { target } })` — parallel() 보안 스캔 → 집계.
`CLAUDE_CODE_DISABLE_WORKFLOWS=1` 시 check-security.sh 방식 fallback.

<!-- #3602: 커맨드 진입점(.claude/commands/forge-check-security.md)을 지우며 그 파일에만 있던 Advisor 절을 옮겼다 -->
## Advisor 자문 (advisory-only · non-blocking · 리졸버 기본 = **GPT-6 Astra**)

보안 발견의 심각도·악용 가능성 판정이 경계일 때 `advisor-strategist` 조언을 구한다(모델 = `advisor-spawn-guard.sh resolve` 출력, **기본 `gpt-6-astra`**). **advisory-only — 게이트 차단 아님. 미가용·실패 시 기본 흐름 진행(fail-open).**

> ⚠️ **아래 예시는 리졸버가 `claude-*` 를 냈을 때의 형태다.** 스폰 모델은 항상 `advisor-spawn-guard.sh resolve`(리졸버 래퍼) 가 정한다 — `claude-fable-5-1`→`model:"fable"`, `claude-opus-5-5`→`model:"opus"`, **`gpt-6-astra`(기본)·`gpt-6.1-sol`(구 CLI 는 `gpt-6-sol`) 같은 `gpt-*` 면 Agent 가 아니라 `mcp__codex__codex`(sandbox=read-only)**. 분기표 → `agents/advisor-strategist.md §비용 특성`. 리졸버를 건너뛰면 kill-switch·일일캡·미가용 폴백이 전부 우회되고, 리졸버만 직접 부르면 래퍼의 예산 초과 하향(R3)도 빠진다.
```
Agent(subagent_type="advisor-strategist", prompt="발견 내용·영향 범위·기존 방어 맥락 3-5줄. 질문: 이 보안 발견의 실제 악용 가능성과 심각도 상향/하향 근거 2-3개는?")
```

- 트리거: Critical/High 판정 경계 또는 N/A 처리 판단 시
- 반환 조언은 참고만 — 최종 판단·실행은 이 스킬이 수행.
- **advisor 모델 = `advisor-spawn-guard.sh resolve` 출력**(**기본 `gpt-6-astra`** · Fable 5.1 은 `FORGE_ADVISOR_MODEL=fable` 또는 `FORGE_ADVISOR_EXECUTOR=codex|gpt`(벤더 교차) 일 때 · Opus 5.5 는 `FORGE_ADVISOR_MODEL=opus` 로 고정하거나 Codex 예산 초과(`cr-budget.sh check` over=1) 날 래퍼가 astra 를 Opus 로 내릴 때(R3, #1274 — WARN 1줄. 구 "astra → Fable" 은 2026-09-27 폐기)). 출력이 `gpt-*` 면 Agent 가 아니라 `mcp__codex__codex`(sandbox=read-only)로 스폰한다.
  ⚠️ 2026-08-12 이전 문구 **"Fable 5 미배선 — Human 수동 에스컬레이션 전용 · `advisor-model-resolve` 호출 금지"는 폐기**했다 — 이 게이트에 advisor 자문 레그가 실재하는데 리졸버 호출을 금지해 라우팅이 서로 어긋났다(cr-final HIGH). 정본 → `rules/model-routing.md §Advisor 전략 상시 가동`
- 모델 라우팅: 본 스킬 작업=Sonnet · 탐색=Haiku · advisor=`advisor-spawn-guard.sh resolve` 출력(**기본 `gpt-6-astra`** · CLI<0.156.1 면 `gpt-5.6-sol` 로 하향).
  ⚠️ **구 표기 "기본 Fable 5.1 · 대체 gpt-6-astra" 는 2026-09-17 폐기** — 2026-09-07 Human 지시(advisor 기본 Fable→Astra)를 이 파일이 따라오지 못했다. 문서는 fable, 리졸버는 astra 를 내고 있었다.
  실측 재현: `bash shared/scripts/advisor-model-resolve.sh` → `gpt-6-astra` · `bash shared/scripts/advisor-spawn-guard.sh resolve` → `gpt-6-astra` (2026-09-17 관측).
  근거: 문서가 조언자 벤더를 틀리게 적으면 "실행자와 다른 벤더에게 묻는다" 는 교차 규율을 사람이 손으로 뒤집는다. 정본 → `rules/model-routing.md §세션 운영 모델`.
  폐기조건: 사람이 기본 조언자를 다시 정하면 이 줄을 갱신한다.
