# forge-pge — Reference (상세 예시·구현 스크립트·rationale)

> SKILL.md 본문에서 분리된 참고자료. 필요 시에만 Read.

## §Sprint Contract 예시

```yaml
sprint_contract:
  scope: "결제 API /payment/charge 엔드포인트 + 단위 테스트"
  out_of_scope: "환불 API, 결제 이력 조회 (별도 sprint)"
  done_criteria: "단위 테스트 PASS + Stripe sandbox 1회 전송 성공 응답"
  eval_ids:
    - "payment-api:unit-test-pass"
    - "payment-api:stripe-sandbox-response"
    - "payment-api:input-validation"
  rollback_trigger: "민감정보 로그 노출 발견 시 즉시 STOP"
```

## §Phase 5 결정표 Acceptance trace (자기일관성 참조)

**Acceptance trace (결정표 자기일관성 참조 — maxCycles=3 가정)**:
```
C1 eval-record: items=[A:PASS, B:FAIL]      → 게이트G ok / 순위1 무 / 순위2 items[]에 FAIL(B) → SUCCESS 아님 / 순위3 N=1 미도달 → continue(B 접근 변경)
C2 eval-record: items=[A:PASS, B:PASS]      → 게이트G ok(C1도 파싱) / 순위2 전항목 PASS+커버 → SUCCESS ✅
   (대안) C2 items=[B:PASS] (A 소멸)        → 순위3: A가 C1 PASS인데 C2 items 소멸 → re-emit 요청; re-emit PASS면 drift(계속), FAIL/재소멸이면 [STOP] REGRESSION
   (대안) C2 Codex CRITICAL 발견            → 루프가 security_event 라인 append → 순위1 [STOP] SECURITY_CRIT(중단/재개에도 durable)
C3(도달 시) items에 B 3연속 FAIL            → 순위4 SAME_ISSUE & 순위5 max_cycles 동시 → [STOP](메시지=SAME_ISSUE, cap 동시)
```

## §SSoT 단일화 현황 (rationale — same_issue = 실호출 완료, 나머지 = 정직한 경계)

> **SSoT 단일화 현황 (same_issue = 실호출 완료, 나머지 = 정직한 경계)**: 위 결정표는 PGE 전용 구현(자체 JSONL 누적)이되, `/forge-implement`·`/forge-loop-maker`가 공유하는 `loop-kernel.js`(`${FORGE_ROOT:-$HOME/forge}/.claude/skills/forge-loop-maker/scripts/loop-kernel.js` — same_issue/plateau/oscillation/max_cycles 등 8종 stop-condition의 SSoT)와의 관계를 healer.md·forge-implement.md가 이미 정립한 패턴 그대로 이식한다:
> - **same_issue(순위4)**: PGE 메인 컨텍스트도 healer·forge-implement와 동일하게 일반 Bash 프로세스(Workflow 샌드박스 아님)이므로 `checkSameIssue`를 **실제로 import해 호출**한다 — `SAME_ISSUE_MAX` 상수·연속-FAIL 카운팅을 재구현하지 않고 kernel 단일소싱(구현 = 아래 [루프 지시] 4번). kernel 미가용/timeout 시 기존 하드코딩(N-2·N-1·N 3연속 FAIL 비교)으로 즉시 폴백 — 캡 소실 없음.
> - **regression·rubric_all_pass·max_cycles·security_crit**은 kernel과 입력 타입·개념이 달라(kernel의 `checkPlateau`/`checkOscillation`은 numeric score 수열을 보고, PGE는 구조화 id별 PASS/FAIL 커버리지를 본다) 실호출 대상이 아니다 — healer.md가 문서화한 것과 동일한 "정직한 경계" 판단이다. `max_cycles`는 kernel 설계상에서도 "caller가 소유하는 결정론적 1순위 bound"(kernel §1-b)로 명시돼 PGE도 `maxCycles`/`--cycles`를 계속 자체 보유한다. 이 4종은 PGE 고유 결정표(순위1~5)가 그대로 SSoT — drift 우려 시에도 개념이 달라 임계값 대조 자체가 성립하지 않는다.
> 완전 단일화(전 조건 엔진 교체)는 대상이 아니며, 위 경계가 최종 상태다(healer.md/forge-implement.md와 3-way 정합).

## §same_issue kernel 실호출 스크립트 본문 (loop-kernel.js checkSameIssue 호출)

```bash
KERNEL="${FORGE_ROOT:-$HOME/forge}/.claude/skills/forge-loop-maker/scripts/loop-kernel.js"
STATE_FILE="{project_root}/.claude/state/pge-kernel-state.{run_id}.json"   # run_id = 위 §run_id handshake(PGE_SPEC.md) — per-run 격리, 사이클 간 누적
# 사이클 N eval-record의 items[] 중 verdict=FAIL인 id만 findings로 변환
FINDING='[{"id":"<req:chk>","severity":"stop","passed":false,"detail":"cycle N FAIL"}, ...]'

KERNEL_OUT=$(timeout 10 node --input-type=module -e '
const { checkSameIssue } = await import(process.argv[1]);
const issueCounts = JSON.parse(process.argv[2] || "{}");
const findings = JSON.parse(process.argv[3]);
const r = checkSameIssue(findings, issueCounts);
console.log(JSON.stringify({ tripped: r.tripped, key: r.key, count: r.count, issueCounts }));
' "$KERNEL" "$(cat "$STATE_FILE" 2>/dev/null || echo '{}')" "$FINDING" 2>/tmp/pge-kernel-err-{run_id}.log)
KERNEL_RC=$?
if [ "$KERNEL_RC" -eq 0 ] && [ -n "$KERNEL_OUT" ]; then
  echo "$KERNEL_OUT" | jq -c '.issueCounts' > "$STATE_FILE"
fi
```
