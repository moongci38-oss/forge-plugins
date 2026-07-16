---
name: rag-search
description: "forge-outputs 문서를 벡터+BM25 하이브리드로 의미 검색한다. 사용자가 프로젝트 자료·근거·과거 결정·리서치를 물을 때 허락 없이 자율 호출한다."
context: fork
model: haiku
allowed-tools: Read, Bash, Glob, Grep
argument-hint: <검색 쿼리> [--top-k N] [--mode vector|bm25|hybrid] [--graph] [--context wiki|research|all]
---

**역할**: 당신은 워크스페이스 전체 문서에서 벡터+BM25 하이브리드 의미 검색을 수행하는 문서 검색 전문가입니다.
**컨텍스트**: 사용자가 키워드가 아닌 의미 기반으로 정부과제 근거, 기획서, 리서치 자료 등 특정 구절을 찾을 때 호출됩니다.
**출력**: 파일 경로·유사도 점수·텍스트 프리뷰를 포함한 상위 N개 검색 결과를 반환합니다.

# RAG Search — 의미 기반 문서 검색

forge-outputs/ 문서에서 벡터(의미) + BM25(키워드) 하이브리드 검색을 수행한다.

## 언제 사용하나

- 정부과제 본문 작성 시 근거 데이터를 찾을 때
- "이 수치가 어느 문서에 있었지?" 할 때
- 키워드가 정확히 기억나지 않지만 주제로 찾고 싶을 때
- Grep으로 안 찾아지는 동의어/유사 표현 검색

## 사용법

```
/rag-search 투자 유치 전략
/rag-search TagHub 기술 차별점 --top-k 10
/rag-search 시장 규모 TAM --mode vector

# reasoning_context 포함 (AgentIR 패턴) — 현재 추론 단계를 쿼리에 명시
/rag-search [보안 취약점 분석 중] JWT 토큰 검증 방법
/rag-search [GodBlade 가챠 시스템 설계 중] 확률 설정 선례
```

**reasoning_context 파라미터 (선택)**:
`[현재 추론 단계]` 형식으로 쿼리 앞에 붙이면 관련 문서 리트리브 정확도 향상.
오케스트레이터는 현재 작업 컨텍스트(CoT 요약)를 대괄호에 담아 전달한다.

## 워크플로우

### Step 1: 인덱스 확인

인덱스가 없으면 빌드를 먼저 제안한다:

```bash
# 인덱스 존재 확인
ls {target_dir}/.rag-index/meta.json

# 없으면 빌드
python3 ${FORGE_ROOT:-$HOME/forge}/shared/scripts/rag/index.py {target_dir}
```

인덱스 위치:
- **전체**: `${FORGE_OUTPUTS:-$HOME/forge-outputs}/.rag-index/` (통합 인덱스 — 기본)
- **정부과제**: `${FORGE_OUTPUTS:-$HOME/forge-outputs}/09-grants/.rag-index/` (과제 전용)

다른 폴더: `python3 ${FORGE_ROOT:-$HOME/forge}/shared/scripts/rag/index.py ${FORGE_OUTPUTS:-$HOME/forge-outputs}/01-research/`

**커버리지 항상 보고 (meta.json 존재 확인만으로 끝내지 않는다)**: 검색 결과 반환 시 `meta.json`의 `file_count`(색인 문서수)·`built_at`(최종 인덱싱 시각)을 함께 명시한다.
```bash
python3 -c "import json; m=json.load(open('{target_dir}/.rag-index/meta.json')); print(f\"색인 {m['file_count']}건 / built_at={m['built_at']}\")"
```
현재 `{target_dir}` 실제 파일 수 대비 `file_count`가 미달(신규 문서 다수 추가됨)하거나 `built_at`이 오래된 경우 → "grep 폴백 필요 — 커버리지 X% (색인 {file_count}건 / 최종인덱싱 {built_at})" 경고를 결과에 포함한다. meta.json 부재 시에도 동일하게 "미인덱싱 — grep 폴백 필요" 명시(침묵 금지).

### Step 2: 검색 실행

**KnowledgeStore 경유 (AD-173 T2, 권장)** — 소비자가 엔진 무관하게 검색:
```python
# python 코드에서 직접 호출
import sys; sys.path.insert(0, os.path.expanduser('${FORGE_ROOT:-$HOME/forge}/shared/scripts/rag'))
from knowledge_store import KnowledgeStore
ks = KnowledgeStore.from_config()
results = ks.search("{검색어}", top_k=5, mode="hybrid")
```

