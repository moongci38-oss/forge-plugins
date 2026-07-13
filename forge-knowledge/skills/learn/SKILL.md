---
name: learn
description: 프로젝트별 세션 간 학습을 축적·검색·활용하는 스킬. "이전에 이 패턴으로 해결했다"를 AI가 기억. learnings.jsonl에 저장하여 다음 세션에서 자동 참조.
user-invocable: true
context: fork
model: haiku
---

**역할**: 당신은 프로젝트별 세션 간 학습을 축적·검색·활용하는 학습 관리자입니다.
**컨텍스트**: 새로운 패턴을 발견했거나 과거 해결법을 찾을 때 호출됩니다.
**출력**: learnings.jsonl 항목 저장 또는 검색 결과을 반환합니다.

# Learn — 프로젝트별 학습 축적

세션 간 프로젝트 학습을 jsonl 파일에 축적하고, 이후 세션에서 자동 참조한다.
Auto Memory(워크스페이스 레벨)를 보완하는 프로젝트 레벨 학습 시스템.

## Auto Memory vs Learn

| | Auto Memory | Learn |
|---|---|---|
| 범위 | 워크스페이스 전체 | 프로젝트별 |
| 내용 | 사용자 프로필, 피드백, 규칙 | 기술 패턴, 버그 해결, 설정 발견 |
| 형식 | 개별 .md 파일 | 단일 .jsonl (append-only) |
| 접근 | MEMORY.md 인덱스 | /learn 검색 |

## 저장 위치

```
{프로젝트 루트}/.claude/learnings.jsonl
```

예:
- `${FORGE_ROOT:-$HOME/forge}/.claude/learnings.jsonl`
- `${FORGE_OUTPUTS:-$HOME/forge-outputs}/09-grants/kocca/2026-문화체육관광RD-스타트업혁신성장/.claude/learnings.jsonl`

## 사용법

### 학습 저장
```
/learn save "HWP 파일은 hwp2pdf로 변환 후 Read해야 함. 직접 Read하면 바이너리 깨짐"
/learn save "grants-write에서 작성요령 span 태그를 삭제하면 검수 FAIL — 절대 삭제 금지"
/learn save "FAISS 인덱스는 개별 노드 삭제 미지원 → 삭제된 파일 있으면 전체 재빌드"
```

### 학습 검색
```
/learn search "HWP"
/learn search "FAISS 삭제"
```

### 학습 목록
```
/learn list           # 최근 10개
/learn list --all     # 전체
```

### 학습 내보내기
```
/learn export         # 마크다운으로 출력
```

## 워크플로우

### 저장 (save)
```bash
# learnings.jsonl에 1줄 append
echo '{"ts":"2026-03-30T08:00:00Z","content":"학습 내용","tags":["tag1"],"session":"세션ID"}' >> .claude/learnings.jsonl
```

### 검색 (search)
```bash
# jsonl에서 키워드 검색
grep -i "검색어" .claude/learnings.jsonl | python3 -c "
import sys, json
for line in sys.stdin:
    entry = json.loads(line)
    print(f'[{entry[\"ts\"][:10]}] {entry[\"content\"]}')"
```

### 자동 참조
세션 시작 시 현재 프로젝트의 learnings.jsonl이 있으면 최근 20개를 컨텍스트에 로드한다.

## AI 행동 규칙

1. 새로운 패턴/해결법을 발견하면 "이걸 /learn에 저장할까요?" 제안
2. 같은 실수를 반복하면 learnings를 검색하여 이전 해결법 참조
3. 저장 시 tags를 자동 추출 (기술명, 스킬명, 파일 유형 등)
4. 세션 시작 시 learnings.jsonl이 있으면 최근 항목 자동 로드
5. 학습 내용이 Auto Memory에 더 적합하면 (사용자 피드백, 행동 규칙) Auto Memory에 저장

---

## 코드/디버깅/리뷰/분석 경험 = learnings.jsonl 단일 저장소 + `learnings.sh` 헬퍼

code-reviewer / forge-pge / investigate / forge-fix / codebase-analyzer 가 만드는 디버깅·수정·리뷰·분석 교훈은 **learnings.jsonl에만** 저장한다 (forge-vault/Obsidian = 리서치 노트 전용 — 코드 경험 금지). 이 용도 항목은 **리치 스키마** + **`$HOME/.claude/scripts/learnings.sh` 헬퍼 경유만** (inline grep/sed/python·shell JSON 조합 금지).

### 경로 정본 (canonical)
- `GLOBAL_LEARNINGS` = `${FORGE_ROOT:-$HOME/forge}/.claude/learnings.jsonl` (크로스-프로젝트 교훈)
- `PROJECT_LEARNINGS` = `$(git rev-parse --show-toplevel)/.claude/learnings.jsonl` (현재 작업 repo의 교훈 — append 기본 타겟)
- `ACCESS_LOG` = `<repo>/.claude/learnings-access.log` (미추적 — `.gitignore`)
- 테스트 격리: `LEARNINGS_OVERRIDE=<tmp.jsonl>` env → 헬퍼의 모든 cmd가 그 단일 파일을 사용 (프로덕션 무변경)

