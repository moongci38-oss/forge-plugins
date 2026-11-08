# forge#5154 — main 을 develop 에 합침 · 변이·대조

## 방법
`git merge origin/main` (rebase·force push 없음). 충돌 = 더 새 쪽:
- forge-knowledge 8파일 · forge-status-board 4파일 · marketplace.json = **main 값**(#126·#127) — develop 의 같은 폴더는 fc62fc3(main 릴리스 #125) 과 같았다(`git diff --stat fc62fc3 origin/develop -- forge-knowledge forge-status-board` = 0줄) → main 쪽이 그대로 위에 쌓인 판
- forge-core plugin.json · marketplace 의 forge-core 항목 = **develop 값 0.7.29** · forge-multi 4파일 = **삭제 유지**(#128)
손편집 없음 — 파일은 `git show <ref>:<경로>` 로 그대로 가져왔고 marketplace 의 forge-core 판 1줄만 정규식으로 맞췄다.

## 변이
forge-knowledge/.claude-plugin/plugin.json 을 develop 값(0.2.27)으로 되돌림 → `git diff --stat origin/main -- forge-knowledge forge-status-board` 가 0줄에서 `1 file changed` 로 바뀜(옛 판이 살아남는 꼴을 잡는다). 합친 판으로 복구 → 다시 0줄.

## 자기 적대
1. **#126·#127 말고 다른 것이 develop 에 섞이지 않나** — develop 대비 17파일 = #126 12파일 + #127 6파일(marketplace 겹침 1) · 합 17. 그 밖 0.
2. **#128 이 되돌려지지 않나** — main 대비 diff 가 정확히 #128 의 9파일(forge-multi 삭제 4 · 판 2 · 증거 3) · 트리에 `forge-core/skills/forge-multi` 없음.
3. **판 번호가 서로 어긋나지 않나** — 각 plugin.json 과 marketplace 항목이 같다(forge-core 0.7.29 · forge-knowledge 0.2.28 · forge-status-board 0.4.0) · json.load 4개 OK.
4. 무력화되는 입력: 이 PR 이 머지되기 전에 main 이나 develop 에 새 커밋이 쌓이면 다시 갈라진다 — PR B(develop→main)를 A 바로 뒤에 머지해야 한다.
