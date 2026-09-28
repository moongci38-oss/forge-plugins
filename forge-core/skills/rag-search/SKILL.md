---
name: rag-search
description: "forge-outputs 문서를 의미검색(벡터+BM25)해 근거를 찾는다. 쓸 때: 프로젝트 자료·과거 결정·리서치·위키에 대한 질문 — 허락 없이 먼저 부른다. SKIP: 코드 심볼·호출 관계(→ GitNexus), 규칙 문서 위치(→ brain-route.sh), 웹 최신 정보."
context: fork
model: haiku
allowed-tools: Read, Bash, Glob, Grep
argument-hint: <검색 쿼리> [--top-k N] [--mode vector|bm25|hybrid] [--graph] [--context wiki|research|all]
---

# RAG Search — 의미 기반 문서 검색

`${FORGE_OUTPUTS:-$HOME/forge-outputs}/` 문서에서 벡터(의미)+BM25(키워드) 하이브리드 검색 → 파일 경로·점수·프리뷰 상위 N개 반환.

- 쓸 때: 정부과제 근거 찾기 · "이 수치 어느 문서였지?" · 키워드가 흐릿한 주제 검색 · Grep 이 못 잡는 동의어
- ⚠️ **문서 전용** — 코드 심볼(함수·클래스)은 `Grep` 또는 GitNexus.

## 사용법

```
/rag-search 투자 유치 전략
/rag-search TagHub 기술 차별점 --top-k 10
/rag-search [GodBlade 가챠 시스템 설계 중] 확률 설정 선례   # reasoning_context
```
reasoning_context: 현재 추론 단계를 `[...]` 로 쿼리 앞에 붙이면 정확도가 오른다.

## Step 1: 인덱스·커버리지 확인

```bash
ls {target_dir}/.rag-index/meta.json
bash ~/forge/shared/scripts/rag/rag-exec.sh index.py {target_dir}          # 없으면 빌드(사용자 확인 후)
python3 -c "import json; m=json.load(open('{target_dir}/.rag-index/meta.json')); print(f\"색인 {m['file_count']}건 / built_at={m['built_at']}\")"
```

- 인덱스: 전체 `${FORGE_OUTPUTS:-$HOME/forge-outputs}/.rag-index/`(기본) · 정부과제 `${FORGE_OUTPUTS:-$HOME/forge-outputs}/09-grants/.rag-index/`
- 결과에 `file_count`·`built_at` 항상 명시. 실제 파일 수 대비 미달·오래됨 → "grep 폴백 필요 — 커버리지 X% (색인 {file_count}건 / 최종인덱싱 {built_at})" 경고. meta.json 없으면 "미인덱싱 — grep 폴백 필요"(침묵 금지).

## Step 2: 검색 실행

KnowledgeStore 경유(권장 · **WSL 세션 전용** — Windows 는 아래 CLI):
```python
import sys; sys.path.insert(0, os.path.expanduser('~/forge/shared/scripts/rag'))
from knowledge_store import KnowledgeStore
results = KnowledgeStore.from_config().search("{검색어}", top_k=5, mode="hybrid")
```

CLI:
```bash
bash ~/forge/shared/scripts/rag/rag-exec.sh search.py "{검색어}" --top-k {N} --mode {hybrid|vector|bm25} --index-dir ${FORGE_OUTPUTS:-$HOME/forge-outputs}/.rag-index
bash ~/forge/shared/scripts/rag/rag-exec.sh search.py "{검색어}" --index-dir ${FORGE_OUTPUTS:-$HOME/forge-outputs}/09-grants/.rag-index
```

| 옵션 | 뜻 |
|---|---|
| `--top-k N` | 결과 수(기본 5) |
| `--mode hybrid\|vector\|bm25` | 기본 hybrid |
| `--graph` · `--graph-hops N` | Obsidian `[[wikilink]]` 이웃 확장(기본 1홉) |
| `--json` | JSON 출력(결과마다 `"relevance": "pass"\|"low-relevance"`) |
| `--index-dir` | 인덱스 위치 |

