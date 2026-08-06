---
model: sonnet
name: skill-creator
description: "새 스킬 생성/기존 스킬 수정. 스킬 생성·수정 요청 시 반드시 사용 — SKILL.md 직접작성 금지."
license: Complete terms in LICENSE.txt
---

# Skill Creator

This skill provides guidance for creating effective skills.

## About Skills

Skills are modular, self-contained packages that extend Claude's capabilities by providing
specialized knowledge, workflows, and tools. Think of them as "onboarding guides" for specific
domains or tasks—they transform Claude from a general-purpose agent into a specialized agent
equipped with procedural knowledge that no model can fully possess.

### What Skills Provide

1. Specialized workflows - Multi-step procedures for specific domains
2. Tool integrations - Instructions for working with specific file formats or APIs
3. Domain expertise - Company-specific knowledge, schemas, business logic
4. Bundled resources - Scripts, references, and assets for complex and repetitive tasks

## Core Principles

> **필독 reference**: `${FORGE_ROOT:-$HOME/forge}/.claude/rules-on-demand/skill-writing-principles.md`
> — 예측가능성이 근본 미덕. context load vs cognitive load(`disable-model-invocation` 판단), 정보 계층 사다리,
> description = 분기당 트리거 1개, 선도어(leading word), no-op 테스트, 실패 모드 6종(조기완료·중복·퇴적·비대·no-op·부정).

### Concise is Key

The context window is a public good. Skills share the context window with everything else Claude needs: system prompt, conversation history, other Skills' metadata, and the actual user request.

**Default assumption: Claude is already very smart.** Only add context Claude doesn't already have. Challenge each piece of information: "Does Claude really need this explanation?" and "Does this paragraph justify its token cost?"

Prefer concise examples over verbose explanations.

### Set Appropriate Degrees of Freedom

Match the level of specificity to the task's fragility and variability:

**High freedom (text-based instructions)**: Use when multiple approaches are valid, decisions depend on context, or heuristics guide the approach.

**Medium freedom (pseudocode or scripts with parameters)**: Use when a preferred pattern exists, some variation is acceptable, or configuration affects behavior.

**Low freedom (specific scripts, few parameters)**: Use when operations are fragile and error-prone, consistency is critical, or a specific sequence must be followed.

Think of Claude as exploring a path: a narrow bridge with cliffs needs specific guardrails (low freedom), while an open field allows many routes (high freedom).

### Anatomy of a Skill

Every skill consists of a required SKILL.md file and optional bundled resources:

```
skill-name/
├── SKILL.md (required)
│   ├── YAML frontmatter metadata (required)
│   │   ├── name: (required)
│   │   └── description: (required)
│   └── Markdown instructions (required)
└── Bundled Resources (optional)
    ├── scripts/          - Executable code (Python/Bash/etc.)
    ├── references/       - Documentation intended to be loaded into context as needed
    └── assets/           - Files used in output (templates, icons, fonts, etc.)
```

#### SKILL.md (required)

Every SKILL.md consists of:

- **Frontmatter** (YAML): Contains `name` and `description` fields. These are the only fields that Claude reads to determine when the skill gets used, thus it is very important to be clear and comprehensive in describing what the skill is, and when it should be used.
- **Body** (Markdown): Instructions and guidance for using the skill. Only loaded AFTER the skill triggers (if at all).

#### Bundled Resources (optional)

##### Scripts (`scripts/`)

Executable code (Python/Bash/etc.) for tasks that require deterministic reliability or are repeatedly rewritten.

- **When to include**: When the same code is being rewritten repeatedly or deterministic reliability is needed
- **Example**: `scripts/rotate_pdf.py` for PDF rotation tasks
- **Benefits**: Token efficient, deterministic, may be executed without loading into context
- **Note**: Scripts may still need to be read by Claude for patching or environment-specific adjustments

##### References (`references/`)

Documentation and reference material intended to be loaded as needed into context to inform Claude's process and thinking.

