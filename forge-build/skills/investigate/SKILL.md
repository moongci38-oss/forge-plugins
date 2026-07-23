---
name: investigate
description: "버그 근본원인을 증상→분석→가설→검증 4단계로 규명. 원인불명 버그 수정 전 필수 — 근본원인 없이 수정 금지."
context: fork
model: sonnet
---

**역할**: 당신은 버그/이슈의 근본 원인을 4단계 구조화 프로세스로 분석하는 디버깅 전문가입니다.
**컨텍스트**: 사용자가 버그, 에러, 이상 동작을 겪을 때 호출됩니다.
**출력**: 근본 원인 분석 보고서 + 수정 계획을 반환합니다.

# Investigate — 루트 코즈 분석

> **파이프라인 위치**: `/forge-fix` 버그 파이프라인 ① 조사·재현 스테이지. 독립 호출도 유지.

버그, 에러, 이상 동작의 근본 원인을 4단계 구조화 프로세스로 분석한다.

## Workflow 통합 (계획서 P2-7)
RAG 선검색 → 조사 → 분석 → 가설 검증 컨텍스트 격리. Stage 4+5(재현+수정)는 human gate 후 healer/forge-pge 위임.
패턴: RAG(Explore) → Investigate(소스+gitnexus) → Analyze(가설 2개+) → Verify → [STOP] human gate.
실행: `Workflow({ script: Bash("cat ~/.claude/skills/investigate/workflow.js"), args: { issue, target, skipVerify } })`
skipVerify=true → Stage 3 skip, 가설 목록만 반환. `CLAUDE_CODE_DISABLE_WORKFLOWS=1` 시 기존 직접 실행 fallback.

## 핵심 철칙

> **근본 원인을 특정하지 않은 상태에서 수정하지 않는다.**
> 증상만 보고 패치하면 다른 곳에서 같은 문제가 재발한다.

## 사용법

```
/investigate "로그인 후 세션이 유지되지 않는 문제"
/investigate "grants-write가 작성요령 span을 삭제하는 버그"
/investigate "RAG 검색 결과에 관련 없는 문서가 상위에 나옴"
```

## 4단계 프로세스

### Stage 0: RAG 선검색 + 소스 변경 감지

이슈 키워드(에러 메시지 + 모듈명 + 증상)로 forge-outputs를 먼저 검색한다.

1. 키워드 추출 → `rag-search` 스킬 호출
   - **rag-search 결과 없음 (cold-start 가능성)**: Glob `forge-outputs/01-research/bugs/**/*.md` + `forge-outputs/docs/reviews/**/*.md` 직접 탐색 → 파일명에 키워드 포함 시 Read
2. 유사 이슈 리포트 발견 시:
   - 해당 파일 Read → 다음 추출:
     - **리포트 작성일**: 파일명 또는 front matter `date:` 또는 `# ... YYYY-MM-DD` 패턴에서 **YYYY-MM-DD** 추출
     - **관련 파일 목록**: 리포트 내 backtick 코드블록 또는 `## 근본 원인` / `## 수정 파일` 섹션에서 `.ts`/`.js`/`.py`/`.cs`/`.go` 경로 Grep
   - 관련 파일 목록 없으면 프로젝트 루트 전체(`-- .`)로 대체
   - `git -C "{프로젝트 루트}" log --since="{YYYY-MM-DD}T00:00:00+09:00" --oneline -- {관련 파일들}` 실행
   - **git 실패** (not a git repo / permission error): "git 사용 불가 — 기존 해결책 참고 후 Stage 1 진행"
   - **커밋 없음**: "소스 변경 없음 — 기존 해결책 유효" → 제시 후 Human 확인
   - **커밋 N개**: "관련 소스 N개 커밋 변경 — 기존 해결책 참고만, 재조사 권장" → Stage 1 진행
3. 없음 → "기존 케이스 없음" 출력 후 Stage 1 진행

## 재현 루프 구축 (Stage 1 선행 reference)

재현이 자명하지 않은 버그는 `${FORGE_ROOT:-$HOME/forge}/.claude/rules-on-demand/bug-feedback-loop.md` 참조 — **루프 구축법 11종**(실패 테스트→curl→트레이스 재생→bisect→차등 루프…), **tight 4기준**(red-capable·결정적·빠름·agent-runnable), 비결정 버그 재현율 전략. red-capable 명령이 존재하기 전에 코드를 읽으며 가설부터 세우는 것 금지. 가설은 **3~5개 랭킹 생성**(단일 가설 = 앵커링) 후 검증 착수 — Stage 2 "가설 2개+"의 상한 확장.

