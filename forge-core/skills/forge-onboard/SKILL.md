---
name: forge-onboard
description: "신규 프로젝트를 Forge 파이프라인에 온보딩한다(구조 스캔 → CLAUDE.md·spec 스캐폴딩 → 게이트 배선). 새 레포를 Forge에 붙일 때 사용한다."
allowed-tools: Bash, Read, Write, Edit, Glob, Grep, Agent
context: fork
model: sonnet
---

**역할**: 당신은 신규 프로젝트를 Forge 파이프라인에 4단계로 자동 온보딩하는 프로젝트 셋업 전문가입니다.
**컨텍스트**: 새 프로젝트 추가, 프로젝트 온보딩, Forge 등록, 프로젝트 초기 설정 요청 시 호출됩니다.
**출력**: forge-sync 등록·규칙/템플릿 배포·CLAUDE.md 스캐폴딩·forge-workspace.json 연결이 완료된 프로젝트 환경과 온보딩 체크리스트를 반환합니다.

# Forge Onboard — 신규 프로젝트 온보딩

신규 프로젝트를 Forge 파이프라인에 등록하고 개발 환경을 완성하는 4단계 자동화 스킬.

## 실행 전 수집 정보

아래 정보를 사용자에게 확인한다. 대부분은 경로만 알면 자동 추론 가능.

| 항목 | 예시 | 필수 |
|------|------|:----:|
| 프로젝트 경로 | `$HOME/my-project` | **필수** |
| 프로젝트 이름 | `my-project` (kebab-case) | **필수** |
| 프로젝트 유형 | `web` / `game` | **필수** |
| 설명 | "Next.js SaaS 플랫폼" | 권장 |
| 워크스페이스 | `wsl` / `windows` | 경로에서 추론 |
| 테크 스택 | 자동 탐지 (package.json, .csproj 등) | 자동 |
| 기획 도메인 | forge-workspace.json의 symlinkBase | 권장 |

### 워크스페이스 자동 추론

```
{YOUR_WSL_WORKSPACE}/* → wsl
/mnt/e/* 또는 E:/* → windows
```

## Phase 0: Brownfield 감지 및 분기

### 0.1 기존 프로젝트 판별

아래 조건 중 2개 이상 충족 시 **brownfield** 경로로 분기한다.

| 조건 | 판별 명령 |
|------|---------|
| git history 존재 | `git -C <project-path> log --oneline -1 2>/dev/null` — exit 0이면 충족 |
| 기존 CLAUDE.md | `test -f <project-path>/CLAUDE.md` |
| 소스 파일 50개 이상 | `find <project-path> -type f \( -name "*.ts" -o -name "*.cs" -o -name "*.py" -o -name "*.go" \) 2>/dev/null | wc -l` — 50 이상이면 충족 |

- **신규 프로젝트 (brownfield X)**: Phase 1부터 표준 플로우 진행.
- **기존 프로젝트 (brownfield O)**: 0.2 추가 질문 → 0.3 도메인 분석 → Phase 1 진행. Phase 3.1에서 CLAUDE.md autogen 절차 적용.

### 0.2 Brownfield 추가 질문 (필수)

brownfield 감지 시 Phase 1 착수 전 아래 5개 질문을 사용자에게 확인한다. 모두 답변 수집 후 진행.

1. **현재 가장 큰 pain point**는 무엇인가? (예: 빌드 불안정, 테스트 누락, 문서 없음)
2. **절대 건드리면 안 되는 레거시 영역**이 있는가? (예: 특정 서비스, 파일, 외부 API 연동)
3. **기존 naming / structure / coding convention**은 무엇인가? (예: camelCase, 폴더 구조 패턴)
4. **현재 CI/CD 파이프라인** 상태는? (없음 / 있음, 상세)
5. **기존 문서** 위치와 최신성은? (없음 / wiki / docs/ 폴더 등)

수집 결과를 이후 Phase 3.1 CLAUDE.md autogen의 입력으로 사용한다.

### 0.3 병렬 도메인 분석 (대형 brownfield 권장)

