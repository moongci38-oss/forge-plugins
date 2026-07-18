---
description: "[DEPRECATED] → /forge-deploy stg 사용. develop → staging 승격 + 배포 위임 래퍼"
model: haiku
group: deploy
---

# /forge-staging — [DEPRECATED 위임 래퍼]

> **이 커맨드는 `/forge-deploy stg`로 통합되었습니다** (F2 W1, 2026-07-18). 신규 사용은 `/forge-deploy`를 호출하세요. 이 파일은 하위호환 위임 래퍼입니다.

**위임**: `/forge-staging [프로젝트...] [--dry-run]` → **`/forge-deploy stg [프로젝트...] [--dry-run]`**

## 인자 매핑

| 구 forge-staging 인자 | 신 forge-deploy 매핑 |
|----------------------|---------------------|
| `/forge-staging` | `/forge-deploy stg` |
| `/forge-staging --dry-run` | `/forge-deploy stg --dry-run` |
| `--step=<name>` / `--rollback [<ts>]` | deploy-config `method=script` 경로에서 배포 스크립트 인자로 passthrough (forge-deploy Step 4) |

- GATE-1(forge-qa 확인)·deploy-config 어댑터 라우팅·브랜치 승격만 폴백은 모두 `/forge-deploy stg`에 흡수됨.
- 구 정의(F1 어댑터 전문)는 git 히스토리에 보존.
