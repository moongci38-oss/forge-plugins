# mutation — forge-core v0.7.27 (forge#3573)

확인 = plugin.json 훅 참조가 모두 실존 · 옛 두 스킬 폴더 없음 · harness-diet 모드 파일 4/4 (`red.log`·`green.log` 와 같은 검사)

## M1 — 지운 훅 참조 1줄을 되살리면 FAIL
이 가지 사본의 plugin.json SessionStart 에 `hooks/session-placement-advisory.sh` 참조를 다시 넣음 →
`hook refs=5 끊김=['hooks/session-placement-advisory.sh']` · FAIL · rc=1 (green 은 PASS · rc=0).

## 자기 적대 3항목
1. **훅 2개를 빼서 기능이 사라지나?** 두 훅은 forge SSoT 에서 이미 지워졌다 — 플러그인이 없는 파일을 부르면 세션마다 훅 에러가 난다. 빼는 것이 지금 동작과 같다(총괄 결정).
2. **diff 가 큰데(44파일) 이 PR 몫이 맞나?** 대부분 v0.7.26 이후 SSoT 에 쌓인 변경을 `build-plugin` 이 그대로 export 한 것이다. 손으로 고친 것은 plugin.json(훅 2·설명)·marketplace.json(설명·버전)·forge-core/README.md(옛 두 스킬 줄) 세 곳뿐.
3. **버전을 손으로 0.7.27 로 내린 것이 맞나?** build 의 자동 올림은 실행마다 1씩 오른다 — 앞선 관문 FAIL 실행이 이미 한 번 올렸다. develop 의 0.7.26 다음 릴리스 1회라 0.7.27 이 맞다(plugin.json = marketplace 일치 확인).
