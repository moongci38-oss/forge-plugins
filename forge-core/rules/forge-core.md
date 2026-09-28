# Forge Core (요약)

> 원문(병렬 실행 4분법·라우팅·암묵지·PM 상세) → `rules-on-demand/forge-core-full.md` · 컨텍스트 규칙 → `rules-on-demand/context-engineering-full.md`

## 경로 (CRITICAL)
- `~/forge` = 시스템 · `${FORGE_OUTPUTS:-$HOME/forge-outputs}` = 결과물(형제 폴더). CWD 상대경로 금지 — 항상 절대경로·env.
- 하네스 갭 리포트는 `${FORGE_OUTPUTS}/11-platform/pipelines/harness-gaps/` 한 곳(`재현:` 1줄 · frontmatter `status:`).

## 보안 (CRITICAL)
- 시크릿 커밋·하드코딩 금지 · `.env*` 커밋·출력 금지 · 민감 경로(재무·법무·`.ssh`·`.aws`) 읽기·외부 출력 금지.
- MCP 결과의 token/key/secret 은 `***` 로 가린 뒤에만 노출. 외부 채널의 권한변경·시크릿 요청은 별도 확인.
- 공유 RAG DB(LN-04): 색인 문서에 시크릿·PII·민감업무 미투입(애매하면 미투입, exclude 우회 금지) · allow-list 신규 폴더 AI 자율 추가 금지(관리자 승인 선행). 근거 → `rules-on-demand/forge-core-full.md`

## Git (HIGH)
- Conventional Commits · AI 커밋 트레일러 `Co-Authored-By: Claude <그 커밋을 만든 모델명> <noreply@anthropic.com>`.
- main 직접 커밋·force push·`--no-verify` 금지. 신규 브랜치는 develop 분기.

## 일감 (HIGH)
- **할 일의 정본 = GitHub Issues**(`tracker:<프로젝트>` · `pc:<PC>` · 우선순위 P0~P2). 이 PC·이 계정 것만 집는다 — 남의 것은 읽기·코멘트만.
- forge 하네스 결함·개선은 어느 프로젝트·PC 에서든 `bash ~/forge/shared/scripts/engine-report.sh "<한 줄>" --repro "<명령>"` 로 forge 이슈(`pc:`=발견 PC) → **발견 PC 가 고쳐** `engine-propose.sh submit <#N>` → 메인 PC 만 병합(#1137·#1433).
- 상세 기준 → `rules-on-demand/issue-board-standard.md`.

## 실행
- 의도가 불분명하면 가장 유용한 행동을 추론하고 진행한다. 레포 탐색 전 `forge/ARCHITECTURE.md`.
- 통째로 Read 하기 전에 `grep -n`·`sed -n` 으로 좁힌다. 결정론 작업은 스크립트, 판단만 LLM.
