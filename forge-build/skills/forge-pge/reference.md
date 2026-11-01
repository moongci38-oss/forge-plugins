# forge-pge — Reference (상세 예시)

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
