---
name: start-sonnet
description: Sonnet 세션 시작 — 구현 컨텍스트 로드. 트리거: "세션 시작", "구현 시작", "start-sonnet", Opus handover 수신 후 구현 착수 시, /start-sonnet 호출 시.
---

Invoke the `/start-sonnet` slash command. All logic is defined there.

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
