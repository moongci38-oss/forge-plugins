# evals.json + eval-rubric 통합 섹션 템플릿

SKILL.md §Step 4.5(evals.json 생성) 및 §신규 스킬 생성 시 eval-rubric 통합 참조용. 요구사항·검증 게이트는 SKILL.md 본문 유지 — 여기는 복사용 템플릿만.

## evals.json 필수 형식

```json
{
  "skill_name": "{skill-name}",
  "evals": [
    {
      "id": 1,
      "prompt": "...스킬 핵심 워크플로우 대표 케이스...",
      "expected_output": "...기대 출력 요약...",
      "expectations": [
        "...검증 포인트 1...",
        "...검증 포인트 2...",
        "...검증 포인트 3..."
      ]
    },
    { "id": 2, "prompt": "...", "expected_output": "...", "expectations": ["...", "...", "..."] },
    { "id": 3, "prompt": "...", "expected_output": "...", "expectations": ["...", "...", "..."] }
  ]
}
```

## 표준 eval-rubric 통합 섹션 (복사·커스터마이즈)

신규 SKILL.md 생성 시 아래 섹션을 스킬별로 커스터마이즈하여 삽입:

```markdown
## 자동 평가 (eval-rubric 통합)

본 스킬 결과 산출 후 자동으로 `eval-rubric` 호출 → 4축 Rubric 채점 → `eval_cases.jsonl` 누적.

### 호출 시점
- {스킬별 핵심 산출물 명시}

### 절차
1. 산출물 저장 후: `/eval-rubric --target {경로}`
2. verdict + 4축 점수 + rationale 수신
3. eval_cases.jsonl append (helper: `~/.claude/skills/eval-rubric/scripts/eval-cases-append.py`)
   - case_id: EC-{skill}-{N} auto-increment
   - split: hash 결정적 (sample 80% / holdout 20%)
   - dedupe: sha256(skill+input)

### 자동 비활성
- `EVAL_RUBRIC_AUTO=off`
- frontmatter `eval_cases: off`

### 보안
- redaction 정책 자동 적용
- secret/PII 의심 시 STOP fail-safe

> 출처: 하네스 백과사전 제5장, AD-19 (2026-05-11)
```

## 네거티브 케이스 (should_trigger: false)

positive eval(스킬이 정상 동작하는가)만으로는 **over-triggering**(스킬이 발동되면 안 되는 상황에서 불필요하게 로드돼 컨텍스트를 낭비하는 문제)을 잡을 수 없다. 각 스킬 evals.json에 **스킬이 발동되면 안 되는 상황**을 최소 1개 네거티브 케이스로 넣는다.

- `should_trigger` 필드: 옵셔널 bool, **기본 true**(positive). 네거티브 케이스만 `false`로 명시.
- 네거티브 프롬프트 = 표면적으로 이 스킬과 유사어를 포함하지만 실제로는 다른 도구/직접 처리가 맞는 요청.
- expected_output = 스킬 비발동 + 올바른 대안 처리 서술.

```json
{
  "id": 4,
  "should_trigger": false,
  "prompt": "...이 스킬이 발동되면 안 되는 상황 (유사어 포함하되 실제로는 불필요)...",
  "expected_output": "...스킬 비발동 + 올바른 대안 처리...",
  "expectations": [
    "이 스킬이 발동되지 않는가?",
    "불필요한 로드/검색으로 컨텍스트를 낭비하지 않는가?",
    "유사 상황과 실제 적용 상황을 구분하는가?"
  ]
}
```

검증(WARN-only, 비차단): `FORGE_EVALS_NEGATIVE_WARN=1 python3 shared/scripts/validate-evals.py structure` — 스킬당 네거티브 케이스가 0개면 WARN 출력(즉시 BLOCK 아님, `FORGE_EVALS_STRICT`와 별도 플래그). over-trigger 실검증(라우터 관측)은 behavioral judge 완료 후 결합.