소스 파일 200개 이상이거나 마이크로서비스 구조인 경우 병렬 서브에이전트 4개로 도메인 매핑을 권장한다 (강제 아님 — 소규모는 직접 탐색).

```
Agent(model:"sonnet", description:"architecture mapper") → 주요 모듈 구조, 의존성 그래프
Agent(model:"sonnet", description:"api mapper")          → 외부 API 인터페이스, 엔드포인트 목록
Agent(model:"sonnet", description:"data mapper")         → 데이터 모델, DB 스키마, 상태 구조
Agent(model:"sonnet", description:"security mapper")     → 인증/인가 패턴, 민감 영역 식별
```

각 agent는 탐색 결과 요약(최대 500단어)만 메인 컨텍스트에 반환. 원문 파일 내용은 반환 금지.
분석 결과를 0.2 질문 답변과 합쳐 Phase 3.1 autogen 입력으로 사용.

## Phase 0.5: Multi-doc Ingestion + Precedence Chain (WI-24)

프로젝트 문서를 일괄 수집하고 우선순위 체계를 적용한다.

### 문서 수집 (ingest-docs)

`--docs <path>` 또는 `--docs-dir <dir>` 인자로 기존 문서를 일괄 ingestion:

```bash
/forge-onboard <project-path> --name <name> --type web --docs ./legacy-docs/
```

수집 대상: ADR, Spec, PRD, README, ERD, API 명세, 기타 설계 문서.

### 우선순위 체계 (precedence chain)

수집된 문서 간 충돌 시 아래 순서로 우선 적용:

```
ADR > SPEC > PRD > DOC
```

| 등급 | 설명 | 처리 |
|------|------|------|
| **ADR** | 아키텍처 결정 기록 — 번복 불가 결정 | 항상 우선. 충돌 시 다른 문서 수정 제안 |
| **SPEC** | 구현 명세 — 승인된 설계 계약 | ADR 다음. PRD와 충돌 시 Spec 우선 |
| **PRD** | 제품 요구사항 — 비즈니스 목표 | Spec 없을 때 기준 |
| **DOC** | 일반 문서 — 참고용 | 충돌 시 항상 하위 |

### BLOCKER 게이트

ingestion 중 다음 발견 시 **[STOP]** 사용자 확인 필수:
- ADR ↔ Spec 직접 충돌 (ADR 결정을 Spec이 위반)
- 동일 기능에 대한 Spec 2개+ 존재 (버전 불일치)
- PRD에 명시된 필수 요구사항이 기존 Spec에 누락

BLOCKER 없으면 → `precedence-check: PASS` 명시 후 Phase 1 진입.

## Phase 1: forge-sync 등록

### 1.1 manifest.json에 타겟 등록

```bash
node $HOME/.claude/scripts/forge-sync.mjs init <project-path> \
  --name <project-name> \
  --scope all \
  --description "<description>" \
  --workspace <wsl|windows>
```

이 명령이 자동으로:
- `forge/dev/manifest.json`에 타겟 추가
- `.specify/config.json` 생성 (없으면)

### 1.2 .specify/config.json 보강

자동 생성된 config.json을 프로젝트에 맞게 보강한다:

```json
{
  "projectName": "MyProject",
  "projectType": "web|game",
  "autoMerge": false,
  "branchPrefix": {
    "feature": "feat/",
    "fix": "fix/",
    "hotfix": "hotfix/"
  },
  "defaultBranch": "develop",
  "specNaming": "{feature-name}.spec.md",
  "notion": {
    "projectName": "MyProject",
    "tasksDbId": "<forge-workspace.json에서 자동 추출>"
  }
}
```

게임 프로젝트 추가 필드:
```json
{
  "engine": "Unity",
  "buildSystem": "msbuild",
  "language": "csharp"
}
```

## Phase 2: forge-sync 배포

```bash
node $HOME/.claude/scripts/forge-sync.mjs sync --target <project-name> --include-recommended
```

배포되는 항목:

