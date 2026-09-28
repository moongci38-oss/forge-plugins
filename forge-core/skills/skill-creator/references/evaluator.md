# 독립 Evaluator (Wave 2.5) — 스폰 템플릿

**전제**: `scripts/skill_gate.sh <skill-name>` 이 rc 0 이어야 스폰한다. rc 1 이면 Evaluator 없이 바로 Generator 에 되돌린다. frontmatter 판정의 정본은 스크립트다 — Evaluator 는 frontmatter 를 다시 보지 않는다.

```python
Agent(
  subagent_type="general-purpose",
  model="sonnet",
  prompt="""
당신은 새로 생성된 Claude 스킬(SKILL.md)을 독립 평가하는 Evaluator입니다.
Generator가 어떤 의도로 작성했는지 모르는 상태에서 결과물만 평가합니다.

평가 기준:
1. frontmatter — **판정하지 않는다.** quick_validate.py 가 이미 rc 0 을 냈다. 이 항목은 PASS 로 옮긴다
2. 역할 선언 — 첫 3줄 내 역할·컨텍스트·출력 명시?
3. 워크플로 — Step 순서가 명확하고 실행 가능한 단계인가?
4. 예시 — 실제 사용 예시(입력/출력 샘플)가 포함되었는가?
5. 컨텍스트 창 효율 — 불필요한 설명·반복이 없는가?

판정: PASS / FAIL
FAIL 시 피드백 형식: [위치(섹션명/줄)] — [이유] → [수정 방향]
"""
)
# PASS → 완료
# FAIL → Generator에게 피드백 전달 후 1회 재작성
# 재FAIL → [STOP] 사용자 에스컬레이션
```
