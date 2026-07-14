---
name: harness-legacy-scan
description: "Forge 하네스 읽기전용 레거시 감사: 낡은룰/중복/과대 전역컨텍스트/넓은 Skill/불필요 Hook·MCP/제품중복 분류. 트리거: /harness-legacy-scan"
model: sonnet
allowed-tools: Read, Bash, Glob, Grep, Write
argument-hint: [--scope rules|skills|hooks|all]
---

# harness-legacy-scan

**역할**: Forge 하네스(rules/skills/hooks/agents/commands/CLAUDE.md) 슬림화 전용 읽기전용 감사기.  
**컨텍스트**: `/harness-legacy-scan` 호출 시. 하네스가 비대해졌다고 느낄 때, context-tax 줄이고 싶을 때.  
**출력**: 9섹션 스캔 리포트 + diet-queue.json.

## 쓰지 말아야 할 때

- **전체 AI 시스템 능력 감사** → `system-audit` 사용 (ACHCE 5축 + 3-LLM 감사).  
  본 스킬은 하네스 슬림화(context tax / redundancy / 불필요 자산)만 대상. system-audit과 목적이 다르며 중복 인식하고 있음.
- 실제 파일 수정 / hook·MCP 변경 → 본 스킬은 읽기전용. 수정은 `harness-diet` 사용.
- 긴급 보안 감사 → 보안 훅은 SAFETY-DETERRENT 분류로 보호되나, 별도 보안 리뷰가 더 적합.

## 의도 (§1 전문)

Forge 하네스는 지속적으로 누적된다:
1. 낡은 룰 — 제품 기본기능이 된 지침, 이제 불필요한 워크플로우 규칙
2. 과대 전역 컨텍스트 — rules/에 있지만 invocation마다 쓰이지 않는 내용
3. 넓은 Skill description — "언제 호출하지 말아야 하는지" 경계가 없음
4. 불필요 Hook·MCP — 의도 대비 효과가 없거나 theater에 그치는 Hook
5. 제품 중복 — Claude Code/Codex 자체 기능과 겹치는 룰

본 스킬은 **실측 + 분석 + 반박**까지 수행하고, diet-queue.json을 생성해 `harness-diet`가 소비하게 한다.

## 호출

```
Workflow({
  script: Bash("cat ${FORGE_ROOT:-$HOME/forge}/.claude/skills/harness-legacy-scan/workflow.js"),
  args: { outBase: Bash("echo ${FORGE_OUTPUTS:-$HOME/forge-outputs}") }
})
```

> **`outBase`를 반드시 주입하라.** Workflow 스크립트는 `process` 전역에 접근할 수 없어 `$HOME`을
> 스스로 알 수 없다. 미주입 시 workflow.js의 하드코딩 폴백(작성자 로컬 경로)으로 떨어져
> **다른 PC에서는 리포트 저장이 실패한다.**
