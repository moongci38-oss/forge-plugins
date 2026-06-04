# 게임 프로젝트 스택 참조

## 서버 런타임 자동 감지 우선순위

`game-verify.sh`가 `server/` 디렉토리를 탐침하여 런타임 자동 감지:

| 감지 기준 | 런타임 |
|---------|--------|
| `package.json` / `app.js` | `nodejs` |
| `*.sln` (레거시) | `dotnet-msbuild` |
| `*.csproj` (모던) | `dotnet` |
| `pom.xml` / `build.gradle` | `java` |
| `requirements.txt` / `pyproject.toml` | `python` |
| `go.mod` | `go` |
| `Cargo.toml` | `rust` |

소켓 프로토콜도 자동 감지: Socket.IO → WebSocket → TCP → HTTP 순.

`qa-config.json`에 `stack.serverRuntime` / `stack.socketProtocol` 명시 시 자동 감지 오버라이드.

---

## 바둑이 (Baduggi) — `/mnt/e/new_workspace/boardGames/baduggi/`

| 컴포넌트 | 경로 | 런타임 | 프로토콜 |
|---------|------|--------|---------|
| 서버 | `server/` | nodejs | socketio |
| 클라이언트 | `client/` | Unity 6000.3.10f1 | — |
| 봇 | `bot-dotnet8/` | dotnet (.NET 8) | socketio |

서버 기동: `cd server && node app.js`
봇 빌드: `dotnet build bot-dotnet8/Baduki_Bot.csproj`

---

## 맞고 (MatGo) — `/mnt/e/new_workspace/boardGames/matgo/`

| 컴포넌트 | 경로 | 런타임 | 프로토콜 |
|---------|------|--------|---------|
| 서버 | `server/` | nodejs | socketio |
| 클라이언트 | `client/` | Unity (C#) | — |
| 봇 | `bot-dotnet8/` | dotnet (.NET 8) | socketio |

봇 빌드: `dotnet build bot-dotnet8/MatGo_Bot.csproj`

---

## GodBlade — `/mnt/e/new_workspace/god_Sword/src/`

| 컴포넌트 | 경로 | 런타임 | 프로토콜 |
|---------|------|--------|---------|
| 공통 | `common/` | dotnet-msbuild | — |
| 서버 | `server/` | dotnet-msbuild | tcp + http |
| 클라이언트 | `client/` | Unity 2019.4.40f1 | — |

빌드 순서:
```bash
msbuild common/EodCommon_VS2017.sln /p:Configuration=Release /v:minimal
msbuild server/EodServer_VS2017.sln /p:Configuration=Debug /v:minimal
```

프로토콜: TCP(Protobuf+AES) + REST API. `socketProtocol: tcp`.

---

## 공통 QA 경로

- 테스트 결과: `docs/qa/artifacts/unity-test-results.xml`
- QA 리포트: `docs/qa/game-qa-report.md`
- 서버 로그: `/tmp/qa-server.log`
- 봇 스모크 로그: `/tmp/qa-bot-smoke.log`