- **When to include**: For documentation that Claude should reference while working
- **Examples**: `references/finance.md` for financial schemas, `references/mnda.md` for company NDA template, `references/policies.md` for company policies, `references/api_docs.md` for API specifications
- **Use cases**: Database schemas, API documentation, domain knowledge, company policies, detailed workflow guides
- **Benefits**: Keeps SKILL.md lean, loaded only when Claude determines it's needed
- **Best practice**: If files are large (>10k words), include grep search patterns in SKILL.md
- **Avoid duplication**: Information should live in either SKILL.md or references files, not both. Prefer references files for detailed information unless it's truly core to the skill—this keeps SKILL.md lean while making information discoverable without hogging the context window. Keep only essential procedural instructions and workflow guidance in SKILL.md; move detailed reference material, schemas, and examples to references files.

##### Assets (`assets/`)

Files not intended to be loaded into context, but rather used within the output Claude produces.

- **When to include**: When the skill needs files that will be used in the final output
- **Examples**: `assets/logo.png` for brand assets, `assets/slides.pptx` for PowerPoint templates, `assets/frontend-template/` for HTML/React boilerplate, `assets/font.ttf` for typography
- **Use cases**: Templates, images, icons, boilerplate code, fonts, sample documents that get copied or modified
- **Benefits**: Separates output resources from documentation, enables Claude to use files without loading them into context

#### What to Not Include in a Skill

A skill should only contain essential files that directly support its functionality. Do NOT create extraneous documentation or auxiliary files, including:

- README.md
- INSTALLATION_GUIDE.md
- QUICK_REFERENCE.md
- CHANGELOG.md
- etc.

The skill should only contain the information needed for an AI agent to do the job at hand. It should not contain auxilary context about the process that went into creating it, setup and testing procedures, user-facing documentation, etc. Creating additional documentation files just adds clutter and confusion.

**Gotchas 섹션 (권장 — 2026-07-16 적용계획 T1-1)**: 운영 이력이 쌓인 스킬은 SKILL.md에 `## Gotchas (흔한 실패 패턴)` 섹션을 두되, **실증된 실패만** 항목당 증거 링크(learnings ID·handover·룰 경위) 의무. 추정·일반론 금지 — 증거 없는 항목은 넣지 않는 게 낫다(낡은 지침 유입 방지).

### Progressive Disclosure Design Principle

Skills use a three-level loading system to manage context efficiently:

1. **Metadata (name + description)** - Always in context (~100 words)
2. **SKILL.md body** - When skill triggers (<5k words)
3. **Bundled resources** - As needed by Claude (Unlimited because scripts can be executed without reading into context window)

#### Progressive Disclosure Patterns

Keep SKILL.md body to the essentials and under 500 lines to minimize context bloat. Split content into separate files when approaching this limit. When splitting out content into other files, it is very important to reference them from SKILL.md and describe clearly when to read them, to ensure the reader of the skill knows they exist and when to use them.

**Key principle:** When a skill supports multiple variations, frameworks, or options, keep only the core workflow and selection guidance in SKILL.md. Move variant-specific details (patterns, examples, configuration) into separate reference files.

> 3가지 PD 패턴 예시코드(High-level guide with references / Domain-specific organization / Conditional details): 필요시 `references/pd-examples.md` Read.

**Important guidelines:**

- **Avoid deeply nested references** - Keep references one level deep from SKILL.md. All reference files should link directly from SKILL.md.
- **Structure longer reference files** - For files longer than 100 lines, include a table of contents at the top so Claude can see the full scope when previewing.

## Skill Creation Process

Skill creation involves these steps:

1. Understand the skill with concrete examples
2. Plan reusable skill contents (scripts, references, assets)
3. Initialize the skill (create the directory + SKILL.md frontmatter manually — see Step 3)
4. Edit the skill (implement resources and write SKILL.md)
5. Validate the skill (run quick_validate.py — see Step 5)
6. Iterate based on real usage