## 11-Category Bug Pattern

Stage 0.5 빠른 매핑 + Stage 2 가설 수립에 공통 참조하는 11종 카탈로그.

> 전체 카탈로그 → `reference.md §11-Category Bug Pattern 카탈로그` (필요 시 Read)

→ Stage 0.5에서 1~2개 특정 후 Stage 1 진입. Stage 2 가설 수립 시 해당 카테고리 패턴을 근거로 활용.

## 4 디버그 추론 모델

Stage 2(분석) 및 Stage 3(가설 검증) 진행 시, 4가지 추론 모델(binary-search/differential/causal-chain/invariant-check) 중 상황에 맞는 것을 선택하여 적용한다. 기존 5-step 역추적(Stage 2 §코드 경로 역추적)과 병행 사용.

> 모델별 적용 상황·방법 상세표 → `reference.md §4 디버그 추론 모델` (필요 시 Read)

### Stage 0.5: 버그패턴 빠른 매핑

증상을 11-Category Bug Pattern 카탈로그(위)에 빠르게 매핑한다. Stage 1 탐색 범위를 사전에 좁히기 위함.

→ 해당 카테고리 1~2개 특정 후 Stage 1 시작.

### Stage 1: 조사 (Investigate)

증상을 정확히 기록하고, 재현 조건을 특정한다.

**시작 전 — GitNexus 구조 탐색 (인덱스된 프로젝트에서 우선 실행)**:
```
0. mcp__gitnexus__list_repos → indexed_date 확인 (7일+ stale = 경고 후 계속)
1. mcp__gitnexus__query({query: "{에러_키워드} {모듈명}"})
   → 관련 Process + Symbol 발견 (grep 추측 대신 그래프 근거)
2. mcp__gitnexus__context({name: "{의심_함수}"})
   → callers/callees 360도 뷰 → 재현 시나리오 근거
→ gitnexus 결과 없으면 기존 grep/소스 탐색 fallback
```

**시작 전**: `.claude/reference/codebase-analysis.md` 존재 시 Read → 아키텍처·의존성 그래프 파악 후 영향 범위 추론에 활용

```markdown
## 증상
- 무엇이 발생하는가:
- 언제 발생하는가:
- 어디서 발생하는가:
- 재현 가능한가: [Yes/No/간헐적]
- 재현 계정: [예: test_j만 / test_j + test_m 동일 / 모든 계정]

## 재현 단계
1. ...
2. ...
3. → 여기서 문제 발생

## 기대 동작 vs 실제 동작
- 기대: ...
- 실제: ...
```

수집 방법:
- 에러 로그/스택 트레이스 읽기
- 관련 파일 Grep/Read
- git log로 최근 변경 확인
- 재현 시도

**UI/레이아웃 버그 분기** (증상이 시각적 깨짐·렌더링 이슈인 경우):

```bash
# 1. 재현 전 스크린샷 (RED) — mcp__claude-in-chrome 사용
#    저장: docs/bug_report/screenshots/{BUG-ID}-red-before.png
# 2. 스크린샷을 bug report에 첨부 → healer Vision evaluator가 참조

# Chrome 접속 → 해당 페이지 이동 → screenshot 캡처
# 파일 없으면 healer a4 Vision evaluator 판정 불가 → 반드시 캡처
```

**API 응답 캡처 분기** (데이터 없음 vs 버그 구분이 필요한 경우):

```bash
# Stage 1에서 API 응답 body 저장
# 저장: docs/bug_report/artifacts/{BUG-ID}-api-response.json
# → healer가 재현 시 동일 API 재호출 없이 참조 가능
# → "데이터 없음(정상)" vs "버그" 구분 근거로 사용
```

**과거 버그 자동 검색 (필수)**: Stage 1 시작 시 두 채널로 유사 버그 확인.
```bash
# (1) learnings.jsonl 의 bug-fix-pattern (compounding — global + project, access.log 자동 기록)
LEARN_BY=investigate bash ~/.claude/scripts/learnings.sh load bug-fix-pattern 2>/dev/null
# (2) rag-search (보완 — forge-outputs/01-research/bugs/ 본문 검색)
rag-search("{project} {증상 키워드}")
```
→ 관련 결과 있으면 Stage 1 보고서에 "관련 과거 버그" 섹션 추가 (learnings의 `apply` = 이전 근본원인+수정 패턴 요약 / bug 리포트 = 상세).

