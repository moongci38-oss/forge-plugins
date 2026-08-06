# forge-onboard — Reference

> SKILL.md 본문에서 분리된 상세 템플릿·기준표. 해당 Phase 실행 시에만 Read.

## §3.1-C 핵심정보(Project Vitals) 타입별 템플릿

프로젝트 루트 CLAUDE.md에 `## 핵심정보` 섹션을 **반드시** 포함한다. 프로젝트 타입에 따라 아래 템플릿을 사용. 시크릿은 **평문 금지 — 참조 위치만** 기재 (`.env` ref 또는 `<설명>` placeholder).

검증: 생성 후 `bash ${FORGE_ROOT:-$HOME/forge}/shared/scripts/check-vitals-secrets.sh <CLAUDE.md 경로>` (exit 0 = OK, exit 2 = 평문 시크릿 BLOCK).

**dev (web/game/backend):**
```markdown
## 핵심정보

### 실행
- FE: `pnpm dev` (포트 3000) | BE: `pnpm start:dev` (포트 4000)
- DB: host=localhost port=5432 db=<db명> — 자격증명: `.env` 참조
- 외부서비스: <서비스명>=ref:.env#<ENV_VAR>

### 기타
- 환경변수: `.env` (`.env.example` 참조)
```

**grants (정부과제):**
```markdown
## 핵심정보

### 사업 기본
- 사업코드: <코드>
- 소관부처: <부처명>
- 접수포털: <URL>
- 마감: <YYYY-MM-DD> (status: active/closed)

### 서류
- 제출양식 경로: `docs/forms/`
- 평가배점: <배점표 경로 또는 요약>
- 기관자격: <자격 요건 1줄>
```

**research/wiki:**
```markdown
## 핵심정보

### 데이터
- 데이터소스: <소스명/URL>
- 저장규약: `forge-outputs/01-research/<폴더>/`
- RAG context명: <context 식별자>

### 스크립트
- 분석: `<스크립트 절대경로>`
- 인덱싱: `<스크립트 절대경로>`
```

**marketing/ops:**
```markdown
## 핵심정보

### 채널 & 계정
- 채널: <채널명> — 계정 참조: `.env#<VAR>` 또는 `<secret manager ref>`
- KPI 기준: <지표 1줄>

