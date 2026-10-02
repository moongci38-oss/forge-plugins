---
name: rag-search
description: "forge-outputs 문서를 의미검색(벡터+BM25)해 근거를 찾는다. 쓸 때: 프로젝트 자료·과거 결정·리서치·위키에 대한 질문 — 허락 없이 먼저 부른다. SKIP: 코드 심볼·호출 관계(→ GitNexus), 규칙 문서 위치(→ brain-route.sh), 웹 최신 정보."
context: fork
model: haiku
allowed-tools: Read, Bash, Glob, Grep
argument-hint: <검색 쿼리> [--top-k N] [--mode vector|bm25|hybrid] [--scope knowledge|ops|all]
---

# RAG Search — 의미 기반 문서 검색

`${FORGE_OUTPUTS:-$HOME/forge-outputs}/` 문서에서 벡터(의미)+BM25(키워드) 하이브리드 검색 → 파일 경로·점수·프리뷰 상위 N개 반환.

- 쓸 때: 정부과제 근거 찾기 · "이 수치 어느 문서였지?" · 키워드가 흐릿한 주제 검색 · Grep 이 못 잡는 동의어
- ⚠️ **문서 전용** — 코드 심볼(함수·클래스)은 `Grep` 또는 GitNexus.

## 사용법

```
/rag-search 투자 유치 전략
/rag-search <제품명> 기술 차별점 --top-k 10
/rag-search [게임 가챠 시스템 설계 중] 확률 설정 선례   # reasoning_context
```
reasoning_context: 현재 추론 단계를 `[...]` 로 쿼리 앞에 붙이면 정확도가 오른다.

## Step 1: 공용 DB 연결 확인

```bash
bash ~/forge/shared/scripts/t3-check.sh    # T3_OK | T3_DOWN reason=… | T3_SKIP (연결만 본다 — 색인 건수는 안 나온다)
```

- 인덱스는 공용 DB 하나다(로컬 `.rag-index` 는 걷었다 #1763). 공용 DB 가 안 되면 검색이 위키 파일 직접 검색으로 내려가고 stderr 에 안내 1줄이 나온다 — 그 줄이 보이면 결과에 "공용 색인 미사용"을 명시한다(침묵 금지).

## Step 2: 검색 실행

KnowledgeStore 경유(권장 · **WSL 세션 전용** — Windows 는 아래 CLI):
```python
import sys; sys.path.insert(0, os.path.expanduser('~/forge/shared/scripts/rag'))
from knowledge_store import KnowledgeStore
results = KnowledgeStore.from_config().search("{검색어}", top_k=5, mode="hybrid")
```

CLI:
```bash
bash ~/forge/shared/scripts/rag/rag-exec.sh search.py "{검색어}" --top-k {N} --mode {hybrid|vector|bm25}
```

| 옵션 | 뜻 |
|---|---|
| `--top-k N` | 결과 수(기본 5) |
| `--mode hybrid\|vector\|bm25` | 기본 hybrid |
| `--scope knowledge\|ops\|all` | 검색 범위. `knowledge`(기본) = 운영 기록(작업 지시·인수인계·하네스 레포·`.claude/`·검수 원문 `docs/reviews`·`13-multiagent`·버그 리포트 `01-research/bugs`·`10-operations`)과 영상 수집물(`videos/cache`·`videos/clones`) 제외 · `ops` = 운영 기록만 · `all` = 전부 |
| `--json` | JSON 출력(결과마다 `"relevance": "pass"\|"low-relevance"`) |

- 하네스 자체(규칙·훅·인수인계·작업 기록)를 찾을 때는 `--scope all` 또는 `--scope ops` 를 붙인다 — 기본 범위에서는 나오지 않는다.
- `RAG_RELEVANCE_THRESHOLD`(기본 0.10): 미달 청크는 `[low-relevance]` 섹션으로 분리(삭제 아님). 결과 부족 시 `RAG_RELEVANCE_THRESHOLD=0.05 rag-exec.sh search.py ...`.
- `FORGE_RAG_ENGINE` = `auto`(기본, 공용 DB → 안 되면 위키 파일 직접 검색) · `t3`(진단 — 폴백 없음, 실패 시 exit 1).
- 어느 계층이 답했는지는 **stderr 마커**로 판정(exit code 는 둘 다 0):

| 계층 | stderr 마커 |
|---|---|
| 공용 DB | `🔗 검색 계층: T3(공용 pgvector) — 팀 공유 인덱스` |
| 위키 대체 | `⚠️ 검색 계층: 위키 파일 직접 검색(`<경로>`) —` <사유> `· 팀 공유 인덱스와 다른 결과입니다` |
| 없음 | `⚠️ 검색 계층: 없음 —` <사유> `· 위키 폴더 없음(결과 0건)` (`--scope ops` 는 공용 DB 에만 있다) |

정책 정본 `~/forge/docs/RAG-SHARED-DB-POLICY.md` · 동작 정본 `shared/scripts/rag/search.py`.

## 인덱스 관리

```bash
bash ~/forge/shared/scripts/rag/rag-exec.sh index.py ${FORGE_OUTPUTS:-$HOME/forge-outputs}/09-grants [--rebuild]
bash ~/forge/shared/scripts/rag/rag-exec.sh index.py ${FORGE_OUTPUTS:-$HOME/forge-outputs}/01-research
bash ~/forge/shared/scripts/rag/rag-exec.sh index.py ${FORGE_OUTPUTS:-$HOME/forge-outputs}
```
색인은 공용 DB 에만 쓴다 — 공용 DB 주소가 없으면 안내 1줄 뒤 건너뛴다.

구성: LlamaIndex · 임베딩 multilingual-e5-small(384차원, 로컬) · 청크 512/overlap 50 · md/txt/json/docx/pdf. 요구: Python 3.10+ · `pip install -r ~/forge/shared/scripts/rag/requirements.txt`.

## AI 행동 규칙

1. grants-write/grants-review 중 근거가 필요하면 자동 호출 가능.
2. 인용 시 파일 경로를 출처로 명시. 출력은 항상 경로 + 점수 + relevance(`pass`/`low-relevance`). 필요하면 결과 파일을 Read 해 전체 문맥 확인.
3. 공용 색인에 없는 자료면 색인을 제안만 — 사용자 확인 없이 자동 색인 금지(공용 DB 에 쓴다).
4. `[low-relevance]` 청크는 근거로 직접 인용 금지 — 쓰면 라벨 함께 표기.
