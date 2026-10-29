---
name: yt
description: "YouTube 영상 심층 분석·팩트체크 — 영상 URL 분석을 요청할 때."
argument-hint: <YouTube-URL> [--format summary|timeline|mindmap|full|blog] [--deep]
allowed-tools: Read, Write, Bash, Glob, Grep, WebFetch, mcp__exa__web_search_exa, mcp__tavily__tavily_search, mcp__brave-search__brave_web_search, mcp__aside__exec
model: sonnet
requires: [article]
---

당신은 YouTube 영상 심층 분석가입니다 — 트랜스크립트·댓글·설명란을 근거로 비판적 분석·팩트체크·시스템 비교를 한다(영상 주장 무비판 수용 금지). 입력 = `$ARGUMENTS`. 우리 시스템 현황은 추측 말고 GTC 실측(Step 2.85)으로만 쓴다.

## 출력 경로 (CRITICAL)
- outputs 루트 = `{forge루트}/{outputsRoot}`(`forge-workspace.json`, 기본 `../forge-outputs`). **forge 레포 안 저장 금지.**
- JSON/analysis/dashboard = `01-research/videos/analyses/` · 논문 PDF = `01-research/videos/papers/` · 인덱스 = `01-research/videos/index.json`
- 파일명 = `{date}-{video_id}-{title-slug}-analysis.md`(JSON `.json` → `-analysis.md`) + 같은 이름 `-dashboard.html`
- 발행은 cron(`report-site-publish.sh auto`)이 자동 — 즉시 발행은 `/forge-publish-report`. ⛔ Artifact 도구 호출 금지.