### 모니터링
- 대시보드: <URL 또는 경로>
- 알림: <채널/방법>
```

> grants 전용: `_grant-info.md` / `_agency-profile.md` 존재 시 이 섹션에서 해당 파일 링크로 포인터 연결.
> 예: `- 상세 사업정보: [_grant-info.md](_grant-info.md)`

## §3.3 Agent Teams 소유권 템플릿

**Web (모노레포):**
```markdown
| Role | 담당 | 모델 |
|------|------|------|
| Team Lead | SDD 게이트, Shared 파일 | 현재 세션 |
| Backend | apps/api/src/** | Sonnet 5 |
| Frontend | apps/web/src/** | Sonnet 5 |
```

**Game:**
```markdown
| Role | 담당 | 모델 |
|------|------|------|
| Team Lead | SDD 게이트, 공통 로직 | 현재 세션 |
| Server | server/**, common/** | Sonnet 5 |
| Client | client/Assets/** | Sonnet 5 |
```

## §3.4 verify.sh 템플릿

**Web (Node.js):**
```bash
#!/bin/bash
set -e
pnpm lint
pnpm build
pnpm test
```

**Game (Unity/.NET):**
```bash
#!/bin/bash
set -e
cd common && msbuild *.sln /p:Configuration=Release
cd ../server && msbuild *.sln /p:Configuration=Debug
```

## §3.5 Monitoring(Sentry) 스택 감지표 + 템플릿 상세

### 3.5.1 스택 감지 조건표

| 스택 | 감지 조건 | SDK |
|------|----------|-----|
| Next.js | `package.json` → `next` | `@sentry/nextjs` |
| NestJS | `@nestjs/core` | `@sentry/nestjs` + `@sentry/profiling-node` |
| Colyseus | `colyseus` + NestJS | `@sentry/node` + `@sentry/profiling-node` |
| React | `react` (Next 미존재) | `@sentry/react` |
| Node.js | `package.json` (framework 미감지) | `@sentry/node` |
| Unity | `Assets/` + `ProjectSettings/` | `io.sentry.unity` (UPM manifest) |
| FastAPI | `pyproject.toml` + `fastapi` | `sentry-sdk[fastapi]` |

미지원 스택 = exit 0 + WARN 출력 (수동 통합 필요).

### 3.5.2 sentry.config 생성

`templates/sentry-config-{stack}.{ts,js,cs,py}` → 프로젝트에 복사.

**모든 템플릿에 P-7 빈 DSN 처리 내장** (런타임 비활성화 코드 롤백 없이):
- TS/JS: `if (!process.env.SENTRY_DSN || process.env.SENTRY_ENABLED === 'false') return;`
- Python: `if not os.getenv("SENTRY_DSN") or os.getenv("SENTRY_ENABLED") == "false": return`
- C# (Unity): 환경변수 + `Debug.Log("[Sentry] Disabled")` guard

### 3.5.3 .env 파일 분리 (P-2 보안)

**앱 `.env.example`** (런타임 변수만):
```
SENTRY_DSN=https://your-key@sentry.io/your-project
SENTRY_ENVIRONMENT=development
```

**`.env.ci.example`** (CI secret 전용 — 앱 .env 포함 금지):
```
SENTRY_AUTH_TOKEN=your-auth-token-here
SENTRY_ORG=your-org-slug-here
SENTRY_PROJECT=your-project-slug-here
```

## §6.3 claude-design-prompts.md 전체 템플릿 (web/app)

파일: `forge-outputs/05-design/projects/<project-name>/forge-claude-design-prompts.md`

표준 4-PART 구조:

```markdown
# {ProjectName} — Claude Design 파이프라인 프롬프트

> 작성: {YYYY-MM-DD} · 프로젝트: {project-name}
> 파이프라인: Claude Design (Main) → 레포 통합
> 워크플로우 정본: `$HOME/.claude/rules-on-demand/claude-design-workflow.md`

---

## 0. 연동 개요

1단계 Design System 설정 (1회) → claude.ai/design > Design systems 탭
2단계 페이지별 Prototype 생성   → PART 2 카드별
3단계 프롬프트 입력              → PART 2 각 카드의 [프롬프트] paste
4단계 코드 Export                → Share > Export to code > React + Tailwind (TSX)
5단계 레포 통합                  → 각 카드의 [Output] 경로에 paste

---

## PART 1 — Design System 탭 입력 (프로젝트 1회 설정)

> claude.ai/design > Design systems > Create → 이름 `{ProjectId}-{Track}`

### 색상
| 슬롯 | 값 | 용도 |
|------|-----|------|
| Primary | [TODO] | 주 브랜드 색상 |
| Secondary | [TODO] | 보조 색상 |
| Accent | [TODO] | 강조/CTA |
| Surface | [TODO] | 배경/카드 |
| Danger | [TODO] | 오류/삭제 |

### 폰트
- Family: [TODO] (fallback system sans-serif)
- 스케일: [TODO]

### 간격 / 모서리
- Spacing: 4 또는 8px 기본 스케일
- Radius: [TODO]
- 아이콘: [TODO]
- 컴포넌트: [TODO]

### 톤 / 브랜드
- [TODO]

---

## PART 2 — 페이지별 Prototype 프롬프트

> 각 카드 = 1 Prototype. Project name / Output(레포 경로) / 프롬프트.
> ⚠️ Output 경로 필수 — 누락 시 export 후 배치 불가 (AD-77).

### P1. [TODO: 페이지명]
- **Project name**: `{id}-{page}`
- **Output**: `src/app/{route}/page.tsx`
- **프롬프트**: [TODO]

---

## PART 3 — 검수 / 우선순위 / 차단 항목

### 검수 체크리스트 (매 페이지, export 후)
- [ ] 색상 토큰만 사용 (임의색 X)
- [ ] 폰트 단일 사용
- [ ] 간격 기본 스케일
- [ ] 모서리 일관
- [ ] 반응형 desktop/tablet/mobile
- [ ] 접근성 대비 4.5:1

### 우선순위
1. MVP 필수 페이지
2. 보조 페이지
3. Phase 2+ 보류

### 생성 전 결정 필요 (차단)
- [TODO: 결정 필요 항목]
```

**PRD/GDD에서 색상·폰트 언급 발견 시**: PART 1 자동 추출 후 `[TODO]` 교체.
**없으면**: `[TODO]` placeholder 유지.