**다층 시스템 boundary 진단 (멀티 컴포넌트 시스템 필수)**:

> 시스템이 다층 구조(Frontend → API → DB, CI → build → deploy, Auth proxy → SignalR → backend)일 때 **추측 금지 — evidence 수집 우선**.

각 컴포넌트 경계에 진단 instrumentation 추가하여 **WHERE 깨지는지** 한 번에 확인:

```
For EACH component boundary:
  - 컴포넌트 진입 시 입력 데이터 로깅
  - 컴포넌트 출구 시 출력 데이터 로깅
  - 환경변수/설정 propagation 검증
  - 각 레이어 상태(헤더·세션·토큰·DB connection state) 캡처

→ 한 번 실행 → evidence 수집 → 깨진 경계 식별 → 해당 컴포넌트만 Stage 2 분석
```

**원칙**: 1 회 실행 + 4 layer 로그 = 깨진 경계 즉시 식별 → 해당 1개 layer만 깊이 조사. 4 layer 동시 추측 = thrashing.

> 실행 예시(starbeginz 3 repo: avatarplay-frontend → .NET API → MySQL) → `reference.md §Stage 1 다층 시스템 boundary 진단 예시` (필요 시 Read)

### Stage 2: 분석 (Analyze)

가능한 원인을 모두 나열하고, 증거 기반으로 좁힌다.

#### 패턴 분석 — 가설 수립 전 working example 비교

가설 나열 전, 동일 코드에서 **정상 동작 경로(working example)** 와 **실패 경로** 를 나란히 비교한다:

1. **유사 기능 탐색**: 같은 레이어에서 정상 동작하는 코드(passing path) 1개를 찾는다.
2. **구조 대조**: passing path와 failing path의 코드 구조·상태 흐름·의존성을 줄 단위로 비교.
3. **차이점 목록화**: 두 경로 간 유일한 차이를 3개 이하로 좁힌다 — 이것이 가설 우선순위 근거.

→ working example 비교 없이 가설 목록만 나열하면 Stage 2 미완료.

#### 가설 수립 전 자기점검 — red-flag 7종

아래 생각이 들면 멈추고 근거를 먼저 수집한다:

1. "이게 원인인 것 같다" — 증거 없이 단정. 근거 없으면 가설 목록에 넣되 High 주지 않는다.
2. "이전에도 이 패턴이었다" — 현재 증상과 이전 사례가 100% 동일한지 확인 후 유추.
3. "재현이 어려우니 그냥 고친다" — 재현 불가 = 원인 미특정. Stage 3 검증 먼저.
4. "코드가 간단해 보여서 버그가 없을 것" — 단순 코드에서도 off-by-one·null-deref 빈발.
5. "긴급하니 빠르게" — 긴급할수록 근본 원인 특정 후 수정. 우회 패치는 재발 확률 ↑.
6. "이 파일만 보면 된다" — Stage 1 boundary 진단으로 레이어 확정 전 단일 파일 한정 금지.
7. "테스트가 통과하니 원인이 아니다" — 테스트가 해당 경로를 커버하는지 먼저 확인.

```markdown
## 가설 목록
| # | 가설 | 가능성 | 근거 |
|---|------|:-----:|------|
| 1 | ... | High | ... |
| 2 | ... | Medium | ... |
| 3 | ... | Low | ... |

## 제외된 가설
| 가설 | 제외 이유 |
|------|---------|
| ... | ... |
```

분석 방법:
- 5 Whys (왜? 5번 반복)
- 변경점 분석 (git diff/log)
- 코드 경로 역추적 5-step (콜 스택 backward trace):
  1. Observe symptom — 에러가 터진 지점(스택 최상단) 확인
  2. Find immediate cause — 해당 함수/라인에서 무엇이 틀렸는가
  3. Ask what called this — 그 함수를 호출한 caller는 어디인가
  4. Keep tracing up — caller의 caller를 반복 추적 (최대 5 depth)
  5. Find originating cause — 최초로 잘못된 값/상태를 주입한 지점 = 근본 원인
  → 5 depth 내 originating cause 미발견 시: 시스템 경계(외부 입력/설정/환경) 의심
