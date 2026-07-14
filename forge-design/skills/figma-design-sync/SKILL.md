---
name: figma-design-sync
description: Figma file URL을 입력받아 디자인 토큰·메타·스크린샷을 Figma MCP로 fetch하고 CLAUDE-DESIGN-PROMPTS.md + ANALYSIS-REPORT.md를 갱신하여 claude.ai/design 결과물 정합도를 향상시킨다. 트리거 — 사용자가 Figma URL과 함께 "디자인 토큰 추출", "claude.ai/design 정합도 fix", "Figma 동기화", "디자인 시스템 갱신"을 요청하거나 `/figma-design-sync` 슬래시 명령으로 호출할 때. Figma MCP rate limit 도달 시 Codex/Gemini Vision PNG 재분석으로 자동 폴백. 입력은 Figma URL + 대상 doc 경로 + 옵션 brand 정정 룰. 산출물은 CLAUDE-DESIGN-PROMPTS.md 토큰 갱신 + figma-export/ANALYSIS-REPORT.md 실측·diff + figma-export/variables.json 원본 + 변경 보고서. eval_cases on.
---

# Figma Design Sync — claude.ai/design 정합도 향상

## 역할

Figma 원본과 claude.ai/design 산출물 간 정합도를 맞추는 동기화 실행자. Figma MCP로 토큰·구조·스크린샷을 fetch해 CLAUDE-DESIGN-PROMPTS.md와 ANALYSIS-REPORT.md를 실측값으로 갱신한다.

## 컨텍스트

사용자가 Figma URL과 함께 "디자인 토큰 추출"/"정합도 fix"/"Figma 동기화"를 요청하거나 `/figma-design-sync`로 호출 시 발동. Figma MCP rate limit 도달 시 Codex/Gemini Vision PNG 재분석으로 자동 폴백한다.

## 목적

claude.ai/design 결과물이 Figma 원본과 안 맞는 문제 해결.

**원인**: 텍스트 프롬프트 한계 (PNG Vision 분석 = 근사값 / spacing·radius 변형 / pixel-perfect X).

**해결**: Figma MCP 직접 fetch → 정확한 토큰·구조 추출 → MD doc 갱신 → claude.ai/design 입력 정합.

## Workflow 통합 (계획서 P2-7)
Figma MCP → rate limit 자동 폴백: Codex Vision(즉시) → Gemini Vision(2차). 폴백 source 명시.
패턴: Fetch(URL파싱+MCP병렬3종) → Fallback(rate limit 시 Codex→Gemini 자동) → Map(토큰매핑+저장) → Update(PROMPTS갱신+브랜드룰).
실행: `Workflow({ script: Bash("cat ~/.claude/skills/figma-design-sync/workflow.js"), args: { figmaUrl, docPath, brandRules, crMode } })`
`CLAUDE_CODE_DISABLE_WORKFLOWS=1` 시 기존 Step 1~9 직접 실행 방식 fallback.

### `--cr` 옵션 (crMode)

Figma MCP rate limit 발생 시 Vision 폴백에서 Codex 사용 여부를 제어한다. caller는 `~/forge/shared/scripts/cr-mode.sh` 조회 후 `args.crMode`로 전달한다.

| 값 | 동작 |
|----|------|
| `on` (기본) | Codex Vision 1차 폴백 → Gemini Vision 2차 (현재 동작) |
| `degrade` | Codex Vision 스킵 → Gemini Vision 직행 |
| `off` | Codex Vision 스킵 → Gemini Vision 직행 |

로그: `[cr] figma Codex Vision fallback skipped (crMode=<value>) → Gemini`

## 트리거 조건

- 사용자가 Figma URL 제공 + 토큰 갱신 의도
- CLAUDE-DESIGN-PROMPTS.md 결과물이 원본과 차이 발견
- 신규 화면 추가로 디자인 시스템 갱신 필요
- 정기 sync (Figma 원본 변경 후)

## 입력

