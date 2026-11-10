# forge#4142 할 일 3 (조각 A1) — forge-knowledge 에 forge-review MCP 싣기 · 변이·대조

## 방법
forge 정본 `shared/mcp/forge-review-server.py`(origin/develop 14411f116)를 `forge-knowledge/mcp/` 에 **손대지 않고** 복사했다.
plugin.json `mcpServers` 에 `forge-review` 1칸을 더했다. forge-tools 는 아직 남긴다(이슈 순서: 먼저 싣고 → 그 뒤 뺀다).
나눔(400줄 계약): A1 forge-review(이 PR) → A2 forge-metrics(306줄) → B forge-tools 빼기.
forge-knowledge 0.2.28 → 0.2.29 (plugin.json · marketplace.json).
forge-review 는 검색 모듈을 `Path(__file__).parents[2]/shared/scripts/rag` 에서 찾는다 — 플러그인 사본에선 없는 경로라
`env.FORGE_REVIEW_RAG_DIR = ${HOME}/forge/shared/scripts/rag` 를 준다.

## 변이
plugin.json 의 forge-review `env` 이름을 바꿔(`FORGE_REVIEW_RAG_DIR_MUT`) 실제로는 안 주는 꼴 → 같은 측정:
`forge-review-server.py wiki_search verdict: 판정 불가 results: 0 검색 모듈을 못 불렀다(ModuleNotFoundError)` (green 은 `조회함 results: 5`).
되돌린 뒤 다시 `조회함`.

## 자기 적대
1. **`${HOME}` 펼침이 플러그인 mcpServers 의 env 에서 실제로 되는지는 이 측정 밖이다** — 측정은 셸이 펼친 값을 넣었다. 이 레포엔 `${user_config.*}`·`${CLAUDE_PLUGIN_ROOT}` 선례만 있다. 안 펼쳐지면 검색 2개가 **판정 불가**로 떨어진다(틀린 0건이 아니라 — 서버가 ImportError 를 판정 불가로 낸다). 팀 PC 설치 뒤 `/mcp` 로 forge-review 의 `wiki_search` 1번을 재는 것이 확인 방법이다.
2. **팀 PC 가 forge-tools 를 쓰는지는 못 쟀다** — pc-status 보고에 MCP 사용 칸이 없고 사용량 타이머(`forge-mcp-usage`)는 기본 꺼짐. 그래서 이 조각은 빼지 않고 **더하기만** 한다.
3. **오래된 PC 2대(보고 5일·24일 전)는 기댐 경로가 있는지 판정 불가** — 없으면 forge-review 검색이 판정 불가로 떨어진다. forge-tools 가 아직 남아 있어 그 PC 의 기존 기능은 그대로다.
4. **같은 이름의 MCP 를 전역에도 등록한 PC** — 플러그인을 설치하면 같은 서버가 두 벌 뜰 수 있다(읽기 전용이라 해는 없다 · 실제 이름 꼴은 확인 필요). 메인 PC 는 플러그인 미설치라 지금은 해당 없다(이슈 본문 실측).
5. 무력화되는 입력: forge 정본 서버가 바뀌면 이 사본은 그대로다 — `sync-from-forge.py` 는 `mcp/` 를 안 본다(손 복사 · 228행 주석).
