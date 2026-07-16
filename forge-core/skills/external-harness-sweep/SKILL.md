---
name: external-harness-sweep
description: "Use when performing a full 1:1 source sweep of an external harness/skills repo against Forge to produce an adoption matrix. Triggers on: (1) '외부 레포 전수 대조', (2) '하네스 sweep', (3) 'external sweep [url]', (4) comparing gstack/gsd/superpowers/similar AI harness repos to Forge. Runs 5 phases: Scout(seed detection) → Inventory(full enumerate) → Compare(per-item verdict) → Refute(adversarial verify) → Synthesize(adoption matrix). SKIP when: user only wants a quick summary without source verification, or repo is not an AI harness/skills repo."
---

# external-harness-sweep

외부 AI 하네스 레포를 Forge와 1:1 전수 대조하여 채택 매트릭스를 생성한다. yt/article 1차분석 seed가 있으면 claim 가설로 가속, 없으면 전수 enumerate. 소스 검증은 항상 fresh `git clone --depth 1` (seed 단독 판정 금지).

## 역할

외부 AI 하네스/스킬 레포를 Forge와 1:1 전수 대조해 ADOPT/ADAPT/DEFER/SKIP 채택 매트릭스를 생성하는 감사자. seed(1차 분석) 유무와 무관하게 fresh clone 기반 소스 검증을 강제한다.

## 컨텍스트

"외부 레포 전수 대조"/"하네스 sweep"/"external sweep [url]" 요청 또는 gstack·gsd·superpowers류 하네스와 Forge 비교 시 발동. 5-Phase(Scout→Inventory→Compare→Refute→Synthesize) workflow로 실행되며, 단순 요약만 원하거나 대상이 하네스/스킬 레포가 아니면 SKIP.

## 출력

`docs/reviews/final/<name>-sweep.json`(채택 매트릭스) + `11-platform/reports/<name>-forge-analysis-<date>.md`(종합 리포트) + `docs/planning/active/plans/<date>-<name>-apply-plan.md`(적용 계획서).

## 실행

```
Workflow({
  script: Bash("cat $HOME/.claude/skills/external-harness-sweep/workflow.js"),
  args: {
    target_url: "<외부 레포 git URL>",          // 필수
    target_name: "<slug>",                       // 선택 (없으면 URL 마지막 세그먼트)
    seed_path: "<1차분석 md 절대경로>",           // 선택 (없으면 자동탐지 best-effort)
  }
})
```

## Phase 구조

| Phase | 내용 |
|-------|------|
| 0 Scout | `--seed` 명시 우선 → 자동탐지 → 실패시 skip(정상) |
| 1 Inventory | fresh clone + 전체 항목 enumerate + Forge 자산 인벤토리(parallel) |
| 2 Compare | 항목별 Forge 1:1 소스대조 + ADOPT/ADAPT/DEFER/SKIP 판정(pipeline) |
| 3 Refute | non-SKIP 결정 적대 검증(pipeline 연속) |
| 4 Synthesize | 채택 매트릭스 + 로드맵 + 신규발견 + seed_delta |

## 반환값 구조

```js
{
  target: { name, url, depth },
  seed: { found, source, claims },
  total_items: number,
  all_verdicts: [{ item, mapping, gap, decision, conf, g, f, rh, rn }],
  synthesis: {
    summary, counts, adapt_roadmap,
    notable_new_findings, forge_internal_findings,
    seed_delta, low_conf
  }
}
```

## 산출물 저장 경로 (plan §5 규약)

| 산출물 | 경로 |
|-------|------|
| 채택 매트릭스 JSON | `docs/reviews/final/<name>-sweep.json` |
| 종합 리포트 | `11-platform/reports/<name>-forge-analysis-<date>.md` |
| 적용 계획서 | `docs/planning/active/plans/<date>-<name>-apply-plan.md` |

## 주의

- `depth=claims` = v1 DEFER (exhaustive 단일 모드)
- cr-multi = workflow 외장 (sweep 결과에 별도 `/cr-triple` 호출)
- 채택 결정 후 적용은 내부 패턴 전수 점검 필수 (메모리: "내부 패턴 적용도 동일")

## 자동 평가

스킬 실행 결과는 `eval_cases.jsonl`에 자동 누적 (eval-rubric 통합).

판정 기준:
- **PASS**: synthesis.counts.total > 0, all_verdicts 전항목 decision 있음, seed_delta 존재
- **WARN**: low_conf 항목 > 20%, Inventory items < 5 (레포 구조 이상)
- **FAIL**: Inventory 0건 (clone 실패), synthesis 누락
