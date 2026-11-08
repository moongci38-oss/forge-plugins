# forge#4111 C2c — plugins 사본 forge-multi 삭제 · 변이·대조

## 방법
forge 쪽 삭제(forge PR #5147·#5150·#5151 · develop 에 지운 경로 0)를 이 레포 사본에 옮긴다 — forge-sync 는 삭제를 옮기지 않는다.
`git rm -r forge-core/skills/forge-multi forge-core/commands/forge-multi.md` → **4파일**
(commands/forge-multi.md · skills/forge-multi/SKILL.md · skills/forge-multi/reference/r2-runner.md · skills/forge-multi/workflow.js).
forge-core 0.7.28 → 0.7.29 (plugin.json · marketplace.json — 안 올리면 팀원에게 안 간다 · #126 선례).
plugin.json 에 skill·command 개별 목록은 없다(grep `forge-multi` 0건) — 판 번호만 고쳤다.

## 변이
`git show HEAD:forge-core/commands/forge-multi.md > forge-core/commands/forge-multi.md` 로 1파일을 되살리고 같은 측정 →
`EXISTS: forge-core/commands/forge-multi.md` 다시 나옴(green 은 ABSENT). 되살린 파일을 지워 green 으로 복귀.

## 남은 글자 (`grep -rn forge-multi` · .evidence 제외) — 지운 경로를 **실행으로 부르는 곳 0**
| 갈래 | 파일 | 처리 |
|---|---|---|
| 주석·이력 | scripts/sync-from-forge.py:74 · forge-core/hooks/forge-onboard.test.sh:124 | 그대로(브리프) |
| 문서 목록 | README.md:60·703 · ONBOARDING.md:81 · forge-core/skills/system-audit/dashboard/redundancy-map.md:9 | 범위 밖 |
| 동기화 사본 문구(`/forge-multi` 안내) | forge-build: commands/codex-review.md · commands/forge-spec.md · skills/codex-review/SKILL.md · skills/forge-work-plan/SKILL.md · skills/qa/workflow.js · skills/canary/workflow.js · agents/cto-advisor.md / forge-core: commands/forge-final.md · forge-code-review.md · forge-test-review.md · skills/harness-diet/{workflow.js:650, references/sweep.md} / forge-knowledge: daily-system-review/wave25-adversarial.md · weekly-research/wave25-wave3.md | 범위 밖 — forge 정본이 바뀐 뒤 정기 동기화 몫 |
harness-diet/workflow.js:650 은 에이전트 프롬프트 글 안의 `$HOME/.claude/skills/forge-multi` 경로(이 레포 파일을 읽지 않는다) — 실행 호출처 아님.

## 자기 적대
1. **지울 파일만 지웠나** — `git diff --cached --stat` = 삭제 4 + 판 번호 2줄 + 증거. 다른 경로 없음.
2. **사본을 부르는 실행 경로가 남아 깨지지 않나** — 이 레포에서 `skills/forge-multi`·`commands/forge-multi.md` 를 읽는 시험·훅·스크립트 0(grep). 남은 것은 안내 문구 — `/forge-multi` 를 부르면 "명령 없음"이 될 뿐이고 forge 정본에서도 이미 없다.
3. **판 번호를 안 올려 배포가 안 되는 일은 없나** — plugin.json·marketplace.json 둘 다 0.7.29 · json.load OK.
4. 무력화되는 입력: forge 쪽에서 forge-multi 가 되살아나면 다음 동기화가 사본을 다시 만든다 — 의도대로다.