| 카테고리 | 경로 | 내용 |
|---------|------|------|
| Dev Rules | `.claude/rules/forge-*.md` | 워크플로, 세션, 테스트, 성능 등 14개 |
| 공통 Rules | `.claude/rules/` | frontend-standards, plan-mode, pr-code-review-gate |
| Templates | `.specify/templates/` | Spec·Walkthrough 템플릿 (+ game: element-task) — Plan/Task는 Spec §8/§11 서브섹션 |
| GitHub Spec Kit | `.github/` + `scripts/` | CI 워크플로, 이슈/PR 템플릿 |
| Hooks (recommended) | `.claude/hooks/` | 보안 체크, JSON 무결성 |

### Windows(NTFS) 프로젝트 대응

`forge-sync`가 EPERM 에러 시 수동 복사로 대체:

```bash
for f in $HOME/.claude/forge/rules/*.md; do
  cp "$f" "<project-path>/.claude/rules/$(basename $f)" 2>/dev/null
done
```

## Phase 3: 프로젝트 스캐폴딩

forge-sync가 배포하지 않는 프로젝트 고유 파일을 생성한다.

### 3.1 CLAUDE.md

프로젝트 루트에 CLAUDE.md를 생성한다. 기존 파일이 있으면 Forge 참조만 추가.

필수 섹션 목록 + on-demand 룰 참조 템플릿 → `references/scaffold-templates.md §3.1` (필요 시 Read)

### 3.1-B Brownfield CLAUDE.md autogen (기존 프로젝트 전용)

brownfield 감지 시 "기존 파일이 있으면 Forge 참조만 추가" 규칙 대신 아래 절차를 적용한다.

**단계 1~3 (기존 코드 스캔 → 규칙 추출 → CLAUDE.md draft 생성)** 상세 + 템플릿 → `references/scaffold-templates.md §3.1-B` (필요 시 Read)

**단계 4. 사용자 검토 (게이트, 이관 금지)** — draft를 사용자에게 제시하고 수정 요청 반영 후 확정.
확정 전 Phase 1(forge-sync 등록)을 선행할 수 있으나, CLAUDE.md 확정 전 Phase 3 이후 진행 금지.

### 3.1-C 핵심정보 (Project Vitals) — 타입별 필수 템플릿

프로젝트 루트 CLAUDE.md에 `## 핵심정보` 섹션을 **반드시** 포함한다. 프로젝트 타입에 따라 타입별 템플릿(dev/grants/research/marketing)을 사용. 시크릿은 **평문 금지 — 참조 위치만** 기재 (`.env` ref 또는 `<설명>` placeholder).

검증: 생성 후 `bash ${FORGE_ROOT:-$HOME/forge}/shared/scripts/check-vitals-secrets.sh <CLAUDE.md 경로>` (exit 0 = OK, exit 2 = 평문 시크릿 BLOCK).

> 상세 → `reference.md §3.1-C 핵심정보 타입별 템플릿` (필요 시 Read)

### 테크 스택 자동 탐지

테크 스택은 프로젝트에서 자동 탐지:
- `package.json` → Node.js/React/Next.js/NestJS
- `*.csproj` / `*.sln` → C#/.NET/Unity
- `Cargo.toml` → Rust
- `go.mod` → Go
- `requirements.txt` / `pyproject.toml` → Python

### 3.2 .specify/constitution.md

프로젝트 헌법. 탐지된 테크 스택 기반으로 스캐폴딩.

필수 섹션 목록 → `references/scaffold-templates.md §3.2` (필요 시 Read)

### 3.3 .claude/rules/agent-teams.md

Agent Teams 파일 소유권 정의. 프로젝트 구조(Web 모노레포 / Game)에 맞게 생성.

> 상세 템플릿 → `reference.md §3.3 Agent Teams 소유권 템플릿` (필요 시 Read)

### 3.4 verify.sh

빌드+테스트 검증 스크립트. 테크 스택(Web Node.js / Game Unity·.NET)에 따라 생성.

> 상세 템플릿 → `reference.md §3.4 verify.sh 템플릿` (필요 시 Read)

### 3.5 docs/ 폴더 구조

`docs-structure.md` 전역 규칙에 따라 생성:

