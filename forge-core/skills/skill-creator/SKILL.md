---
model: sonnet
name: skill-creator
description: "새 스킬 생성/기존 스킬 수정. 스킬 생성·수정 요청 시 반드시 사용 — SKILL.md 직접작성 금지."
license: Complete terms in LICENSE.txt
---

# Skill Creator

**역할**: 새 스킬을 만들거나 기존 스킬을 고친다 · **컨텍스트**: 사용자의 스킬 요청 + 대상 레포 `.claude/skills/` · **출력**: 게이트를 통과한 `<skill>/SKILL.md`(+ 필요한 `scripts/`·`references/`·`assets/`·`evals/evals.json`)

- 설계 원칙·구조·예시 → `references/principles.md` · 필독 → `${FORGE_ROOT:-$HOME/forge}/.claude/rules-on-demand/skill-writing-principles.md`
- 스크립트 경로 `S="${FORGE_ROOT:-$HOME/forge}/.claude/skills/skill-creator/scripts"`

## 절차 (순서대로 — 명확한 이유 없이는 건너뛰지 않는다)

### Step 1. 구체 예시로 이해
어떤 요청이 이 스킬을 불러야 하는지 예시를 받거나 만들어 사용자 확인을 받는다. 한 메시지에 질문을 몰지 않는다. 사용법이 이미 분명하면 건너뛴다.

### Step 2. 재사용 자원 계획
예시마다 "처음부터 하면 무엇을 매번 다시 하나"를 보고 `scripts/`(매번 다시 쓰는 코드·결정론 작업) · `references/`(매번 다시 찾는 스키마·문서) · `assets/`(출력에 쓰는 템플릿) 목록을 정한다. 예시 → `references/principles.md §5`.

### Step 3. 배치 결정 + 초기화
**먼저 전역/로컬을 정한다.** *"두 번째 프로젝트에서도 그대로 쓰이나?"* 예 → 전역(`~/forge/.claude/skills/`, `forge-sync sync` 로 미러·팀원 전파) · 아니오/모르겠다 → 로컬(그 레포 `.claude/skills/`). 전역은 description 이 모든 세션에 상주하고 강등이 승격보다 비싸다 — 애매하면 로컬. 그레이존 5사례·되돌리는 법 → `references/placement-global-vs-local.md`.

이미 있는 스킬을 고치는 경우 이 단계는 건너뛴다. 스캐폴딩 스크립트는 없다 — 손으로 만든다:
```bash
mkdir -p .claude/skills/<skill-name>/{scripts,references,assets}   # Step 2 계획에 있는 하위폴더만
```
```yaml
---
name: <skill-name>
description: "<트리거 조건 + 한 줄 요약 — Claude가 이 필드만 보고 발동 여부를 판단한다>"
---
```
쓰지 않는 예시 파일·빈 폴더는 만들지 않는다.

### Step 4. 자원 구현 + SKILL.md 작성
- 자원(`scripts/`·`references/`·`assets/`)부터 만든다. **추가한 스크립트는 실제로 돌려 본다.**
- `scripts/` 번들·CLI 호출 지시가 있으면 `rules-on-demand/aci-design-guide.md` 체크리스트로 자가 점검(WARN, 차단 아님).
- **frontmatter — 트리거 모드를 먼저 정한다(생략 금지).** 사람이 `/name` 으로 부르는 것 = `disable-model-invocation: true`(상주 0) · Claude 가 자율 발동해야 하는 것만 기본값. 단 다른 스킬·파이프라인이 부르는 스킬엔 붙이지 않는다.
- description = 트리거 중심(쓸 때·SKIP), `<`·`>` 금지, 1024자 이하. 공식 필드만(`input`·`output` 같은 키는 죽은 메타데이터 + quick_validate FAIL). `tools:` 는 SKILL.md 에 넣지 않는다. `---` 는 반드시 1행. 상세 표 → `references/frontmatter.md`.
- 본문 = 매번 필요한 절차만, 명령형. 상단에 `**역할**`·`**컨텍스트**`·`**출력**` 3요소, `## 실패 시 출력` 절. 템플릿·예시·표는 `references/` 로 빼고 "X 할 때만 읽어라"로 가리킨다. 250줄 넘으면 분리.
- `eval_cases.jsonl` 시드 3개(PASS/WARN/FAIL) 권장 — 없으면 quick_validate WARN.

