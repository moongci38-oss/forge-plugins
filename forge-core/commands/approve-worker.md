---
description: MAS P0 worker 승인 토큰 발행 — HMAC-SHA256 서명 후 approvals/{task_id}-{nonce}.yaml 저장
group: mas
---

# /approve-worker

## 사용법

```
/approve-worker {task_id} {worker} {allowed_tools} {target_paths}
```

**예시**:
```bash
/approve-worker 2026-05-24-v1-review codex-critic mcp__codex__codex ${FORGE_OUTPUTS:-$HOME/forge-outputs}/13-multiagent/tasks/2026-05-24-v1-review/**
```

## Step 1: 선행 조건 확인

```bash
# secret 존재 + mode 600 확인
[ -f ~/.config/forge/orch-token.key ] || { echo "[ERROR] secret 없음 — 생성 필요"; exit 1; }
stat -c %a ~/.config/forge/orch-token.key | grep -q "^600$" || { echo "[ERROR] secret mode != 600"; exit 1; }

# audit 디렉토리 준비
mkdir -p ${FORGE_OUTPUTS:-$HOME/forge-outputs}/.claude/audit/approvals
```

## Step 2: secret 최초 생성 (없는 경우만)

```bash
mkdir -p ~/.config/forge
python3 -c "import secrets; open(os.path.expanduser('~/.config/forge/orch-token.key'),'wb').write(secrets.token_bytes(32))"
chmod 600 ~/.config/forge/orch-token.key
```

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

## Step 5: multiagent-approval-verify.sh hook 확인

```bash
# hook이 settings.json에 등록되었는지 확인
grep -q "multiagent-approval-verify" ~/.claude/settings.json && echo "hook 등록됨" || echo "hook 미등록"
```

## Step 6: 토큰 만료 처리

토큰 유효기간 = 1h. 만료 후 재발행 필요.

```bash
# 만료된 토큰 정리 (1시간 이상 된 파일)
find ${FORGE_OUTPUTS:-$HOME/forge-outputs}/.claude/audit/approvals -name "*.yaml" -mmin +60 -exec echo "만료: {}" \;
```

## Step 7: Rollback

```bash
# skill 비활성
mv ~/.claude/skills/approve-worker ~/.claude/skills/_archive/approve-worker-$(date +%Y-%m-%d)

# secret 폐기 (신규 발행 불가)
shred -u ~/.config/forge/orch-token.key

# audit log 보존 (삭제 금지)
# ${FORGE_OUTPUTS:-$HOME/forge-outputs}/.claude/audit/approvals/ = 감사 기록
```

## 보안 (P0 = audit-only)

- HMAC = best-effort. same-UID 모델 = secret 파일 read 가능.
- `PROC_PID_OVERRIDE`: production 환경에서 자동 차단 + audit log 기록.
- P2: OS keychain / seccomp sandbox 도입 후 real-time enforce.