Follow these steps in order, skipping only if there is a clear reason why they are not applicable.

### Step 1: Understanding the Skill with Concrete Examples

Skip this step only when the skill's usage patterns are already clearly understood. It remains valuable even when working with an existing skill.

To create an effective skill, clearly understand concrete examples of how the skill will be used. This understanding can come from either direct user examples or generated examples that are validated with user feedback.

For example, when building an image-editor skill, relevant questions include:

- "What functionality should the image-editor skill support? Editing, rotating, anything else?"
- "Can you give some examples of how this skill would be used?"
- "I can imagine users asking for things like 'Remove the red-eye from this image' or 'Rotate this image'. Are there other ways you imagine this skill being used?"
- "What would a user say that should trigger this skill?"

To avoid overwhelming users, avoid asking too many questions in a single message. Start with the most important questions and follow up as needed for better effectiveness.

Conclude this step when there is a clear sense of the functionality the skill should support.

### Step 2: Planning the Reusable Skill Contents

To turn concrete examples into an effective skill, analyze each example by:

1. Considering how to execute on the example from scratch
2. Identifying what scripts, references, and assets would be helpful when executing these workflows repeatedly

Example: When building a `pdf-editor` skill to handle queries like "Help me rotate this PDF," the analysis shows:

1. Rotating a PDF requires re-writing the same code each time
2. A `scripts/rotate_pdf.py` script would be helpful to store in the skill

Example: When designing a `frontend-webapp-builder` skill for queries like "Build me a todo app" or "Build me a dashboard to track my steps," the analysis shows:

1. Writing a frontend webapp requires the same boilerplate HTML/React each time
2. An `assets/hello-world/` template containing the boilerplate HTML/React project files would be helpful to store in the skill

Example: When building a `big-query` skill to handle queries like "How many users have logged in today?" the analysis shows:

1. Querying BigQuery requires re-discovering the table schemas and relationships each time
2. A `references/schema.md` file documenting the table schemas would be helpful to store in the skill

To establish the skill's contents, analyze each concrete example to create a list of the reusable resources to include: scripts, references, and assets.

### Step 3: Initializing the Skill

At this point, it is time to actually create the skill.

Skip this step only if the skill being developed already exists, and iteration or validation is needed. In this case, continue to the next step.

<!-- root-cause(cross-layer/X-06, 2026-08-03 관측): 이 스텝이 가리키던 `scripts/init_skill.py`는 이 저장소 히스토리 전체에 존재한 적이 없다(`git log --all -- .claude/skills/skill-creator/scripts/init_skill.py` → 0건 — "복원"이 아니라 애초에 없던 스크립트). 검증 안 된 스캐폴딩 스크립트를 지금 급조하는 대신(선택 b — 판단 근거는 배정 브리프 X-06 보고 참조), 아래 인라인 절차로 대체한다. 실제 존재하는 `scripts/quick_validate.py`는 Step 5에서 그대로 사용한다. -->

When creating a new skill from scratch, create the directory and SKILL.md manually — there is no scaffolding script in this skill's `scripts/` (only `quick_validate.py` exists there).

```bash
mkdir -p .claude/skills/<skill-name>/{scripts,references,assets}
```

Then write `SKILL.md` at the skill root with the required frontmatter (`name` + `description` — see **Anatomy of a Skill** above for the full field list):

```yaml
---
name: <skill-name>
description: "<트리거 조건 + 한 줄 요약 — Claude가 이 필드만 보고 발동 여부를 판단한다>"
---
```

Only create the `scripts/` / `references/` / `assets/` subdirectories the skill actually needs (per the Step 2 plan) — do not pre-fill placeholder example files that nothing uses.

### Step 4: Edit the Skill

