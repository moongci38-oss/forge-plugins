---
description: "[DEPRECATED] → /forge-deploy prod 사용. staging → main 프로덕션 릴리스 위임 래퍼"
model: sonnet
group: deploy
---

# /forge-release — [DEPRECATED 위임 래퍼]

> **이 커맨드는 `/forge-deploy prod`로 통합되었습니다** (F2 W1, 2026-07-18). 신규 사용은 `/forge-deploy`를 호출하세요. 이 파일은 하위호환 위임 래퍼입니다.

**위임**: `/forge-release [프로젝트...] [--dry-run]` → **`/forge-deploy prod [프로젝트...] [--dry-run]`**

## 인자 매핑

| 구 forge-release 인자 | 신 forge-deploy 매핑 |
|----------------------|---------------------|
| `/forge-release` | `/forge-deploy prod` |
| `/forge-release --dry-run` | `/forge-deploy prod --dry-run` |

- **IRON 게이트 불변**: staging→main = Release MR 생성까지만(AI), main 머지 = Human 웹 전용, prod 배포 [STOP] bypass 불가 — 모두 `/forge-deploy prod`에 그대로 이관됨(§prod 게이트).
- Codex 적대적 최종 리뷰·advisor 자문·production-deploy 잡별 검증도 흡수됨.
- 구 정의는 git 히스토리에 보존.
