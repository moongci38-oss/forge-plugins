---
description: "[DEPRECATED] /spec-write + /forge-implement + /qa + /forge-pr 순차 호출 안내"
argument-hint: "<기능 설명> [--spec <path>] [--plan <dir>] [--bulk <path>]"
group: implement
---

# /sdd (Deprecated)

AD-46 (2026-05-15): /sdd = 4 독립 명령으로 분해.

권장 사용:
1. /forge-spec <기능 설명>     # Spec 작성 (Human STOP)
2. /forge-implement            # P5 구현 (시나리오 라우팅)
3. /qa                         # E2E 검증
4. /forge-pr                   # PR + Codex /cr-final + 머지

각 단계 [STOP] = 사용자 결정. 묶음 자동 chain X.

기존 /sdd 자동 chain 원하면: bash ${FORGE_ROOT:-$HOME/forge}/dev/scripts/sdd-legacy-chain.sh <기능 설명>
(legacy 스크립트 = 본 AD-46에서 미생성, 별도 후속)