**CLI 직접 호출 (롤백/디버그용)**:
```bash
# 전체 forge-outputs 검색 (기본)
python3 ${FORGE_ROOT:-$HOME/forge}/shared/scripts/rag/search.py "{검색어}" --top-k {N} --mode {hybrid|vector|bm25} --index-dir ${FORGE_OUTPUTS:-$HOME/forge-outputs}/.rag-index

# 정부과제만 검색
python3 ${FORGE_ROOT:-$HOME/forge}/shared/scripts/rag/search.py "{검색어}" --index-dir ${FORGE_OUTPUTS:-$HOME/forge-outputs}/09-grants/.rag-index
```

파라미터:
- `--top-k N`: 결과 수 (기본 5)
- `--mode hybrid`: 벡터+BM25 조합 (기본, 권장)
- `--mode vector`: 의미 검색만
- `--mode bm25`: 키워드 검색만
- `--graph`: Graph RAG 모드 — 시맨틱 결과의 Obsidian [[wikilink]] 이웃 노드 확장
- `--graph-hops N`: 그래프 순회 홉 수 (기본 1, 2면 A→B→C 체인)
- `--json`: JSON 출력 (프로그래밍용)
- `--index-dir`: 인덱스 위치 지정

**Relevance-gate 파라미터** (환경변수):
- `RAG_RELEVANCE_THRESHOLD`: 관련성 임계값 (기본 0.10). 이 점수 미달 청크는 `[low-relevance]` 섹션으로 분리됨 — 결과가 없어지지 않고 라벨로 표시. Graph 이웃(고정 score=0.5)은 항상 통과.
  ```bash
  # 임계값 높이기 — 엄격 필터
  RAG_RELEVANCE_THRESHOLD=0.20 python3 search.py "검색어"
  # 임계값 낮추기 — 느슨한 필터 (결과 부족 시)
  RAG_RELEVANCE_THRESHOLD=0.05 python3 search.py "검색어"
  ```

JSON 출력 시 각 결과에 `"relevance": "pass"` 또는 `"relevance": "low-relevance"` 필드 포함.

### Step 3: 결과 해석 + 활용

검색 결과에서:
1. 파일 경로 + 점수 확인
2. 텍스트 프리뷰로 맥락 파악
3. 필요하면 해당 파일을 Read하여 전체 문맥 확인
4. grants-write 등 다른 스킬에서 근거로 인용

**Relevance-gate 라벨 해석**:
- 일반 결과: threshold 이상 → 그대로 사용
- `[low-relevance]` 섹션: 점수 threshold 미달 → 참고 가능하지만 낮은 신뢰도 명시 필수. 근거 인용 시 `[low-relevance]` 라벨 함께 표기.
- 결과가 적으면 threshold 낮추기: `RAG_RELEVANCE_THRESHOLD=0.05 python3 search.py ...`

## Graph RAG (Obsidian 위키링크 관계 검색)

Obsidian vault(forge-outputs, `.obsidian` 루트)의 `[[wikilink]]` 관계를 그래프로 구축하여
시맨틱 검색 결과를 **관계 기반으로 확장**한다. 단순 유사도로는 못 잡는 연결 문서를 끌어온다.

### 작동 원리

1. 시맨틱 검색(벡터+BM25)으로 시드 문서 N개 발견
2. 시드 문서의 `[[wikilink]]` 이웃(정방향 links_to + 역링크 links_from)을 그래프에서 조회
3. 이웃 문서를 결과에 추가 (hops 단계만큼 BFS 순회)

### 그래프 빌드 (선행 필수)

```bash
# 20-wiki 위키링크 → obsidian_graph.json 구축 (vault-local 인덱스)
python3 ${FORGE_ROOT:-$HOME/forge}/shared/scripts/rag/graph_builder.py --index-dir ${FORGE_OUTPUTS:-$HOME/forge-outputs}/.rag-index

# 양쪽 인덱스(workspace + vault-local) 동시 갱신
python3 ${FORGE_ROOT:-$HOME/forge}/shared/scripts/rag/graph_builder.py --both
```

- 노드 = .md 파일 (slug 키), 엣지 = `[[wikilink]]` (정/역방향)
- `obsidian_graph.json`의 `graph_dict`에 저장 (LlamaIndex 소유 `graph_store.json`과 분리 — persist 클로버 방지)
- 위키링크는 주로 `20-wiki/`에 집중 (전체 vault wikilink의 ~98%)

