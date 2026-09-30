---
description: PR 생성 → 크기·로컬CI·보안 → 등급별 code-reviewer 검수 1라운드 → develop 머지 (#1349 단순화판)
argument-hint: "[PR 제목]"
group: deploy
model: sonnet
---

# /forge-pr

브랜치를 PR 로 올리고, 기계 검사를 통과하면 **검수 1라운드** 뒤 develop 에 머지한다.
**완료 = 테스트 통과 + blocking(CRITICAL·HIGH) 0.** (`dev-workflow-rules.md §운영 규칙`)
**예산 — 넘으면 멈추고 보고한다**: 에이전트 최대 2개(검수 레그 포함 · 읽기 전용 탐색 제외) · 검수 1라운드 + 수정 후 재검수 1회 · 재검수 뒤 **수정이 만든 회귀만** 남으면 증명 후 머지(§4 판정) · LOW·비차단 지적은 버린다(`dev-workflow-rules.md §운영 규칙 2`).

## 0. 준비

- 지금 브랜치가 `develop`·`main` 이면 멈춘다. 커밋 안 된 내 변경은 먼저 커밋하고 `git fetch origin`.

### 소관 팀 + 팀 지식 (WARN 전용, 비차단)
```bash
bash "${FORGE_ROOT:-$HOME/forge}/shared/scripts/team-route.sh" forge-pr [--project <proj>]
# → OWNER=<slug> · 팀 지식: ${FORGE_OUTPUTS:-$HOME/forge-outputs}/12-team-ops/members/<slug>/wisdom.md
```
- 스크립트가 실패하거나 wisdom.md 가 없으면 **건너뛴다**(fail-open, AD-168). `OWNER=none` 이어도 그대로 진행한다. 팀장 경유(버스)를 강제하지 않는다. 판정 근거는 "커맨드 소유"다 — 파일 소유가 아니다.

## 1. 크기 · 로컬 CI
```bash
bash shared/scripts/pr-size-gate.sh --base origin/develop   # rc 1 = 너무 크다 → 쪼갠다 · rc 2 = 판정 불가(통과 아님)
bash shared/scripts/local-ci.sh --base origin/develop       # rc 0 만 통과 · SKIP 은 통과가 아니다
bash shared/scripts/pr-new-script-wiring.sh --base origin/develop   # 새 스크립트 호출처 0곳 = ⚠️ UNWIRED(경고) — 호출처를 붙이거나 지운다(#1379)
```
local-ci 가 정본 CI 다. 실패하면 고치고 다시 돌린다. `UNWIRED` 가 남으면 PR 본문 `## 남은 위험` 에 사유를 적는다.

## 2. 보안
1. `/forge-check-security` 를 돌려 `docs/qa/security/<브랜치슬러그>.md` 를 만든다(남김 — 사람 결정).
2. `bash shared/scripts/security-report-freshness.sh --base origin/develop` — **rc 0 만 통과**(1 = 오래됨 → 다시 스캔 · 2 = 없음 · 3 = 판정 불가).
3. 리포트에 CRITICAL 이 있으면 **[STOP] 사람**.
4. 보안 경로를 건드렸으면(아래 TRIGGER) `/forge-check-security-exec` 도 돌려 PR 본문 §검증에 붙인다 — scorer exit 0 만 통과, 3 = 판정 불가.

```bash
# ⚠️ 아래 4개 정규식은 기계가 읽는다 — 한 줄 NAME='…' 형식을 바꾸지 마라. `shared/scripts/security-exec-gate-check.sh` 와 문자 단위로 같아야 한다(sec-re-parity.test.sh) · cr-machine-checks.sh·cr-risk-tier.sh 도 이 줄 기준.
SEC_RE='(^|[/_.-])(auth|authz|authn|authori[zs][a-z]*|login|logout|signin|signup|oauth|saml|jwt|csrf|xsrf|cors|cookie|secret|credential|passwd|password|permission|privilege[a-z]*|acl|rbac|grade|gate|guard|crypto|hmac|saniti[zs][a-z]*|escape|webhook|payment|billing|checkout|invoice|refund|upload|multipart)([/_.-]|$)'
APP_RE='(^|/)((api|routes?|handlers?|controllers?|middlewares?|endpoints?)/|(server|app|index)\.(js|ts|mjs|cjs|py)$)'
EXC_RE='(^\.claude/|^docs/|\.md$|/_archive/|skills-archived/)'
GATE_RE='(\.claude/skills/forge-check-security-exec/|\.claude/commands/forge-pr\.md$|\.claude/skills/forge-check-security/)'
```
TRIGGER 판정 + 아래 BOUNDARY 감지는 기계가 한 번에 한다(위 정규식·아래 패턴을 이 파일에서 읽는다):
```bash
bash "${FORGE_ROOT:-$HOME/forge}/shared/scripts/cr-machine-checks.sh" --repo-root "$PWD" --base origin/develop --only sec-paths,boundary --out /tmp/cr-sec-<N>.json
```
JSON `summary` 의 `[sec-paths] TRIGGER…` = TRIGGER · `SKIP…` = SKIP · `[boundary] 감지…` = BOUNDARY 감지 · `미실행`·`대상 0건` = **판정 불가(통과 아님)**.
**BOUNDARY(되돌리기 어려운 변경)** — 감지되면(아래 블록은 패턴 정본, 위 한 줄이 실행한다) 사람에게 범주(B1~B6, `BOUNDARY.md`)를 알리고 **확인을 받은 뒤** 진행한다.
```bash
git diff --name-only origin/develop HEAD | xargs grep -l \
  "ALTER TABLE\|CREATE TABLE\|DROP TABLE\|payment\|billing\|stripe\|@Roles\|@UseGuards" 2>/dev/null \
  || git diff --name-only origin/develop HEAD | grep -E "(migrations/|package\.json|requirements\.txt)"
```

## 3. PR 생성
본문은 5필드 제목을 그대로 쓴다: `## 문제` · `## 접근` · `## 변경범위` · `## 검증`(실행한 명령과 결과) · `## 남은 위험`.
```bash
bash shared/scripts/pr-dup-guard.sh <이슈번호>        # 같은 이슈 중복 PR 금지 — rc 1 = 새 PR 대신 그 PR 에 싣는다 · 2 = 판정 불가
git push -u origin HEAD
R=$(git remote get-url origin | sed -E 's#^([a-z][a-z0-9+.-]*://[^/]*github\.com(:[0-9]+)?/|[^/]*github\.com:)##; s#\.git$##')   # 레포 명시 — 자리표시는 gh 큐를 못 탄다(#1484)
N=$(bash shared/scripts/gh-q.sh --wait=90 api "repos/$R/pulls" -f base=develop -f head="$(git branch --show-current)" \
      -f title="<제목>" -F body=@<본문 파일 **절대경로**> -q .number)   # gh 큐 경유(#1484) · 상대경로면 큐 대신 직접 호출
bash shared/scripts/pr-body-sections-check.sh <N>   # rc 0 = 5/5 · 1 = 누락 → 본문 고침 · 2 = 판정 불가
```

## 3.5 자기 점검 (검수 직전 — 내가 먼저 찌른다)

검수에 넘기기 전에 **내 변경만** 5가지로 직접 찔러 본다. 상세·찌르는 법 → `.claude/rules-on-demand/pr-self-check.md`.
1. **막던 게 아직 막히나** — 옛 코드가 거부하던 입력을 새 코드도 거부하나(1건 이상 실제로 넣어 본다).
2. **문자열이 코드가 되지 않나** — 변수를 sed·eval·`bash -c`·정규식에 치환했나 · 따옴표 없는 변수.
3. **커지면 버티나** — 입력이 커질 때 중첩 루프·건마다 전체 재스캔(O(n²))이 없나.
4. **경로를 가로채이지 않나** — 모듈·lib·스크립트를 CWD 기준으로 찾지 않나(절대경로·스크립트 기준으로).
5. **같은 구멍의 변형** — 고친 패턴의 다른 표기(들여쓰기·주석 꼬리·대소문자·상대 import)를 최소 1개 더 찔렀나.

- 찾은 구멍마다 **테스트 1개**를 추가한다(구멍이 없었으면 0). PR 본문 §검증에 한 줄: `자기 점검: 5/5 확인, 추가 테스트 N`.

## 4. 검수 등급 → 1라운드
```bash
bash shared/scripts/cr-risk-tier.sh --base origin/develop --repo-root "$PWD"   # 출력 tier= 를 그대로 쓴다(새 판단 없음)
bash shared/scripts/cr-machine-checks.sh --repo-root "$PWD" --base origin/develop --out /tmp/cr-mc-<N>.json
```

| tier | 할 일 |
|---|---|
| `skip` | 기계검사만 — JSON `summary` 에 실패가 없으면 통과 |
| `light`·`full-general` | 검수 `Agent(subagent_type="code-reviewer", model=…)` 1회 — 모델은 같은 출력의 `claude_model=` 그대로(`claude-fable-5-1` → `"fable"` · `claude-opus-5-5` → `"opus"` · 비어 있으면 `"opus"`). 출력의 `codex_model=` 이 있으면 그 Codex 레그도 함께 |
| `full-gate` | **2벤더 교차 1라운드** — ① `Agent(subagent_type="code-reviewer", model="fable")` ② `mcp__codex__codex`(sandbox=read-only, model=출력의 `codex_model=`(gpt-6-astra), effort=`codex_effort=`) 에 같은 입력. 두 레그를 **한 메시지에서 병렬**로 부르고 지적을 합친다 |

- 검수자는 **구현한 에이전트와 다른 새 에이전트**다(내장 `/code-review` 아님). 넘길 것: PR 번호 · `git diff origin/develop...HEAD` · 기계검사 summary · 보안 리포트 경로. 받을 것: 지적마다 등급(CRITICAL/HIGH/MEDIUM/LOW) + 파일:줄 + 이유.
- 판정:
  - CRITICAL·HIGH 0 → 5단계로.
  - HIGH 있음 → HIGH 만 고친다(**실제로 돈 검수 레그 수로 가른다** — 1레그 = 새 에이전트 1회 `Agent(subagent_type="general-purpose", model="opus")` · 2레그(Codex 레그가 붙은 모든 등급) = 예산이 찼으니 **세션이 직접**) → 테스트·local-ci 통과 → push → **같은 레그로 재검수 1회**.
    재검수 뒤 남은 HIGH 가 **이번 수정이 만든 회귀**뿐이면(아래 증명) 그것만 고치고 5단계 · 회귀 아닌 새 HIGH → **[STOP] 사람**.
    회귀 증명 = 같은 테스트가 ① 수정 직전 커밋 PASS ② 수정 커밋 FAIL ③ 복구 후 PASS(①이 없으면 회귀가 아니라 기존 결함 → [STOP]).
  - CRITICAL 있음 → **[STOP] 사람.**
  - MEDIUM·LOW → 버린다(판정 코멘트에 개수만 적는다).

## 5. 판정 코멘트 → 머지
```bash
HEAD_SHA=$(git rev-parse HEAD)   # push 된 마지막 커밋이어야 한다
bash shared/scripts/gh-q.sh --wait=90 api "repos/$R/issues/<N>/comments" -q .html_url \
  -f body="판정 PASS — tier=<tier> · 검수 <한 줄 요약> · 증거 .evidence/<브랜치 / 를 - 로>/ <!-- forge-verdict: PASS sha=$HEAD_SHA -->"   # gh 큐 경유(#1484) · $R 은 §3
bash shared/scripts/pr-verdict-gate.sh <N>                     # 최신 판정 확인(경고만)
bash shared/scripts/pr-merge.sh <N> --squash --delete-branch   # ⚠️ **총괄 세션만** — 방은 이 줄을 실행하지 않는다(아래)
```

- **코드 PR 은 증거 3종을 커밋하고 판정 코멘트에 그 경로를 적는다** — `.evidence/<브랜치 / 를 - 로>/` 에 `red.log`(수정 전 FAIL) · `green.log`(수정 후 PASS) · `mutation.md`(바꾼 줄을 되돌려 테스트 FAIL + `## 자기 적대` 3항목+). 없으면 `pr-merge.sh` 의 증거 관문(`pr-evidence-check.sh` · #1618)이 머지를 거부한다. `.md` 만 바꾼 PR 은 면제.

- ⛔ **방(팀장 세션)은 판정 코멘트까지가 끝이다** — 머지는 총괄에게 넘긴다(사람 결정 2026-09-29 #1582 · `dev-workflow-rules.md §운영 규칙 4`·§Git). 보고에 PR 번호·판정 sha·"머지는 총괄" 을 적고 끝낸다.

- `pr-merge.sh` rc 1(이 PC 가 엔진 병합자가 아님) → 우회 금지, `bash shared/scripts/engine-propose.sh submit <N>` 안내 후 멈춘다. 원격 브랜치가 남았으면 `git push origin --delete <브랜치>`.

## [STOP] 사람에게 넘기는 경우

보안 CRITICAL · 검수 CRITICAL · BOUNDARY 감지 · 예산 초과(에이전트 2개 · 검수 1라운드 + 재검수 1회) · 재검수 뒤 회귀 아닌 새 HIGH · 판정 불가(rc 2·3)가 풀리지 않을 때.
