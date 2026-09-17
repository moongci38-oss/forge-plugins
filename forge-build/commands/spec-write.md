---
description: "[DEPRECATED alias] /forge-spec으로 이름 변경됨 — Spec 작성 단독 명령"
argument-hint: "<기능 설명> [--spec <기존 path>] [--plan <plan dir>] [--bulk <forge-context-path>]"
group: plan
disable-model-invocation: true
---

# /spec-write (Alias)

이 명령은 `/forge-spec`으로 이름 변경되었습니다. 동일 동작:

```
/forge-spec <기능 설명>
```

모든 인자, 옵션, 동작은 `/forge-spec`과 100% 동일합니다.
기존 인자 예: `/forge-spec "결제 API 연동" --plan planning/active/payment.md`

---

## 폐기 대기 (2026-09-17 — 삭제는 사람 결정)

**실호출 0건 실측.** 레포 안에서 `/spec-write` 를 **실제로 부르는** 커맨드·훅·스크립트·CI 는 없다 —
남은 참조는 전부 ⑦언급(연혁 서술·README·안내문)이다.
재현: `grep -rln '/spec-write' . | grep -v '^./.git/' | grep -v lightrag-wiki-data`
→ 16파일(전부 언급, 2026-09-17 실측). 실행 진입점은 `commands/forge-spec.md` 하나다.

**⚠️ 지우기 전 선행조건 — 미완 2건**
1. `.claude/skills/spec-compliance-checker/SKILL.md` 의 `/spec-write` 2건을 `/forge-spec` 으로 교체.
2. `dev/global-rules/dev-workflow-rules.md`(전역 L1 룰) 의 언급 정리 — **팀 전파 레인 판정이 선행**이다
   (미러 `forge-sync sync` 로만 발효되는 레인이라 SSoT 만 고치면 기존 머신에 도달하지 않는다).

**⚠️ 감사 리포트 정정**: `2026-09-17-cmd-audit-A-devchain.md §4` 는 이 커맨드를 "manifest 미등재라
플러그인 정리 불필요" 라고 적었으나 **사실이 아니다** — `.claude/plugin-manifest.json` 에 등재돼 있다.
지울 때 manifest 항목도 **함께** 빼야 하며, 플러그인은 `forge-plugins-repo` **main** 레인이라
develop 머지만으로는 전파되지 않는다.
재현: `grep -n 'spec-write' .claude/plugin-manifest.json` → `55:        "spec-write.md",`(2026-09-17 실측)

> 비용이 556B 라 급하지 않다. **이 파일은 삭제하지 않았다** — 위 2건 + 사람 결정이 선행이다.
> 폐기조건: 선행 2건이 끝나고 사람이 삭제를 결정하면 이 파일과 manifest 항목을 함께 지운다.
