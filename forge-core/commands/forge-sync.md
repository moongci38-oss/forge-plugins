---
description: Forge Dev 중앙 저장소에서 프로젝트로 동기화
allowed-tools: Bash, Read
argument-hint: "[--target <name>] [--include-recommended] [--dry-run]"
model: haiku
group: ops
---

# /forge-sync — Forge Dev 동기화

`${FORGE_ROOT:-$HOME/forge}/dev/` 원본 저장소의 Core 구성요소를 프로젝트에 배포합니다.

> ⚠️ **2026-09-17 경로 통일.** 구 표기 `node ~/.claude/scripts/forge-sync.mjs`(8곳)·`~/.claude/forge/`(1곳) 폐기.
> 그 경로들은 **이 머신의 심링크**일 뿐이고 git 으로 팀원에게 전파되지 않는다 — 심링크가 없는 머신에서는 그대로 `MODULE_NOT_FOUND` 로 죽는다.
> 게다가 `~/.claude/` 미러는 **편집 차단 대상**(AD-41)이라 SSoT 가 아니다.
> 재현: `ls -l ~/.claude/scripts/forge-sync.mjs` → `-> $HOME/forge/dev/scripts/forge-sync.mjs` · `ls -ld ~/.claude/forge` → `-> $HOME/forge/dev` (2026-09-17 관측)
> 정본 표기는 `forge-onboard.md:27` 과 레포 `CLAUDE.md` 가 쓰는 `${FORGE_ROOT:-$HOME/forge}/dev/scripts/` 다.
> 근거: 감사 C그룹 §6 (`11-platform/pipelines/plans/2026-09-17-cmd-audit-C-ops.md`)
> 폐기조건: `forge-sync.mjs` 가 `dev/scripts/` 밖으로 옮겨지면 이 절과 아래 명령을 함께 고친다.

## 동기화

```bash
# 전체 프로젝트 동기화
node "${FORGE_ROOT:-$HOME/forge}/dev/scripts/forge-sync.mjs" sync

# 특정 프로젝트만
node "${FORGE_ROOT:-$HOME/forge}/dev/scripts/forge-sync.mjs" sync --target my-project

# Recommended 포함
node "${FORGE_ROOT:-$HOME/forge}/dev/scripts/forge-sync.mjs" sync --include-recommended

# 변경 사항만 확인 (실제 복사 안 함)
node "${FORGE_ROOT:-$HOME/forge}/dev/scripts/forge-sync.mjs" sync --dry-run
```

## 등록 목록 조회

```bash
# 전체 target 목록 (워크스페이스별 그룹)
node "${FORGE_ROOT:-$HOME/forge}/dev/scripts/forge-sync.mjs" list

# 특정 워크스페이스만 필터
node "${FORGE_ROOT:-$HOME/forge}/dev/scripts/forge-sync.mjs" list --workspace wsl
```

## 새 프로젝트 온보딩

```bash
# 1. 등록 (scope, description, workspace 지정)
node "${FORGE_ROOT:-$HOME/forge}/dev/scripts/forge-sync.mjs" init /path/to/project \
  --name my-project \
  --scope all \
  --description "프로젝트 설명" \
  --workspace wsl

# 2. forge 배포
node "${FORGE_ROOT:-$HOME/forge}/dev/scripts/forge-sync.mjs" sync --target my-project --include-recommended

# 3. 프로젝트별 설정 (수동)
#    - CLAUDE.md 작성
#    - .specify/ 디렉토리 생성
#    - .claude/rules/agent-teams.md 파일 소유권 정의
#    - verify.sh 작성
```

**워크스페이스 키:**

- `wsl` — WSL/Linux 홈 아래 작업 폴더 (Linux/WSL 프로젝트)
- `windows` — `E:/new_workspace` (Windows 프로젝트)
- `business` — `~/forge` (비개발, shared-only)

<!-- 2026-09-17: 구 표기 `Z:{YOUR_WSL_WORKSPACE}`·`Z:~/forge` 폐기 — 치환되지 않은 템플릿 자리표시자였고, `Z:` 드라이브 문자도
     이 머신 한정 매핑이라 팀원 머신에서 뜻이 통하지 않는다. 실제 경로는 `dev/scripts/forge-sync.mjs` 의 등록 상태(`list`)가 정본이다.
     근거: 감사 C그룹 §6 부수. 폐기조건: 워크스페이스 키 정의가 스크립트 밖으로 나오면 그 값을 여기에 적는다. -->

## 동작 규칙

- 해시 비교로 변경분만 복사
- **Override 자동 업데이트** (v1.2.0): templates/agents/skills 카테고리
  - 프로젝트별 `.claude/forge-sync-state.json`에 배포 시점 해시 기록
  - 프로젝트가 수정하지 않은 파일 → 전역 소스 변경 시 자동 업데이트 `(auto)`
  - 프로젝트가 직접 커스터마이징한 파일 → 스킵 `(project override)`
  - 첫 실행 시 해시 초기화 (1회 스킵), 이후부터 자동 추적
- Recommended는 `init` 시 자동 복사, `sync` 시 기존 있으면 스킵
- `shared-only` scope: shared-docs만 배포 (core/recommended 제외)