### 리치 스키마
```json
{"id":"L-<UTC ts>-<8hex>","date":"YYYY-MM-DD","category":"review-pattern|pge-failure|bug-fix-pattern|codebase-delta|process|decision|user-directive|forbidden-pattern","summary":"...","trigger":"...","apply":"...","evidence":"...","status":"active|stale|superseded|dormant","superseded_by":null,"fingerprint":"<review-pattern 전용 — issue.category:bare>","fluency_dimension":"D1|D2|D3|D4"}
```
- `fluency_dimension` (optional): AI Fluency 4D 차원 태깅 — 아래 4D 섹션 참조. 기존 엔트리 수정 불요.
- `id` = collision-safe (timestamp+rand) — 멀티-writer 안전. 레거시 `L-NN` 무변경.
- `category=="review-pattern"` 이면 `fingerprint` 필수 (형식 `^(logic|security|performance|spec|test|architecture|unknown):.+$`).
- `summary`·`evidence` = 1줄 (개행 금지 — 스택트레이스 등은 caller가 1줄 압축 후 append).
- `status` 영구 삭제 X — 마킹 또는 GC archive 이관(move)만.

### 헬퍼 cmd
```bash
LEARN_BY=<comp> bash $HOME/.claude/scripts/learnings.sh load <category>     # active만 stdout, learnings 변경 0, access.log 기록
bash $HOME/.claude/scripts/learnings.sh append [--global] [--replaces <old-id>] \
  --category <c> --summary <s> --apply <a> [--trigger <t>] [--evidence <e>] [--fingerprint <fp>]   # 필드 인자만 — shell JSON 조합 금지. sanitize+validate+collision-id+중복가드 자동. exit: 0 성공 / 2 secret 차단 / 3 검증실패 / 4 git repo 아님 / 6 review-pattern 중복
bash $HOME/.claude/scripts/learnings.sh supersede-current <old-id> <new-id>  # global/project에서 old-id 찾아 status:superseded (패턴 해소 시)
bash $HOME/.claude/scripts/learnings.sh next-id | sanitize-check | validate <json>
/learn gc [--apply]   → learn-gc.sh (dry-run 기본; --apply 시 stale/dormant 마킹·archive move)
```

### 컴포넌트 표준 패턴
- **착수 전**: `LEARN_BY=<comp> learnings.sh load <category>` → active 교훈 로드 (access.log 자동 기록).
- **완료 후**: 새 근본원인/반복 패턴(3회+) → `learnings.sh append ...` → 보고에 `📌 신규: <id>`. 더 정확한 교훈으로 교체 시 `--replaces <old-id>`. 패턴 해소 시 `supersede-current <old-id> self` → 보고에 `🧹 정리: <id>`.
- append exit 2(secret) = 저장 안 됨 → caller는 `⚠️ <category> learning 억제됨 — <패턴명> 감지, 내용 비노출`만 보고 (raw 노출 X). exit 4(git repo 아님) = caller가 learning 내용을 사용자 보고에 노출(손실 0). exit 6(중복) = 침묵.

### 큐레이션 (트리거 기반 반자동 — 완전 자율 X)
1. **stale** = learning `evidence`/`apply`의 `path:line`·`fn()`가 무효 → `learn-gc.sh`만 마킹 (load는 변경 안 함).
2. **replaces / supersede** = append `--replaces` 또는 컴포넌트가 결정론적 패턴해소 감지 시 `supersede-current`.
3. **주기 GC** = `/learn gc` (dry-run 리포트 기본; `--apply` 시 stale 90일+ archive move·dormant 마킹). cron 등록은 사용자 `/schedule` 결정.

### 팀 공유
learnings.jsonl = git-tracked 필수 (sensitive 값 금지 — `sanitize-check`가 강제). 작업 후 commit+push → 동료 `git pull` 후 자동 로드. 멀티 브랜치 동시 append = `.gitattributes` `merge=union`로 충돌 없이 병합. (단순 숫자 `L-NN` 폐기 — collision-safe id 사용; 레거시는 유지.)

> 상세 룰: `$HOME/.claude/rules-on-demand/compounding-knowledge.md`

---

## AI Fluency 4D Framework (AD-94)

learnings를 4개 역량 차원으로 분류하는 선택적 태깅 체계.

| 차원 | 핵심 질문 | learnings 예시 |
|------|----------|--------------|
| **D1 — Delegate (위임)** | 무엇을 AI에 맡길지? | "복잡한 grep 탐색 = subagent 위임 (메인 컨텍스트 보호)" |
| **D2 — Describe (설명)** | 컨텍스트 얼마나 줄지? | "repo 구조 미설명 → 오답 3회. handover 2-paragraph 필수" |
| **D3 — Discern (판단)** | AI 산출물 어떻게 검토? | "subagent 보고 = 1차 후보. grep 실측 2차 의무 (L-38)" |
| **D4 — Diligence (부주의 방지)** | 어떤 게이트로 검증? | "self-report = 실측 출력 첨부 의무 (AD-93 W5 룰)" |

### 태깅 방법

```bash
bash $HOME/.claude/scripts/learnings.sh append \
  --category bug-fix-pattern \
  --summary "..." --apply "..." \
  --fluency_dimension D3  # optional
```

> `fluency_dimension`이 없는 기존 엔트리 = 그대로 유지.  
> learn-gc-weekly.sh가 주간 4D 분포 통계 제공 (어느 차원 학습 부족인지 식별).

## Evaluator (Wave 2.5)

독립 Evaluator subagent가 산출물 품질을 검증합니다.

```
Evaluator 역할: 산출물 독립 검증
모델: claude-haiku-4-5 (경량, 편향 최소화)
격리: 메인 컨텍스트 오염 방지
```

판정 기준:
- PASS: 모든 핵심 기준 충족, 즉시 사용 가능
- WARN: 사용 가능하나 개선 권장, 사용자 확인 후 진행
- FAIL: 핵심 기준 미충족, 재실행 필요

eval_cases.jsonl에 결과 자동 누적.
