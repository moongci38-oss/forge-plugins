---
description: Forge Dev Check 8.6 UI/UX 품질 검수 — 독립 실행 MAS P1+ (2026-05-25): + Codex Vision 우선 (정확도), Gemini Vision 폴백.
allowed-tools: Bash, Read, Grep, Glob, ToolSearch, mcp__playwright__browser_navigate, mcp__playwright__browser_snapshot, mcp__playwright__browser_take_screenshot, mcp__playwright__browser_resize
model: sonnet
group: verify
---

# /forge-check-ui — UI/UX 품질 게이트

Check 8.6 UI/UX 검증을 독립적으로 실행합니다.

## 실행

1. UI 관련 파일 변경 목록 확인
2. 정적 분석 (U-1~U-5) → `ui-quality-checker` agent 스폰:

```python
Agent(subagent_type="ui-quality-checker",
      prompt="변경 파일 목록: {changed_files}. Spec: {spec_path}. 6축 정적 검증 실행.")
```

3. U-6 Lighthouse/반응형 시각 검증 → 본 커맨드에서 직접 실행 (Playwright MCP 가용 시)
4. 두 결과 합산 → JSON 반환

## 트리거 조건

`.tsx`, `.jsx`, `.vue`, `.css`, `.scss`, `.svg`, `.png` 등 UI 파일 변경 시.
> 실패 시 [[pev-self-correction]] 적용