### Step 4.5. evals.json (필수)
`<skill>/evals/evals.json` — `evals` 배열 **최소 3개**(id 1·2·3), 각 항목 `id`·`prompt`(10자 이상)·`expected_output`·`expectations`(3개 이상). 범주: ① happy path ② 경계·edge ③ FAIL/WARN 판정. 형식·네거티브 케이스 → `references/evals-templates.md`.
```bash
python3 ~/forge/shared/scripts/validate-evals.py structure    # PASS 확인 후 다음 단계
```

### Step 4.6. eval-rubric 통합 (조건부 강제)
산출물이 verdict-bearing·다른 스킬 입력·분기 Quality Audit 대상 중 하나면 SKILL.md 끝에 `## 자동 평가 (eval-rubric 통합)` 섹션 의무. 판정·템플릿·예외(`metadata: {eval_cases: off}`) → `references/evals-templates.md`.

### Step 4.7. Adversarial Stress-Test (행동 규율 강제 스킬만)
TDD 준수·검증 요구·보안 체크·완료선언 게이트·리뷰 의무처럼 **규율을 강제하는 스킬**에만. 순수 참조 스킬(API 문서·문법 가이드)은 건너뛴다.
1. **RED** — 스킬 없이 시나리오 실행 → 실패 패턴·합리화 언어 verbatim 기록
2. **GREEN** — 스킬 포함 후 같은 시나리오 → 규칙 준수 확인
3. **REFACTOR** — 새 합리화가 나오면 명시적 반박 추가
전체 사이클 → `writing-skills/testing-skills-with-subagents.md` · 압박 시나리오·반박표 → `references/stress-test.md`. GREEN 확인 후 다음.

### Step 5. 완료 게이트 (필수 — 통과 전 완료 선언 금지)
```bash
bash "$S/skill_gate.sh" <skill-name>     # 지금 있는 레포(워크트리 포함)의 스킬을 잰다
```
quick_validate.py(frontmatter) + skill-lint.py --strict(Pocock 4축)를 돈다. rc 0 = 통과 · rc 1 = FAIL·CRITICAL·HIGH → 고치고 다시 · rc 2 = 사용법/스킬 없음. 출력 첫 줄 `대상 루트:` 가 맞는 레포인지 본다. Forge 스킬은 디렉터리 자체가 결과물이다(.skill zip 없음).

### Step 6. 독립 Evaluator (Wave 2.5)
게이트 rc 0 일 때만 Evaluator subagent 를 띄운다(rc 1 이면 Evaluator 없이 바로 Generator 에 되돌린다). 스폰 템플릿 → `references/evaluator.md`. PASS → 완료 · FAIL → 피드백 반영 1회 재작성 · 재FAIL → **[STOP]** 사용자 에스컬레이션.

### Step 7. 반복
실사용 → 막힌 곳 관찰 → SKILL.md·자원 수정 → Step 5 게이트 재실행.

## 금지
- SKILL.md 를 이 절차 없이 직접 작성하지 않는다.
- README·CHANGELOG·설치 안내 같은 부가 문서를 스킬 폴더에 만들지 않는다.
- 같은 정보를 SKILL.md 와 references 에 중복하지 않는다. reference 는 SKILL.md 에서 한 단계로만 연결한다(100줄 넘으면 목차).
- 근거 없는 Gotchas 항목을 넣지 않는다(실증된 실패 + 증거 링크만).

## 실패 시 출력
게이트 rc 1 이면 스크립트 출력의 FAIL·CRITICAL·HIGH 줄을 그대로 보여 주고 "미완료"로 보고한다. rc 2 면 원인 1줄(사용법·스킬 경로·skill-lint 부재)을 보고하고 멈춘다. Evaluator 재FAIL 이면 피드백 전문과 함께 [STOP].

## 재검토 (분기 GC)
모델 메이저 업데이트·3개월 미사용·오류율 20% 초과 시 keep/simplify/deprecate. 오류율은 지금 "판정 불가"로 적는다(추정 금지). 상세 → `references/review-triggers.md`.
