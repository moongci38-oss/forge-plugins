# /external-harness-sweep

외부 AI 하네스 레포를 Forge와 1:1 전수 대조하여 채택 매트릭스를 생성한다.

## 사용법

```
/external-harness-sweep <url> [--name <slug>] [--seed <path>] [--depth exhaustive]
```

| 인자 | 필수 | 설명 |
|------|------|------|
| `<url>` | ✅ | 외부 레포 git URL (https://github.com/...) |
| `--name <slug>` | 선택 | 레포 식별 slug (없으면 URL 마지막 세그먼트) |
| `--seed <path>` | 선택 | yt/article 1차분석 md 절대경로. 없으면 자동탐지 후 skip |
| `--depth` | 선택 | `exhaustive` 고정 (v1 단일 모드) |

## 예시

```
/external-harness-sweep https://github.com/garrytan/gstack --name gstack
/external-harness-sweep https://github.com/garrytan/gsd --name gsd --seed ${FORGE_OUTPUTS:-$HOME/forge-outputs}/01-research/videos/analyses/gsd-analysis.md
```

## 실행 흐름

```
Workflow({
  script: Bash("cat ~/.claude/skills/external-harness-sweep/workflow.js"),
  args: {
    target_url: "<url>",
    target_name: "<name>",
    seed_path: "<seed 절대경로 or ''>",
  }
})
```

## 산출물

결과를 다음 경로에 저장:
- 채택 매트릭스: `~/forge-outputs/docs/reviews/final/<name>-sweep.json`
- 리포트: `~/forge-outputs/11-platform/reports/<name>-forge-analysis-<YYYY-MM-DD>.md`

## 후속 작업

채택 결정 후 → `/cr-triple` 로 검수 → `docs/planning/active/plans/<date>-<name>-apply-plan.md` 작성
