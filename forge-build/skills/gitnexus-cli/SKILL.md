---
name: gitnexus-cli
description: "Use for GitNexus CLI commands — analyze/index a repo, check status, clean index, generate wiki, list repos. Ex: \"Index this repo\", \"Generate a wiki\""
---

# GitNexus CLI Commands

All commands work via `npx` — no global install required.

## Commands

### analyze — Build or refresh the index

```bash
npx gitnexus analyze
```

Run from the project root. This parses all source files, builds the knowledge graph, writes it to `.gitnexus/`, and generates CLAUDE.md / AGENTS.md context files.

| Flag           | Effect                                                           |
| -------------- | ---------------------------------------------------------------- |
| `--force`      | Force full re-index even if up to date                           |
| `--embeddings` | Enable embedding generation for semantic search (off by default) |
| `--drop-embeddings` | Drop existing embeddings on rebuild. By default, an `analyze` without `--embeddings` preserves them. |
| `--skip-agents-md` | Skip regenerating the CLAUDE.md / AGENTS.md context files entirely. |

**When to run:** First time in a project, after major code changes, or when `gitnexus://repo/{name}/context` reports the index is stale. In Claude Code, a PostToolUse hook detects staleness after `git commit` and `git merge` and notifies the agent to run `analyze` — the hook does not run analyze itself, to avoid blocking the agent for up to 120s and risking KuzuDB corruption on timeout.

