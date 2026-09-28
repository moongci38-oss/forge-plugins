---
description: MAS P0 worker 승인 토큰 발행 — HMAC-SHA256 서명 후 approvals/{task_id}-{nonce}.yaml 저장
group: mas
---

# /approve-worker

> 정본 = `scripts/approve-worker-sign.py`·`approve-worker-verify.py`. 로직 변경은 스크립트에서, command↔skill 두 문서는 동기 유지.

## 사용법

```
/approve-worker {task_id} {worker} {allowed_tools} {target_paths}
```
예: `/approve-worker 2026-05-24-v1-review codex-critic mcp__codex__codex ${FORGE_OUTPUTS:-$HOME/forge-outputs}/13-multiagent/tasks/2026-05-24-v1-review/**`

## Step 1·2·5·6: 선행 조건 — **[STOP] 게이트** (스크립트 1회)

```bash
bash "${FORGE_ROOT:-$HOME/forge}/shared/scripts/approve-worker-preflight.sh"
```

스크립트가 하는 일: secret(`~/.config/forge/orch-token.key`)이 없을 때만 생성(**이미 있으면 절대 덮어쓰지 않는다** — 덮어쓰면 발행된 토큰이 전부 무효) → mode 600 확인 → approvals 폴더 준비 → `multiagent-approval-verify` 훅 등록 확인(`~/.claude/settings.json`) → 만료(1h 초과) 토큰 목록.

출력 키 해석 (종료 0 = 진행 · 1 = 멈춤, 판정 불가도 1 = fail-closed):
- `RESULT=OK` → Step 3 진행. `SECRET=created` 면 최초 생성된 것이다.
- `REASON=secret_mode_not_600` 등 `RESULT=FAIL` → 원인 해결 전 발행 금지.
- `HOOK=missing`·`HOOK=unknown` → **[STOP]** multiagent-approval-verify.sh 미등록 — 이 훅이 없으면 발행한 토큰을 **아무도 검증하지 않는다**(승인 절차가 형식만 남는다). 재등록 후 진행(설정 편집은 Human): ~/.claude/settings.json PreToolUse
- `EXPIRED=<경로>` → 토큰 유효기간 = 1h. 만료분은 재발행 필요.

## Step 3: 토큰 발행

```bash
python3 ~/.claude/skills/approve-worker/scripts/approve-worker-sign.py \
  --task "{task_id}" \
  --worker "{worker}" \
  --tools "{tool1},{tool2}" \
  --paths "{path_glob}"
```

**성공 출력**:
```
[APPROVED] ${FORGE_OUTPUTS:-$HOME/forge-outputs}/.claude/audit/approvals/{task_id}-{nonce}.yaml
  worker=codex-critic nonce=... expires=...
```

## Step 4: 토큰 검증 (선택)

```bash
python3 ~/.claude/skills/approve-worker/scripts/approve-worker-verify.py \
  --task "{task_id}" \
  --nonce "{nonce_from_output}" \
  --worker "{worker}" \
  --tool "{tool_being_used}"
```

## Step 7: Rollback

```bash
mv ~/.claude/skills/approve-worker ~/.claude/skills/_archive/approve-worker-$(date +%Y-%m-%d)  # skill 비활성
shred -u ~/.config/forge/orch-token.key  # secret 폐기 (신규 발행 불가)
# audit log 보존(삭제 금지): ${FORGE_OUTPUTS:-$HOME/forge-outputs}/.claude/audit/approvals/
```

## 보안 (P0 = audit-only)

- HMAC = best-effort. same-UID 모델 = secret 파일 read 가능.
- `PROC_PID_OVERRIDE`: production 환경에서 자동 차단 + audit log 기록.
- P2: OS keychain / seccomp sandbox 도입 후 real-time enforce.
