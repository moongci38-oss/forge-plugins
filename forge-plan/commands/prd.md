---
description: 제품 요구사항 문서(PRD) 작성 — 아이디어를 입력하면 요구사항 명확화 + PRD 완성본 생성
argument-hint: <제품/기능 아이디어 설명>
allowed-tools: Read, Write, WebSearch, WebFetch, Glob, Grep
model: sonnet
group: plan
---
> **⚠️ 실행 모드 확인**: 이 커맨드는 쓰기 모드에서만 정상 동작합니다. Plan mode 감지 시 즉시 [STOP] — "Escape로 plan mode 해제 후 재실행하세요. 내부 [STOP] 게이트가 승인 지점입니다."


당신은 requirements-clarity와 product-manager-toolkit 스킬을 활용하는 제품 기획 전문가입니다.

## 제품/기능 아이디어
$ARGUMENTS

## 수행 절차

1. **기존 문서 확인**: `02-product/` 폴더에서 관련 기존 기획서나 PRD가 있는지 확인
2. **명확도 평가**: 입력된 아이디어의 요구사항 명확도를 0-100점으로 평가
3. **갭 분석**: 명확도가 90점 미만이면 부족한 영역을 파악하고 구체화 질문 제시
   - 타겟 사용자, 핵심 문제, 성공 지표, 범위, 기술 제약 등
4. **시장 검증**: 웹에서 유사 제품/경쟁사 조사 (출처 URL, 날짜 포함)
4.5. **(Phase 2 skip 시) 5요소 체크리스트 작성**: `gate-log.md`에 페르소나·가치제안·Moat·가격·위험 5요소 각각 = `충족` + 근거 1줄 기록. 1개라도 미충족 → **[STOP]** (Phase 2 진행 권고)
5. **에이전트 회의 (4관점 3라운드) → PRD 초안 작성 (RICE 포함)**:
   - Round 1: 전략가·사용자 옹호자·기술 아키텍트·비판자 독립 초안 (병렬, 앱/웹=4명)
             → 탈락 필터: Phase 2 완료 시 = Don't 태그 위반 초안 탈락 / Phase 2 skip 시 = 4.5의 5요소 체크리스트 미반영 초안 탈락
   - Round 2: 교차 크리틱 — 각 에이전트가 타 관점 반박·보완
   - Round 3: Lead가 수렴 → 최적안으로 PRD 초안 완성 (명확도 90점 이상). **RICE 평가 + "핵심 화면 목록" 섹션 포함** (출력 형식 참조)
   - `agent-meeting-template.md` 형식으로 비교표 작성 + PRD 최상단 "에이전트 회의 결과" 섹션
   - 충돌 해소 불가 → **[STOP]**
   - 산출물: `YYYY-MM-DD-s3-prd.md` (초안 — RICE 포함된 완성본)
6. **[MANDATORY — 건너뛰기 금지] /autoplan 3관점 리뷰**: PRD 초안 완성 직후 반드시 실행.
   - 입력: 단계 5의 PRD 초안 (RICE·핵심 화면 목록 포함)
   - CEO(비즈니스) → Design(UX) → Engineering(기술) 순서로 검토 + 어노테이션(AGREE/WARN/BLOCK)
   - **BLOCK ≥1 → PRD 수정 후 `/autoplan` 재호출** (반복 3회까지). 3회 후에도 BLOCK 잔존 → **[STOP]**
   - BLOCK 0건 → 어노테이션 PRD 반영 후 단계 7로 진행
7. **[BLOCKING] /codex-review --stage plan**:
   - `/codex-review --stage plan --target <YYYY-MM-DD-s3-prd.md 경로> --blocking`
   - 호출 횟수: 최초 1회 + FAIL 시 수정 재호출 최대 2회 (총 3회). 3회 후에도 FAIL → **[STOP]**
   - 결과: `forge-outputs/docs/reviews/plan/{date}-{slug}.{md,json}`
8. **디자인 방향 + 시안**:
   - Human이 방향 정의 (텍스트 서술 또는 참고 URL·이미지)
   - 참고 URL·이미지 제공 시: `/screenshot-analyze` → 스타일 키워드 추출 (URL = https 공개 출처만 / 이미지 ≤10MB, PNG·JPG·WEBP, EXIF 제거, PII·시크릿 금지 → 위반 입력 폐기. 출처·라이선스 = style-guide에 기록)
   - 신규: `/theme-factory` / 기존: `/style-forge` → `YYYY-MM-DD-s3-style-guide.md`
   - `/soul-prompt-craft` (style-guide + 기획서 "핵심 화면 목록") → `YYYY-MM-DD-s3-design-prompt.md`
   - Human: `claude.ai/design`에서 시안 생성 → `s3-mockup/{화면 ID}.{png|fig}` (핵심 화면별 1개 이상, 누락 = [STOP])
     - Claude Design 접근/생성 실패 1회 기록 후 Fallback: Stitch MCP로 목업 export (png/fig만, 코드 산출물 폐기, Human 통보)
   - 검수: `/forge-check-ui` (**blocking** — CRITICAL ≥1 시 `/visual-loop` 1사이클 후 재검수, 최대 2사이클, 이후 잔존 → [STOP])
9. **(Human 요청 시만) PPT 변환**: `/pptx` 스킬로 .pptx 생성
10. **저장**: `forge-outputs/02-product/projects/{project}/YYYY-MM-DD-s3-prd.md` (+ s3-style-guide.md, s3-design-prompt.md, s3-mockup/) 저장

## 출력 형식

```
# {제품/기능명} — PRD
작성일: YYYY-MM-DD
명확도 점수: XX/100
admin_required: true|false        ← 관리자 기능 포함 여부 (Phase 4 게이트가 이 플래그로 s4-admin-detailed-plan.md 필수 여부 판정 — 키워드 grep 아님)

## 0. 에이전트 회의 결과 (4관점 비교표 + 선택 근거)
## 1. 개요 (Overview)
## 2. 문제 정의 (Problem Statement)
## 3. 타겟 사용자 (Target Users)
## 4. 핵심 요구사항 (Core Requirements)
### 4.1 필수 기능 (Must-have)
### 4.2 선호 기능 (Nice-to-have)
## 5. 핵심 화면 목록 (Key Screens)   ← Phase 4 s4-detailed-plan·s4-ui-source/ 검증 기준. 표: 화면 ID(kebab-case 영문, 고유) | 화면명 | 1줄 목적
## 6. 성공 지표 (Success Metrics)
## 7. 기술 제약사항 (Technical Constraints)
## 8. 경쟁 분석 (Competitive Analysis)
## 9. RICE 우선순위 평가
| 항목 | 점수 | 근거 |
## 10. 타임라인 & 마일스톤
## 11. 리스크 & 의존성
## Sources
```
