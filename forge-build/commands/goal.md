---
description: "[DEPRECATED alias] /forge-fix --loop 로 흡수됨 — 자율 PEV 루프 (AD-93 §갭 9, 버그수정 파이프라인 통합 plan v1.1 §5-8/D6)"
group: qa
disable-model-invocation: true
---

# /goal — DEPRECATED alias → `/forge-fix --loop`

> **진입은 `/forge-fix --loop "<종료조건>"` 이다.** `/goal` 의 PEV 루프 기능은 그쪽으로 흡수됐다
> (버그수정 파이프라인 통합 plan v1.1 §2 D6). 이 파일은 진입점 표식으로만 남는다.

```
/forge-fix --loop "scope=auth 모든 시나리오 PASS"
```

- **엔진 설명서**(PEV 동작·종료조건 7종·stop-condition 배선표·FOP 종료조건·Ralph Loop 연동)
  → `rules-on-demand/goal-pev-engine.md`
- **실엔진** → `.claude/skills/qa/scripts/goal-pev.py`(실존 ✓) · 산출물 `docs/qa/goal-loop-state.json` 을
  `.claude/hooks/qa-event-router.sh` 가 소비한다 — 그래서 이 alias 는 **걷어내지 않는다.**

⚠️ **구 구성 2026-09-17 폐기** — 이 파일은 alias 안내문인데 혼자 67줄이었고 그중 55줄이 엔진 설명서였다
(같은 급 alias 인 `spec-write` 17줄·`sdd` 25줄과 대비). **삭제가 아니라 이동이다** — 내용은 위 참조 파일에
한 글자도 바뀌지 않고 전부 있다.
재현: `diff <(sed -n '/^# \/goal — 자율 종료 조건/,$p' .claude/rules-on-demand/goal-pev-engine.md) <(git show <이동 커밋>^:.claude/commands/goal.md | sed -n '13,67p')` → 차이 없음
폐기조건: `/goal` 을 손으로 치는 사람이 없어지고 훅이 `goal-loop-state.json` 을 더는 읽지 않게 되면 이 파일을 지운다.