When editing the (newly-generated or existing) skill, remember that the skill is being created for another instance of Claude to use. Include information that would be beneficial and non-obvious to Claude. Consider what procedural knowledge, domain-specific details, or reusable assets would help another Claude instance execute these tasks more effectively.

#### Learn Proven Design Patterns

Consult these helpful guides based on your skill's needs:

- **Multi-step processes**: See references/workflows.md for sequential workflows and conditional logic
- **Specific output formats or quality standards**: See references/output-patterns.md for template and example patterns

These files contain established best practices for effective skill design.

#### ACI 체크리스트 (WARN, `scripts/` 번들 또는 도구형 지시 포함 시)

번들 스크립트(`scripts/`)를 포함하거나 SKILL.md 본문에서 CLI/도구 호출을 지시하는 스킬은 `rules-on-demand/aci-design-guide.md` 체크리스트(파라미터 스키마·에러 반환 계약·출력 계약·few-shot 예시·최소권한)를 참고해 자가 점검한다. WARN 수준 권고 — 하드 게이트 아님, 패키징 차단 없음.

#### Start with Reusable Skill Contents

To begin implementation, start with the reusable resources identified above: `scripts/`, `references/`, and `assets/` files. Note that this step may require user input. For example, when implementing a `brand-guidelines` skill, the user may need to provide brand assets or templates to store in `assets/`, or documentation to store in `references/`.

Added scripts must be tested by actually running them to ensure there are no bugs and that the output matches what is expected. If there are many similar scripts, only a representative sample needs to be tested to ensure confidence that they all work while balancing time to completion.

Any example files and directories not needed for the skill should be deleted. The initialization script creates example files in `scripts/`, `references/`, and `assets/` to demonstrate structure, but most skills won't need all of them.

#### Update SKILL.md

**Writing Guidelines:** Always use imperative/infinitive form.

##### Frontmatter

**트리거 모드를 먼저 정한다 (Step 0 — 생략 금지).** `description`은 **항상 컨텍스트에 상주**한다(body는 invoke 시에만 로드). 즉 model-invoked 스킬 하나를 만들 때마다 **모든 세션이 그 description 값만큼 토큰을 낸다.** 이 결정을 미루면 비용이 영구히 누적된다.

| 이 스킬은… | 설정 | 결과 |
|---|---|---|
| 사람이 `/name`으로 **명시 호출**하는 워크플로·파이프라인·세션의식 | `disable-model-invocation: true` | **상주 비용 0.** 모델 자동호출 차단 |
| Claude가 작업 도중 **자율 발동**해야 하는 것 (코드 작성 후 검사, 자료 질문 시 검색 등) | 미설정(기본) | description 상시 상주 — 그만큼 짧고 트리거 중심으로 |

판단 기준: **"사용자가 이 스킬 이름을 기억하고 직접 칠 수 있는가?"** 그렇다면 `disable-model-invocation: true`다. 모델이 알아서 발동해야만 쓸모가 있는 것만 model-invoked로 남긴다.

> 2026-07-14 실측: 스킬 93개 중 91개가 model-invoked였고 description 26,414자(≈7~9K 토큰)가 매 세션 상주 중이었다. 대부분은 사용자가 `/`로 부르는 파이프라인이라 순수 낭비였다. 원인은 이 문서가 "name/description 외 필드 금지"라고 지시한 것.

- `name`: The skill name
- `description`: This is the primary triggering mechanism for your skill, and helps Claude understand when to use the skill.
  - **Write trigger-focused descriptions only** (AD-115 description-as-router 기준). "what it does" 설명은 description이 아닌 body에.
  - Include all "when to use" / "when NOT to use" trigger conditions here — Not in the body. The body is only loaded after triggering.
  - Example description for a `docx` skill: "Use when working with .docx files for: (1) Creating new documents, (2) Modifying or editing content, (3) Working with tracked changes, (4) Adding comments. SKIP when user only needs plain text output."

**AD-115 description-as-router 품질 기준** (Article A3 기반):

