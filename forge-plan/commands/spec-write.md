---
description: Spec 작성 단독 명령 (옛 /sdd Phase 0~2)
argument-hint: "<기능 설명> [--spec <기존 path>] [--plan <plan dir>] [--bulk <forge-context-path>]"
group: plan
---

# /spec-write

Spec 작성 단독 실행. `/sdd` Phase 0~2 분리 명령 (AD-46).

## Iron Law
설계(Spec) 승인 전 코드·scaffold·구현 액션 절대 금지. Spec 작성만.

## Red Flags (무시 금지 — 자기합리화 차단)
| 이런 생각이 들면 | 강제 행동 |
|--------------|---------|
| "기획서 없어도 Spec 바로 쓰자" | Red Flag → Phase 0 전제조건 먼저 |
| "태스크는 추상 설명으로 충분" | Red Flag → §8 실제 코드블록+커밋메시지 |
| "에러 핸들링 추가 라고만 적자" | Red Flag → 실제 try-catch 코드 작성 |

> 출처: Superpowers brainstorming/writing-plans Iron Law (YT af3OJ0L1jEU, 2026-05-21).

## 실행 단계

**Phase 0 — 전제조건 확인**
- 기획서(`s3-prd.md` / `s3-gdd.md`) 존재 확인 + read
- 세부계획서(`s4-development-plan.md`) 존재 확인 + read
- 없으면 exit 1 (전제조건 미충족)

**Phase 1 — 기존 Spec 확인**
- `.specify/specs/` 탐색
- 동일 기능 Spec 존재 시 사용자 확인 [STOP] → 덮어쓰기 or 신규

**Phase 2 — Spec 작성**
- `spec-writer-base` 에이전트 호출
- 인자: `--spec <path>` 기존 Spec 갱신 / `--plan <dir>` 계획서 디렉토리 / `--bulk <path>` 대량 모드
- Spec 저장: `.specify/specs/YYYY-MM-DD-{slug}.md`

**Phase 2.5 — HTML 시각화 옵션 (복잡도 High Spec)**
- 아키텍처 다이어그램·UI 옵션 비교·상태 전이가 포함된 Spec → HTML 병행 생성 제안
- 저장: `.specify/specs/YYYY-MM-DD-{slug}.html` (Markdown은 AI 지침용 SSoT로 유지)
- 단순 Spec(단일 기능·CRUD)은 Markdown만. (근거: HTML 시각화가 복잡 설계 전달에 우월 — YT 분석 2026-05-18)

**[STOP] Human 검토 + 승인**
- Spec 승인 없이 `/forge-implement` 진입 금지 (PHASE7-IRON-1)

## 다음 단계

```
/forge-implement    # Phase 8 구현 (시나리오 라우팅)
```

## Exit 코드

| 코드 | 의미 |
|:---:|------|
| 0 | Spec 작성 완료 + Human 승인 |
| 1 | 전제조건 미충족 (기획서/계획서 없음) |
| 2 | spec-writer 에이전트 실패 |
