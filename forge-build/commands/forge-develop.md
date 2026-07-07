---
description: "prod 머지 후 main→develop 동기화 커맨드"
model: haiku
group: deploy
---

> **⚠️ 실행 모드 확인**: 이 커맨드는 쓰기 모드에서만 정상 동작합니다. Plan mode 감지 시 즉시 [STOP] — "Escape로 plan mode 해제 후 재실행하세요. 내부 [STOP] 게이트가 승인 지점입니다."

# /forge-develop — main → develop 동기화

**방향: main → develop** (prod 머지 후 develop에 main 내용 반영).

`dev-workflow-rules` "main 머지 시 develop도 동기화 유지 (둘 다 최신). develop 방치 금지" 준수.

## 실행 시점

`/forge-release` → prod merge to main 완료 직후 호출.

## 동기화 흐름

```bash
# 1. develop 브랜치로 전환
git checkout develop

# 2. main 최신 내용 반영 (main → develop 방향)
git merge main --no-ff -m "chore: sync main → develop after prod release"

# 3. 동기화 결과 확인
git log --oneline -5
git status
```

## 충돌 발생 시

```bash
# 충돌 파일 확인
git status

# 충돌 해소 후
git add <충돌 파일>
git commit -m "chore: resolve merge conflict — main → develop sync"
```

충돌 해소 불가 시 → [STOP] Human 에스컬레이션

## 완료 확인

```bash
# main과 develop이 동기화됐는지 확인
git rev-list --count main..develop   # 0이면 완전 동기화
git rev-list --count develop..main   # 0이면 완전 동기화
```

양방향 모두 0 → 동기화 완료. develop 방치 상태 아님.

## 다음 단계

동기화 완료 → `/forge-deploy` 흐름 종료 (production-deploy.yml 자동 트리거 확인)
