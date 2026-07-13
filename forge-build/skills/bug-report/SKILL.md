---
name: bug-report
description: "웹앱 LNB 전체 메뉴를 자동 순회하며 기능 오류·레이아웃 이슈를 탐지하고 bug-report 표준 포맷(BUG-NNN, 6하원칙, INDEX.md)으로 저장. 트리거: 'QA 해줘', '버그 찾아줘', '메뉴 돌아봐줘', URL+로그인 정보 주면서 탐색 요청, 레이아웃 확인 요청."
---

# Web QA

> **파이프라인 위치**: `/forge-fix` 버그 파이프라인 ② 리포트 스테이지(+ `--scan` 발견 프론트). 독립 호출도 유지.

## 역할

웹앱 LNB 전체 메뉴를 자동 순회하며 기능 오류·레이아웃 이슈를 탐지하는 QA 실행자. 오류를 만나도 중단하지 않고 기록 후 계속 진행하며, bug-report 표준 포맷(BUG-NNN, 6하원칙)으로 결과를 남긴다.

## 컨텍스트

`/forge-fix` 버그 파이프라인의 ② 리포트 스테이지(또는 `--scan` 발견 프론트) 또는 독립 호출. 전제: 접속 URL·로그인 계정(선택)·프로젝트 루트 경로·테스트 범위(전체/특정 메뉴)를 사용자로부터 확보한 상태.

**입력**: 접속 URL, 로그인 계정(선택), 프로젝트 루트 경로, 테스트 범위(전체/특정 메뉴).
**출력**: `docs/bug_report/BUG-NNN-{slug}.md` (bug-report 표준 포맷) + `INDEX.md` 갱신 + 스크린샷 + 콘솔/네트워크 로그 파일(가능 시).

---

## 사전 확인

작업 전 확인:
1. **접속 URL** — 테스트 대상 주소
2. **로그인 계정** — ID/PW (없으면 이미 로그인 상태인지 확인)
   - 복수 계정 시: **계정1로 전체 탐색 → 버그 발견 시 계정2로 동일 재현 여부 확인**
3. **프로젝트 루트** — 버그 저장 경로 기준
4. **테스트 범위** — LNB 전체 vs 특정 메뉴

---

## Step 1: 접속 및 로그인

`mcp__claude-in-chrome__navigate`로 URL 접속 후 로그인 폼에 자격증명 입력.
로그인 성공 여부를 페이지 텍스트로 확인 후 진행.

## Step 2: LNB 메뉴 목록 파악

`mcp__claude-in-chrome__get_page_text`로 메뉴 구조 추출.
서브메뉴(드롭다운·트리) 모두 펼쳐서 목록화 → 내부 체크리스트로 관리.

## Step 3: 페이지별 순차 탐색

각 메뉴 하나씩 클릭 → 아래 항목 점검.
**오류 발생해도 기록 후 다음 메뉴 계속 진행 — 절대 중단 금지.**

**기능 오류 체크**:
- HTTP 오류 (404/500/502) — URL + 상태코드 기록
- 빈 화면 / 로딩 스피너 미해제
- JS 콘솔 에러 (`read_console_messages`)
- 네트워크 요청 실패 (`read_network_requests`)
- 버튼/링크 클릭 불가·무반응
- 데이터 테이블 빈 칸·오류 메시지

**레이아웃 이슈 체크**:
- 요소 겹침(overlap) / overflow / 정렬 틀어짐
- 여백 불균일 / 이미지·아이콘 깨짐·미표시
- 테이블 컬럼 width 이상 / 불필요한 스크롤바

## Step 4: 버그 발견 시 즉시 처리

버그 발견 즉시:

**① 스크린샷 캡처 (PIL 가짜 이미지 절대 금지)**
```
1. request_access 필수 호출 (캡처 권한 확인)
2. 권한 있으면: mcp__computer-use__screenshot 으로 실제 캡처
   저장: {프로젝트 루트}/docs/bug_report/screenshots/BUG-{NNN}-red-{메뉴명}.png
3. 권한 없으면: "캡처 실패 — 권한 없음" 기록 후 다음 진행 (중단 금지)
```

