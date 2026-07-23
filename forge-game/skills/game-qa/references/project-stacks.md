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

## 바둑이 (Baduggi) — `E:\workspace\boardgames\baduggi\` (WSL: `/mnt/e/workspace/boardgames/baduggi/`) — 실측 2026-07-21

| 컴포넌트 | 경로 | 런타임 | 프로토콜 |
|---------|------|--------|---------|
| 서버 | `server/` | **NestJS 11** (TS, Node≥20) | socketio (4.8.1, `allowEIO3`=2.x 호환) |
| 클라이언트 | `client/` | Unity 6000.3.10f1 | — |
| 봇 | `bot-dotnet8/Baduki_Bot.csproj` | dotnet (net8.0) | socketio |

서버 기동: `cd server && npm run build && node dist/main.js` (또는 `nest start`) — ⚠ 옛 `node app.js` 아님(엔트리=`dist/main.js`, 빌드 선행 필수)
봇 빌드: `dotnet build bot-dotnet8/Baduki_Bot.csproj`
테스트: `cd server && npm test` (jest, `*.spec.ts`) · DB: mysql2

---

## 맞고 (MatGo) — `E:\workspace\boardgames\matgo\` (WSL: `/mnt/e/workspace/boardgames/matgo/`) — 실측 2026-07-21

| 컴포넌트 | 경로 | 런타임 | 프로토콜 |
|---------|------|--------|---------|
| 서버 | `server/` | **NestJS 11** (TS, Node≥20) | socketio (4.8.1, `allowEIO3`=2.x 호환) |
| 클라이언트 | `client/` | Unity 6000.3.10f1 | — |
| 봇 | `bot-dotnet8/MatGo_Bot.csproj` | dotnet (net8.0) | socketio |

서버 기동: `cd server && npm run build && node dist/main.js` (또는 `nest start`) — ⚠ 옛 `node app.js` 아님(엔트리=`dist/main.js`, 빌드 선행 필수)
봇 빌드: `dotnet build bot-dotnet8/MatGo_Bot.csproj` · DB: mysql2

> ⚠ **서버 자동감지 함정(2026-07-21 실측)**: `game-verify.sh`는 `package.json`/`app.js`로 `nodejs`를 감지하나, NestJS 서버의 실행 엔트리는 `dist/main.js`(빌드 산출)라 `app.js` 탐침으로는 기동 못 함. qa-config.json에 `stack.serverStart` 오버라이드 또는 빌드 선행 스텝 필요.

---

## GodBlade — `/mnt/e/workspace/godblade/` (Windows: `E:\workspace\godblade\`) — 실측 2026-07-18

| 컴포넌트 | 경로 | 런타임 | 프로토콜 |
|---------|------|--------|---------|
| 공통 | `common/` | dotnet-msbuild | — |
| 서버 | `server/` | dotnet-msbuild | tcp + http |
| 클라이언트 | `client/` | Unity 6000.3.10f1 | — |

서버 서브프로젝트(`server/` 하위): `EodAuthenticationServer`, `EodGameServer`, `EodGlobalServer` 등. 테스트: `EodGameServer.Tests`(NUnit, `server/EodGameServer.Tests/`).

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