| 항목 | 필수 | 예시 |
|------|:----:|------|
| Figma URL | ✅ | `https://figma.com/design/:fileKey/:fileName?node-id=:int-:int` |
| 대상 doc 경로 | ✅ | `docs/plans/operations-tool/CLAUDE-DESIGN-PROMPTS.md` |
| Brand 정정 룰 | 옵션 | "talkain → Story Beginz (PC-15)" |
| 기존 figma-export/ 경로 | 옵션 | `docs/plans/operations-tool/figma-export/` |

## 워크플로우

### Step 1: URL 파싱

```bash
python3 ~/.claude/skills/figma-design-sync/scripts/parse_figma_url.py "<URL>"
# 출력: {"fileKey": "...", "nodeId": "...", "branchKey": null}
```

검증:
- `node-id` 누락 시 → 사용자에게 node-specific URL 재요청
- 비-Figma URL → 즉시 거절

### Step 2: Figma MCP 호출 (병렬 3종)

단일 메시지 내 병렬 호출:

1. `mcp__claude_ai_Figma__get_variable_defs(fileKey, nodeId)` → 디자인 변수 원본
2. `mcp__claude_ai_Figma__get_metadata(fileKey, nodeId)` → 구조 트리
3. `mcp__claude_ai_Figma__get_screenshot(fileKey, nodeId, maxDimension=2048)` → 시각 reference

### Step 3: Rate Limit 폴백

응답 감지 시 즉시 폴백:
- "Figma MCP tool call limit"
- "Upgrade your seat or plan"
- HTTP 429

**상세 폴백 흐름** = `references/fallback-vision.md` 참조.

3 옵션 (사용자 선택):
- A. 기존 `figma-export/images/` PNG → Codex Vision 재분석 (즉시)
- B. 사용자에게 Figma JSON export 요청
- C. 사용자 새 PNG 1~2장 share

### Step 4: 토큰 매핑

Figma variables → 표준 토큰 변환.

**상세 매핑 규칙** = `references/token-mapping.md` 참조.

핵심 카테고리:
- 컬러 (Primary / Surface / Text / State / Tier)
- 타이포 (Heading / Body / Caption)
- 간격 (4·8·12·16·24·32·48px scale)
- 보더·radius·shadow
- 컴포넌트 패턴 (필터바·테이블·배지·버튼·모달)

### Step 5: `figma-export/variables.json` 저장

원본 Figma variables JSON 직렬화 후 저장:

```
TARGET="docs/plans/{module}/figma-export"
mkdir -p "$TARGET"
# MCP get_variable_defs 응답 그대로 → variables.json
```

### Step 6: ANALYSIS-REPORT.md 갱신

기존 파일 있으면 patch, 없으면 생성.

**필수 섹션**:
- 헤더: 생성/갱신 일자 + Figma file + node-id
- 실측 컬러 팔레트 (표)
- 레이아웃 측정값 (LNB·GNB·main spacing)
- 컴포넌트 패턴 (필터바·테이블·배지)
- **변경 이력** = 이전 토큰 vs 신규 토큰 diff
- 분석 방식 표기: "Figma MCP" 또는 "Vision 분석 (폴백)"

### Step 7: CLAUDE-DESIGN-PROMPTS.md 갱신

`## A. 공통 디자인 시스템` 섹션 → 토큰 부분 patch.

**보존 의무**:
- 기존 컴포넌트 패턴 묘사 (필터바·테이블 등 텍스트 묘사)
- Brand 정정 룰 (예: F7 "Story Beginz 강제, talkain 금지")
- 오타 표준화 (맴버→멤버 등)
- 사용법 안내 (A 블록 + B 모듈 prompt 결합)

**갱신 항목**:
- `# 컬러 토큰 (YYYY-MM-DD Figma 실측값으로 업데이트)` 헤더 일자 갱신
- 색상 HEX 갱신 (변경된 것만)
- 신규 토큰 추가 (이전 미정의 항목)

### Step 8: Brand 정정 룰 적용

옵션 입력된 brand 정정 룰 적용:

| Brand 변환 예 | 적용 위치 |
|-------------|----------|
| `talkain` 텍스트 → `Story Beginz` | CLAUDE-DESIGN-PROMPTS.md 전수 |
| Logo PNG 교체 | assets/ (별 작업) |
| 브랜드 색상 swap | 토큰 매핑 시 |