**② API 응답 캡처** (데이터 관련 페이지)
```
read_network_requests 로 API 응답 확인 → 3-way 분류:
- 200 + 빈배열/null → "데이터 없음" (버그 아님, 정상)
- 4xx / 5xx          → 버그 (API 오류)
- 200 + data 있음 + 화면 미표시 → 렌더링 버그
```
버그 판정 시 엔드포인트·상태코드·응답 요약 리포트에 저장.

**②-2 콘솔/네트워크 로그 파일 영속화 (F12 증거, 읽고 버리지 않음)**
```
가능하면 동일 URL을 playwright 헬퍼로 재현 캡처해 콘솔·네트워크 전문을 파일로 남긴다:
node "${FORGE_ROOT:-$HOME/forge}/shared/scripts/playwright-devtools-capture.mjs" \
  --url {버그 재현 URL} --out-prefix docs/qa/artifacts/{BUG-ID}-red --phase red

chrome MCP 순회 세션(로그인 상태·SPA 컨텍스트) 때문에 헬퍼 병행이 어려우면, 최소한
read_console_messages / read_network_requests 결과를 화면에서만 읽고 버리지 말고 파일로 저장:
  docs/bug_report/logs/{BUG-ID}-console.json
  docs/bug_report/logs/{BUG-ID}-network.json
```
저장 경로(헬퍼 사용 시 `docs/qa/artifacts/{BUG-ID}-red-console.json` 등, 미사용 시 위 `docs/bug_report/logs/` 경로)를 Step 5 템플릿의 "콘솔 로그 파일" / "네트워크 로그 파일" 필드에 기록한다. 둘 다 캡처 불가 시 "미수집 — 사유" 기록.

**③ BUG ID 채번**
```bash
bash $HOME/.claude/skills/bug-report/scripts/next-bug-id.sh {프로젝트 루트}/docs/bug_report
```

**④** 6하원칙 + 재현 계정 메모 기록 → 다음 메뉴 즉시 계속

## Step 4.5: 증상 이동 감지 (Symptom Migration — FOP 연동)

> false-green 방지: 이전에 "fixed"로 처리된 기능이 다시 버그로 등장하면, 이전 수정이 증상 계층만 고친 false-green이었을 가능성(증상이 다음 계층으로 이동). 이를 새 리포트에 경보로 남긴다. SSoT: `11-platform/pipelines/forge-dev/2026-07-01-v1-fix-outcome-gate/plan.md`.

버그 리포트 작성 전, 이 기능({WHERE} 메뉴/URL/엔드포인트)이 과거에 수정 완료됐는지 결정론적으로 조회:

```bash
# 이전 fix 증거 조회 (프로젝트 루트=$ROOT). WHERE의 핵심 키워드(메뉴 slug/URL 경로/엔드포인트)를 KEY로.
KEY="{메뉴 slug 또는 URL 경로 또는 엔드포인트}"
# 1) 과거 bug-report 중 Resolved/Closed 동일 기능
grep -rliE "$KEY" "$ROOT"/docs/bug_report/BUG-*.md 2>/dev/null | while read f; do
  grep -qiE "상태.*(Resolved|Closed|해결|수정완료)" "$f" && echo "PRIOR-FIX(bug-report): $f"; done
# 2) FOP 아티팩트(이전 GREEN) — 동일 기능
grep -rliE "$KEY" "$ROOT"/docs/qa/artifacts/bug-*-fop.json 2>/dev/null | sed 's/^/PRIOR-FIX(fop): /'
# 3) 영구 회귀 등록 — 동일 기능
grep -niE "$KEY" "$ROOT"/docs/qa/scenarios.md 2>/dev/null | sed 's/^/PRIOR-REGRESSION: /'
```

- **매치 있음** → 새 리포트에 `## 증상 이동 경보` 섹션 추가(Step 5 템플릿). 이전 fix 참조 + "이전 FOP 재검증 필요" 명시. severity를 최소 **High**로 상향(회귀=핵심 신뢰 문제).
- **매치 없음** → 신규 버그(정상). 경보 섹션 생략.

advisory: 경보는 플래그일 뿐 차단 아님. 이전 fix가 실제 무효인지 판정은 healer FOP 재검증(a4.5)에 위임.

## Step 5: 버그 리포트 파일 작성