```bash
mkdir -p docs/{guides,tech,planning/{active/forge,done},reviews,infrastructure,walkthroughs,assets,references,_archive}
```

### 3.5 Inspector Reference Sheet

`forge/planning/templates/inspector-reference-template.md`를 `docs/references/inspector-reference.md`에 복사한다.

```bash
cp ${FORGE_ROOT:-${FORGE_ROOT:-$HOME/forge}}/planning/templates/inspector-reference-template.md <project-path>/docs/references/inspector-reference.md
```

프로젝트 유형별 초기값 조정 목록 → `references/scaffold-templates.md §3.5` (필요 시 Read)

> 이 시트는 AI-Human 분업의 핵심. AI가 Spec/코드 작성 시 이 시트를 참조하고, Human이 에디터/브라우저에서 교정한 값을 누적한다.

## Phase 3.5: Monitoring 통합 (Sentry)

에러 모니터링을 자동 통합한다. `--no-monitoring` flag 시 스킵.

### 3.5.1 스택 감지 + SDK 자동 설치

`scripts/monitoring-init.sh <project-path>` 실행. 지원 스택 7종(Next.js/NestJS/Colyseus/React/Node.js/Unity/FastAPI). 미지원 스택 = exit 0 + WARN 출력 (수동 통합 필요).

> 스택별 감지조건·SDK 표 → `reference.md §3.5 Monitoring(Sentry) 스택 감지표` (필요 시 Read)

### 3.5.2 sentry.config 생성

`templates/sentry-config-{stack}.{ts,js,cs,py}` → 프로젝트에 복사. 모든 템플릿에 P-7 빈 DSN 처리(런타임 비활성화, 코드 롤백 없이) 내장.

> 템플릿 언어별 guard 코드 → `reference.md §3.5.2` (필요 시 Read)

### 3.5.3 .env 파일 분리 (P-2 보안)

앱 `.env.example`(런타임 변수만) / `.env.ci.example`(CI secret 전용, 앱 .env 포함 금지)로 분리.

> 파일 내용 예시 → `reference.md §3.5.3` (필요 시 Read)

### 3.5.4 검증

```bash
# 스택 감지 dry-run
bash scripts/monitoring-init.sh --dry-run <project-path>

# SDK 통합 확인
grep -rn "Sentry.init\|initSentry\|sentry_sdk.init" <project-path>/src/ 2>/dev/null | head -3

# .env 분리 확인 (P-2)
grep "SENTRY_DSN" <project-path>/.env.example         # 있어야 함
! grep "SENTRY_AUTH_TOKEN" <project-path>/.env.example # 없어야 함
grep "SENTRY_AUTH_TOKEN" <project-path>/.env.ci.example # 있어야 함
```

Unity는 Editor 실행 없이 manifest.json + SentryInit.cs까지만. 실제 DSN 입력은 Editor TODO.

## Phase 4: forge-workspace.json 연결

`forge/forge-workspace.json`의 `projects`에 등록하여 기획 파이프라인(Phase 1~5) 산출물이 프로젝트에 연결되도록 한다.

```json
{
  "projects": {
    "<project-name>": {
      "devTarget": "<project-path>",
      "symlinkBase": "docs/planning/active/forge/<domain>"
    }
  }
}
```

게임 프로젝트 추가 필드:
```json
{
  "projectType": "game",
  "projectScale": "Small"
}
```

## Phase 5: RAG 워크스페이스 등록

`${FORGE_ROOT:-${FORGE_ROOT:-$HOME/forge}}/shared/scripts/rag/workspace.json`의 `sources`에 새 프로젝트를 추가한다.

### 5.1 이미 등록됐는지 확인

```python
import json
from pathlib import Path
config = json.loads(Path("shared/scripts/rag/workspace.json").read_text())
paths = [s["path"] for s in config["sources"]]
# <project-path>가 이미 있으면 스킵
```

### 5.2 프로젝트 유형별 exclude_dirs

프로젝트 유형에 맞게 exclude_dirs를 결정한다:

