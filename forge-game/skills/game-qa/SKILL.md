---
name: game-qa
description: "Unity 게임 클라이언트와 게임 서버 QA를 자동화한다. 게임 빌드 검증이나 게임 QA를 요청할 때 사용한다."
---

# game-qa — 게임 프로젝트 QA (Phase A~H 정합)

> **AD-93 W5**: /qa 스킬과 동일한 Phase A~H 패턴 적용. game-qa는 Unity MCP 전용 T1/T2 대체.

**역할**: Unity MCP + 서버/봇 빌드 + 소켓 스모크 + 정적분석 통합 QA. Phase A~H 오케스트레이터.
**전제**: Unity MCP(CoderGamester/mcp-unity 또는 com.unity.ai.assistant) 게임 프로젝트 세션에 설치됨.
**출력**: `docs/qa/game-qa-report.md` + NUnit XML (`docs/qa/artifacts/unity-test-results.xml`)

프로젝트별 스택 → `references/project-stacks.md` 참조.

## 실행 순서 (4단계)

### 1. 프로젝트 감지

```bash
# baduggi / matgo / GodBlade / 기타 자동 감지
PROJECT=$(basename "$(pwd)")
# project-stacks.md에서 해당 프로젝트 스택 확인
```

`references/project-stacks.md` 읽어 대상 프로젝트 서버·봇·Unity 경로 확인.

### 2. Unity MCP 테스트 (우선)

MCP 도구 직접 호출 (Claude Code 세션에서 실행 시 노출됨):

```
run_tests(testPlatform: "editmode")
→ passed/failed/errors 파싱
→ FAIL > 0 → 실패 테스트명 + 에러메시지 수집 → 버그 리포트

get_console_logs(logType: "Error")
→ NullReferenceException / SocketException / ProtocolError 목록
→ **console_clean 판정**: QA 시작 시 이 호출로 콘솔 에러 기준선을 캡처하고, QA 종료 시 동일 호출로 재캡처해 diff한다. 기준선 대비 신규 에러 0건 = PASS(console_clean), 1건+ = 리포트 "콘솔 에러" 섹션에 기록 후 FAIL/WARN 판정에 반영.

# UI 버그 의심 시
capture_screenshot()          → docs/qa/artifacts/game-shot-{N}.png
get_scene_summary()           → 씬 상태 스냅샷
```

**MCP 프리플라이트**: MCP 도구 호출 전 엔진 브리지 헬스를 curl 1콜로 확인 (예: `curl -s -o /dev/null -w '%{http_code}' --max-time 2 <MCP endpoint>`). DOWN이면 툴 타임아웃을 기다리지 말고 즉시 사용자에게 에디터 기동 요청.

**인게임 E2E 프로브 (런타임 GREEN 증거)**: 정적 검사·테스트가 전부 PASS여도 런타임 연출/표시 버그는 못 잡는다. 프로젝트 스코프 레시피가 있으면 로드해 따른다 — 예: GodBlade `src/.claude/rules/unity-e2e-probe.md` (Play 진입 → 이벤트 기반 UI 클릭 → 마커 로그 프로브(씬 저장 금지·종료 시 회수·씬 diff 0 확인) → 스크린샷 → DB 실측(DESCRIBE 먼저)). 엔진·UI 프레임워크 구현 디테일은 프로젝트 룰이 정본 — 이 스킬에 하드코딩하지 않는다.

**팝업 해소 루프 (시나리오 진입 전 표준 선행 스텝)**: 자정 경과 등으로 출석·일일 보상 팝업이 스택으로 쌓이면 E2E 내비게이션이 막힌다. 시나리오 진입 직전 "팝업 감지(`get_scene_summary()`/`capture_screenshot()`) → 닫기 클릭 → 재확인" 루프를 최대 5회 반복한다. 5회 후에도 팝업이 남으면 [STOP] — 팝업 종류·스크린샷 첨부해 Human 확인 요청(무한 루프 금지).

**MCP 없는 경우** (ToolSearch("unity run_tests") 결과 없음): Unity CLI 폴백.

```bash
"$UNITY_PATH" -batchmode -nographics -quit   -projectPath "$CLIENT_DIR"   -runTests -testPlatform editmode   -testResults docs/qa/artifacts/unity-test-results.xml
```

### 3. 서버/봇 빌드 + 소켓 스모크

`scripts/game-verify.sh` 실행:

```bash
bash ~/forge/.claude/skills/game-qa/scripts/game-verify.sh
```

검사 항목:
| ID | 내용 | 판정 |
|----|------|------|
| T-BUILD | `dotnet build bot-dotnet8/` 또는 `msbuild` | FAIL |
| T-CONNECT | 서버 HTTP 헬스 + Socket.IO 핸드셰이크 | FAIL |
| T-STATIC | C# null체크 누락, TODO 과다 (>10건), 이벤트 상수 불일치 | WARN |
| T-BOT | `BOT_SMOKE=1` 시 봇 연결 스모크 | WARN |

### 4. 리포트 생성

`docs/qa/game-qa-report.md`:

