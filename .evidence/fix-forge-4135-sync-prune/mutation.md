# forge#4135 sync-prune mutation

- 되돌림: `_forge_had()` 를 `return True`(forge 기록 확인 없음 — 지금 forge 에 없으면 다 지움)로 바꾼 사본
```
  FAIL  ① STALE 목록이 다르다  got=['forge-core/agents/gone-agent.md', 'forge-core/commands/mine.md', 'forge-core/commands/old.md', 'forge-core/skills/gone', 'forge-core/skills/mine'] out=↳ forge SSoT 에 있�
  NOT_CARRIED: agents/live.md
  NOT_CARRIED: commands/live.md
STALE_REMAINING=5  (forge 에서 지웠는데 플러그인에 남은 것 — --prune 으로 지운다)
  STALE: forge-core/skills/gone
  STALE: forge-core/skills/mine
  STALE: forge-core/commands/mine.md
  STALE: forge-core/commands/old.md
  STALE: forge-core/agents/gone-agent.md

  FAIL  ② --prune 결과가 다르다  rc=0 남은삭제대상=[] 사라진보존대상=['skills/mine', 'commands/mine.md'] /commands/old.md
  PRUNED: forge-core/agents/gone-agent.md
STALE_REMAINING=5  (forge 에서 지웠는데 플러그인에 남은 것 — --prune 으로 지운다)
  STALE: forge-core/skills/gone
  STALE: forge-core/skills/mine
  STALE: forge-core/commands/mine.md
  STALE: forge-core/commands/old.md
  STALE: forge-core/agents/gone-agent.md

FAIL=2
```
- 복구(이 PR): ①② PASS · FAIL=0

## 자기 적대
1. 플러그인 전용 항목을 지우나 → forge **기록에 있었던** 것만 STALE(`git log -1 -- <경로>`) · 위 mutation 이 그 판별을 증명(기록 확인을 빼면 `mine` 이 지워져 FAIL).
2. 기본 동기화·--verify 가 무언가 지우나 → 지우는 곳은 `--prune` 독립 모드 하나뿐 · --verify·동기화는 STALE 줄을 찍기만 하고 종료코드도 그대로(새 관문 아님).
3. forge 기록을 못 읽으면 → `_forge_had` 가 False → STALE 아님 → 안 지움(fail-safe) · 칸 폴더가 없으면 그 칸은 건너뜀(종전 iter_pairs 와 같은 규칙).

## qa BLOCKING H1 — CI 배선
- 되돌림(배선 줄 삭제) = 고치기 전 판: grep 결과 0(0 이면 CI 가 새 시험을 안 돈다) · 이 PR: 1
- 짝 시험 `scripts/tests/leak-scan-wiring.test.sh`: 검수 head rc=1(`  FAIL  scripts 시험 전부 CI 배선`) → PR head rc=0
