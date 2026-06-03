---
name: approve-worker
description: "HMAC 기반 MAS worker 승인 토큰 발행 스킬. 사용자 TTY에서 /approve-worker {task_id} {worker} {allowed_tools} {target_paths} 호출 시 HMAC-SHA256 서명 토큰을 ${FORGE_OUTPUTS:-$HOME/forge-outputs}/.claude/audit/approvals/{task_id}-{nonce}.yaml에 저장. mas P0 approval gate 선행 필수. 트리거: /approve-worker, worker 승인, approval token 발행, mas P0 구현 시작 전."
input: task_id worker allowed_tools target_paths (CLI 인자 또는 대화 요청)
output: ${FORGE_OUTPUTS:-$HOME/forge-outputs}/.claude/audit/approvals/{task_id}-{nonce}.yaml (HMAC signed YAML token)
eval_cases: off
---

# /approve-worker

MAS P0 worker 스폰 전 사용자 TTY 승인 토큰을 발행한다. `multiagent-approval-verify.sh`가 이 토큰을 검증한다.

## 실행

```bash
python3 ~/.claude/skills/approve-worker/scripts/approve-worker-sign.py \
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
상세: `${FORGE_OUTPUTS:-$HOME/forge-outputs}/02-product/projects/forge-platform/specs/approve-worker-spec.md §acceptance criteria`

## 관련 파일

- `scripts/approve-worker-sign.py` — HMAC 발행 (FR-1~FR-7 + production guard)
- `scripts/approve-worker-verify.py` — HMAC 검증 + nonce atomic consume (FR-8)
- `~/forge/.claude/commands/approve-worker.md` — 명령 Step 1~7 (forge 동기화 대상)

## Evaluator (Wave 2.5)

독립 Evaluator subagent가 산출물 품질을 검증합니다.

```
Evaluator 역할: 산출물 독립 검증
모델: claude-haiku-4-5 (경량, 편향 최소화)
격리: 메인 컨텍스트 오염 방지
```

판정 기준:
- PASS: 모든 핵심 기준 충족, 즉시 사용 가능
- WARN: 사용 가능하나 개선 권장, 사용자 확인 후 진행
- FAIL: 핵심 기준 미충족, 재실행 필요

eval_cases.jsonl에 결과 자동 누적.