| 기준 | 좋은 예 | 나쁜 예 |
|------|--------|--------|
| 동사로 시작 | "Analyze, extract, compare..." | "This skill is for..." |
| 구체적 트리거 | "Use when user pastes Figma URL" | "Use for design tasks" |
| 부정 트리거 포함 | "SKIP when importing openai" | (트리거만 기술) |
| 번호 열거 | "Use for: (1) create, (2) edit" | "document processing tasks" |
| 100단어 이내 | 압축적, 중복 없음 | 장황, 반복 있음 |

**eval_cases.jsonl 권장**: 신규 스킬 생성 시 3개 시드 케이스 (PASS/WARN/FAIL). 미생성 시 quick_validate.py에서 stderr WARN (exit 0 유지).

**공식 필드만 쓴다.** Claude Code는 아래 목록에 없는 키를 **파싱하지 않고 버린다** — 넣어도 아무 일도 일어나지 않는 죽은 메타데이터가 된다(2026-07-14 실측: `input`/`output`/`group`/`role`/`metadata` 등 65건이 그 상태였다).

```
name  description  model  context  disable-model-invocation  user-invocable
when_to_use  argument-hint  arguments  allowed-tools  disallowed-tools
effort  agent  hooks  paths  shell
```

- `user-invocable`은 **기본값이 true**다. `user-invocable: true`를 쓰는 것은 no-op 줄이다 — 쓰지 마라. 감추고 싶을 때만 `false`.
- **`tools:` 필드는 SKILL.md에 추가하지 않는다** — skill은 메인 컨텍스트 확장이므로 도구 제한 레이어가 없음. `tools:`는 `agents/*.md`에서만 사용. 상세: `rules-on-demand/skill-vs-agent-tools.md`.
- frontmatter의 `---`는 **반드시 1행에서 시작**해야 한다. 앞에 주석·공백이 한 줄이라도 있으면 YAML 파싱이 실패해 **스킬로 인식조차 되지 않는다**(실증: 루프 스킬 4종이 이 이유로 전부 미인식 상태였다).

##### Body

Write instructions for using the skill and its bundled resources.

**본문은 매번 필요한 절차만.** 템플릿·예시·상세 규칙·레퍼런스 표는 `references/`로 빼고 본문에서 조건부로 참조한다("X를 할 때만 `references/y.md`를 읽어라"). 본문이 길면 **트리거될 때마다 전량 로드**된다. 250줄이 넘으면 분리 신호다.

##### 완료 게이트 (필수 — 통과 전 완료 선언 금지)

```bash
python3 "${FORGE_ROOT:-$HOME/forge}/shared/scripts/skill-lint.py" --skill <skill-name>
```

Pocock 4축(트리거·구조·유도·가지치기) 결정론 검사다. **CRITICAL/HIGH가 하나라도 뜨면 고치고 다시 돌린다.** 출력이 깨끗해야 스킬이 완성된 것이다.

### Step 4.5: evals.json 생성 (필수 — 패키징 전 완료)

신규 스킬 모든 경우에 `evals/evals.json` 생성 **필수**. 이 단계를 건너뛰면 CI WARN 발생.

#### 경로

```
{skill-name}/evals/evals.json
```

> JSON 필수 형식(스키마 예시): 필요시 `references/evals-templates.md` Read.

#### 요구사항

- `evals` 배열 **최소 3개** 항목 (id: 1, 2, 3)
- 각 항목: `id` / `prompt` (최소 10자) / `expected_output` / `expectations` (최소 3개 항목)
- 케이스 범주 권장: ① happy path — 정상 동작 ② 경계·edge 케이스 ③ FAIL/WARN 판정 케이스

#### 검증

```bash
python3 ~/forge/shared/scripts/validate-evals.py structure
```

PASS 확인 후 Step 5 진행.

### Step 4.7: Adversarial Stress-Test (Discipline-Enforcing Skills Only)

