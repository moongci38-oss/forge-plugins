---
name: game-qa
description: "Unity 게임 클라이언트 + 게임 서버 QA 자동화 (AD-93 W5: Phase A~H 정합). GodBlade/바둑이/맞고 전용. Unity MCP run_tests + .NET bot 빌드 + 소켓 스모크 + C# 정적분석. /qa Phase A~H와 동일 패턴 — 자동 브랜치 / bug-report 6하원칙+Failure Attribution / healer 라우팅 / cr-* / develop 자동 머지."
role: orchestrator
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

# UI 버그 의심 시
capture_screenshot()          → docs/qa/artifacts/game-shot-{N}.png
get_scene_summary()           → 씬 상태 스냅샷
```

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

## 자동 평가 (eval-rubric 통합)

호출 시점: `docs/qa/game-qa-report.md` 생성 직후

절차:
1. `/eval-rubric --target docs/qa/game-qa-report.md`
2. verdict + 4축 점수 수신
3. `eval_cases.jsonl` append — case_id: EC-game-qa-{N}

자동 비활성: `EVAL_RUBRIC_AUTO=off`
