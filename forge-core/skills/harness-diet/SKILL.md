---
name: harness-diet
description: "harness-legacy-scan 리포트의 low-risk 항목만 적용: CLAUDE.md 축소/절차→Skill 이동/긴 SKILL.md 분할/description 좁힘/삭제후보 archive. 트리거: /harness-diet"
disable-model-invocation: true
model: sonnet
allowed-tools: Read, Write, Edit, Bash, Glob, Grep
argument-hint: "[--dry-run] [--queue <path-to-diet-queue.json>]"
---

# harness-diet

**역할**: harness-legacy-scan 이 만든 diet-queue.json 을 소비해 `diet_auto=true && risk=low` 항목만 자동 적용한다(medium/high 는 목록 반환 → Human 승인).
**출력**: 7보고 섹션 (변경목록/이유/Before-After/diff요약/Claude행동변화/Human승인목록/smoke-test).

## 쓰지 말아야 할 때

- scan 리포트를 검토하지 않은 상태 → 먼저 `harness-legacy-scan` 실행 + 리포트 확인.
- medium+ 위험 변경 자동 적용 → [STOP] 게이트 필수, Human 승인 후만.
- hook/MCP/allowed-tools 변경 → 본 스킬 수정 불가.
- 앱 코드/test/build/deploy 임의 실행 → 금지.

> **판별 기준**: `${FORGE_ROOT:-$HOME/forge}/.claude/rules-on-demand/skill-writing-principles.md`
> — no-op 테스트(기본 동작 대비 행동을 바꾸는가? 아니면 삭제) · 퇴적(가지치기) vs 비대(progressive disclosure) · 중복 = 단일 원천 위반.

## 허용 7가지

1. **CLAUDE.md 축소** — 중복/일반지침 섹션 제거 (Forge 특화 내용은 유지)
2. **절차 CLAUDE.md→Skills 이동** — 작업전용 워크플로우를 skill 로 분리
3. **긴 SKILL.md 분리** — SKILL.md + reference.md + examples.md
4. **description 좁힘** — "언제 쓰지 말아야 하는지" 섹션 추가
5. **자동호출 Skill 에 negative guard 추가** — "사용하지 말아야 할 때" 섹션 삽입
6. **삭제후보 archive 이동** — 영구삭제 X (복구가능)
7. **변경이유 인라인주석 정리** — 최종요약으로 집약

## 금지 7가지

1. 영구 삭제 (archive 이동만)
2. hooks 수정
3. MCP 설정 수정
4. allowed-tools 확대
5. 앱 코드 수정
6. test/build/deploy 임의 실행
7. 불확실한 변경 자동 적용 → 수동 승인 목록으로 반환

## 경로·안전 규칙

- **편집 SSoT** = `~/forge/.claude/`. `~/.claude/` 직접 편집은 block-forge-mirror-edit hook(exit2)이 차단.
- **archive 경로**: `${FORGE_OUTPUTS:-$HOME/forge-outputs}/11-platform/pipelines/forge-dev/2026-06-08-v1-harness-diet/plans/archive/harness-diet-2026-06-08/` (`.claude/archive/` 사용 금지 — mirror orphan).
- **forge-sync 삭제 미전파 (CRITICAL)**: 스킬 archive 시 SSoT 폴더(`~/forge/.claude/skills/{name}/`) 이동 후 **`~/.claude/skills/{name}` mirror 도 python3 shutil.rmtree 로 반드시 제거**. rollback = archive 에서 복원 후 `node ~/.claude/scripts/forge-sync.mjs sync`.
- **SAFETY carve-out**: effectiveness=SAFETY-DETERRENT 또는 보안키워드(injection/redact/secret/permission/override/block/deny) 자산 → **자동 archive 절대 금지**, Human 승인 필수. 미발동 ≠ 효과 없음.

## 호출

```
Workflow({
  script: Bash("cat ${FORGE_ROOT:-$HOME/forge}/.claude/skills/harness-diet/workflow.js"),
  args: {
    queuePath: "/path/to/diet-queue.json",
    outBase: Bash("echo ${FORGE_OUTPUTS:-$HOME/forge-outputs}")
  }
})
```

> **`outBase` 를 반드시 주입하라.** Workflow 스크립트는 `$HOME` 을 모른다 — 미주입 시 하드코딩 폴백으로 떨어져 다른 PC 에서 archive·리포트 저장이 실패한다.

기본 queuePath: `${FORGE_OUTPUTS}/11-platform/pipelines/forge-dev/2026-06-08-v1-harness-diet/diet-queue.json`