경로: `{프로젝트 루트}/docs/bug_report/{BUG-ID}-{slug}.md`

```markdown
# {BUG-ID} — {버그 제목}

**심각도**: Critical | High | Medium | Low
**상태**: Open
**발견일**: YYYY-MM-DD HH:MM
**발견자**: web-qa 자동탐색
**담당자**: (미배정)

## 6하원칙

| 항목 | 내용 |
|------|------|
| **WHO** | {계정명} 계정 / 재현 계정: {test_j만 / test_j+test_m 동일 / 모든 계정} |
| **WHAT** | {발생한 현상 — 구체적으로} |
| **WHEN** | {YYYY-MM-DD HH:MM} |
| **WHERE** | {메뉴명} > {페이지명} (`{URL}`) |
| **WHY** | {추정 원인 — 모르면 "미확인"} |
| **HOW** | 1. {재현 단계} 2. {재현 단계} 3. {결과} |

**스크린샷**: `screenshots/{BUG-ID}-red-{메뉴명}.png` (캡처 실패 시 "캡처 실패 — 권한 없음")

**콘솔 로그 파일**: `{저장 경로}` (미수집 시 "미수집 — 사유")
**네트워크 로그 파일**: `{저장 경로}` (미수집 시 "미수집 — 사유")

**API 응답** (데이터 버그 시):
- 엔드포인트: `{URL}`
- 상태코드: `{200/4xx/5xx}`
- 응답 요약: `{빈배열 / 데이터N건 / 오류메시지}`
- 판정: `데이터없음(정상) / API오류(버그) / 렌더링버그`

## Failure Attribution

- **컴포넌트**: (URL + 오류 유형)
- **연관 버그**: —

## 증상 이동 경보 (Symptom Migration) — Step 4.5 매치 시에만

- **이전 fix**: {PRIOR-FIX 경로/BUG-ID/날짜}
- **판정**: 이 기능은 과거 수정 완료됨 → 재등장 = 이전 FOP false-green 의심(증상이 다음 계층으로 이동).
- **조치 권고**: healer 재수정 시 이전 GREEN 증거(db_query_after/reload/full-journey) 재검증 + 이전 회귀테스트가 왜 못 잡았는지 규명(a6 oracle 재점검).
- (Step 4.5 매치 없으면 이 섹션 생략)

## 처리 이력

| 날짜 | 작업자 | 내용 |
|------|--------|------|
| YYYY-MM-DD | web-qa | Open |
```

## Step 6: INDEX.md 갱신

`docs/bug_report/INDEX.md` 없으면 신규 생성:
```markdown
# Bug Index

| ID | 제목 | 심각도 | 상태 | 발견일 | 담당자 |
|----|------|--------|------|--------|--------|
```

발견 버그마다 행 추가:
```
| {BUG-ID} | {slug} | {심각도} | Open | {발견일} | — |
```

## Step 7: 탐색 완료 요약

탐색 전체 완료 후 출력:

```markdown
## QA 탐색 결과 요약

**테스트 URL**: {URL}  **일시**: {YYYY-MM-DD}  **총 메뉴**: {N}개  **발견 버그**: {N}개

| 메뉴명 | URL | 상태 | 버그 수 |
|--------|-----|------|---------|
| 대시보드 | /dashboard | ✅ 정상 | 0 |
| 회원관리 | /users | ⚠️ 레이아웃 | 1 |
| 정산관리 | /settlement | ❌ 500 오류 | 1 |

### 우선순위 권고
**즉시 조치 (Critical/High)**: BUG-NNN — {사유}
**다음 스프린트 (Medium/Low)**: BUG-NNN — {사유}
```

상태 아이콘: ✅ 정상 / ⚠️ 레이아웃 / ❌ 기능오류

---

## Step 7.5: 순회 후 Evaluator 패스 (post-traversal, 순회 완료 후에만 실행)

> 이 단계는 Step 7 요약 출력 **이후**에만 실행한다. 순회 중 절대 중단 금지 원칙은 유지된다.

별도 evaluator subagent를 스폰한다 (traversal executor와 독립된 agent — reasoning 격리).

