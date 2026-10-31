"""git_global.py — `git` 의 전역 옵션(-C·-c·--git-dir …)을 풀어 **실제 대상 폴더**와 하위명령 자리를 찾는 공용 판정.

출처: main-write-guard.sh §0 인라인 파서(#1390 · PR #1393)에서 옮겼다(#2692 할 일 3 첫 조각).
왜 공용인가: 같은 `git -C <폴더>` 풀기를 가드 6개(branch-base-develop · forge-destructive-op-block ·
engine-writer-guard · no-force-push · block-hook-tamper · main-write-guard)가 따로 갖고 있다 —
한쪽만 고치면 그 차이가 곧 구멍이 된다. 지금 부르는 곳은 셋이다(아래 '호출부').
값 옵션 집합도 여기 한 곳이다 — git 은 `--config-env x.y=HOME` 처럼 값을 띄어 받는다. 집합에 없으면 값을 하위명령으로
읽어 `git --config-env x.y=HOME stash` 가 stash 가드를 지나갔다(#3014). 붙인 꼴(`--config-env=…`)은 한 토큰이라 원래 걸렸다.

계약 — parse_git_globals(seg, start=1, value_opts=GIT_GLOBAL_VAL) -> (cdir, idx)
  seg   : 따옴표를 이미 벗긴 토큰 목록(한 명령 조각). seg[start] 가 `git` 바로 뒤 토큰이다.
  cdir  : 마지막 `-C <값>` 의 값 그대로(없으면 None). 여러 -C 는 **마지막 것이 이긴다** — git 은 상대경로
          -C 를 앞 것에 이어 붙이지만 이 판정은 잇지 않는다(옮기기 전 동작 그대로 · 상대경로는 호출부 cwd 기준).
  idx   : 하위명령 토큰 자리. idx >= len(seg) 면 하위명령 없음.
  value_opts 에 든 옵션은 다음 토큰을 값으로 삼킨다(`--git-dir=x` 처럼 붙은 꼴은 한 토큰).
  `--git-dir`·`--work-tree` 는 값만 삼키고 cdir 로 보지 않는다(옮기기 전 동작 그대로).

⚠️ 무력화되는 입력: 폴더를 변수·명령치환으로 가린 꼴(`git -C "$D" …`) — 글자 그대로 돌려줄 뿐 풀지 않는다.
시험: shared/scripts/tests/git-global-lib.test.sh · git-global-space-opts.test.sh(#3014)
호출부: main-write-guard.sh(기본 집합) · forge-destructive-op-block.sh §7(기본 집합) · branch-base-develop.sh(자기 집합 -C·-c)
"""

GIT_GLOBAL_VAL = frozenset({"-C", "-c", "--git-dir", "--work-tree", "--namespace", "--exec-path",
                            "--config-env", "--super-prefix", "--attr-source"})   # 띄운 값을 받는 꼴(#3014)


def parse_git_globals(seg, start=1, value_opts=GIT_GLOBAL_VAL):
    i, cdir = start, None
    while i < len(seg) and seg[i].startswith("-"):
        o = seg[i]
        if o in value_opts:
            if o == "-C" and i + 1 < len(seg):
                cdir = seg[i + 1]
            i += 2
        else:
            i += 1
    return cdir, i