- 유사 이슈 검색 (learnings.jsonl, Auto Memory)

### Stage 3: 가설 검증 (Verify)

가장 가능성 높은 가설부터 검증한다.

```markdown
## 검증 결과
| 가설 | 검증 방법 | 결과 | 확정? |
|------|---------|------|:----:|
| 1 | ... | ... | ✅/❌ |
```

검증 방법:
- 최소 재현 코드 작성
- 로그 삽입 후 재실행
- 관련 테스트 실행
- 설정 변경 후 동작 확인

**(선택) Advisor 가설 우선순위 조언** — 가설이 3개 이상이고 각각 검증 비용이 클 때:

```
Agent(
  subagent_type="advisor-strategist",
  prompt=f"""
근본 원인 가설 중 검증 우선순위 조언 요청.

증상:
{핵심 증상 3~5줄}

후보 가설 목록:
1. {가설 1}
2. {가설 2}
3. {가설 3}

이미 검증된 것:
- {가설 X}: {검증 결과 요약}

제약:
- 검증 시간 평균 {n}시간/가설
- 프로덕션 영향 있음 (유지보수 창구 제한)

질문:
1. 다음 검증할 가설 순서를 근거와 함께 제시해주세요.
2. 각 검증의 예상 비용(시간)과 차단 리스크를 짚어주세요.
"""
)
```

Advisor 응답 받아 Stage 3 진행 순서 결정.

### Stage 4: 재현 테스트 (Prove-It)

근본 원인이 확정되면, **수정 전에** 재현 테스트를 먼저 작성한다.

> **Prove-It 원칙**: 버그를 코드로 증명한 후에만 수정한다.
> 재현 테스트 없는 수정은 "고쳤다고 생각했는데 다시 터짐"의 원인이다.

```markdown
## 재현 테스트
- 테스트 파일: ...
- 테스트 내용: [버그를 정확히 재현하는 테스트]
- 실행 결과: ❌ FAIL (버그가 재현됨을 확인)
```

프로세스:
1. 버그를 정확히 재현하는 테스트 작성
2. 테스트 실행 → **반드시 FAIL** 확인 (PASS면 테스트가 버그를 못 잡는 것)
3. 이제 Stage 5로 이동하여 수정

**blast-radius 게이트**: 수정 예상 범위가 >5개 파일이면 Stage 5 진입 전 중단.
→ Human에게 범위 확인 요청 또는 scope 축소 후 재진행. >5 파일 수정 = 설계 문제 또는 wrong-root-cause 신호.

### Stage 5: 수정 (Fix)

재현 테스트가 FAIL하는 것을 확인한 후에만 수정한다.

```markdown
## 근본 원인
[1문장으로 정확히 기술]

## 수정 내용
- 파일: ...
- 변경: ...
- 이유: ...

## 검증
- [ ] 재현 테스트 → ✅ PASS (수정 확인)
- [ ] 기존 테스트 → ✅ 전체 PASS (회귀 없음)

## 재발 방지
- [ ] 재현 테스트가 CI에 포함됨
- [ ] /learn에 패턴 저장
- [ ] 관련 규칙/문서 업데이트
```

#### 3-fix 에스컬레이션

fix-attempt 카운터를 추적한다. Stage 5를 재진입할 때마다 +1.

- attempt 1~2: 정상 수정 시도
- attempt 3+: **즉시 STOP**. 반복 실패 = 근본 원인 미특정 또는 설계 문제.
  → Stage 2로 돌아가 가설 목록 전면 재검토 후 architecture proposal 작성.
  → Human에게 "3회 수정 실패 — 설계 검토 필요" 보고 후 진행 승인 받기.

#### 토큰 캡 + same-root-cause oscillation 가드 (P1 신규)

**토큰 캡**: Stage 진입마다 확인.

```
INVESTIGATE_TOKEN_CAP = 환경변수 INVESTIGATE_TOKEN_CAP (기본: 300000)

각 Stage 진입 전:
  if estimated_tokens ≥ INVESTIGATE_TOKEN_CAP:
    "[STOP] INVESTIGATE_TOKEN_CAP={cap} 도달. Stage {N} 진입 취소."
    현재까지 수집한 증거 + 가설 목록 + 마지막 Stage 결과 반환
```

