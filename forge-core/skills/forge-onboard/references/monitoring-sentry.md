# Phase 3.5 — Monitoring 통합 (Sentry) 상세

> `forge-onboard` SKILL.md 의 **Phase 3.5 를 실제로 실행할 때** Read 한다.
> `--no-monitoring` 으로 스킵하는 경우에는 읽을 필요가 없다.
> (2026-08-28 분리 — SKILL.md 500줄 규정 준수. 절차는 한 줄도 바꾸지 않고 그대로 옮겼다.)


에러 모니터링을 자동 통합한다. `--no-monitoring` flag 시 스킵.

### 3.5.1 스택 감지 + SDK 자동 설치

`scripts/monitoring-init.sh <project-path>` 실행. 지원 스택 7종(Next.js/NestJS/Colyseus/React/Node.js/Unity/FastAPI). 미지원 스택 = exit 0 + WARN 출력 (수동 통합 필요).

> 스택별 감지조건·SDK 표 → `reference.md §3.5 Monitoring(Sentry) 스택 감지표` (필요 시 Read)

### 3.5.2 sentry.config 생성

`templates/sentry-config-{stack}.{ts,js,cs,py}` → 프로젝트에 복사. 모든 템플릿에 P-7 빈 DSN 처리(런타임 비활성화, 코드 롤백 없이) 내장.

> 템플릿 언어별 guard 코드 → `reference.md §3.5.2` (필요 시 Read)

### 3.5.3 .env 파일 분리 (P-2 보안)

앱 `.env.example`(런타임 변수만) / `.env.ci.example`(CI secret 전용, 앱 .env 포함 금지)로 분리.

> 파일 내용 예시 → `reference.md §3.5.3` (필요 시 Read)

### 3.5.4 검증

```bash
# 스택 감지 dry-run
bash scripts/monitoring-init.sh --dry-run <project-path>

# SDK 통합 확인
grep -rn "Sentry.init\|initSentry\|sentry_sdk.init" <project-path>/src/ 2>/dev/null | head -3

# .env 분리 확인 (P-2)
grep "SENTRY_DSN" <project-path>/.env.example         # 있어야 함
! grep "SENTRY_AUTH_TOKEN" <project-path>/.env.example # 없어야 함
grep "SENTRY_AUTH_TOKEN" <project-path>/.env.ci.example # 있어야 함
```

Unity는 Editor 실행 없이 manifest.json + SentryInit.cs까지만. 실제 DSN 입력은 Editor TODO.
