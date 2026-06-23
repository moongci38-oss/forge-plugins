---
description: forge-outputs 지식 베이스 하이브리드 검색 — vector + BM25 + Graph RAG (ADR-174 unified_search)
allowed-tools: Read, Bash, Glob, Grep
argument-hint: <검색 쿼리> [--top-k N] [--mode vector|bm25|hybrid] [--graph] [--context wiki|research|all]
model: sonnet
group: brain
---

# /rag-search — 하이브리드 지식 검색

forge-outputs 지식 베이스에서 ADR-174 unified_search 라우터를 통해 시맨틱 검색을 실행합니다.

## 사용법

```
/rag-search <쿼리>                           # 기본 하이브리드 검색
/rag-search <쿼리> --top-k 10               # 상위 N개 결과
/rag-search <쿼리> --mode vector            # 벡터 전용
/rag-search <쿼리> --mode bm25              # 키워드 전용
/rag-search <쿼리> --graph                  # Graph RAG (위키링크 이웃 확장)
/rag-search <쿼리> --context wiki           # wiki 컨텍스트만
/rag-search [보안 감사 중] <쿼리>            # reasoning_context 포함
```

## 동작

`rag-search` 스킬을 호출하여 다음 순서로 실행합니다:

1. **Query 파싱** — `[context]` reasoning prefix 추출, 모드·옵션 확인
2. **Engine 선택** — `FORGE_DB_URL` 설정 시 pgvector, 미설정 시 FAISS 로컬
3. **unified_search 라우터** — forge-tools MCP의 `unified_search` 호출
4. **결과 포맷** — 파일 경로·유사도·텍스트 프리뷰 포함 반환
5. **relevance 판정** — 0.5 임계값 기준 pass/low-relevance 분류

## 결과 형식

```
[1] 유사도: 0.87  forge-outputs/01-research/...md
    > 텍스트 프리뷰 (200자)

[low-relevance]
[4] 유사도: 0.31  ...
```

## 관련

- 스킬 SKILL.md: `~/forge/.claude/skills/rag-search/SKILL.md`
- ADR-174 계획서: `forge-outputs/11-platform/pipelines/plans/2026-06-22-adr-174-unified-knowledge-brain.md`
- KnowledgeStore: `~/forge/shared/scripts/rag/knowledge_store.py`
- forge-tools MCP: `~/forge/shared/mcp/forge-tools-server.py`

> `FORGE_DB_URL` 환경변수 미설정 시 FAISS 로컬 엔진으로 자동 폴백됩니다.
