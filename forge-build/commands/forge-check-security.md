---
description: Forge Dev 보안 검수 (P6 QA Phase 1 T6 연계) — 독립 실행
allowed-tools: Bash, Read, Grep, Glob
model: sonnet
disable-model-invocation: true
group: verify
---

# /forge-check-security — 보안 검수 게이트

보안 검증을 독립 실행합니다 (P6 QA Phase 1 T6 연계).

## 실행

1. `security-gate.md` 프롬프트 로드
2. 프로젝트별 보안 검증 스크립트 실행
3. OWASP Top 10 패턴 매칭
4. 의존성 CVE 스캔
5. 결과를 JSON 형식으로 반환

## 판정 기준

| 레벨 | 조건 | 행동 |
|------|------|------|
| Level 1 | WARN만 | 자동 수정 가능 |
| Level 2 | FAIL 1~2건 | 자동 수정 + 재검증 |
| Level 3 | FAIL 3건+ | [STOP] Human 승인 |
> 실패 시 [[pev-self-correction]] 적용

## Advisor 자문 (advisory-only · non-blocking · Opus)

보안 발견의 심각도·악용 가능성 판정이 경계일 때 `advisor-strategist`(Opus) 조언을 구한다. **advisory-only — 게이트 차단 아님. 미가용·실패 시 기본 흐름 진행(fail-open).**

```
Agent(subagent_type="advisor-strategist", prompt="발견 내용·영향 범위·기존 방어 맥락 3-5줄. 질문: 이 보안 발견의 실제 악용 가능성과 심각도 상향/하향 근거 2-3개는?")
```

- 트리거: Critical/High 판정 경계 또는 N/A 처리 판단 시
- 반환 조언은 참고만 — 최종 판단·실행은 커맨드가 수행.
- **Fable 5 미배선** — Human 수동 에스컬레이션 전용(자동분기는 forge-fix T4 한정). `advisor-model-resolve` 호출 금지.
- 모델 라우팅: 본 커맨드 작업=Sonnet · 탐색=Haiku · advisor/결정=Opus.
