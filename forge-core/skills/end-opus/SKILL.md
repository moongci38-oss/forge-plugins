---
name: end-opus
description: Opus 세션 종료 — 아키텍처 결정·전략 인수인계 + 장기기억 업데이트. 트리거: "전략 세션 종료", "end-opus", ADR 작성 완료 후, Sonnet 큐 handover 생성 시, /end-opus 호출 시.
---

Invoke the `/end-opus` slash command. All logic is defined there.

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
