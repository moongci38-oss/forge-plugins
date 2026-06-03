---
name: image-orchestrate
description: GodBlade AI 이미지 생성 주 진입점. orchestrator.sh + nanobanana-wrapper.py (gpt-image-1 primary, nano-banana fallback) + path-safe-storage.sh + quality-check.py 래핑. Use for: (1) GodBlade game asset 이미지 생성, (2) 카테고리별 AI 이미지 생성 (character/monster/ui/background/effect), (3) /image-orchestrate <category> <name> <description> 호출. SKIP: 비-GodBlade 이미지, 일반 AI 이미지 생성 (/generate-image 사용).
input: category (character|monster|ui|background|effect) + name + description + optional --dry-run
output: ASSETS_ROOT/GraphicResource/AI_Generated/{Category}/{name}-{sha8}.png + cost-log entry
---

# image-orchestrate

GodBlade AI 이미지 생성 오케스트레이터.

## 환경변수 필수

```bash
ORCH_TOKEN=<secret>   # orchestrator.sh HMAC gate
ASSETS_ROOT=/mnt/e/new_workspace/god_Sword/src/client/Assets
```

## 사용법

```bash
# 기본 생성
/image-orchestrate character warrior-01 "armored warrior, sword raised"

# dry-run (경로 검증만, 이미지 생성 X)
/image-orchestrate background forest-01 "enchanted forest" --dry-run
```

## 실행 흐름

1. `ORCH_HMAC=$(echo -n "${ORCH_TOKEN}$(date +%Y%m%d)" | sha256sum | awk '{print $1}')`
2. `ORCH_HMAC=$ORCH_HMAC bash ${FORGE_OUTPUTS:-$HOME/forge-outputs}/11-platform/pipelines/forge-dev/game-image-mvp/orchestrator.sh <category> <name> <description>`
3. wrapper → gpt-image-1 primary / nano-banana fallback
4. path-safe-storage.sh → AI_Generated/{Category}/
5. quality-check.py → PASS/PENDING/REJECT
6. cost-log.jsonl atomic append + chain hash

## Stage 2 negative 기본값

`no text, no watermark, no labels, no overlay text, no brand name, no game title` 자동 포함.

## 경로 구조

```
ASSETS_ROOT/GraphicResource/AI_Generated/
├── Characters/  ← character
├── Monsters/    ← monster
├── UI/          ← ui
├── Backgrounds/ ← background
└── Effects/     ← effect
```

## 자동 평가 (eval-rubric 통합)

본 스킬 이미지 생성 완료 후 quality-check.py 자동 평가 → eval_cases.jsonl 누적.
