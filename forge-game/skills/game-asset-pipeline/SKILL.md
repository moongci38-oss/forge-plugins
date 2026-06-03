---
name: game-asset-pipeline
description: GodBlade 게임 에셋 5 카테고리 워크플로우 오케스트레이터. /game-asset-pipeline <category> <name> <description> 또는 배치 생성. AI_Generated/{Characters,Monsters,UI,Backgrounds,Effects}/ 경로 자동 라우팅. image-orchestrate 스킬 래핑. Use for: (1) GodBlade 게임 에셋 배치 생성, (2) 카테고리별 에셋 생성·관리, (3) 생성된 에셋 목록 조회. SKIP: 단일 이미지 생성(/image-orchestrate), 비-GodBlade 게임 에셋.
input: category + name + description 또는 batch YAML/JSON
output: AI_Generated/{Category}/ PNG 파일 목록 + cost-log 요약
---

# game-asset-pipeline

GodBlade 게임 에셋 5 카테고리 배치 생성 워크플로우.

## 사용법

```bash
# 단일 에셋
/game-asset-pipeline character warrior-02 "dark knight, axe"

# 현재 생성된 에셋 목록
/game-asset-pipeline --list

# 카테고리별 조회
/game-asset-pipeline --list character
```

## 카테고리 경로

| 카테고리 | 경로 |
|---------|------|
| character | AI_Generated/Characters/ |
| monster | AI_Generated/Monsters/ |
| ui | AI_Generated/UI/ |
| background | AI_Generated/Backgrounds/ |
| effect | AI_Generated/Effects/ |

## --list 실행

```bash
find "$ASSETS_ROOT/GraphicResource/AI_Generated" -name "*.png" \
  -exec ls -la {} \; | awk '{print $5, $9}'
```