| 유형 | exclude_dirs |
|------|-------------|
| **web (Node.js)** | `.git`, `node_modules`, `.next`, `dist`, `out`, `build`, `.turbo`, `coverage` |
| **game (Unity)** | `.git`, `Library`, `Temp`, `obj`, `Logs`, `UserSettings`, `Packages` |
| **python** | `.git`, `__pycache__`, `.venv`, `venv`, `dist`, `build`, `.pytest_cache` |
| **generic** | `.git`, `node_modules`, `__pycache__`, `dist`, `build` |

### 5.3 workspace.json sources에 추가

Read → Edit으로 직접 수정한다:

```json
{
  "path": "<project-path>",
  "exclude_dirs": ["<유형별 목록>"],
  "note": "<project-name> — <description>"
}
```

### 5.4 등록 확인

```bash
bash ${FORGE_ROOT:-${FORGE_ROOT:-$HOME/forge}}/shared/scripts/rag/rag-exec.sh index.py --workspace --incremental
```

변경 없으면 "✅ 변경 없음" 출력. 새 프로젝트 파일이 있으면 자동 추가됨.

---

## Phase 6: Claude Design 폴더 스캐폴딩

`web` / `app` 프로젝트에 Claude Design 파이프라인 진입점을 생성한다. `game` 프로젝트는 `assets/` 폴더만.

### 6.1 프로젝트 유형 분기

```
web / app → PART 0/1/2/3 풀 템플릿 생성
game      → assets/ 폴더만 생성 (PART X)
```

### 6.2 폴더 생성

```bash
mkdir -p ${FORGE_OUTPUTS:-$HOME/forge-outputs}/05-design/projects/<project-name>/assets
```

### 6.3 claude-design-prompts.md 생성 (web/app만)

파일: `forge-outputs/05-design/projects/<project-name>/forge-claude-design-prompts.md`

표준 4-PART 구조(0.연동개요 / 1.Design System 탭 입력 / 2.페이지별 Prototype 프롬프트 / 3.검수·우선순위·차단항목).

**PRD/GDD에서 색상·폰트 언급 발견 시**: PART 1 자동 추출 후 `[TODO]` 교체.
**없으면**: `[TODO]` placeholder 유지.

> 전체 템플릿 원문 → `reference.md §6.3 claude-design-prompts.md 전체 템플릿` (필요 시 Read)

### 6.4 참조 표준

`forge-outputs/05-design/projects/operations-tool/2026-05-20-claude-design-prompts.md` — PART 0~3 완성 예시.

---

## Phase 7: 선행 자료 핸드오프 (경로 B, A5-2)

`${FORGE_OUTPUTS:-$HOME/forge-outputs}/`에 이 프로젝트 착수 전 쌓인 선행 자료(리서치·기획 초안·회의록 등)가 있는지 스캔하고, 있으면 repo `docs/`로 **이관**한다. 정본: `forge-os-v2-architecture.md §7.2b`(생애주기 핸드오프 규칙) — 충돌 시 그 문서 우선.

**원칙**: 이사(move)지 복사가 아니다. outputs와 repo docs/ 양쪽에 동일 문서가 남는 이중 SSoT를 만들지 않는다.

### 7.1 outputs 선행 자료 스캔

`forge-workspace.json`의 `symlinkBase`(Phase 4에서 등록한 값) 및 프로젝트명으로 outputs 하위를 검색한다:

```bash
grep -rl "<project-name>" ${FORGE_OUTPUTS:-$HOME/forge-outputs}/01-research/ ${FORGE_OUTPUTS:-$HOME/forge-outputs}/05-design/projects/<project-name>/ 2>/dev/null
find ${FORGE_OUTPUTS:-$HOME/forge-outputs} -path "*<project-name>*" -type f 2>/dev/null
```

### 7.2 제외 2종 판별

찾은 각 문서에 아래 판별 질문을 적용한다:

> **"이 문서가 이 프로젝트 없이도 가치가 있는가?"** — 그렇다면 outputs 잔류(이관 대상 아님).