```markdown
# Game QA Report — {프로젝트명}
일시: {date} | 판정: PASS / WARN / FAIL

## Unity 테스트 (MCP/CLI)
passed: N | failed: N | errors: N

## 실패 테스트
- {테스트명}: {에러메시지}

## 콘솔 에러
- {에러타입}: {메시지} ({파일:라인})

## 서버/봇 빌드
- T-BUILD: PASS/FAIL
- T-CONNECT: PASS/FAIL

## 정적 분석 WARN
- {항목}: {파일:라인}

## 판정 근거
Unity FAIL {N}건 / 빌드 FAIL {N}건 → FAIL
WARN만 → WARN / 전체 0건 → PASS
```

## Workflow 통합 (계획서 P2-1)
병렬/다단계 실행 = Workflow 도구로 컨텍스트 격리 + resume 지원.
패턴: Detect → parallel(Unity테스트, 서버/봇빌드) → 집계 Report.
실행: `Workflow({ script: Bash("cat ~/.claude/skills/game-qa/workflow.js"), args: { project } })`
`CLAUDE_CODE_DISABLE_WORKFLOWS=1` 시 기존 4단계 직접 실행 방식 fallback.

## FAIL 라우팅 + 재시도 루프 [BOUNDED]

> 추정=보조, 결정론 bound=max-cycles, 정확 enforcement=P4(agent-budget 훅)

`Unity FAIL > 0` 또는 `빌드 FAIL > 0` 발생 시 silent FAIL 금지 — 즉시 bounded 재시도:

```
QA_CYCLE=0
QA_MAX=2
ISSUE_HASH=""   # sha256(실패테스트명:에러메시지 첫줄)

while [Unity FAIL > 0 또는 빌드 FAIL > 0] AND QA_CYCLE < QA_MAX:
  QA_CYCLE += 1
  NEW_HASH = sha256(실패테스트명:에러메시지 첫줄)

  # same-issue stop: 동일 오류 2회 연속 = 자동 해소 불가
  # GC5: QA_MAX=2이므로 1st cycle에서 즉시 NEW_HASH==ISSUE_HASH 체크 = 즉각 stop.
  # forge-implement는 PEV_MAX=3 → PEV_CYCLE>=2 조건으로 1회 추가 시도 허용 — max 차이로 인한 의도적 비대칭.
  # 근거: Unity 빌드/테스트 = 무거움(사이클 비용↑) → 보수적 max2. web 구현 반복 = 경량 → forge-implement max3.
  if NEW_HASH == ISSUE_HASH:
    → [STOP] 동일 오류 반복 감지. Human 개입 필요. (QA_CYCLE 값 표시)
    exit 4

  ISSUE_HASH = NEW_HASH

  # 라우팅 (game-qa = Unity, web-healer X)
  → /forge-fix (general fixer) 호출 — 새 fixer 작성 금지
    · 실패 테스트명 + 에러메시지 전달
    · C# / .NET 빌드 오류 컨텍스트 포함

  # 실패 단계만 재실행 (전체 재실행 X)
  if 직전 실패 = Unity 테스트:
    → Unity MCP run_tests 또는 Unity CLI 재실행 (§2 절차 그대로)
  if 직전 실패 = 빌드(T-BUILD):
    → dotnet build 또는 msbuild 재실행 (§3 절차 그대로)
  → 결과 수집 → game-qa-report.md 업데이트

if 여전히 FAIL AND QA_CYCLE == QA_MAX:
  → [STOP] QA 재시도 {QA_MAX}회 초과. Human 개입 필요.
  exit 4
```

**루프 상한**: max 2 cycles (결정론적 bound).
**same-issue stop**: sha256(실패테스트명:에러메시지 첫줄) 이전 cycle과 동일 시 즉시 [STOP].
**라우팅 원칙**: game-qa는 Unity/C# 환경 — web 전용 /healer X. /forge-fix (general) 재사용.
**재실행 스코프**: 실패한 단계(Unity 테스트 또는 빌드)만 재실행. 전체 4단계 재실행 금지.

## 자동 평가 — GATING eval-rubric (완료 전 필수 통과)

호출 시점: `docs/qa/game-qa-report.md` 생성 후, **완료 선언 전** (게이팅 위치)

절차 (별도 evaluator agent — executor context 격리):
```
Agent(
  role: evaluator,         # executor reasoning context 미포함 — 루브릭 + 산출물만 입력
  input: docs/qa/game-qa-report.md + eval rubric,
  command: /eval-rubric --target docs/qa/game-qa-report.md
)
→ verdict(PASS/WARN/FAIL) + 4축 점수 수신
→ eval_cases.jsonl append — case_id: EC-game-qa-{N}
```

**게이팅 규칙**:
- eval-rubric verdict = PASS 또는 WARN → 완료 허용
- eval-rubric verdict = FAIL → game-qa FAIL 처리 (위 재시도 루프 재진입 또는 [STOP])
- `EVAL_RUBRIC_AUTO=off` 시 → 완료 전 사용자 수동 평가 요청 출력

자동 비활성: `EVAL_RUBRIC_AUTO=off`

> **Worker-Evaluator 분리 확인 (P2 감사)**: 위 eval-rubric Agent()는 executor reasoning context를
> 수신하지 않는다 (`# executor reasoning context 미포함 — 루브릭 + 산출물만 입력` 주석 명시).
> 분리가 이미 올바르게 구현되어 있으므로 추가 변경 불필요.