**적용 대상**: 다음 중 하나에 해당하는 스킬 — TDD 준수, 검증 요구, 보안 체크, 완료선언 게이트, 리뷰 의무 등 **행동 규율을 강제하는 스킬**.

참조: `writing-skills/testing-skills-with-subagents.md` — TDD RED-GREEN-REFACTOR 전체 사이클.

**순수 참조 스킬(API 문서, 문법 가이드)은 이 단계를 건너뛴다.**

#### 적용 절차 (RED-GREEN-REFACTOR)

1. **RED** — 스킬 없이 시나리오 실행 → 에이전트 실패 패턴·합리화 언어 verbatim 기록
2. **GREEN** — 스킬 포함 후 동일 시나리오 → 규칙 준수 확인
3. **REFACTOR** — 새 합리화 발견 시 명시적 반박 추가 (rationalization table 갱신)

> 압박 시나리오 템플릿 + 합리화 반박표 예시: 필요시 `references/stress-test.md` Read.

Green 확인 후 Step 5 진행.

### Step 5: Validating a Skill

<!-- root-cause(cross-layer/X-06, 2026-08-03 관측): `scripts/package_skill.py`도 init_skill.py와 동일하게 git 히스토리에 존재한 적 없음(0건). 게다가 Forge 스킬은 `.claude/skills/<name>/` 디렉토리에서 직접 로드되므로(마켓플레이스 배포용 .skill zip 개념은 Forge 내부 생성 흐름에 해당 없음) 패키징 단계 자체가 불필요하다 — 검증만 남긴다. -->

Once development of the skill is complete, validate it with the script that actually exists in this skill (`scripts/quick_validate.py`):

```bash
python3 .claude/skills/skill-creator/scripts/quick_validate.py .claude/skills/<skill-name>
```

The script checks:

- `SKILL.md` exists
- File starts with valid YAML frontmatter (`---` on line 1, parseable YAML block)
- (추가 검증 항목은 스크립트 본문 참조 — 필요 시 확장 가능, §검증 quick_validate.py 확장 권고 절 참조)

If validation fails, fix the reported errors and re-run. Forge 내부 스킬에는 별도 배포 산출물(.skill zip)이 없다 — 디렉토리 자체가 결과물이다.

### Step 6: Iterate

After testing the skill, users may request improvements. Often this happens right after using the skill, with fresh context of how the skill performed.

**Iteration workflow:**

1. Use the skill on real tasks
2. Notice struggles or inefficiencies
3. Identify how SKILL.md or bundled resources should be updated
4. Implement changes and test again


---

## Agent Teams — 독립 Evaluator (Wave 2.5)

생성된 SKILL.md 또는 스킬 패키지를 독립 서브에이전트가 검증한다.

```python
Agent(
  subagent_type="general-purpose",
  model="sonnet",
  prompt="""
당신은 새로 생성된 Claude 스킬(SKILL.md)을 독립 평가하는 Evaluator입니다.
Generator가 어떤 의도로 작성했는지 모르는 상태에서 결과물만 평가합니다.

평가 기준:
1. frontmatter — name/description/context 필드 완전성 (모든 필드 존재?)
2. 역할 선언 — 첫 3줄 내 역할·컨텍스트·출력 명시?
3. 워크플로 — Step 순서가 명확하고 실행 가능한 단계인가?
4. 예시 — 실제 사용 예시(입력/출력 샘플)가 포함되었는가?
5. 컨텍스트 창 효율 — 불필요한 설명·반복이 없는가?

판정: PASS / FAIL
FAIL 시 피드백 형식: [위치(섹션명/줄)] — [이유] → [수정 방향]
"""
)
# PASS → 스킬 패키징 진행
# FAIL → Generator에게 피드백 전달 후 1회 재작성
# 재FAIL → [STOP] 사용자 에스컬레이션
```

## SKILL.md 필수 필드 (frontmatter)