- `INVESTIGATE_TOKEN_CAP` 미설정 시 기본값 **300000** 적용.
- Stage별 추정 토큰: Stage 0~0.5 ~30000 / Stage 1 ~60000 / Stage 2 ~80000 / Stage 3 ~60000 / Stage 4~5 ~70000.
- ⚠️ **추정치 정직성**: 추정치 = best-effort (LLM 자가추정, 정확 토큰 카운트 불가). **결정론적 bound = max-cycles**; 토큰 추정은 보조 가드. 정확한 토큰 enforcement는 P4 (agent-budget 훅 연동) 예정.

**same-root-cause oscillation 가드**: Stage 5에서 2회 연속 동일 근본 원인이 도출됐으나 테스트가 여전히 FAIL인 경우 → Stage 2 재진입 금지, 즉시 에스컬레이션.

```
same-root-cause 판정:
  Stage 5 attempt N 완료 후:
    current_root = "## 근본 원인" 섹션 1줄(정규화 소문자, 앞 120자)
    prev_root    = attempt N-1 의 동일 추출값
    if current_root == prev_root AND 테스트 FAIL:
      "[OSCILLATION] 동일 근본 원인 2회 — 수정 패치가 실제 원인에 미도달."
      "Stage 2 재진입 금지. 설계 검토 필요. Human 에스컬레이션."
      STATUS: BLOCKED (조사 완료 상태 선언)
      handover에 oscillation 경위 + 마지막 root-cause 기록 의무
```

- oscillation은 3-fix 에스컬레이션과 독립적으로 작동 (attempt 2에서도 같은 근본원인 연속이면 즉시 발화).

## 합리화 반박 — 금지 패턴

5종 합리화 패턴(증상=원인 단정, 단일 파일 한정, Stage 건너뜀, 반복시도 정당화, 테스트 후순위)과 각 반박·올바른 행동.

> 전체 표 → `reference.md §합리화 반박 — 금지 패턴표` (필요 시 Read)

## 조사 완료 선언 (GS-B10)

Stage 3 이후 [STOP] human gate 전, 반드시 아래 3종 중 하나로 완료 상태 선언:

| 상태 | 의미 | 조건 |
|------|------|------|
| **DONE** | 근본 원인 특정 완료, 수정 가능 | 가설 검증 PASS + 재현 명령 FAIL 확인 |
| **DONE_WITH_CONCERNS** | 원인 특정했으나 부작용/불확실성 존재 | 가설 검증 PASS + 경고 사항 명시 |
| **BLOCKED** | 근본 원인 특정 불가, 추가 정보 필요 | 3-fix 에스컬레이션 도달 또는 재현 불가 |

출력 형식 (human gate 직전):
```
조사 완료 상태: DONE | DONE_WITH_CONCERNS | BLOCKED
근본 원인: <1줄>
확인 명령: <재현 명령>
다음 단계: <healer 위임 | 추가 정보 요청 | 에스컬레이션>
```

## AI 행동 규칙

1. 버그 리포트를 받으면 즉시 코드 수정하지 않는다 — Stage 0(RAG 선검색)부터 시작
2. Stage 2에서 가설이 1개뿐이면 의심한다 — 최소 2개 이상 나열
3. Stage 3 검증 없이 Stage 4로 넘어가지 않는다
4. **Stage 4에서 재현 테스트를 먼저 작성하고 FAIL을 확인한 후에만 Stage 5 수정으로 넘어간다** (Prove-It 원칙)
5. 수정 후 재현 테스트 PASS + 기존 테스트 전체 PASS 확인
6. 해결된 패턴을 /learn에 저장 제안 (+ Stage 6에서 `learnings.sh append --category bug-fix-pattern` 자동 1줄)
7. Stage 5 완료 후 반드시 Stage 6 실행 — bug log MD 저장 + learnings.jsonl 1줄 append (compounding)
### Stage 6: 버그 로그 저장 (Save)

Stage 5 수정 완료 후 **반드시** bug log를 forge-outputs에 저장한다.

저장 경로: `forge-outputs/01-research/bugs/{project}/{YYYY-MM-DD}-{slug}.md`

- `{project}`: 현재 작업 디렉토리에서 추론 (godblade, portfolio, pingame-server 등)
- `{slug}`: 증상 요약 kebab-case (예: `session-not-persisted-after-login`)

> front matter + 섹션 전체 템플릿 → `reference.md §Stage 6 bug log MD 템플릿` (필요 시 Read)

