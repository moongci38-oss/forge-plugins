# forge#4111 C2 조각 C — plugins 사본 forge-multi 정리 · 변이·대조

## 방법
forge 정본(`origin/develop` 27fcb5f68 의 `.claude`)으로 `scripts/sync-from-forge.py` 를 돌린 결과에서
**forge#4111 고침(PR #4732 · fe238eb5d)이 바뀐 파일 7개만** 옮겼다. 손편집 없음 — 경로 변환은 동기화 스크립트가 한다.
forge-knowledge 0.2.27 → 0.2.28 (plugin.json · marketplace.json — 안 올리면 팀원에게 안 간다).

## 변이
`forge-knowledge/skills/yt/SKILL.md` 를 main 판으로 되돌리고 `--verify` → `DRIFT: forge-knowledge/skills/yt/SKILL.md` 다시 나옴 ·
`DRIFT_REMAINING=34`(green 33). 다시 동기화본을 넣어 33 으로 복귀.

## 대조 표 — forge-multi 글자가 있는 plugins 파일 42개 (`git grep -l -E 'forge-multi|--mode multi|cr-triple|cr-multi' origin/main`)
| 갈래 | 파일 | 처리 |
|---|---|---|
| 동기화로 맞춤 (#4732) | forge-knowledge: commands/forge-find-item.md · skills/article/{SKILL,reference}.md · skills/weekly-research/SKILL.md · references/wave25-wave3.md · skills/yt/{SKILL,reference}.md | 이번 커밋 |
| #3738 동기화 몫 | forge-build: commands/codex-review.md · skills/codex-review/SKILL.md · commands/forge-review.md · skills/forge-review/SKILL.md (develop 쪽 변경이 #3738 본문 이전 — forge-multi 글자는 줄지 않고 옮겨감) | 범위 밖 · 다음 정기 동기화 |
| forge 쪽 대기 (#4751·조각 A) | develop 에 아직 글자가 남은 파일 — forge-build: agents/cto-advisor.md · commands/forge-pr.md · commands/forge-spec.md · skills/forge-work-plan/SKILL.md · skills/canary/workflow.js · skills/qa/workflow.js / forge-core: commands/forge-{code-review,final,test-review}.md · skills/forge-loop-maker · harness-diet · skill-creator · system-audit / forge-knowledge: daily-system-review/wave25-adversarial.md · weekly-research/wave1-collect-detail.md · mcp/forge-tools-server.py | 선반영 금지 — forge 머지 뒤 동기화 |
| 유지 (forge 에 아직 있음 · STALE_REMAINING=0) | forge-core: skills/forge-multi/** · commands/forge-multi.md · .claude-plugin/plugin.json · marketplace.json 항목 | forge-multi 제거 일에서 `--prune` |
| plugins 고유·이력 | README.md · ONBOARDING.md · forge-core/README.md · scripts/sync-from-forge.py(주석) · .evidence/** · forge-core/hooks/forge-onboard.test.sh(기존 시험) | 손대지 않음 |

## 자기 적대
1. **범위 밖 DRIFT 를 끌고 오지 않았나** — `git diff --stat` = 7 문서 + 버전 2줄뿐(24+/35−). 나머지 33 DRIFT 는 그대로 둠.
2. **옮긴 내용이 #4111 아닌 변경을 섞지 않았나** — 7파일의 develop 이력(2026-11-01 마지막 동기화 이후)은 fe238eb5d 하나 · diff 전부 `--mode multi`·cr-triple → Codex 1명 문구.
3. **plugins 의 forge-review 가 새 문구(`--stage analysis --cr on`)를 받나** — plugins main 의 forge-review·codex-review 에 `analysis` stage 와 `--cr` 인자 이미 있음(argument-hint 줄). 바꿔도 깨진 호출이 되지 않는다.
4. 무력화되는 입력: forge 쪽 #4732 문구가 뒤에 다시 바뀌면 이 사본은 다시 DRIFT — 정기 동기화가 맞춘다.