핸드오프 제외 2종:
1. **세션 handover 문서** — 세션 재개용, 프로젝트 자산 아님.
2. **조직 공통 리서치** — 여러 프로젝트에 걸쳐 참조되는 범용 자료(예: 산업 동향, 공통 프레임워크 비교).

남는 후보(이 프로젝트에 귀속되고, 이 프로젝트 없이는 의미 없는 문서 — 예: 이 프로젝트 전용 리서치, 초기 기획 초안, 이 프로젝트 회의록)만 이관 대상으로 사용자에게 제시한다.

### 7.3 사용자 확인 게이트 (필수 — 자동 실행 금지)

이관은 비가역(원위치 삭제 수반)이므로 후보 목록을 사용자에게 제시하고 **[STOP] 승인**을 받은 뒤에만 실행한다. 7.1~7.2(스캔·후보 제시)까지는 자동, move는 승인 후에만.

### 7.4 이관 실행 (승인 후)

```bash
mkdir -p <project-path>/docs/_handover
mv <outputs-file> <project-path>/docs/_handover/  # 또는 문서 성격에 맞는 docs/ 하위 폴더
```

이관 전후 파일 수 대조 1줄 기록(무결성 확인):
```
이관 전 outputs 후보: N개 / 이관 후 docs/ 반영: N개 / 일치 확인
```

### 7.5 이정표 스텁 생성

이관한 각 문서의 outputs 원위치에 1파일 스텁을 남긴다(원문 삭제 후 흔적):

```markdown
→ <project-path>/docs/_handover/<파일명>, YYYY-MM-DD 이관
```

### 7.6 allow-list 후보 제안

이관된 docs/ 경로가 공유 RAG DB 색인 allow-list(`RAG-SHARED-DB-POLICY.md §4`) 대상 후보라면, 경로만 제안한다 — 실제 allow-list 추가는 민감정보 부재 확인 + 관리자 승인 선행(AI 자율 추가 금지, `forge-core.md §RAG-SHARED-DB`).

이 Phase는 **경로 B(기존 outputs 자료가 있는 프로젝트)** 한정. 신규 프로젝트(outputs에 선행 자료 없음)는 7.1 스캔에서 0건 확인 후 스킵.

---

## 완료 체크리스트

모든 단계 완료 후 아래를 검증한다:

```
[ ] manifest.json에 타겟 등록 확인
[ ] .specify/config.json 존재 + Notion DB 연결
[ ] .claude/rules/forge-*.md 14개 배포 확인
[ ] .specify/templates/ 배포 확인
[ ] CLAUDE.md 존재 + Forge 참조 포함
[ ] .specify/constitution.md 존재
[ ] .claude/rules/agent-teams.md 존재
[ ] verify.sh 존재 + 실행 권한
[ ] docs/ 폴더 구조 생성
[ ] forge-workspace.json에 프로젝트 등록
[ ] workspace.json sources에 프로젝트 등록 (Phase 5)
[ ] 05-design/projects/{project}/forge-claude-design-prompts.md 생성 (web/app, Phase 6)
[ ] (brownfield 해당 시) Phase 0 감지 조건 2개 이상 충족 확인 기록
[ ] (brownfield 해당 시) 추가 질문 5개 답변 수집 완료
[ ] (brownfield 해당 시) CLAUDE.md autogen draft 사용자 검토·확정
[ ] Multi-doc ingestion 수행 + precedence-check 결과 기록
[ ] (경로 B 해당 시) outputs 선행 자료 스캔 + 이관/스텁/allow-list 후보 제안 완료 (Phase 7)
[ ] forge-sync status 확인
```

```bash
node $HOME/.claude/scripts/forge-sync.mjs status
```

## 주의사항

- 기존 파일이 있으면 덮어쓰지 않는다 (CLAUDE.md, constitution.md 등)
- 기존 파일에 Forge 참조가 없으면 추가만 한다
- `.env`, credentials 등 민감 파일은 생성하지 않는다
- 프로젝트 고유 규칙(agent-teams.md 등)은 템플릿 생성 후 사용자 확인을 받는다
- Notion Projects DB에 프로젝트를 등록할지는 사용자에게 확인한다