- `RAG_RELEVANCE_THRESHOLD`(기본 0.10): 미달 청크는 `[low-relevance]` 섹션으로 분리(삭제 아님). 결과 부족 시 `RAG_RELEVANCE_THRESHOLD=0.05 rag-exec.sh search.py ...`. Graph 이웃(score 0.5)은 항상 통과.
- `FORGE_RAG_ENGINE` = `auto`(기본, T3 공용 pgvector → 실패·스키마 부재·0건이면 T2 로컬 FAISS 폴백) · `t2`(로컬 전용) · `t3`(폴백 없음, 실패 시 exit 1).
- 어느 계층이 답했는지는 **stderr 마커**로 판정(exit code 는 둘 다 0):

| 계층 | stderr 마커 |
|---|---|
| T3 | `🔗 검색 계층: T3(공용 pgvector) — 팀 공유 인덱스` |
| T2 강등 | `⚠️ 검색 계층: T2(로컬 FAISS) 강등 — 팀과 다른 결과일 수 있습니다.` |
| T2 의도 | (무출력 — `FORGE_RAG_ENGINE=t2`) |
| 폴백 사유 | `[rag-search] T3 미가용/비어있음 — 로컬 인덱스로 폴백` |
| fail-closed | `[rag-search] ⚠️ 해석된 DB가 머신 로컬입니다(공용 T3 아님) — T3 시도 생략.` |

정책 정본 `~/forge/docs/RAG-SHARED-DB-POLICY.md` · 동작 정본 `shared/scripts/rag/search.py`.
## Graph RAG

시맨틱 시드 → `[[wikilink]]` 정/역방향 이웃을 hops 만큼 BFS 추가(점수 0.5, `graph_neighbor: true`). 위키가 벡터 인덱스에 없으면 확장 안 됨. 그래프 빌드 선행:
```bash
bash ~/forge/shared/scripts/rag/rag-exec.sh graph_builder.py --index-dir ${FORGE_OUTPUTS:-$HOME/forge-outputs}/.rag-index
bash ~/forge/shared/scripts/rag/rag-exec.sh graph_builder.py --both        # workspace + vault-local 동시
bash ~/forge/shared/scripts/rag/rag-exec.sh search.py "에이전트 패턴" --graph --top-k 5 --index-dir ${FORGE_OUTPUTS:-$HOME/forge-outputs}/.rag-index
```
저장: `obsidian_graph.json` 의 `graph_dict`(LlamaIndex `graph_store.json` 과 분리).

## 인덱스 관리

```bash
bash ~/forge/shared/scripts/rag/rag-exec.sh index.py ${FORGE_OUTPUTS:-$HOME/forge-outputs}/09-grants [--rebuild]
bash ~/forge/shared/scripts/rag/rag-exec.sh index.py ${FORGE_OUTPUTS:-$HOME/forge-outputs}/01-research
bash ~/forge/shared/scripts/rag/rag-exec.sh index.py ${FORGE_OUTPUTS:-$HOME/forge-outputs}
cat ${FORGE_OUTPUTS:-$HOME/forge-outputs}/09-grants/.rag-index/meta.json
```

구성: LlamaIndex · 임베딩 multilingual-e5-small(384차원, 로컬) · 청크 512/overlap 50 · md/txt/json/docx/pdf. 요구: Python 3.10+ · `pip install -r ~/forge/shared/scripts/rag/requirements.txt` + `pip install llama-index-embeddings-huggingface sentence-transformers docx2txt` · (선택) OPENAI_API_KEY 있으면 text-embedding-3-small.

## AI 행동 규칙

1. grants-write/grants-review 중 근거가 필요하면 자동 호출 가능.
2. 인용 시 파일 경로를 출처로 명시. 출력은 항상 경로 + 점수 + relevance(`pass`/`low-relevance`). 필요하면 결과 파일을 Read 해 전체 문맥 확인.
3. 인덱스가 없으면 빌드를 제안만 — 사용자 확인 없이 자동 빌드 금지. 오래됐으면 `--rebuild` 제안.
4. `[low-relevance]` 청크는 근거로 직접 인용 금지 — 쓰면 라벨 함께 표기.
