# AD-96-MVP Hook Contract (SSoT)

> 이 표가 HOOKS_ALLOWLIST + settings.json + 각 hook 명세의 단일 진실 원천.
> 변경 시 3 source 동기화 의무.

## MVP 10 Gates + 1 Helper

| Hook ID | 파일 | 종류 | 트리거 이벤트 | settings.json | HOOKS_ALLOWLIST | Input | Output | Fixture |
|---------|------|------|-------------|:---:|:---:|-------|--------|---------|
| H1 | `qa-6w-validate.sh` | gate | Phase D→E (phase-d) / Phase E→F (phase-f) 진입 직전 Bash | - | ✓ | `<plan-path> <phase>` | exit 0/2 | `6w-phase-{d,f}-{complete,missing-*}.md` |
| H2 | `qa-artifact-frontend.sh` | gate | Phase E a4 후 (UI 버그) Bash | - | ✓ | `<artifacts_dir> <bug_N> <phase>` | exit 0/2 | `artifacts-{complete,missing-tablet}/` |
| H3 | `qa-artifact-backend.sh` | gate | Phase E a4 후 (API/DB 버그) Bash | - | ✓ | `<artifacts_dir> <bug_N>` | exit 0/2 | `be-logs-{complete,missing-db}/` |
| H6 | `vision-evaluator-required.sh` | gate | Phase F 진입 직전 (UI) Bash | - | ✓ | `<reviews_dir> <bug_N>` | exit 0/2 | `vision-{pass,fail}.json` |
| H7 | `pixel-diff-gate.sh` | gate | Phase E a4 후 Bash | - | ✓ | `<diff_json>` | exit 0/2 | `pixel-diff-{ok,over}.json` |
| H9 | `healer-log-read-required.sh` | gate | PreToolUse Edit/Write (healer ctx) | Edit\|Write | ✓ | stdin JSON + `CLAUDE_AGENT_OUTPUT` + read-log jsonl | exit 0/2 | `healer-output-{with,without}-readconfirmed.txt` |
| H10 | `bug-fix-plan-schema.sh` | gate | PreToolUse Write `*bug-fix-plan*.md` | Write | ✓ | stdin JSON (file content) | exit 0/2 | `plan-{valid,missing-component}.md` |
| H26 | `scenarios-required.sh` | gate | Phase A→B 전환 Bash | - | ✓ | `<scenarios-path>` | exit 0/2 | `scenarios-{exists,missing}.md` |
| H27 | `scenarios-coverage-8.sh` | gate | Phase B 진입 직전 Bash | - | ✓ | `<scenarios-path>` | exit 0/2 | `scenarios-{8covered,missing-security}.md` |
| H28 | `scenarios-parallel-exec.sh` | gate | Phase B 실행 시작 Bash | - | ✓ | `<scenarios-path> <mode> [spawn-json]` | exit 0/2 | `spawn-{parallel,serial-violation}.json` |
| helper | `healer-read-tracker.sh` | helper | PreToolUse Read (sha256 수집) | Read | ✓ | stdin JSON | exit 0 always | (sha256 read-log jsonl에 append) |

## Cross-reference

- `~/forge/dev/scripts/forge-sync.mjs` HOOKS_ALLOWLIST: 11종 (10 gate + 1 helper)
- `~/.claude/settings.json` PreToolUse: H9(Edit|Write) / H10(Write) / helper(Read)
- `_ad97-pending/`: H4/H5/H8/H11~H25/H29 — AD-97 진입 전 발동 X

## bug-fix-plan.md 필수 필드 (H10 검증)

```yaml
유형: UI/UX | API | DB | 혼합
cross_repo: true | false   # Phase D 자동 감지 (영향 파일 repo root ≥ 2 → true)
Who: ...
What: ...
When: ...
Where: ...
Why_hypothesis: ...        # Phase D 필수 (H1 phase-d gate)
Why_root_cause: 미작성     # healer a4 후 채움 (H1 phase-f gate)
How: |
  재현 단계...
  재현율: N/3
# UI/UX 추가 필수
영향 컴포넌트: <Name>
viewport: [mobile, tablet, desktop]
발견 축: [1-7]
```
