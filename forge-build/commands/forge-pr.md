---
description: PR 생성 → 크기·로컬CI·보안 → 등급별 code-reviewer 검수 1라운드 → develop 머지 (#1349 단순화판)
argument-hint: "[PR 제목]"
group: deploy
model: sonnet
---

# /forge-pr

브랜치를 PR 로 올리고, 기계 검사를 통과하면 **검수 1라운드** 뒤 develop 에 머지한다.
**완료 = 테스트 통과 + blocking(CRITICAL·HIGH) 0.** (`dev-workflow-rules.md §운영 규칙`)
**예산 — 넘으면 멈추고 보고한다**: 실행 방식·동시 수 = `dev-workflow-rules.md §운영 규칙 2` · 검수는 **PR 당 1번**(1라운드 · 재검수 없음 — 고친 뒤 기계 검사 줄로 확인 · §4 판정 · #2243).

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
bash shared/scripts/pre-pr-check.sh --base origin/develop --pr-body <본문 파일>   # 범위(크기)·진짜 도구·변이 증거(#2451)·실행 방식(#2718 · 본문 파일을 먼저 쓴다 — §3 의 6필드 + `실행 방식:` 1줄 · 나눠 했으면 `## 팀장 확인`) — rc 1 = 고친다(크면 쪼갠다) · rc 2 = 판정 불가(통과 아님) · 진짜 도구 WARN 은 smoke.md 를 더한다
bash shared/scripts/local-ci.sh --base origin/develop       # rc 0 만 통과 · SKIP 은 통과가 아니다
bash shared/scripts/pr-new-script-wiring.sh --base origin/develop   # 새 스크립트 호출처 0곳 = ⚠️ UNWIRED(경고) — 호출처를 붙이거나 지운다(#1379)
```
local-ci 가 정본 CI 다. 실패하면 고치고 다시 돌린다. `UNWIRED` 가 남으면 PR 본문 `## 남은 위험` 에 사유를 적는다.

## 2. 보안
1. `/forge-review --lens security` 를 돌려 `docs/qa/security/<브랜치슬러그>.md` 를 만든다(남김 — 사람 결정).
2. `bash shared/scripts/security-report-freshness.sh --base origin/develop` — **rc 0 만 통과**(1 = 오래됨 → 다시 스캔 · 2 = 없음 · 3 = 판정 불가).
3. 리포트에 CRITICAL 이 있으면 **[STOP] 사람**.
4. 보안 경로를 건드렸으면(아래 TRIGGER) `/forge-review --lens security --exec` 도 돌려 PR 본문 §검증에 붙인다 — scorer exit 0 만 통과, 3 = 판정 불가.

```bash
# ⚠️ 아래 4개 정규식은 기계가 읽는다 — 한 줄 NAME='…' 형식을 바꾸지 마라. `shared/scripts/security-exec-gate-check.sh` 와 문자 단위로 같아야 한다(sec-re-parity.test.sh) · cr-machine-checks.sh·cr-risk-tier.sh 도 이 줄 기준.
SEC_RE='(^|[/_.-])(auth|authz|authn|authori[zs][a-z]*|login|logout|signin|signup|oauth|saml|jwt|csrf|xsrf|cors|cookie|secret|credential|passwd|password|permission|privilege[a-z]*|acl|rbac|grade|gate|guard|crypto|hmac|saniti[zs][a-z]*|escape|webhook|payment|billing|checkout|invoice|refund|upload|multipart)([/_.-]|$)'
APP_RE='(^|/)((api|routes?|handlers?|controllers?|middlewares?|endpoints?)/|(server|app|index)\.(js|ts|mjs|cjs|py)$)'
EXC_RE='(^\.claude/|^docs/|\.md$|/_archive/|skills-archived/)'
GATE_RE='(\.claude/skills/forge-check-security-exec/|\.claude/commands/forge-pr\.md$|\.claude/skills/forge-check-security/|\.claude/commands/forge-review\.md$|\.claude/skills/forge-review/|shared/scripts/codex-review-route\.sh$|\.claude/skills/codex-review/|shared/scripts/review-4lens\.sh$|shared/config/review-lenses\.md$)'
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
본문은 6필드 제목을 그대로 쓴다: `## 문제` · `## 접근` · `## 변경범위` · `## 검증`(실행한 명령과 결과) · `## 남은 위험` · `## 되돌리기`(되돌리는 법 — revert 1번 · 끄개 변수 · 데이터 이전 유무 · 바뀐 파일이 전부 `.md` 면 면제 · 위 BOUNDARY 감지면 빈 칸도 판정기 rc 1 · #4201).
spec 이 있는 일이면 `## 검증` 에 `spec: <경로>` 1줄과 AC 마다 증거 1줄(꼴: - AC-001 · `bash <시험>` → `.evidence/<가지>/green.log` — 명령은 따로 백틱 안 · QA 를 돌렸으면 `forge-qa` 결과 파일 경로를 같은 줄에)을 둔다 — 머지 관문 기계 검사 `ac` 축이 AC 마다 이 PR 의 증거 파일과 명령이 둘 다 있는지 대조하고 빠지면 fail(#3735).
고치기(fix·refactor) PR 은 `## 접근` 에 `리팩토링:` 1줄을 둔다 — 이번에 줄이거나 옮긴 것(파일·줄 수), 없으면 `리팩토링: 없음 — <이유>`(고치기가 줄만 늘리고 정리를 건너뛰지 않게 · #3239).
```bash
bash shared/scripts/pr-dup-guard.sh <이슈번호>        # 같은 이슈 중복 PR 금지 — rc 1 = 새 PR 대신 그 PR 에 싣는다 · 2 = 판정 불가
git push -u origin HEAD
R=$(git remote get-url origin | sed -E 's#^([a-z][a-z0-9+.-]*://[^/]*github\.com(:[0-9]+)?/|[^/]*github\.com:)##; s#\.git$##')   # 레포 명시 — 자리표시는 gh 큐를 못 탄다(#1484)
N=$(bash shared/scripts/gh-q.sh --wait=90 api "repos/$R/pulls" -f base=develop -f head="$(git branch --show-current)" \
      -f title="<제목>" -F body=@<본문 파일 **절대경로**> -q .number)   # gh 큐 경유(#1484) · 상대경로면 큐 대신 직접 호출
bash shared/scripts/pr-body-sections-check.sh <N>   # rc 0 = 필수 칸 전부(.md 만이면 5 · 그 밖 6) · 1 = 누락·BOUNDARY 빈 되돌리기 → 본문 고침 · 2 = 판정 불가
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
bash ${FORGE_ROOT:-$HOME/forge}/shared/scripts/machine-checks-line.sh <N>                    # 기계 검사를 PR head 사본에서 **1번** 돌리고 판정 코멘트에 붙일 1줄을 낸다(#2227)
bash ${FORGE_ROOT:-$HOME/forge}/shared/scripts/machine-checks-batch.sh <N> <N2> <N3>        # PR 여러 건이면 동시에(최대 3 · -j·FORGE_MC_PARALLEL) — PR 마다 `#<N> rc=0 ` 뒤가 그 PR 의 줄(#2718)
bash ${FORGE_ROOT:-$HOME/forge}/shared/scripts/review-brief.sh <N> --note "<볼 것>"          # 검수할 등급이면 — 위 검사까지 돌리고 브리프 1장을 쓴다(레그에게 이 파일을 넘긴다)
```

| tier | 할 일 |
|---|---|
| `skip` | 기계검사만 — `기계 검사:` 줄이 `fail=0 miss=0` 이면 통과(줄은 `machine-checks-line.sh <N>` 출력 그대로) |
| `light`·`full-general` | 기계검사만 — `skip` 과 같다(검수자 0 · #2594). 평소엔 `cr-risk-tier.sh` 가 이 두 등급을 `skip` 으로 접어 내고, 사람 끄개(`FORGE_OPS_RULE=off`·`FORGE_CR_TIER=`)로 이름이 남아도 `legs=0` 이다 — 검수자는 full-gate 에만 붙는다(`dev-workflow-rules.md §운영 규칙 1`) |
| `full-gate` | **검수자 4명 · 관점 하나씩 동시에 · 1회**(사람 결정 2026-10-08 #2266 — 출력 `lenses=4` · 재검수 없음) — `review-brief.sh <N>` 이 만든 **브리프 1개** — 총괄은 그 브리프를 `qa-<프로젝트>` 방에 보낸다(스크립트 stderr 끝줄 `forge-session-bus.sh send --detach qa-<프로젝트> - < <브리프>` 그대로). qa 방이 Codex 4갈래 `bash shared/scripts/review-4lens.sh --stage code --root <사본> --base <base> --brief <브리프>` 1줄로 관점 4개를 **한 메시지에서 동시에** 돌린다(#3897 — 브리프 `## 관점` 절의 ①우회·주입 ②회귀 ③변형·전수 ④실사용·배선 · 검수자는 자기 관점만 본다 · rc 4 검수 못 함 = 표식 없이 `검수 못 함` 코멘트 + 총괄 알림 · rc 3 = Codex 못 돎 → Claude 검수자 4관점 대체(브리프 2번 rc 3 줄 · `model-routing.md` 검수 줄)). 지적은 qa 방이 합친다(같은 파일·같은 줄 = 1건 · CRITICAL·HIGH 만 판정 코멘트에 · 나머지는 개수만) · 검수마다 그 프로젝트 qa wisdom 1줄(브리프 `## qa 방이 할 일`) → 수정본은 기계 검사 줄로 끝낸다 · 머지는 총괄. 출력이 `legs=2`·`codex_model=` 을 실을 때만(사람이 2벤더를 지정 — `FORGE_OPS_RULE=off`) `mcp__codex__codex`(sandbox=read-only, model=`codex_model=`, effort=`codex_effort=`) 레그를 같은 입력으로 한 메시지에서 병렬로 붙인다(브리프에 사본 실행 범위 — 아래 넘길 것) |

- 검수자는 **구현한 에이전트와 다른 새 에이전트**다(내장 `/code-review` 아님). 넘길 것: PR 번호 · `git diff origin/develop...HEAD` · 기계검사 summary · 보안 리포트 경로 · 설계 원칙 정본 `${FORGE_ROOT:-$HOME/forge}/.claude/rules-on-demand/design-principles.md`(리뷰 질문 · #2052). **브리프는 손으로 쓰지 않는다** — `review-brief.sh <N>` 이 만든 파일을 넘긴다(위 항목과 기계 검사 줄·요약이 들어 있다 · #2227). 레그에게 테스트·변이 재실행을 시키지 않는다 — 프로그램이 이미 1번 돌았고 레그는 판단만 한다. Codex 레그 브리프에는 사본 실행 범위를 적는다 — 가설 확인용 탐침 1개만 · 턴 상한 25 · 실행 칸 합계 ≤150 · 전체 스위트(`run-all-tests.sh`) 금지 · 정본 `.claude/prompts/cr-multi-codex.md §사본 실행 범위`. 받을 것: 지적마다 등급(CRITICAL/HIGH/MEDIUM/LOW) + 파일:줄 + 이유.
- 판정:
  - CRITICAL·HIGH 0 → 5단계로.
  - HIGH 있음 → HIGH 만 고친다(**실제로 돈 검수 레그 수로 가른다** — 1레그 = 새 에이전트 1회 `Agent(subagent_type="general-purpose", model="opus")` · 2레그(Codex 레그가 붙은 모든 등급) = 예산이 찼으니 **세션이 직접**) → 테스트·local-ci 통과 → push → **다시 검수하지 않는다**(#2243).
    확인은 기계가 한다: `machine-checks-line.sh <N>` 줄이 `fail=0 miss=-` 이고 그 지적을 재는 테스트 칸이 있으면 5단계. 두 번째 검수 브리프는 `review-brief.sh` 가 거부한다.
    고친 뒤 기계 검사가 실패하거나 지적을 못 고치면 → **[STOP] 사람**.
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
- **고위험(full-gate) PR 은 사람 승인 1번이 있어야 머지된다** — 승인은 그 PR 코멘트 `답변: A`(또는 `A로 승인`·`승인`) · head 커밋 뒤 것만 · 새 `[승인 요청]` 이슈는 만들지 않는다(관문이 PR 에 요청 코멘트를 단다 · AI 는 승인 꼴 코멘트를 달지 않는다 · `pr-human-approval-check.sh` 머리말 · #4274).

- **코드 PR 은 증거 3종을 커밋하고 판정 코멘트에 그 경로를 적는다** — `.evidence/<브랜치 / 를 - 로>/` 에 `red.log`(수정 전 FAIL) · `green.log`(수정 후 PASS) · `mutation.md`(바꾼 줄을 되돌려 테스트 FAIL + `## 자기 적대` 3항목+). 없으면 `pr-merge.sh` 의 증거 관문(`pr-evidence-check.sh` · #1618)이 머지를 거부한다. `.md` 만 바꾼 PR 은 면제.

- ⛔ **방(팀장 세션)은 판정 코멘트까지가 끝이다** — 머지는 총괄에게 넘긴다(사람 결정 2026-09-29 #1582 · `dev-workflow-rules.md §운영 규칙 4`·§Git). 보고에 PR 번호·판정 sha·"머지는 총괄" 을 적고 끝낸다.

- `pr-merge.sh` rc 1(이 PC 가 엔진 병합자가 아님) → 우회 금지, 멈춘다 — 하네스는 메인 PC 에서만 고친다(#2200): 결함은 `bash shared/scripts/engine-report.sh "<한 줄>" --repro "<명령>"` 로 올리면 끝이다(제안 패치 `engine-propose.sh submit` 은 그 PC 에서 멈춘다). 원격 브랜치가 남았으면 `git push origin --delete <브랜치>`.

- **판정 코멘트의 `기계 검사:` 줄은 손으로 쓰지 않는다** — `bash ${FORGE_ROOT:-$HOME/forge}/shared/scripts/machine-checks-line.sh <N>` 을 돌려 나온 **1줄을 그대로** 붙인다(꼬리의 `<!-- machine-checks: … -->` 표식 포함 · #2227). 머지 관문(`pr-machine-line-check.sh`)이 표식 없음·낡은 sha·`fail>0`·`miss`(대상이 있었는데 못 돈 축)를 거부한다 — push 를 더 했으면 줄을 다시 만든다. `.md` 만·스테이지만 바꾼 PR 은 면제. 제품 레포(앱·웹·게임)도 같다 — 그 레포가 선언한 검사(`scripts/verify.sh`·`package.json` scripts)가 같이 돈다.

- **기계 검사 줄에 `경고: refactor` 가 보이면**(줄 끝 "구조 점검 돌릴까요: … 대상 <파일>" · #3239) → 판정 코멘트 전에 둘 중 하나를 정한다: PR 본문 `리팩토링:` 줄을 채운다(줄이거나 옮긴 것 · 미루면 `없음 — 이유`) · 또는 그 파일로 `/improve-codebase-architecture` 를 돌릴지 사람에게 1줄로 묻는다. 경고는 머지를 막지 않는다.

- **판정 코멘트의 `영향 범위:` 줄은 손으로 쓰지 않는다** — PR 가지를 체크아웃한 폴더에서 `bash ${FORGE_ROOT:-$HOME/forge}/shared/scripts/impact-line.sh <N>` 을 돌려 나온 **1줄을 그대로** 붙인다(꼬리의 `<!-- impact-line: … -->` 표식 포함 · #2222). 그 스크립트가 바뀐 파일을 보고 GitNexus 를 직접 돌린다 — 코드 파일(.py .ts .js .mjs)이면 `gitnexus detect-changes`, bash·점 폴더·문서만이면 `색인 밖(사유)`. `pr-merge.sh` 가 표식이 없거나·낡았거나(판정 뒤 커밋을 더 올렸다)·`tool=missing`(색인을 안 만들었다)이거나·바뀐 파일과 어긋나면 **머지를 거부**한다(`.md`·스테이지만 바꾼 PR 은 면제). 색인이 없다고 나오면 그 출력이 알려 주는 명령으로 만든 뒤 다시 돌린다. 도구 고르기 = 선택표 `tool-rules.md` 레포 지도.

## [STOP] 사람에게 넘기는 경우

보안 CRITICAL · 검수 CRITICAL · BOUNDARY 감지 · 예산 초과(운영 규칙 2 · 검수 PR 당 1번) · 수정 뒤 기계 검사 실패 · 판정 불가(rc 2·3)가 풀리지 않을 때.
