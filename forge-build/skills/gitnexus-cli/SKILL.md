---
name: gitnexus-cli
description: "Use for GitNexus CLI commands — analyze/index a repo, check status, clean index, generate wiki, list repos. Ex: \"Index this repo\", \"Generate a wiki\""
disable-model-invocation: true
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

**⚠️ CLAUDE.md 재주입:** `analyze`(플래그 없이)는 `<!-- gitnexus:start -->…<!-- gitnexus:end -->` 블록을 매번 다시 쓴다. 마커가 자기 줄로 남아 있지 않으면 교체 대신 파일 끝에 새 블록을 덧붙여 `git pull --ff-only` 를 막는다.
- `--skip-agents-md` 가 이를 피하는 유일한 지속 수단이다. 단일 스위치라 CLAUDE.md·AGENTS.md 재생성을 함께 끈다(AGENTS.md 심볼 수만 갱신하는 플래그 없음) — 쓸지는 레포별 사람 판단이며 이 스킬의 기본값이 아니다.
- PostToolUse 훅(`~/.claude/hooks/gitnexus/gitnexus-hook.cjs`)은 제안만 출력하고 analyze 를 돌리지 않는다. forge 추적 파일이 아니므로 고치지 않는다.

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

> ⛔ **`--all`·`--force` 는 Human 승인 없이 쓰지 않는다.** 함께 주면 확인 없이 이 머신의 모든 레포 인덱스를 삭제한다. 손상 복구는 `--all` 없이 현재 레포만.

### wiki — Generate documentation from the graph

```bash
npx gitnexus wiki
```

Generates repository documentation from the knowledge graph using an LLM. Requires an API key (saved to `~/.gitnexus/config.json` on first use).

> ⛔ **`wiki` 자체가 외부 전송이다.** 레포 파생 문서를 서드파티 LLM(기본 `minimax/minimax-m2.5`)에 보낸다 → 비공개 레포는 실행 자체에 Human 승인. API 키는 `~/.gitnexus/config.json` 에 평문 저장 — 권한·커밋 여부 확인.

| Flag                | Effect                                    |
| ------------------- | ----------------------------------------- |
| `--force`           | Force full regeneration                   |
| `--model <model>`   | LLM model (default: minimax/minimax-m2.5) |
| `--base-url <url>`  | LLM API base URL                          |
| `--api-key <key>`   | LLM API key                               |
| `--concurrency <n>` | Parallel LLM calls (default: 3)           |
| `--gist`            | Publish wiki as a **public** GitHub Gist — ⛔ 아래 경고 |

> ⛔ **`--gist` 는 Human 승인 없이 실행하지 않는다** — 비공개 레포 내부를 public Gist 로 올리는 비가역 외부 공개(LN-04 취급).
> `--api-key` 는 argv 노출(히스토리·`ps`·로그) → 환경변수 우선. `--base-url` 은 전송 대상을 확인한 뒤에만.

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
