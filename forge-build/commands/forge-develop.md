---
description: "[DEPRECATED] → /forge-deploy dev --reverse 사용. main → develop 역동기화 위임 래퍼"
model: haiku
group: deploy
---

# /forge-develop — [DEPRECATED 위임 래퍼]

> **이 커맨드는 `/forge-deploy dev --reverse`로 통합되었습니다** (F2 W1, 2026-07-18). 신규 사용은 `/forge-deploy`를 호출하세요. 이 파일은 하위호환 위임 래퍼입니다.

**위임**: `/forge-develop` → **`/forge-deploy dev --reverse`** (방향: main → develop 역머지 + dev env 배포(선언 시))

## 인자 매핑

| 구 forge-develop 동작 | 신 forge-deploy 매핑 |
|----------------------|---------------------|
| main → develop 동기화 | `/forge-deploy dev --reverse` (역머지) |
| (배포 미포함) | dev env 배포 미선언 시 머지만 — 원 동작 보존(GUIDE-STOP는 배포 스텝에만) |

- prod 머지 후 develop 방치 금지(`dev-workflow-rules`) 준수는 `/forge-deploy dev --reverse`가 승계.
- 역머지 충돌 = abort + [STOP] 자동 해소 금지(forge-deploy §역방향 흐름 실패 모드).
- 구 정의는 git 히스토리에 보존.
