---
description: 소규모(≤3파일) 변경을 즉시 실행·커밋하는 fast-path 커맨드
group: ops
---

# /forge-fast

소규모(파일 ≤3개) 변경의 fast-path 실행. 풀 SDD 파이프라인 스킵.

## 트리거 조건 (GATE) — AI-instruction 전용 (기계적 강제 없음)

실행 전 자동 확인:
- 변경 예상 파일 ≤ 3개
- 예상 소요 시간 ≤ 1분 (탐색·설계·연구 없이 즉시 작성 가능)
- 신규 외부 의존성 없음 (no deps)
- 사전 리서치 불필요 (no research) — 모르는 API·라이브러리 도입 시 forge-implement로 에스컬레이션
- 신규 공개 API 없음 (기존 API 내부 수정만)
- 단일 모듈 범위 (cross-module 설계 변경 X)

조건 미충족 → [STOP]: "이 변경은 `/forge-implement` 파이프라인이 필요합니다. 이유: {이유}"

## 실행 흐름

### Step 1. 범위 선언

변경 대상 파일 목록을 명시한 후 진행. 3개 초과 시 자동 중단.

```bash
git diff HEAD --name-only  # 이미 스테이징된 변경 확인
```

### Step 2. 즉시 실행

- 변경 사항 인라인 구현 (외부 에이전트 스폰 없이 직접 편집)
- 연관 테스트 파일 grep 확인 (영향 범위 파악)

### Step 3. 자체 검증

영향 테스트만 실행 (전체 테스트 스킵):

```bash
# 영향 파일 기준 테스트만
npm test -- --testPathPattern="{영향파일키워드}"
# 또는
pytest {영향모듈}/ -x
```

실패 시 → 즉시 수정 후 재검증 1회. 2회 실패 시 → forge-implement로 에스컬레이션.

### Step 4. 원자적 커밋

```bash
git add {변경파일1} {변경파일2}  # 선택적 add (git add -A 금지)
git commit -m "fix|feat|refactor: {1줄 설명} [fast-path]

Co-Authored-By: Claude {실행 모델명} <noreply@anthropic.com>"
```

⚠️ **구 표기 `Co-Authored-By: Claude Sonnet 5` 하드코딩은 2026-09-17 폐기** — 규칙은 "**그 커밋을 만든 모델명**"이다(`forge-core.md §Git`). 모델명을 박아 두면 Opus 가 만든 커밋이 Sonnet 이 만든 것으로 기록돼 커밋 저자 통계가 조용히 오염된다.
폐기조건: 트레일러를 훅이 자동 생성하게 되면 이 블록에서 트레일러 줄을 지운다.

---

## 폐기 후보 (조건부 — 2026-09-17, 삭제는 사람 결정)

**레포 내 실호출 0건 · 이 머신 실행 흔적 0건 실측.**
- 레포 참조 3건뿐: 이 파일 자신 · `.claude/plugin-manifest.json:97` · `rules-on-demand/game-dev-pipeline.md`(⑦언급).
  재현: `grep -rln 'forge-fast' . | grep -v '^./.git/' | grep -v lightrag-wiki-data` → 3파일(2026-09-17 실측)
- 이 커맨드가 Step 5 산출물로 지정한 `.claude/state/fast-path.log` 가 **없다** = 여기까지 실행된 적이 없다.
  재현: `ls ~/forge/.claude/state/fast-path.log` → 없음 · 같은 폴더의 다른 파일 8개는 존재(2026-09-17 실측)

**⚠️ "이 머신에 없다" 는 "아무도 안 쓴다" 가 아니다.** 이 커맨드는 `forge-plugins-repo` 로 **팀원에게 배포 중**이라
다른 머신의 사용 여부를 이 레포에서는 알 수 없다.

**지우기 전 선행조건 4건 (하나라도 미확인이면 폐기 금지)**
1. 팀원 머신 사용 여부 실측(플러그인 배포 중).
2. `forge-plugins-repo` **main** 레인에서 `forge-core/commands/forge-fast.md` + `plugin-manifest.json` 항목을
   **함께** 제거 — develop 머지만으로는 전파되지 않는다.
3. `rules-on-demand/game-dev-pipeline.md` 언급 1건 정리.
4. **대체 경로 명문화** — "≤3파일 변경은 커맨드 없이 직접 처리" 를 적지 않으면 사람들이 게이트 없이 그냥 고치게 된다.

> **이 파일은 삭제하지 않았다.** 손실이 2.4KB 뿐이라 4번이 부담스러우면 "고친다"(위 트레일러 정정)로 남겨도 된다.
> 폐기조건: 위 4건이 끝나고 사람이 삭제를 결정하면 이 파일·플러그인 사본·manifest 항목을 함께 지운다.

`[fast-path]` 태그로 추후 감사 추적.

### Step 5. STATE 로그 (선택)

`.claude/state/fast-path.log` 에 append:

```
{YYYY-MM-DD HH:MM} {slug} files={N} test={PASS|SKIP}
```

## 금지 패턴

- 신규 파일 2개+ 생성 금지 (신규 모듈 → forge-implement 트리거)
- `--no-verify` 사용 금지
- `git add -A` / `git add .` 금지 — 파일별 선택적 add 의무

## 에스컬레이션 조건

다음 중 하나라도 발생 시 forge-fast 중단 → `/forge-implement`:
- 실제 변경 파일이 3개 초과된 것을 발견
- 인접 파일에 cascade 영향 발생
- 테스트 2회 연속 실패