> **rag-search 자동 인덱싱**: 저장 즉시 `forge-outputs/01-research/bugs/`가 rag-search 범위에 포함되어
> 다음 `/investigate` 호출 시 Stage 1에서 이 버그가 참조됨.

**+ learnings.jsonl 1줄 append (compounding — 필수)**: bug log MD 저장 후, 그 요약을 learnings에도 기록한다 (다음 세션·동료가 `learnings.sh load bug-fix-pattern`으로 자동 참조). 헬퍼가 sanitize(스택트레이스 full/토큰 차단)·collision-id·validate 처리:

```bash
bash ~/.claude/scripts/learnings.sh append --category bug-fix-pattern \
  --summary "<증상 1줄>" \
  --trigger "<재현 조건 1줄>" \
  --apply "<근본 원인 + 수정 패턴 1줄>" \
  --evidence "01-research/bugs/{project}/{YYYY-MM-DD}-{slug}.md"
```
- exit 0 → 보고에 `📌 learnings 신규: <id>`. exit 2(secret 감지) → `⚠️ bug-fix-pattern learning 억제 — <패턴명>, 내용 비노출` 만 (raw 노출 X). exit 3(다줄 등) → summary/apply를 1줄로 압축 후 재시도. exit 4(git repo 아님) → learning 내용을 사용자 보고에 1줄 노출(손실 0).
- `summary`·`apply`·`evidence`·`trigger` = 각 1줄 (개행 금지 — 스택트레이스는 본문 bug log MD에만, learnings엔 1줄 요약).

**롤업 자동 갱신 (신선도 — append 성공 후)**: bug-fix 패턴 기록 직후 프로젝트 Graph RAG 롤업 즉시 재생성 (단일 sync 엔진, idempotent·non-blocking):
```bash
REPO=$(basename "$(git rev-parse --show-toplevel 2>/dev/null)" 2>/dev/null || echo unknown)
[ -d "${FORGE_OUTPUTS:-$HOME/forge-outputs}/.rag-index" ] && [ "$REPO" != unknown ] && \
  OPENAI_API_KEY="" timeout 180 python3 ~/forge/shared/scripts/rag/project_knowledge_sync.py --project "$REPO" >/dev/null 2>&1 || true
```

### Stage 7: Codex bugfix 적대적 리뷰 (Plan v2-C1, 자동, 권고)

Stage 6 bug log 저장 후 자동 호출:

```bash
/codex-review --stage bugfix --target <patch file or PR-N>
```

검증 포커스 (적대적):
- 근본 원인 vs 우회 — 증상만 가린 patch인지
- 회귀 가능성 — 같은 root cause가 다른 경로에 잠복?
- 재현 케이스 적정성 — 테스트가 실제 버그를 재현?
- 부작용 — 수정으로 새 failure mode 도입?

정책:
- `bugfix` stage = blocking NO. WARN/FAIL → 사용자 컨펌 후 진행
- 결과: `forge-outputs/docs/reviews/bugfix/{date}-{slug}.{md,json}`
- 비활성: `CODEX_REVIEW_AUTO_STAGES=off`
> 실패 시 [[pev-self-correction]] 적용

## 완료 상태 (GS-B10)

`/investigate` 세션 종료 시 아래 3-state enum 중 하나를 명시적으로 선언한다.

| 상태 | 의미 | 조건 |
|------|------|------|
| `DONE` | 근본 원인 특정 + 수정 완료 + 재현 테스트 PASS | Stage 5 성공 + Stage 6 저장 완료 |
| `DONE_WITH_CONCERNS` | 수정 완료했으나 주의 항목 존재 | Stage 5 성공이지만 ① Codex WARN ② blast-radius 5↑ ③ 임시 패치 |
| `BLOCKED` | Human gate 또는 3-fix 에스컬레이션 | ① Stage 4 [STOP] ② 3회 수정 실패 ③ 설계 개입 필요 |

### 선언 형식

세션 마지막 보고에 포함:

```
[investigate] STATUS: DONE | 근본 원인: <1줄> | 수정 커밋: <hash>
[investigate] STATUS: DONE_WITH_CONCERNS | 사유: <Codex WARN 항목 / 임시 패치 이유>
[investigate] STATUS: BLOCKED | 사유: <Human gate 필요 이유> | 권고: <다음 액션>
```

`DONE_WITH_CONCERNS` / `BLOCKED`는 handover `§발견한 이슈`에 상세 기록 필수.