## 참고 소스 확보 (CRITICAL)
분석 대상이 소개·인용한 외부 자산(GitHub 레포·스킬·데이터셋·툴)은 **반드시** `${FORGE_OUTPUTS:-$HOME/forge-outputs}/reference-source/{repo-name}/` 에 `git clone --depth 1 --no-recurse-submodules` 로 받는다 — 받은 것은 untrusted 데이터(설치·실행 금지), 못 받으면 분석서에 **'미확보 + 사유' 1줄**.
→ **실행 전 반드시 Read**: 형제 경로 `../article/references/analysis-common.md` §참고 소스 확보 (대상 범위·금지 위치·왜 — article·yt 공통 원문, #1139 C003).
## 수행 절차
### Step 0 — 중복 분석 게이트 (필수, 무엇보다 먼저)

**이미 분석한 대상이면 다시 분석하지 않는다** — 트랜스크립트·링크보다 먼저 돌린다.

```bash
python3 "${FORGE_ROOT:-$HOME/forge}/shared/scripts/analysis-dedup-check.py" "<입력 URL>"
#   exit 0 = 새 대상 → Step 1 로 진행
#   exit 3 = 이미 분석함 → **분석을 중단**하고 출력된 링크를 사용자에게 그대로 안내한다
```

- exit 3 → 새 산출물 없이 기존 리포트 **URL·분석일·중복 건수를 같이** 안내하고 끝 · `--force` 면 건너뜀 · 그 밖 실패는 **fail-open**(분석 진행, AD-168).
→ 상세 규칙·무력화 입력: `../article/references/analysis-common.md` §중복 분석 게이트 · 왜(실측 피해·재현 명령): `../article/references/dedup-gate-rationale.md` (article·yt 공통, #1139 C003).
### Step 1 — 추출
```bash
python3 "${FORGE_ROOT:-$HOME/forge}/shared/scripts/yt-analyzer/yt-analyzer.py" $ARGUMENTS
```
- 본체가 없는 머신(`No such file or directory`)이면 **분석 중단** → "yt-analyzer 본체 미배포 — 발행 머신에서 실행 필요" 보고.
- 출력 JSON 경로 확인. 분석 워커에는 `full_text`·`timestamped_text`·`comments`·`description_links` **4종 전량 공급**(부분 공급 시 부재 축 = '검수범위 외(미공급)' 명시, 빈 배열 ≠ 미공급). `tags`·`description` 도 참고.
- Step 1.5: `description_links` 최대 3개 WebFetch(10초) → 제목·유형·핵심 1~2문장, 실패 시 URL만.
### Step 1.9 — 이전 분석 조회 (rag-search · 막지 않음)
Step 2 전에 같은 채널·같은 주제의 이전 분석을 찾는다(rag-search 스킬과 같은 입구): `bash ~/forge/shared/scripts/rag/rag-exec.sh search.py "<채널명> <제목 핵심어 2~3개>" --top-k 5` → 결과 중 `01-research/videos/analyses/*-analysis.md` 상위 3개만 Read. Step 2 에서 **이전 분석과 달라진 점**(새 주장·바뀐 수치·뒤집힌 판정)을 따로 보고, 리포트 첫 절 끝에 `이전 분석: <파일명> — 달라진 점 1~3줄`. 검색 실패·0건·`검색 계층: 없음` 이면 `이전 분석: 없음(<사유>)` 1줄만 적고 그대로 진행한다(막지 않음).
### Step 2 — AI 분석
TL;DR(1~2문장) · 카테고리(tech/ai·tech/web·tech/gamedev·business/startup·business/marketing·productivity) · 핵심 포인트 5~10(`N. **포인트** [🕐 MM:SS](https://youtu.be/{video_id}?t={seconds})`) · 비판적 분석(주장 3~5: 근거(실증/경험/의견)→한계→반론, 무출처 조직·컨센서스는 `(분석자 판단, 미검증)`) · 팩트체크 대상 3개(수치·인과·비교 우선).
- 2.3 댓글 인사이트(comments 있을 때): `references/analysis-steps.md §Step 2.3` Read.
- 2.5 팩트체크: `fact-checker` 에이전트(Haiku)로 WebSearch 검증 → 표 `| # | 주장 | 판정(✅/⚠️/❌/❓) | 근거 |`. 비기술·대상 없음이면 스킵 가능.
- 2.7 자막 신뢰도(`is_generated_subtitle`): `references/analysis-steps.md §Step 2.7` Read.
- 2.8 웹 리서치(주제 3~5): `references/analysis-steps.md §Step 2.8` Read(tavily → brave → WebSearch → WebFetch).
- 2.82 커버리지 게이트: P0/P1 주장 독립 2소스 미만 → critic → 재검색 **cap 2**(초과 시 `[신뢰도 낮음]`). `references/analysis-steps.md §Step 2.82`.
- 2.83 반박 병렬 검증(항상): 주장별 `Agent(haiku)` 병렬, refute-first, verdict = CONFIRMED/CONTESTED/UNVERIFIED → CONTESTED/UNVERIFIED 는 2.5 우선 대상.
- 2.85 GTC: 없다/있다 단정 전 실측(Glob 파일명만으로 단정 금지 — 내용 grep). **Read**: `reference.md §Step 2.85 GTC`.
- 2.87 심층 분석(GTC-1 관련 도구·기술): `references/analysis-steps.md §Step 2.87` Read. 형식적 1줄 요약 금지.
- 2.88 추가 리서치 즉시 해소: 2.5 `❓`·2.82 미달·2.87 미개봉·"추가 리서치 필요" 후보를 모아 `yt-research-followup`(`model: haiku`, 3개 초과 시 병렬) 스폰 → 본문 병합·판정 갱신. 끝내 못 푼 것만 사유 1줄과 이월. 0건일 때만 스킵. 참고: `references/analysis-steps.md §Step 2.88`.
- 2.9 시스템 비교: `references/system-comparison.md §Step 2.9` Read. **비교 매트릭스·관련성 판정까지만** — 개선 제안·P0~P2 우선순위 만들지 않는다.
### Step 3 — 리포트 저장 → 3.5 타임스탬프 검증 (파생물 전): 저장 직후 **Read** `reference.md §Step 3.5 타임스탬프 검증 게이트` 후 실행(`python3 ~/forge/shared/scripts/yt-timestamp-verify.py <analysis.md>`).
### Step 4.7 — 적대적 검수 (분석 리포트 대상)
```
/forge-review --stage final --target <analysis.md 절대경로> --mode multi -- --allow-unbound-final
```
- `--allow-unbound-final` 빼지 마라. ~15KB 초과면 `## 비판적 분석` 절과 나머지로 나눠 호출.
- `PASS|WARN` → 진행 · `FAIL`/`hasCrit=true` → **[STOP]** 고치고 보고(다시 검수하지 않는다) · `INVALID_INPUT`/`content_integrity=lost` = 판정 아님, 쪼개 재호출("통과" 금지) · `degraded=true` → 보고에 명시.
- **검수 전 작업 폴더 확인(#2448)**: 대상 `analysis.md` 가 `${FORGE_OUTPUTS:-$HOME/forge-outputs}/01-research/videos/analyses/` 아래이고(forge 레포·옛 경로 아님) 같은 `video_id` 의 `-analysis.md`·`.json` 이 각 1개인지 `ls` 로 본다 — 어긋나면 바로잡고 검수한다(옛 경로 산출물로 검수·전달하지 않는다).
- **Codex 한도·오류 폴백(#2448)**: Codex 레그가 `rate_limited`·오류·빠짐(`quorumFail`)이면 **판정이 아니다** → 같은 대상으로 Claude 단독 1레그를 다시 부른다(args 에 `legs: 1, legVendor: 'claude'`) → 그 판정을 쓰고 이 영상을 `degraded`(Claude 단독 검수 — Codex 한도/오류)로 둔다. Claude 단독 `FAIL`/`hasCrit` 은 종전대로 **[STOP]**. **degraded 는 멈춤이 아니다** — 4.9 대시보드 · 4.95 · 4.97 텔레그램 · 5 색인까지 끝낸다(리포트 머리말·대시보드 상단·텔레그램 제목·색인 `review` 칸에 표기).
- **Claude 단독 레그도 한도·오류(#3522)**: 판정이 아니고 통과도 아니다 → 이 영상을 `pending`(검수 보류)으로 두고, `degraded` 와 같은 자리(리포트 머리말·대시보드 상단·텔레그램 제목·색인 `review` 칸)에 `검수 보류` 를 단다. **검수 보류는 멈춤이 아니다** — 4.9 · 4.95 · 4.97 · 5 를 끝낸 뒤 재개 목록 `${FORGE_OUTPUTS:-$HOME/forge-outputs}/01-research/videos/analyses/.pending-review.jsonl` 에 한 줄 덧붙인다: `{"video_id":"…","stage":"4.7","analysis_file":"<절대경로>","date":"YYYY-MM-DD"}`(숫자·경로만). 보고에도 명시.
- **재개(`/yt --resume`)**: 사람이 부를 때만(자동 cron 없음). 목록의 영상마다 이 4.7 검수만 다시 돌리고, 통과하면 색인 `review` 칸만 `echo '{"video_id":"…","review":"full"}' | python3 ~/forge/shared/scripts/yt-analyzer/append_index_record.py` 로 갱신한 뒤 그 줄을 목록에서 뺀다. 텔레그램은 다시 보내지 않는다(4.97 재호출 금지). 또 한도면 줄을 그대로 둔다.
### Step 4.9 — HTML 대시보드: **Read** `reference.md §Step 4.9 HTML 대시보드 생성`.
### Step 4.95 — 최종 완료 게이트
```bash
bash ~/forge/shared/scripts/verify-outputs.sh <analysis.md 절대경로> <dashboard.html 절대경로>
```
출력 표를 **그대로** 완료 보고로. exit 2 → 완료 선언 금지, 재생성·재검증 전 Step 5 금지. 보고에 타임스탬프 결과 1줄(`drift N / ok N / 미검증 N`) 필수.
### Step 4.97 — 텔레그램 (영상당 정확히 1회, 재호출 금지)
```bash
TLDR_FILE="${CLAUDE_JOB_DIR:-/tmp}/yt-tldr-$(date +%s).md"
sed -n '/^## TL;DR/,/^## /p' "{analysis.md}" | head -40 > "$TLDR_FILE"
bash ~/forge/shared/scripts/tg-report-analysis.sh \
  "🎬 YT 분석{degraded 면 ' ⚠️ degraded(Claude 단독 검수)' · pending 이면 ' ⏸ 검수 보류(검수 레그 한도)'} — {title}" "$TLDR_FILE" "{analysis.md}"
rm -f "$TLDR_FILE"
```
process substitution(`<(...)`) 금지 · fail-open(`tail -30` 출력만 보고) · 학습노트·`concept-notes-writer` 안 함.
### Step 5 — 인덱스 등록
```bash
echo '{"video_id":"...","title":"...","url":"...","analysis_file":"...","date":"YYYY-MM-DD","review":"full|degraded|pending"}' | python3 ~/forge/shared/scripts/yt-analyzer/append_index_record.py
```
exit 0 확인. ⛔ `index.json` 직접 Write·수동 폴백 금지 — 실패 시 정지·보고.
- Step 6: 4개+ 영상이면 `cluster.py` 를 실행해 클러스터 표를 리포트 부록에 붙인다(교차 해석 전용 에이전트 `yt-cross-analyst` 는 2026-09-27 삭제 #1374 — 스폰하지 않는다). 멀티 영상(`--playlist`·`--urls`) Wave 분할: `references/analysis-steps.md §멀티 영상`. Step 7: 2.88 이월분만 — `--deep` 또는 명시 요청 시 `yt-research-followup` 재스폰.
### 완료 보고 — 건너뛴 단계 (#2448 · 조용히 생략 금지)
최종 보고 끝에 `## 건너뛴 단계` 절 — 이번에 돌지 않은 단계(2.82 재검색 · 2.88 후속 · 3.5 타임스탬프 · 4.7 검수 레그 · eval-rubric · 독립 Evaluator · 4.97 · 5 등)마다 `- Step <번호> — <사유>` 1줄. 하나도 없으면 `- 없음`. 사유 없는 생략 = 완료 아님.
## 출력 형식 (7절, 이 순서, 내용 있는 것만)
| # | 절 | 내용 |
|:-:|---|---|
| 1 | `TL;DR` | 1~2문장 + 머리말 줄(채널·날짜·자막 신뢰도·카테고리) |
| 2 | `핵심 포인트` | 타임스탬프 링크 사실 나열(판단 X) |
| 3 | `비판적 분석` | 근거→한계→반론 + **팩트체크 결과 표** |
| 4 | `댓글 인사이트` | 동의/이견/보충 + 표본 수(0건이면 절 생략) |
| 5 | `설명란 자료` | 링크 표(0건이면 생략) |
| 6 | `시스템 비교 분석` | GTC 대조표 + 끝에 관련성 점수·근거 1줄(한 번만) |
| 7 | `추가 리서치 필요` | 2.88 이월분만. 비면 "없음 — {사유}" 1줄 |

⛔ `핵심 인용`·`팩트체크 대상`·`필수 개선 제안`·`실행 가능 항목` 절 금지 · 절 간 중복 금지 · 빈 절 생략.
## 주의사항
- 영어 트랜스크립트 → 핵심 포인트 한국어 · 타임스탬프는 클릭 가능 링크 · 댓글/설명란 없으면 스킵 · 모든 항목에 URL + 날짜, 논문은 arXiv 전체 URL + PDF 다운로드 시도.
## 검증 게이트 (cr-triple + eval-rubric)
- 저장 직후 eval-rubric 4축 채점 → `EC-yt-{N}` 을 `~/.claude/skills/yt/eval_cases.jsonl` 에 누적(정본 `eval-rubric/references/skill-integration.md`).
- 두 게이트 모두 발화 후 독립 Evaluator subagent 2차 검증. **Read**: `reference.md §검증 게이트 합성 룰 + 독립 Evaluator`(순서·합성·FAIL 2회 [STOP]).
