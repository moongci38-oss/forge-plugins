---
description: "[DEPRECATED] /spec-write + /forge-implement + /qa + /forge-pr 순차 호출 안내"
argument-hint: "<기능 설명> [--spec <path>] [--plan <dir>] [--bulk <path>]"
group: implement
disable-model-invocation: true
---

# /sdd (Deprecated)

AD-46 (2026-05-15): /sdd = 4 독립 명령으로 분해.

권장 사용:
1. /forge-spec <기능 설명>     # Spec 작성 (Human STOP)
2. /forge-implement            # P5 구현 (시나리오 라우팅)
3. /qa                         # E2E 검증
4. /forge-pr                   # PR + cr-final(2벤더 교차) + develop 머지

⚠️ **구 표기 "4. /forge-pr — PR + Codex `/forge-final` + 머지" 는 2026-09-17 폐기** —
현재 정본은 `/cr-triple --stage final` **2벤더 교차**(Claude Opus 5 + Codex)다. 정본 → `model-routing.md §검수 2레그`.

각 단계 [STOP] = 사용자 결정. 묶음 자동 chain X.

⛔ **자동 chain 은 없다 — 스크립트가 미생성이다.**
구 안내 `bash ~/forge/dev/scripts/sdd-legacy-chain.sh <기능 설명>` 은 **존재하지 않는 파일을 시키는 줄**이었다
(AD-46 에서 "미생성, 별도 후속"이라 적어 두고 그대로 방치됐다). 치면 `No such file or directory` 로 끝난다.
재현: `test -e ~/forge/dev/scripts/sdd-legacy-chain.sh` → 실패(2026-09-17 실측).
**만들기 전까지 이 모드는 사용 불가** — 위 4단계를 사람이 순서대로 호출한다.
폐기조건: `sdd-legacy-chain.sh` 가 실제로 생기면 이 경고를 지우고 사용법을 적는다.

---

## 폐기 대기 (2026-09-17 — 삭제는 사람 결정)

**실호출 0건 실측.** 레포 안에서 `/sdd` 를 **실제로 부르는** 커맨드·훅·스크립트·CI 는 없다 —
`forge-spec.md`·`forge-pr.md` 의 "옛 `/sdd` Phase N" 은 **연혁 표기**이지 호출이 아니고, 그 표기는
지운 뒤에도 **남겨도 된다**(링크가 아니다).
재현: `grep -rln '/sdd\b' . | grep -v '^./.git/' | grep -v lightrag-wiki-data` → 12파일(전부 언급, 2026-09-17 실측).

**⚠️ 감사 리포트 정정**: `2026-09-17-cmd-audit-A-devchain.md §4` 는 "manifest 미등재라 플러그인 정리
불필요 ✅" 라고 적었으나 **사실이 아니다** — `.claude/plugin-manifest.json` 에 등재돼 있다. 지울 때
manifest 항목도 **함께** 빼야 하고, 플러그인은 `forge-plugins-repo` **main** 레인이라 develop 머지만으로는
전파되지 않는다.
재현: `grep -n '"sdd' .claude/plugin-manifest.json` → `54:        "sdd.md",`(2026-09-17 실측)

**남은 선행조건 1건**: `rules-on-demand/dev-workflow-detail.md` 의 `/sdd` 표기가 연혁인지 안내인지 판정.

> **이 파일은 삭제하지 않았다** — 죽은 스크립트를 가리키던 줄은 위에서 경고로 바꿨고, 삭제 자체는 사람 결정이다.
> 폐기조건: 사람이 삭제를 결정하면 이 파일과 manifest 항목을 함께 지운다.