신규 스킬 생성 시 frontmatter에 반드시 포함:
```yaml
input: (필수) 스킬이 받는 입력 형태 — 한 줄 설명
output: (필수) 스킬이 생성하는 출력물 — 한 줄 설명
```

누락 시 스킬 발주자가 I/O 경계를 추측해야 함 → 재작업 발생.

## Skill 유효성 재검토 트리거

다음 조건 중 하나 이상 충족 시 해당 스킬 재검토:

1. **모델 메이저 업데이트** — Opus/Sonnet/Haiku 메이저 버전 변경 후 (예: 4.6→4.7)
2. **3개월 이상 미사용** — git log 또는 메트릭 기준 호출 0회
3. **오류율 20% 초과** — 다음 측정 식:
   - **분자**: 최근 30일 호출 중 다음 카테고리 발생 횟수
     - 명시적 STOP / FAIL JSON
     - 사용자 재시도 (`/skill` 재호출 within 5min)
     - skill 내부 에러 stdout
   - **분모**: 최근 30일 총 호출 횟수 (settings.json hooks 메트릭 또는 `~/.claude/metrics/{date}.jsonl` 누적)
   - **임계값**: 분자/분모 > 0.20
   - **데이터 소스**: P2-3 session-end-metrics hook의 metrics jsonl
   - **분모 < 10**: 측정 불가 → "사용 빈도 부족" 별도 라벨 (#2 미사용 트리거 우선 적용)

재검토 결과 3택:
- **keep**: 그대로 유지 (재검토일 갱신)
- **simplify**: 도구·옵션·프롬프트 축소 (Single-purpose tool design)
- **deprecate**: archive/ 디렉토리로 이동 + INDEX 업데이트

## 재검토 절차 (분기 GC 사이클 일부)

1. metrics jsonl read → skill별 호출 카운트·실패 카운트 집계
2. 분자/분모 계산 → 임계값 체크
3. 임계 초과 skill = 재검토 후보 list에 추가
4. 사용자 승인 게이트 통과 후 keep/simplify/deprecate 결정
5. 결과 = 분기 Harness GC 사이클 result.md에 기록

> 출처: 하네스 엔지니어링 백과사전 제7장 8가지 운영 원칙 #8 (폐기 시점 정의), 제11장 패턴 #4 Memory consolidation

---

## 신규 스킬 생성 시 eval-rubric 통합 (강제)

신규 스킬이 검증 가능한 산출물(JSON/md 등)을 생성하면 SKILL.md 끝부분에 다음 섹션 의무 포함.

### 통합 대상 판정 (3 조건 중 1 충족 시 의무)

1. 산출물이 PASS/WARN/FAIL 또는 score 등 verdict-bearing
2. 산출물이 사용자 검토 게이트 통과 후 다른 스킬에 입력으로 사용됨 (chain skill)
3. 산출물 품질이 분기 GC Quality Audit에 영향

### 표준 통합 섹션 (복사·커스터마이즈)

신규 SKILL.md 생성 시 스킬별로 커스터마이즈한 통합 섹션을 삽입 의무.

> 복사용 템플릿 전문: 필요시 `references/evals-templates.md` Read.

### 검증 (quick_validate.py 확장 권고)

신규 SKILL.md 검증 시:
- 산출물 verdict-bearing 판정 → eval-rubric 섹션 grep `^## 자동 평가` 확인
- 누락 시 = WARN ("eval-rubric 통합 누락 검토")

### 예외 (통합 불요)

다음 카테고리 = eval-rubric 불요. 해당 경우 frontmatter에 `eval_cases: off` 명시:
- 단순 CRUD 도구 (clip / memsearch / find-item 등)
- 외부 도구 wrapper (cr-bug / cr-code 등 단축 래퍼)
- UI/시각화 출력만 (theme-factory / generate-image 등)

> 출처: AD-19 (eval-rubric 시스템 통합) — 신규 스킬 = 동일 통합 패턴 준수 의무.