**ANALYSIS-REPORT.md** 변경 이력에 명시:
```
- 2026-05-28: PC-15 brand 정정 적용 (talkain → Story Beginz)
```

### Step 9: 결과 보고

```markdown
## Figma Design Sync 완료

### 갱신 토큰 (N건)
- Primary: #EC4899 → #D946EF (변경)
- 보더: 변경 없음
- 신규: State/Caution #FB923C

### 분석 방식
- Figma MCP (정확) / Vision 폴백 (근사값)

### 갱신 파일
- {project}/docs/plans/{module}/CLAUDE-DESIGN-PROMPTS.md
- {project}/docs/plans/{module}/figma-export/ANALYSIS-REPORT.md
- {project}/docs/plans/{module}/figma-export/variables.json

### claude.ai/design 사용 추천
1. Design Systems → 기존 시스템 update (토큰 swap)
2. 화면별 prototype 재생성 → 정합도 확인
3. 차이 있으면 specific 화면 PNG share → 추가 sync
```

## 사용 MCP 도구

- Figma MCP: 토큰·변수·스크린샷 fetch (rate-limit 시 Codex/Gemini Vision 폴백)
- `mcp__claude-in-chrome__*`: 동기화 결과 시각 검증(반응형 스크린샷 diff)
- `mcp__gitnexus__*`: 토큰 변경 영향(impact) — `colors_and_type.css` 소비처 추적

## 룰

- **Rate limit 시 즉시 폴백**: 무한 재시도 X. 사용자에게 옵션 제시.
- **Brand 정정 강제**: 정정 룰 doc 명시 시 무조건 적용.
- **Diff 표시 의무**: 기존 vs 신규 토큰 변경분 명시. "변경 없음" 항목도 표기 권장.
- **분석 한계 명시**: Vision 폴백 시 doc 상단에 "근사값" 경고.
- **기존 컴포넌트 패턴 보존**: 컬러 토큰만 swap. 패턴 묘사 + brand 룰은 그대로.
- **사용자 승인 게이트**: 큰 변경 (HEX 5+ 변경) 시 diff 보여주고 confirm 후 적용.

## 산출물

| 파일 | 변경 | 보존 |
|------|------|------|
| `CLAUDE-DESIGN-PROMPTS.md` | 컬러 토큰 + 일자 헤더 | 컴포넌트 패턴 + brand 룰 + 사용법 |
| `figma-export/ANALYSIS-REPORT.md` | 실측 + diff + 변경 이력 | 이전 분석 history |
| `figma-export/variables.json` | Figma 원본 JSON (신규) | — |

## 참조 파일

- `~/.claude/rules-on-demand/claude-design-workflow.md` — claude.ai/design 사용 가이드
- 현 산출물 예시: `starbeginz-origin/docs/plans/operations-tool/CLAUDE-DESIGN-PROMPTS.md`
- `references/fallback-vision.md` — rate limit 폴백 흐름
- `references/token-mapping.md` — Figma → CSS/Tailwind 토큰 매핑

## 자동 평가 (eval-rubric 통합)

본 스킬 결과 산출 후 자동으로 `eval-rubric` 호출 → 4축 Rubric 채점 → `eval_cases.jsonl` 누적.

### 호출 시점

- `CLAUDE-DESIGN-PROMPTS.md` 갱신 완료 후
- `ANALYSIS-REPORT.md` 갱신 완료 후

### 절차

1. 갱신 후: `/eval-rubric --target {갱신 doc 경로}`
2. verdict + 4축 점수 + rationale 수신
3. eval_cases.jsonl append (helper: `~/.claude/scripts/eval-cases-append.py`)
   - case_id: EC-figma-design-sync-{N}
   - split: hash 결정적
   - dedupe: sha256(skill+input)

### 자동 비활성

- `EVAL_RUBRIC_AUTO=off`
- 단순 single-file 변경 시 skip 가능

### 보안

- redaction 정책 자동 적용
- Figma file URL = public read scope (secret X)

> 출처: AD-19 (eval-rubric 시스템 통합)