**⚠️ Known side effect — CLAUDE.md reinjection:** `analyze` (without `--skip-agents-md`) rewrites the `<!-- gitnexus:start -->…<!-- gitnexus:end -->` block on every run via `upsertGitNexusSection()`. If a human has trimmed that block down to a warning-only stub (no standalone marker line left), the CLI can't find the region to replace and **appends a fresh full block instead** — this has caused repeated reinjection that blocks `git pull --ff-only` on shared checkouts — **서로 다른 날 3회 기록**(2026-07-27 · 08-03 · 08-05, 최초 이관 커밋 `e683191` 이후. 근거 리포트가 08-05 를 "4번째 재발"로 셈한다). 매번 **당일** pull 을 막았다는 뜻이지 하루에 여러 번 재주입된다는 뜻이 아니다. `--skip-agents-md` avoids this entirely by not touching either file.
- Trade-off: this is a **single switch** — it suppresses CLAUDE.md *and* AGENTS.md regeneration together. There is no flag to keep AGENTS.md's symbol/relationship counts current while suppressing CLAUDE.md alone. Whether AGENTS.md's auto-updates matter for a given repo is a per-project human call, not a default this skill sets.
- Note: the PostToolUse staleness hook (`$HOME/.claude/hooks/gitnexus/gitnexus-hook.cjs`) does **not** cause this — it only prints a text suggestion after `git commit`/`merge`, it never runs `analyze` itself. That hook is also **not forge-tracked** (installed locally by `gitnexus setup`, reset on re-setup) — do not edit it expecting the fix to propagate; `--skip-agents-md` on the actual `analyze` invocation is the only durable suppression.
- 근거: `${FORGE_OUTPUTS:-$HOME/forge-outputs}/11-platform/pipelines/harness-gaps/2026-08-05-gitnexus-block-reinjection-harness-gaps.md` §항목1. 플래그 배선은 설치본 소스에서 직접 확인했다(gitnexus **1.6.4**, 2026-08-05 관측) — 경로는 전부 `$(npm root -g)/gitnexus/dist/` 기준이다:
  ```bash
  D="$(npm root -g)/gitnexus/dist"
  grep -n "skip-agents-md" "$D/cli/index.js"          # 25: 플래그 정의
  grep -n "skipAgentsMd"   "$D/cli/analyze.js"        # 297: 옵션 전달
  grep -n "skipAgentsMd"   "$D/core/run-analyze.js"   # 353: 컨텍스트 파일 생성 호출
  sed -n '251,264p'        "$D/cli/ai-context.js"     # 단일 if 가 AGENTS.md·CLAUDE.md 둘 다 감쌈
  sed -n '146,172p'        "$D/cli/ai-context.js"     # 마커 미발견 시 update 아닌 append 경로
  ```
  ⚠️ `run-analyze.js` 는 `cli/` 가 아니라 **`core/`** 아래다. append 분기의 원인은 `findSectionMarkerIndex()` 가 **자기 줄 전체를 차지한 마커만** 구분자로 인정하기 때문이며(업스트림 #1041 — 인라인 산문 속 마커 인용을 구분자로 오인하지 않으려는 의도), 마커가 경고문 안 인라인 인용으로만 남으면 교체 구간을 못 찾아 파일 끝에 새 블록을 덧붙인다.
- 폐기조건: 업스트림이 인용부호로만 남은 마커도 오탐 없이 인식해 append 대신 update 경로를 타게 고치거나, forge가 이 플래그를 기본값으로 채택하면 이 절 제거.

### status — Check index freshness

```bash
npx gitnexus status
```

Shows whether the current repo has a GitNexus index, when it was last updated, and symbol/relationship counts. Use this to check if re-indexing is needed.

### clean — Delete the index

```bash
npx gitnexus clean
```

Deletes the `.gitnexus/` directory and unregisters the repo from the global registry. Use before re-indexing if the index is corrupt or after removing GitNexus from a project.

| Flag      | Effect                                            |
| --------- | ------------------------------------------------- |
| `--force` | Skip confirmation prompt — ⛔ 아래 경고             |
| `--all`   | Clean all indexed repos, not just the current one — ⛔ 아래 경고 |

> ⛔ **`--all` 과 `--force` 는 Human 승인 없이 쓰지 않는다.** 둘을 함께 주면 확인 프롬프트 없이
> **이 머신에 등록된 모든 레포의 인덱스를 삭제**한다(단일 레포 정리가 아니다). 재색인은 대형 레포에서
> 수 분~수십 분이 든다. 이 워크스페이스는 설치·설정 변경을 묻지 않고 진행하므로, 경고가 없으면
> 에이전트가 멈출 근거가 없다. 인덱스 손상 복구 목적이면 `--all` 없이 현재 레포만 정리한다.

### wiki — Generate documentation from the graph

```bash
npx gitnexus wiki
```

Generates repository documentation from the knowledge graph using an LLM. Requires an API key (saved to `~/.gitnexus/config.json` on first use).

> ⛔ **`wiki` 자체가 외부 전송이다 — `--gist` 만의 문제가 아니다.** 지식그래프에서 만든 문서(심볼명·
> 아키텍처·파일 경로)를 **기본값으로 서드파티 LLM 제공자**(`minimax/minimax-m2.5`)에 보낸다. 비공개
> 레포에서는 **실행 자체에 Human 승인**이 필요하다. LN-04·RAG 공유DB 정책과 같은 취급.
> API 키는 `~/.gitnexus/config.json` 에 **평문 저장**되므로 파일 권한·커밋 여부를 함께 확인한다.

| Flag                | Effect                                    |
| ------------------- | ----------------------------------------- |
| `--force`           | Force full regeneration                   |
| `--model <model>`   | LLM model (default: minimax/minimax-m2.5) |
| `--base-url <url>`  | LLM API base URL                          |
| `--api-key <key>`   | LLM API key                               |
| `--concurrency <n>` | Parallel LLM calls (default: 3)           |
| `--gist`            | Publish wiki as a **public** GitHub Gist — ⛔ 아래 경고 |

> ⛔ **`--gist` 는 Human 승인 없이 실행하지 않는다.** wiki 는 지식그래프 전체에서 생성되므로
> 심볼명·아키텍처·파일 경로 등 **비공개 레포 내부가 그대로 담긴다.** 이걸 public Gist 로 올리는
> 것은 **비가역적 외부 공개**다(삭제해도 캐시·인덱싱이 남는다). 이 워크스페이스의 자율 실행 규약은
> 설치·설정 변경을 묻지 않고 진행하므로, 이 플래그에 명시 경고가 없으면 에이전트가 멈출 근거가 없다.
> LN-04(외부 공개 전 민감정보 스캔)·RAG 공유DB 정책과 같은 취급 — 사람이 승인한 경우에만.
>
> 같은 이유로 `--api-key <key>` 는 **argv 노출**(셸 히스토리·`ps`·CI 로그)이 있으니 환경변수를
> 우선한다. `--base-url <url>` 은 LLM 호출 대상을 임의 엔드포인트로 바꾸므로, 레포 파생 콘텐츠가
> 어디로 나가는지 확인하지 않은 채 쓰지 않는다(기본 모델도 서드파티 제공자다).
> 근거: cr-final 3-LLM 검수(2026-08-05) security HIGH/MEDIUM 4건 중 공개·유출 경로 3건.
> 폐기조건: 업스트림이 `--gist` 를 기본 private 로 바꾸거나 확인 프롬프트를 넣으면 이 경고 축소.

### list — Show all indexed repos

```bash
npx gitnexus list
```

Lists all repositories registered in `~/.gitnexus/registry.json`. The MCP `list_repos` tool provides the same information.

## After Indexing

1. **Read `gitnexus://repo/{name}/context`** to verify the index loaded
2. Use the other GitNexus skills (`exploring`, `debugging`, `impact-analysis`, `refactoring`) for your task

## Troubleshooting

- **"Not inside a git repository"**: Run from a directory inside a git repo
- **Index is stale after re-analyzing**: Restart Claude Code to reload the MCP server
- **Embeddings slow**: Omit `--embeddings` (it's off by default) or set `OPENAI_API_KEY` for faster API-based embedding
