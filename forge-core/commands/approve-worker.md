---
description: MAS P0 worker 승인 토큰 발행 — HMAC-SHA256 서명 후 approvals/{task_id}-{nonce}.yaml 저장
group: mas
---

# /approve-worker

> **정본(로직 SSoT) = `scripts/approve-worker-sign.py`·`approve-worker-verify.py`.** 이 문서와 나머지 한쪽(command↔skill)은 동일 스크립트를 부르는 호출부다 — 로직 변경은 스크립트에서 하고 두 문서는 동기 유지한다(harness #2 2026-07-30, 파괴적 통합 대신 정본 명시).

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
# 이미 있으면 절대 덮어쓰지 않는다 — 덮어쓰면 발행된 토큰이 전부 무효가 된다.
if [ ! -f ~/.config/forge/orch-token.key ]; then
  python3 -c "import secrets,sys; open(sys.argv[1],'wb').write(secrets.token_bytes(32))" ~/.config/forge/orch-token.key
  chmod 600 ~/.config/forge/orch-token.key
  echo "[OK] orch-token.key 생성"
else
  echo "[SKIP] orch-token.key 이미 존재 — 재생성하지 않음"
fi
```

> 이전 판은 `python3 -c "import secrets; open(os.path.expanduser(...))"` 로 **`os` 를 임포트하지 않은 채 사용**해
> 항상 `NameError` 로 실패했다(2026-08-03 전수조사 commands/CMD-02). 즉 MAS 승인 게이트의
> 시크릿 부트스트랩이 한 번도 성공한 적이 없다. 경로는 셸이 `~` 를 확장해 `sys.argv` 로 넘긴다.

## Step 3: 토큰 발행

```bash
python3 $HOME/.claude/skills/approve-worker/scripts/approve-worker-sign.py \
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
python3 $HOME/.claude/skills/approve-worker/scripts/approve-worker-verify.py \
  --task "{task_id}" \
  --nonce "{nonce_from_output}" \
  --worker "{worker}" \
  --tool "{tool_being_used}"
```

## Step 5: multiagent-approval-verify.sh hook 확인 — **[STOP] 게이트**

```bash
# 이 훅이 없으면 위에서 발행한 토큰을 **아무도 검증하지 않는다** — 승인 절차가 형식만 남는다.
if grep -q "multiagent-approval-verify" $HOME/.claude/settings.json; then
  echo "hook 등록됨 — 토큰 검증이 실제로 걸린다"
else
  echo "[STOP] multiagent-approval-verify.sh 미등록 — 발행한 승인 토큰을 검증하는 주체가 없다."
  echo "       이 상태로 WRITE 권한 워커를 스폰하면 승인 게이트는 **연극**이다."
  echo "       재등록 후 진행하라(설정 편집은 Human): $HOME/.claude/settings.json PreToolUse"
  exit 1
fi
```

> ⚠️ **2026-08-09 실사고**: 훅 감산 작업에서 이 훅을 등록 해제했는데, 종전 Step 5 는 결과를
> `echo` 로 **출력만** 했다. 그래서 "hook 미등록" 한 줄이 찍혀도 절차가 그대로 진행됐다.
> 확인은 했는데 **멈추지 않는 확인은 확인이 아니다** — `exit 1` 로 승격한다.
> approve-worker 를 참조하는 스킬 4종(site-deep-analyze · system-audit ·
> visual-loop)이 모두 이 게이트 위에 서 있다.
> 폐기조건: 토큰 검증 주체가 다른 방식(예: 런타임 권한 시스템)으로 대체되면 이 절을 지운다.

## Step 6: 토큰 만료 처리

토큰 유효기간 = 1h. 만료 후 재발행 필요.

```bash
# 만료된 토큰 정리 (1시간 이상 된 파일)
find ${FORGE_OUTPUTS:-$HOME/forge-outputs}/.claude/audit/approvals -name "*.yaml" -mmin +60 -exec echo "만료: {}" \;
```

## Step 7: Rollback

```bash
# skill 비활성
mv $HOME/.claude/skills/approve-worker $HOME/.claude/skills/_archive/approve-worker-$(date +%Y-%m-%d)

# secret 폐기 (신규 발행 불가)
shred -u ~/.config/forge/orch-token.key

# audit log 보존 (삭제 금지)
# ${FORGE_OUTPUTS:-$HOME/forge-outputs}/.claude/audit/approvals/ = 감사 기록
```

## 보안 (P0 = audit-only)

- HMAC = best-effort. same-UID 모델 = secret 파일 read 가능.
- `PROC_PID_OVERRIDE`: production 환경에서 자동 차단 + audit log 기록.
- P2: OS keychain / seccomp sandbox 도입 후 real-time enforce.
