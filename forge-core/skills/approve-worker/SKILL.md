---
name: approve-worker
description: "HMAC 기반 MAS worker 승인 토큰 발행. TTY에서 /approve-worker {task_id} {worker} {allowed_tools} {target_paths} 호출 시 서명토큰 저장. mas P0 approval gate 선행 필수. 트리거: /approve-worker, worker 승인, mas P0 구현 시작 전."
---

# /approve-worker

> **정본(로직 SSoT) = `scripts/approve-worker-sign.py`·`approve-worker-verify.py`.** 이 문서와 나머지 한쪽(command↔skill)은 동일 스크립트를 부르는 호출부다 — 로직 변경은 스크립트에서 하고 두 문서는 동기 유지한다(harness #2 2026-07-30, 파괴적 통합 대신 정본 명시).

MAS P0 worker 스폰 전 사용자 TTY 승인 토큰을 발행한다. `multiagent-approval-verify.sh`가 이 토큰을 검증한다.

## 실행

```bash
python3 $HOME/.claude/skills/approve-worker/scripts/approve-worker-sign.py \
  --task {task_id} \
  --worker {worker} \
  --tools {tool1},{tool2} \
  --paths "{path_glob}"
```

## 보안 경계

- **P0 = audit-only** (best-effort 차단). same-UID 환경 = HMAC 위조 가능성 존재.
- `PROC_PID_OVERRIDE`: CI/FORGE_TEST_MODE 외 환경에서 자동 무효화 + audit log 기록 (CRIT-1 production guard).
- Secret: `~/.config/forge/orch-token.key` (mode 600 강제).

## FR 요약

| FR | 요건 |
|----|------|
| FR-1 | CLI: --task/--worker/--tools/--paths 인자 |
| FR-2 | canonical JSON (RFC 8785 — sorted keys, no space) |
| FR-3 | HMAC-SHA256(secret, canonical_payload) |
| FR-4 | approvals/{task_id}-{nonce}.yaml append-only 저장 |
| FR-5 | 1h 만료 자동 적용 |
| FR-6 | PID lineage 5단계 검증 |
| FR-7 | nonce uuid-v4 발행 (issuer만) |
| FR-8 | verifier-side atomic flock consume |

## acceptance

T-AW1~T-AW6 + T-AW2b + T-AW2c 모두 PASS 의무.  
상세: `${FORGE_OUTPUTS:-$HOME/forge-outputs}/02-product/forge-platform/specs/approve-worker-spec.md §acceptance criteria`

## 관련 파일

- `scripts/approve-worker-sign.py` — HMAC 발행 (FR-1~FR-7 + production guard)
- `scripts/approve-worker-verify.py` — HMAC 검증 + nonce atomic consume (FR-8)
- `${FORGE_ROOT:-$HOME/forge}/.claude/commands/approve-worker.md` — 명령 Step 1~7 (forge 동기화 대상)

<!-- root-cause(skills-1/S1-06, 2026-08-03 관측): 여기 있던 "Evaluator (Wave 2.5)" 절은 8개 SKILL.md에 동일 문구로 복제된 산문이며 실제 Agent()/hook 배선이 0건이었다(role/model/isolation을 설명만 하고 아무것도 실행하지 않음). 독립 검증이 실제로 가치 있는 codex-review·forge-check-security만 실제 Agent() 호출로 승격했고, 나머지는 제거만 했다 — 자세한 판단 근거는 codex-review/SKILL.md의 동일 root-cause 주석 참조. -->