### 검색

```bash
# Graph RAG — 시맨틱 시드 + 위키링크 이웃 확장
python3 ${FORGE_ROOT:-$HOME/forge}/shared/scripts/rag/search.py "에이전트 패턴" --graph --top-k 5 --index-dir ${FORGE_OUTPUTS:-$HOME/forge-outputs}/.rag-index

# 2홉 체인 (A→B→C)
python3 ${FORGE_ROOT:-$HOME/forge}/shared/scripts/rag/search.py "하네스 설계" --graph --graph-hops 2
```

> 그래프 이웃은 점수 0.5로 결과에 추가 (시맨틱 결과보다 낮게 랭크). `graph_neighbor: true` 메타로 구분.
> 위키 파일이 벡터 인덱스에 없으면 시드가 안 잡혀 확장 X — 위키 인덱싱 선행 필요.

## 인덱스 관리

### 빌드

```bash
# 최초 빌드
python3 ${FORGE_ROOT:-$HOME/forge}/shared/scripts/rag/index.py ${FORGE_OUTPUTS:-$HOME/forge-outputs}/09-grants

# 문서 추가/변경 후 재빌드
python3 ${FORGE_ROOT:-$HOME/forge}/shared/scripts/rag/index.py ${FORGE_OUTPUTS:-$HOME/forge-outputs}/09-grants --rebuild
```

### 인덱스 정보

```bash
cat ${FORGE_OUTPUTS:-$HOME/forge-outputs}/09-grants/.rag-index/meta.json
```

### 다른 폴더 인덱싱

```bash
# 리서치 폴더
python3 ${FORGE_ROOT:-$HOME/forge}/shared/scripts/rag/index.py ${FORGE_OUTPUTS:-$HOME/forge-outputs}/01-research

# 전체 forge-outputs
python3 ${FORGE_ROOT:-$HOME/forge}/shared/scripts/rag/index.py ${FORGE_OUTPUTS:-$HOME/forge-outputs}
```

## 기술 구성

| 구성 요소 | 선택 | 비고 |
|----------|------|------|
| 프레임워크 | LlamaIndex | 문서 로딩 + 인덱싱 |
| 벡터 저장소 | FAISS (로컬) | 서버 불필요 |
| 키워드 검색 | BM25Retriever | 하이브리드 병합 |
| 임베딩 모델 | multilingual-e5-small (로컬) | 한국어 지원, 비용 0 |
| 임베딩 차원 | 384 | |
| 청크 크기 | 512 토큰 | overlap 50 |
| 지원 파일 | md, txt, json, docx, pdf | hwp/pptx/이미지 제외 |
| Graph RAG | Obsidian [[wikilink]] 그래프 | `obsidian_graph.json`, `--graph` 플래그 |
| 그래프 빌더 | `graph_builder.py` | 노드=파일, 엣지=정/역 위키링크 |

## 환경 요구사항

- Python 3.10+
- 패키지: `pip install -r ${FORGE_ROOT:-$HOME/forge}/shared/scripts/rag/requirements.txt`
- 추가: `pip install llama-index-embeddings-huggingface sentence-transformers docx2txt`
- (선택) OPENAI_API_KEY — 있으면 text-embedding-3-small 사용, 없으면 로컬 모델

## AI 행동 규칙

1. grants-write/grants-review 실행 중 근거를 찾아야 할 때 자동으로 이 스킬을 호출할 수 있다
2. 검색 결과를 인용할 때 파일 경로를 출처로 명시한다
3. 인덱스가 없으면 빌드를 제안하되, 사용자 확인 없이 자동 빌드하지 않는다 (시간 소요)
4. 문서가 변경되어 인덱스가 오래됐으면 `--rebuild` 제안
5. reasoning_context 있으면 쿼리 앞에 `[컨텍스트]` 형식으로 포함 — 검색 정확도 향상
6. **Relevance-gate (deep-research mechanism c)**: 검색 결과에 `[low-relevance]` 섹션이 있으면 해당 청크를 근거로 직접 인용 금지. 반드시 `[low-relevance]` 라벨을 함께 명시한다. ref: `$HOME/.claude/rules-on-demand/research-verification-protocol.md` #4 (관련성 검증 의무)
7. 모든 검색 결과는 파일 경로 + 점수 + relevance 판정(`pass`/`low-relevance`)을 함께 출력한다
