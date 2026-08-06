---
name: gamedesign-analyze
description: "Analyze 기획서 원본(pptx/pdf/xlsx/html)을 분석본 markdown으로 변환. Use when: 신규 기획서 전달, 기획서 갱신 후 재추출, 원본↔분석본 대응 깨짐. SKIP: 신규 GDD 창작(gdd-writer), 코드분석, 버그조사(/forge-fix)."
input: 기획서 원본 파일 경로(pptx/pdf/xlsx/html) + 기능 슬러그(gacha/dungeon/town 등)
output: docs/gameDesign/<기능>/analysis/*.md 분석본 + README 인덱스 갱신 + 커밋
---

# gamedesign-analyze — 게임 기획서 분석

기획팀이 준 원본을 **verbatim 보존 분석본(md)**으로 변환하고, 원본↔분석본 1:1 대응을 유지한다.
GodBlade 던전 기획서 4종 분석(2026-07-14)에서 실증된 절차의 표준화.

## 경로 IRON LAW (선행 확인)

프로젝트의 `.claude/rules/gamedesign-docs.md`가 정본. 요지:

```
docs/gameDesign/<기능>/
├── original/   기획팀 원본 (파일명 = 원본명 그대로)
└── analysis/   분석본 md + img/<문서명>/slideNN.png
```

- 다른 경로에 기획 문서 생성 금지 — PreToolUse hook(`gamedesign-path-guard.sh`)이 BLOCK.
- 중복 보관 금지 (`.claude/reference/`·`docs/planning/` 복사 금지).
- Spec·개발계획서·QA 리포트는 기획서가 아님 — 이 스킬 대상 아님.

## Step 1 — 원본 추출 (포맷별)

| 포맷 | 방법 |
|------|------|
| .pptx | **`/pptx` 스킬** 우선. 폴백: pptx=zip → `unzip` 후 `ppt/slides/slide*.xml`의 `<a:t>` 노드 추출 |
| .pdf | **`/pdf` 스킬** 우선. 폴백: `npx -y @opendocsg/pdf2md --inputFolderPath=<dir> --outputFolderPath=<dir>` (⚠️ 폴더 모드만 동작 — 단일 파일 인자 불가. 임시폴더는 `$CLAUDE_JOB_DIR/tmp`) |
| .xlsx | node `xlsx` 패키지 (`sheet_to_json({header:1})`). ⚠️ **헤더 행이 0행이 아닐 수 있음** — `Pattern01` 등 알려진 헤더 문자열로 헤더 행을 탐색 후 파싱. 컬럼명 추측 금지 |
| .html | 직접 Read 후 텍스트화 (가장 쉬움 — pdf와 병존 시 html 우선) |

추출 불능(스캔 이미지 pdf 등) 시 [STOP] 보고 — 임의 요약으로 대체 금지.

## Step 2 — 분석본 작성 규약

파일명: 원본을 식별 가능한 kebab-case (`dungeon-ui-renewal-v0.7.2.md`).

```markdown
---
source: docs/gameDesign/<기능>/original/<원본 파일명>
extracted_date: YYYY-MM-DD
stale_if_source_mtime_after: <원본 mtime epoch> (<사람이 읽는 날짜>)
---

## Slide N        ← pptx/pdf는 슬라이드/페이지 단위 유지
<원문 verbatim>

### Notes:
<발표자 노트 원문 또는 "(없음)">
```

핵심 원칙:
- **원문 verbatim 보존** — 요약·해석·리뷰 지적을 원문 섹션에 섞지 않는다. 해석이 필요하면 문서 말미 별도 섹션(`## 분석 노트`) 또는 별도 파일(`review-findings-*.md`)로 분리.
- 이미지: `analysis/img/<문서명>/slideNN.png` + md 상대링크 `](img/...)`. 텍스트만 추출했으면 frontmatter에 이미지 생략 사실 명시.
- 구버전 재분석 시: 신버전과의 **델타 요약**을 말미에 추가 (예: "0.1→0.2 델타: slide 11~15 3-Step 연출 신규").
- 원본이 재출력본(pdf 재export 등)으로 갱신됐으면: 전문 대조 → 내용 동일 시 frontmatter(`source`/`stale` 기준)만 갱신, 상이 시 본문 갱신 + 차이 보고.

## Step 3 — README 인덱스 등록

`docs/gameDesign/README.md` 인덱스 표에 원본↔분석본 대응 행 추가/갱신 (기존 표 형식 준수). 원본 제거·backup 이관도 표에 상태 표기.

## Step 4 — 검수 (선택, 권장: 시스템·수치 기획서)

`/cr-double` (stage=plan)로 분석본 검수. 알려진 함정:
- 대용량(>100KB) 분석본은 FileLoad 무결성 게이트에 걸림 — 청크 분할 필요.
- **내부 기획서 전문을 외부 LLM API(Gemini 등)로 보내는 것은 안전분류기가 차단할 수 있음** (데이터 반출 판정 선례) — Codex 단독 폴백 허용.
- 리뷰 지적은 분석본(캐시)에 반영하지 않는다 — `review-findings-*.md`로 분리 (verbatim 원칙).

## Step 5 — 커밋

`docs(gameDesign): <기능> <문서> 분석본 (+ 인덱스 갱신)` — 해당 repo 규약 브랜치. 분석 파일만 add (원본 재편 등 타인의 미커밋 변경을 쓸어담지 말 것 — `git add <개별 경로>`).

## 개발 연계 (분석 이후)

- 분석본은 Spec 작성(Phase 7)·구현 브리프의 기획 근거로 인용된다 — **원본이 여러 버전이면 어느 문서가 어느 영역의 정본(SSoT)인지 Human에게 확인**해 frontmatter 또는 README에 기록 (실증: 던전 7.1=UI/UX 기반 / 7.2=시스템 정본 / 0.2=팝업 참고).
- 기획 미확정 항목(수치 부재·"고민 중" 등)은 갭 리스트로 뽑아 Human 확인 큐에 올린다 — 미확정 상태로 Spec에 승계 금지.

## 자동 평가 (eval-rubric 통합)

산출물 저장 직후 자동 eval-rubric 4축 채점 → eval_cases.jsonl 누적. 통합 패턴(절차·holdout·dedupe·비활성·통합효과·보안) 정본 → `eval-rubric/references/skill-integration.md`.

- **target**: 분석본 경로
- **case_id**: `EC-gamedesign-analyze-{N}`