```python
Agent(
  subagent_type="general-purpose",
  prompt="""
BUG-EVALUATOR 역할: 아래 bug-report 파일 목록을 rubric 기준으로 평가한다.
순회 실행 컨텍스트를 상속하지 않는다 — 오직 rubric + 실제 파일 내용만 참조.

입력: {bug_report_dir}/BUG-*.md 전체 목록
rubric 기준:
  1. 중복 통합: 동일 페이지·동일 현상 BUG-NNN 항목 → 하나의 MASTER 버그로 병합 제안 (파일 수정 X, 병합 목록만 출력)
  2. severity 정합: 각 버그의 심각도를 $HOME/.claude/skills/bug-report/references/severity.md 기준으로 재검증
     - 선언된 심각도 vs rubric 기준 불일치 → [MISMATCH] 플래그
  3. 불일치 요약: MISMATCH 건별 (BUG-ID / 선언 심각도 / 권장 심각도 / 사유) 표 출력

출력 형식:
## Evaluator Report
### 중복 통합 대상
| 그룹 | MASTER | 중복 항목 | 통합 사유 |
|------|--------|----------|---------|

### Severity MISMATCH
| BUG-ID | 선언 | 권장 | 사유 |
|--------|------|------|------|

### 종합 평가
총 버그: N / 중복 후보: N건 / Severity 불일치: N건
  """,
)
```

evaluator 결과를 받아 최종 요약에 "Evaluator 검토 결과" 섹션으로 첨부한다.

---

## Step 7.7: Critical/High 재현 재검 (re-verify, max 1회/버그)

> 재현성을 반드시 확인해야 하는 Critical/High 버그에 한해 실행. bound: 버그당 최대 1회.

Step 7.5 Evaluator 결과에서 **Critical 또는 High** 판정된 버그 목록을 대상으로:

각 Critical/High 버그마다 별도 re-verify subagent를 스폰한다 (evaluator와도 독립):

```python
# Critical/High 버그 목록 순회 (for each bug in critical_high_list)
Agent(
  subagent_type="general-purpose",
  prompt="""
RE-VERIFY 역할: 단일 버그의 재현 가능성을 확인한다. (max 1 re-verify per bug)
대상 버그: {BUG-ID} — {버그 제목}
재현 URL: {WHERE URL}
재현 단계: {HOW 재현 단계}

실행:
1. mcp__claude-in-chrome__navigate 로 해당 페이지 재접속
2. 재현 단계 그대로 수행
3. 동일 현상 확인 → CONFIRMED / 미재현 → UNCONFIRMED

출력:
재현 결과: CONFIRMED | UNCONFIRMED
증거: (스크린샷 경로 또는 "미재현 — 상태 변경 가능성")
  """,
)
```

re-verify 결과를 해당 BUG 파일의 `## 처리 이력` 에 한 줄 추가한다:
```
| {날짜} | re-verify | CONFIRMED / UNCONFIRMED |
```

**bound**: 버그당 1회만 실행. UNCONFIRMED이더라도 추가 재시도 금지 → 결과를 그대로 기록하고 사람이 판단.
Critical이 UNCONFIRMED이면 처리 이력에 "(자동 재현 실패 — 수동 확인 필요)" 명시.

---

## 심각도 기준

→ `$HOME/.claude/skills/bug-report/references/severity.md` 참조

| 심각도 | 기준 |
|--------|------|
| Critical | 5xx 오류, 로그인 불가, 데이터 유실 |
| High | 핵심 기능 불작동, 데이터 오표시 |
| Medium | 부분 오작동, 레이아웃 크게 깨짐 |
| Low | 사소한 여백·아이콘·텍스트 이슈 |

---

## 주의사항

- 오류 페이지 만나도 절대 중단 금지 — 기록 후 다음 메뉴
- 기획 의도 불분명 시 Low + "(기획 확인 필요)" 명시
- 스크린샷 파일명 공백 → 언더스코어(_) 사용

## Workflow 통합 (계획서 P1)

병렬/다단계 실행 = Workflow 도구로 컨텍스트 격리 + resume 지원. 패턴: Navigate→Detect(4개씩 배치 parallel)→Report.

실행: `Workflow({ script: Bash("cat $HOME/.claude/skills/bug-report/workflow.js") })`

`CLAUDE_CODE_DISABLE_WORKFLOWS=1` 시 기존 방식 fallback.

