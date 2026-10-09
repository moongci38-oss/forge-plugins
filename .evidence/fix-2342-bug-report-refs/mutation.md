# mutation — forge#2342 보관된 /bug-report 스킬 참조 (forge-plugins · forge-build 0.4.29)

플러그인 레포에는 테스트 러너가 없어 검사기 = `refs2342.sh`(아래 원문 · 보관된 스킬을 가리키는 꼴의 개수 REFS) + JSON·버전 확인.
임시 워크트리(head 862e844)에서 고친 파일을 하나씩 수정 전(origin/main a1dc6d2) 내용으로 덮었다 — 5개 전부 잡힘 · 되돌린 뒤 변경 0.

## 원자료 (되돌려 FAIL — 실제 출력)

```
## forge-build/skills/healer/SKILL.md 만 수정 전으로 되돌림 → REFS=3 잡힘
## forge-build/commands/forge-fix.md 만 수정 전으로 되돌림 → REFS=1 잡힘
## README.md 만 수정 전으로 되돌림 → REFS=2 잡힘
## forge-build/.claude-plugin/plugin.json 만 되돌림 → 0.4.29 표기 0건 잡힘(green.log 의 버전 줄이 사라진다)
## .claude-plugin/marketplace.json 만 되돌림 → 0.4.29 표기 0건 잡힘(green.log 의 버전 줄이 사라진다)
되돌린 뒤 변경 파일: 0
```

## 검사기 원문 (refs2342.sh)

```bash
#!/usr/bin/env bash
# refs2342.sh <폴더> — 보관된 bug-report 스킬을 가리키는 꼴의 개수(파일명 *bug-report*.md 는 제외 · zip 묶음 healer.skill 제외)
cd "$1" || exit 2
grep -rnoE '/bug-report[ `]|`bug-report` 스킬' --exclude-dir=.git --exclude-dir=.evidence --exclude=*.skill . | sort
echo "REFS=$(grep -rhoE '/bug-report[ `]|`bug-report` 스킬' --exclude-dir=.git --exclude-dir=.evidence --exclude=*.skill . | wc -l | tr -d ' ')"
```

## 자기 적대

1. **`healer.skill`(zip)은 세지 않았다** — #15 이후 안 바뀐 옛 묶음이고 안에 `/bug-report` 2곳이 있다. 다시 묶는 것은 이 PR 범위 밖(PR 남은 위험에 적음).
2. **파일 이름 `*bug-report*.md` 는 참조가 아니다** — 산출물 이름이라 검사 꼴에서 뺐다(`/bug-report` 뒤에 공백·백틱, 또는 `` `bug-report` 스킬 `` 만 센다). 반대로 다른 꼴(예: 줄 끝의 `/bug-report`)로 적힌 참조는 못 본다.
3. **문구 대체는 forge #2357 스테이지와 같은 글자** — 다음 `sync-from-forge` export 가 같은 내용을 덮어도 뜻이 바뀌지 않는다(forge 쪽은 develop 39f29065d 에 머지됨).
