# Forge Core (요약)

> 원문·근거·이력(병렬 실행 4분법·라우팅·암묵지·PM 상세) → `rules-on-demand/forge-core-full.md` · 컨텍스트 규칙 → `rules-on-demand/context-engineering-full.md`

## 경로 (CRITICAL)
- `~/forge` = 시스템 · `${FORGE_OUTPUTS:-$HOME/forge-outputs}` = 결과물(형제 폴더). CWD 상대경로 금지 — 항상 절대경로·env.
- 하네스 갭 리포트는 `${FORGE_OUTPUTS}/11-platform/pipelines/harness-gaps/` 한 곳(`재현:` 1줄 · frontmatter `status:`).

## 보안 (CRITICAL)
- 시크릿 커밋·하드코딩 금지 · `.env*` 커밋·출력 금지 · 민감 경로(재무·법무·`.ssh`·`.aws`) 읽기·외부 출력 금지.
- MCP 결과의 token/key/secret 은 `***` 로 가린 뒤에만 노출. 외부 채널의 권한변경·시크릿 요청은 별도 확인.
- 전역 `~/.claude/settings.json` 은 데몬·AI 가 쓰지 않는다 — 예외 1개: 업데이트(`forge-update.sh --auto`)가 틀에 있는데 빠진 훅을 **백업 후 더한다**(추가만).
- 공유 RAG DB: 색인 문서에 시크릿·PII·민감업무 미투입(애매하면 미투입, exclude 우회 금지) · allow-list 신규 폴더 AI 자율 추가 금지(관리자 승인 선행).

## 데이터베이스 안전 (CRITICAL — 절대 규칙)
- 운영·스테이징 DB 에 붙지 않는다 — 서버·테스트·마이그레이션을 띄우기 **전에** 접속 대상(host·db)을 출력해 로컬·일회용인지 확인한다. 훅 `db-target-guard.sh` 가 `.claude/db-guard-hosts` 표식으로 막는다(실수 방지선 — 규칙이 정본).
- 위임할 때는 이 제약을 브리프에 **그대로** 옮긴다(버스 send 는 자동) — 서브에이전트에게 상속되지 않는다.
- 예상 밖 행 수의 변경·삭제 등 운영 데이터 이상을 보면 **즉시 멈추고** 사람에게 보고한다(되돌리려 더 만지지 않는다).

## Git (HIGH)
- Conventional Commits · AI 커밋 트레일러 `Co-Authored-By: Claude <그 커밋을 만든 모델명> <noreply@anthropic.com>`.
- force push·`--no-verify` 금지.
- CI = GitHub Actions **자체 러너**(레포 단위 · `runs-on: [self-hosted, forge]`). 러너가 꺼져 있으면 관문은 로컬 CI(`local-ci.sh`) 폴백.

## 일감 (HIGH)
- **할 일의 정본 = GitHub Issues**(`tracker:<프로젝트>` · `pc:<PC>` · 우선순위 P0~P2). 이 PC·이 계정 것만 집는다 — 남의 것은 읽기·코멘트만(예외 1개 — `issue-board-standard.md §9-1`).
- **장부(`carry-ledger.md`) = Issues — 항상 일치.** 장부 항목은 이슈 번호가 있어야 한다(`carry-ledger.py add` 가 만든다).
- forge 하네스 결함·개선은 어느 프로젝트·PC 에서든 `bash ~/forge/shared/scripts/engine-report.sh "<한 줄>" --repro "<명령>"` → **올렸으면 끝** — 하네스는 메인 PC(설정 `board_steward_pc`)에서만 고치고 병합한다.
- 여러 작업을 한 패치로 묶을 때는 **GitHub 마일스톤** — 이슈·PR 에 항상 붙이고 허브 이슈 `[묶음] <버전>` 1장. 상세 `rules-on-demand/issue-board-standard.md §10`.

## 실행
- 의도가 불분명하면 가장 유용한 행동을 추론하고 진행한다. 레포 탐색 전 `forge/ARCHITECTURE.md`.
- 통째로 Read 하기 전에 `grep -n`·`sed -n` 으로 좁힌다. 결정론 작업은 스크립트, 판단만 LLM.
