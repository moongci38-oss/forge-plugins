---
name: learn
description: "세션간 학습을 learnings.jsonl에 축적·검색. 시행착오 재발방지 필요시, 과거 동일문제 해결법 확인 시 사용."
context: fork
model: haiku
allowed-tools: Read, Bash, Glob, Grep
argument-hint: save "<내용>" | search "<키워드>" | gc [--apply] | list [--tag <태그>]
---

**역할**: 프로젝트별 세션 간 학습을 `learnings.jsonl` 에 축적·검색한다.
**출력**: learnings.jsonl 항목 저장 또는 검색 결과.
**컨텍스트**: 새로운 패턴을 발견했거나 과거 해결법을 찾을 때 호출됩니다.

# Learn — 프로젝트별 학습 축적

- Auto Memory = 워크스페이스 전체(사용자 프로필·피드백·규칙, 개별 .md) · Learn = 프로젝트별(기술 패턴·버그 해결·설정 발견, 단일 .jsonl append-only).
- 사용자 피드백·행동 규칙은 Auto Memory 로 보낸다.

## 저장 위치
`{프로젝트 루트}/.claude/learnings.jsonl` (예: `~/forge/.claude/learnings.jsonl`)

## 사용법
| 명령 | 동작 |
|---|---|
| `/learn save "<내용>"` | 1줄 append (tags 자동 추출: 기술명·스킬명·파일 유형) |
| `/learn search "<키워드>"` | 키워드 검색 |
| `/learn list [--all]` | 최근 10개 / 전체 |
| `/learn export` | 마크다운 출력 |
| `/learn gc [--apply] [--legacy-ok]` | `learn-gc.sh` (아래 GC) |

```bash
# save
echo '{"ts":"<ISO>","content":"학습 내용","tags":["tag1"],"session":"세션ID"}' >> .claude/learnings.jsonl
# search
grep -i "검색어" .claude/learnings.jsonl | python3 -c "
import sys, json
for line in sys.stdin:
    entry = json.loads(line)
    print(f'[{entry[\"ts\"][:10]}] {entry[\"content\"]}')"
```

## AI 행동 규칙
1. 새 패턴/해결법 발견 → "이걸 /learn에 저장할까요?" 제안
2. 같은 실수 반복 → learnings 검색해 이전 해결법 참조
3. 세션 시작 시 learnings.jsonl 이 있으면 최근 20개를 컨텍스트에 로드

---

## 코드/디버깅/리뷰/분석 교훈 = `learnings.sh` 헬퍼 경유만
code-reviewer·forge-pge·investigate·forge-fix·codebase-analyzer 의 교훈은 **learnings.jsonl 에만** 저장(forge-vault/Obsidian 금지). **리치 스키마 + `~/.claude/scripts/learnings.sh` 경유만** — inline grep/sed/python·shell JSON 조합 금지.

### 경로
- `GLOBAL_LEARNINGS` = `~/forge/.claude/learnings.jsonl` (크로스-프로젝트)
- `PROJECT_LEARNINGS` = `$(git rev-parse --show-toplevel)/.claude/learnings.jsonl` (append 기본)
- `ACCESS_LOG` = `<repo>/.claude/learnings-access.log` (미추적)
- 테스트 격리: `LEARNINGS_OVERRIDE=<tmp.jsonl>` → 모든 cmd 가 그 파일만 사용

### 리치 스키마
```json
{"id":"L-<UTC ts>-<8hex>","date":"YYYY-MM-DD","category":"review-pattern|pge-failure|bug-fix-pattern|codebase-delta|process|decision|user-directive|forbidden-pattern","summary":"...","trigger":"...","apply":"...","evidence":"...","status":"active|stale|superseded|dormant","superseded_by":null,"fingerprint":"<review-pattern 전용 — issue.category:bare>","fluency_dimension":"D1|D2|D3|D4"}
```
- `review-pattern` 은 `fingerprint` 필수: `^(logic|security|performance|spec|test|architecture|unknown):.+$`
- `summary`·`evidence` = 1줄(개행 금지). 영구 삭제 금지 — status 마킹 또는 GC archive 이관만.
- `retention` = `permanent|ttl|session`(기본 `ttl`). 미기재 → WARN 후 `ttl` 저장 · 오값 → **exit 3 거부** · `permanent` 자동 삭제 금지. 점검: `learnings-retention-check.sh <jsonl>` (정본 `OPS-PATTERNS.md §learnings retention 3등급`)
- `fluency_dimension`(선택) = D1 Delegate(무엇을 맡길지) · D2 Describe(컨텍스트) · D3 Discern(산출물 검토) · D4 Diligence(검증 게이트). 없는 기존 엔트리는 그대로. 주간 분포는 learn-gc-weekly.sh.

### 헬퍼 cmd
```bash
LEARN_BY=<comp> bash ~/.claude/scripts/learnings.sh load <category>     # active만 stdout, 변경 0, access.log 기록
bash ~/.claude/scripts/learnings.sh append [--global] [--replaces <old-id>] \
  --category <c> --summary <s> --apply <a> [--trigger <t>] [--evidence <e>] [--fingerprint <fp>] [--retention permanent|ttl|session] [--fluency_dimension D1-4]
#   exit: 0 성공 / 2 secret 차단 / 3 검증실패 / 4 git repo 아님 / 6 review-pattern 중복
bash ~/.claude/scripts/learnings.sh supersede-current <old-id> <new-id>  # old-id → status:superseded
bash ~/.claude/scripts/learnings.sh next-id | sanitize-check | validate <json>
```

### 컴포넌트 표준 패턴
- **착수 전**: `LEARN_BY=<comp> learnings.sh load <category>`
- **완료 후**: 새 근본원인/반복 패턴(3회+) → `append` → 보고 `📌 신규: <id>`. 교체는 `--replaces <old-id>`. 패턴 해소 → `supersede-current <old-id> self` → `🧹 정리: <id>`.
- exit 2 → `⚠️ <category> learning 억제됨 — <패턴명> 감지, 내용 비노출`만 보고 · exit 4 → learning 내용을 사용자 보고에 노출 · exit 6 → 침묵.

### 큐레이션 · GC
1. **stale**(evidence/apply 의 `path:line`·`fn()` 무효) 마킹은 `learn-gc.sh` 만(load 는 변경 안 함).
2. **supersede** = append `--replaces` 또는 `supersede-current`.
3. **`/learn gc`** = dry-run 리포트 기본. `--apply` = stale/dormant 마킹 + stale 90일+ archive move + retention 만료 삭제(ttl 90일·session 1일 → `30-archive/learnings-expired-<날짜>.jsonl`, `--restore <id>` 로 복구). retention 미기재 잔존 시 `--legacy-ok` 없으면 apply exit 2 거부. cron 등록은 사용자 `/schedule` 결정.

### 팀 공유
learnings.jsonl = git-tracked(시크릿 금지 — `sanitize-check` 강제). commit+push → 동료 pull 후 자동 로드. 동시 append 는 `.gitattributes` `merge=union`.

