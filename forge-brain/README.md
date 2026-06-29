# forge-brain

Forge 지식·메모리 레이어 플러그인 — 세션 간 학습 축적, Obsidian 지식 동기화, 메모리 관리를 담당합니다. forge-core의 `/rag-search`와 함께 Forge의 컴파운딩 지식 루프를 구성합니다.

> **버전**: v0.1.0 | **의존성**: forge-core

---

## 설치

```bash
claude plugin marketplace add moongci38-oss/forge-plugins
claude plugin install forge-core   # 필수 선행 설치
claude plugin install forge-brain
```

### 선택 — pgvector 연동 (ADR-174)

`FORGE_DB_URL` 환경변수를 설정하면 pgvector unified_search가 자동 연동됩니다.

```bash
# ~/.bashrc 또는 ~/.zshrc
export FORGE_DB_URL="postgresql://user:pass@localhost:5432/forge"
```

설정하지 않으면 로컬 FAISS + BM25 폴백으로 동작합니다.

---

## 스킬 목록

| 스킬 | 설명 |
|------|------|
| `learn` | 세션 간 학습 축적 → learnings.jsonl |
| `memory-manage` | MEMORY.md 관리 — 추가·수정·삭제·GC |
| `wiki-sync` | Raw 레이어 → 20-wiki/ Obsidian 동기화 |

### learn

프로젝트별 세션 간 학습을 `learnings.jsonl`에 축적합니다. 다음 세션에서 AI가 자동으로 참조하여 "이전에 이 패턴으로 해결했다"를 기억합니다.

**저장 구조** (learnings.jsonl 1행):
```json
{
  "id": "L-20260629T123456-ab1cd2ef",
  "date": "2026-06-29",
  "category": "bug-fix-pattern",
  "summary": "WSL2 heredoc hook 차단 → python3 -c 우회 유효",
  "tags": ["wsl2", "hook", "workaround"]
}
```

**GC**: 90일 미참조 항목 자동 정리 제안 (Human 승인 후 실행).

```
/learn
# 대화식으로 학습 내용 기록

/learn WSL2에서 heredoc이 hook에 차단될 때 python3 -c를 사용하면 우회 가능
```

### memory-manage

`MEMORY.md` 항목을 추가·수정·삭제하고 스탤(stale) 항목을 탐지·정리합니다.

**범위 충돌 우선순위**: `global` > `project` > `session` > `ephemeral`

**기능**:
- 항목 추가/업데이트/삭제
- 90일 미참조 GC (Human 승인 필요)
- 중복 항목 병합
- lifecycle audit (AD-119 기준)

```
/memory-manage
# 대화식 메뉴

/memory-manage add
/memory-manage gc          # GC 후보 탐지
/memory-manage audit       # lifecycle 전체 감사
```

### wiki-sync

Karpathy 3-layer 개인 지식 체계에서 Raw 레이어를 Wiki로 추출합니다.

**3-layer 구조**:
```
Raw 레이어 (forge-outputs/)
├── 01-research/        — 리서치 자료
├── daily-system-review/ — 일일 시스템 리뷰
├── weekly-research/    — 주간 리서치
└── 01-research/videos/ — YouTube 분석

    ↓ /wiki-sync

Wiki 레이어 (forge-outputs/20-wiki/)
└── concepts/           — 개념 노트
    topics/             — 주제별 노트
    projects/           — 프로젝트 지식
```

**실행 순서**:
1. Raw 레이어에서 미위키화 신규 문서 스캔
2. 기존 wiki 노트와 매칭 (업데이트 또는 신규 생성 제안)
3. **Human 승인 루프** — AI가 독단으로 wiki 수정하지 않음
4. 승인 후 `forge-outputs/20-wiki/` 반영

```
/wiki-sync
```

---

## 커맨드 목록

| 커맨드 | 사용법 | 설명 |
|--------|--------|------|
| `/learn` | `/learn [내용]` | learnings.jsonl 저장·검색·GC |
| `/memory-manage` | `/memory-manage [서브커맨드]` | MEMORY.md 관리 |
| `/wiki-sync` | `/wiki-sync` | Raw → Wiki 추출 (Human 승인 루프) |

> **RAG 검색**: `/rag-search`는 **forge-core** 플러그인에서 제공합니다. forge-brain은 지식 **저장·관리** 담당, forge-core는 **검색** 담당입니다.

---

## 지식 관리 워크플로우

```
구현/리서치 세션
       ↓
/learn              → learnings.jsonl (세션 간 컴파운딩)
                            ↓
                    다음 세션에서 /start-sonnet이 자동 참조

리서치 산출물 (01-research/, videos/ 등)
       ↓
/wiki-sync          → 20-wiki/ (Obsidian 지식 베이스)
                            ↓
                    /rag-search (forge-core)로 검색

MEMORY.md 항목
       ↓
/memory-manage      → 스탤 감지·GC·lifecycle audit
```

---

## RAG 검색 연동 (forge-core)

forge-brain이 관리하는 지식 베이스를 forge-core의 `/rag-search`로 검색합니다.

```
/rag-search ADR-174 unified brain 설계 근거
/rag-search OAuth2 구현 시 주의사항
/rag-search 정부과제 사업화 계획서 작성 방법
```

검색 엔진:
- **`FORGE_DB_URL` 설정 시**: pgvector (e5-small 384d) + BM25 하이브리드
- **미설정 시**: 로컬 FAISS + BM25 폴백

---

## 빠른 시작 예시

```
# 세션에서 배운 것 기록
/learn WSL2 heredoc hook 차단 시 python3 -c 우회 유효

# 지식 베이스 검색 (forge-core)
/rag-search 이전에 WSL2 hook 문제 해결한 방법

# 리서치 결과 wiki로 동기화
/wiki-sync

# 메모리 GC
/memory-manage gc
```

---

## 의존 플러그인

| 플러그인 | 필수 여부 | 용도 |
|---------|----------|------|
| forge-core | ✅ 필수 | /rag-search 검색, 세션관리 |
| forge-research | 권장 | 리서치 산출물 → wiki-sync 소스 |

---

## Changelog

### v0.1.0 (2026-06-23)
- 최초 패키징: learn, memory-manage, wiki-sync
- ADR-174 pgvector unified_search 연동 (e5-small 384d, FORGE_DB_URL)
- lifecycle GC (AD-119 기준)
- Human 승인 루프 wiki-sync 도입
