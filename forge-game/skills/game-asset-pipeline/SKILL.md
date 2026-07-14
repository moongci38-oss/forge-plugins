---
name: game-asset-pipeline
description: "GodBlade 게임 에셋 5개 카테고리 워크플로를 오케스트레이션한다. 게임 에셋을 카테고리 단위로 일괄 생산할 때 사용한다."
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

## 에셋 생성 흐름 (game-asset-generate 경유 필수)

> 직접 `/image-orchestrate` 호출 금지 — 품질 게이트 없는 우회 경로.

```
1. /game-asset-generate {category} {name} {description}
   └─ 내부: image-orchestrate 호출 + 6-axis 크리틱 루프 (상속)
   └─ 크리틱 루프가 PASS 판정한 이미지만 반환

2. 검증 게이트 (generate 반환 후)
   ├─ 카테고리 경로 일치 확인:
   │    반환 경로 ∈ AI_Generated/{대응카테고리}/ → OK
   │    불일치 → 이동 후 경로 재확인
   └─ 크리틱 PASS 여부 확인:
        game-asset-generate가 PASS 반환 → 저장 허용
        FAIL 반환 → [STOP] 크리틱 미통과 에셋 저장 금지

3. 저장 확정
   → AI_Generated/{Category}/{name}.png 저장
   → cost-log 업데이트
```

**라우팅 원칙**: game-asset-generate 경유로 6-axis 크리틱 루프를 상속. 새 품질 검사 로직 직접 구현 금지.
**배치 처리**: 다수 에셋 생성 시 각 에셋을 위 흐름으로 순차 처리. 크리틱 미통과 에셋은 배치에서 제외 + 목록 표시.

## --list 실행

```bash
find "$ASSETS_ROOT/GraphicResource/AI_Generated" -name "*.png" \
  -exec ls -la {} \; | awk '{print $5, $9}'
```
