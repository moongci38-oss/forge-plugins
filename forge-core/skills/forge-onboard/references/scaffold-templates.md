# forge-onboard — Phase 3 스캐폴딩 템플릿

> 출처: forge-onboard/SKILL.md — 2026-07-30 harness-diet structure_split, 무손실 보존.

## §3.1 CLAUDE.md 필수 섹션

**필수 섹션:**
- Project Context (테크 스택, 핵심 기능)
- Quick Start (빌드/실행 명령)
- **핵심정보** (§3.1-C 타입별 템플릿 — 필수 산출)
- Golden Rules (Do's / Don'ts)
- Development Methodology: SDD (Forge Dev 파이프라인 기반)
- Git Workflow (브랜치 전략)
- Key Documents (Forge 파이프라인 참조 포함)

**on-demand 룰 참조 섹션 필수 포함** (Key Documents 아래 추가):
```markdown
## 전역 on-demand 규칙
작업 트리거 시 `$HOME/.claude/rules-on-demand/` 해당 룰 read:
- **아키텍처 설계 / 레이턴시 판단** → `latency-reference.md`
- **웹 검색** → `web-search-policy.md`
- **Handover 작성** → `handover-canon.md`
```

## §3.1-B Brownfield CLAUDE.md autogen — 단계 상세 (1~3)

brownfield 감지 시 "기존 파일이 있으면 Forge 참조만 추가" 규칙 대신 아래 절차를 적용한다 (단계 4 사용자 검토 게이트는 SKILL.md 본문 참조).

1. **기존 코드 스캔** — 아래 항목을 탐색한다.
   - 최상위 파일 구조 (`ls -la`, `find . -maxdepth 2 -type f`)
   - 기존 CLAUDE.md 전문 Read (있으면)
   - `.eslintrc*` / `tsconfig*` / `*.csproj` / `Makefile` 등 컨벤션 파일
   - Phase 0.2 질문 답변 + Phase 0.3 도메인 분석 결과 (있으면)

2. **규칙 추출** — 스캔 결과에서 아래 항목을 추출한다.
   - 실제 사용 중인 tech stack (탐지 우선, 사용자 답변 보완)
   - 코딩 컨벤션 (파일 내 패턴에서 귀납)
   - 건드리면 안 되는 레거시 영역 (Phase 0.2 Q2 기반)
   - 주요 pain point (Phase 0.2 Q1 기반)

3. **CLAUDE.md draft 생성** — 기존 파일이 있으면 병합, 없으면 신규 생성.
   필수 섹션 유지 (§3.1 표준과 동일). 추가로 아래 섹션 포함:
   ```markdown
   ## 레거시 보호 영역 (Brownfield)
   - [건드리면 안 되는 영역 목록 — Phase 0.2 Q2 기반]

   ## 기존 컨벤션
   - [naming/structure 패턴 — Phase 0.2 Q3 + 코드 스캔 기반]

   ## Pain Points
   - [현재 주요 문제 — Phase 0.2 Q1 기반]
   ```

## §3.2 .specify/constitution.md 필수 섹션

프로젝트 헌법. 탐지된 테크 스택 기반으로 스캐폴딩:

**필수 섹션:**
1. 프로젝트 개요
2. 기술 스택
3. 코딩 표준
4. 아키텍처 패턴
5. 테스트 표준
6. SDD 워크플로우

## §3.5 Inspector Reference Sheet — 유형별 초기값 조정

`forge/planning/templates/inspector-reference-template.md`를 `docs/references/inspector-reference.md`에 복사한 뒤 프로젝트 유형에 따라 초기 값을 조정한다:

- **game (Unity/NGUI)**: Canvas Scaler, UIRect anchor, ParticleSystem 섹션 활성
- **game (Unity/UGUI)**: RectTransform, Canvas Scaler, Animator 섹션 활성
- **web (React/Next.js)**: CSS props, design tokens, responsive breakpoints 섹션으로 변환

> 이 시트는 AI-Human 분업의 핵심. AI가 Spec/코드 작성 시 이 시트를 참조하고, Human이 에디터/브라우저에서 교정한 값을 누적한다.
