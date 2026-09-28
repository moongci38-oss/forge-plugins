# 스킬 설계 원칙 (skill-creator 상세)

SKILL.md 에서 옮긴 설계 가이드. 목차: 1 About Skills · 2 Core Principles · 3 Anatomy · 4 Progressive Disclosure · 5 Step 1~2 예시 · 6 Step 4·6 가이드

추가 필독: `${FORGE_ROOT:-$HOME/forge}/.claude/rules-on-demand/skill-writing-principles.md` — 예측가능성이 근본 미덕. context load vs cognitive load(`disable-model-invocation` 판단), 정보 계층 사다리, description = 분기당 트리거 1개, 선도어(leading word), no-op 테스트, 실패 모드 6종(조기완료·중복·퇴적·비대·no-op·부정).

## 1. About Skills

Skills are modular, self-contained packages that extend Claude's capabilities by providing specialized knowledge, workflows, and tools — "onboarding guides" for specific domains or tasks.

1. Specialized workflows - Multi-step procedures for specific domains
2. Tool integrations - Instructions for working with specific file formats or APIs
3. Domain expertise - Company-specific knowledge, schemas, business logic
4. Bundled resources - Scripts, references, and assets for complex and repetitive tasks

## 2. Core Principles

### Concise is Key
The context window is a public good. **Default assumption: Claude is already very smart.** Only add context Claude doesn't already have. Challenge each piece: "Does Claude really need this explanation?" / "Does this paragraph justify its token cost?" Prefer concise examples over verbose explanations.

### Set Appropriate Degrees of Freedom
- **High freedom (text instructions)**: multiple approaches valid, decisions depend on context.
- **Medium freedom (pseudocode / parameterized scripts)**: a preferred pattern exists, some variation OK.
- **Low freedom (specific scripts, few params)**: fragile, error-prone, consistency critical, fixed sequence.

A narrow bridge with cliffs needs guardrails (low freedom); an open field allows many routes (high freedom).

## 3. Anatomy of a Skill

```
skill-name/
├── SKILL.md (required)
│   ├── YAML frontmatter metadata (required: name, description)
│   └── Markdown instructions (required)
└── Bundled Resources (optional)
    ├── scripts/          - Executable code (Python/Bash/etc.)
    ├── references/       - Documentation loaded into context as needed
    └── assets/           - Files used in output (templates, icons, fonts, etc.)
```

- **Frontmatter**: `name`·`description` are what Claude reads to decide when to use the skill. Body loads only AFTER triggering.
- **scripts/**: code rewritten repeatedly or needing deterministic reliability (e.g. `scripts/rotate_pdf.py`). Token efficient; may run without being read.
- **references/**: docs loaded as needed (schemas, API docs, policies, detailed workflow guides). Keeps SKILL.md lean. Large files (>10k words) → put grep patterns in SKILL.md. **No duplication** — information lives in SKILL.md or references, not both.
- **assets/**: files used in output, not loaded into context (templates, images, fonts, boilerplate).

### What to Not Include
No README.md / INSTALLATION_GUIDE.md / QUICK_REFERENCE.md / CHANGELOG.md etc. Only what an AI agent needs to do the job — no process history, setup/testing notes, user-facing docs.

**Gotchas 섹션 (권장)**: 운영 이력이 쌓인 스킬은 `## Gotchas (흔한 실패 패턴)` 섹션을 두되, **실증된 실패만** 항목당 증거 링크(learnings ID·handover·룰 경위) 의무. 추정·일반론 금지.

## 4. Progressive Disclosure

1. **Metadata (name + description)** - Always in context (~100 words)
2. **SKILL.md body** - When skill triggers
3. **Bundled resources** - As needed (scripts can run without being read)

When a skill supports multiple variants, keep only the core workflow and selection guidance in SKILL.md; move variant-specific details to reference files, and say clearly in SKILL.md when to read each one. 3가지 PD 패턴 예시코드 → `pd-examples.md`.

- **Avoid deeply nested references** — one level deep from SKILL.md.
- **Structure longer reference files** — over 100 lines → table of contents at the top.

## 5. Step 1~2 예시

### Step 1: Understanding with Concrete Examples
Skip only when usage patterns are already clear. Example questions for an image-editor skill:
- "What functionality should the image-editor skill support? Editing, rotating, anything else?"
- "Can you give some examples of how this skill would be used?"
- "I can imagine users asking for 'Remove the red-eye from this image' or 'Rotate this image'. Other ways?"
- "What would a user say that should trigger this skill?"

Don't ask too many questions in one message. Conclude when the functionality is clear.

### Step 2: Planning Reusable Contents
For each example: (1) how to execute it from scratch, (2) what scripts/references/assets would help when repeating it.
- `pdf-editor` "rotate this PDF" → same code rewritten each time → `scripts/rotate_pdf.py`
- `frontend-webapp-builder` "build a todo app" → same boilerplate → `assets/hello-world/` template
- `big-query` "how many users logged in today?" → re-discovering schemas → `references/schema.md`

## 6. Step 4·6 가이드

### Step 4: Edit
The skill is for another Claude instance — include what is beneficial and non-obvious. Start with the reusable resources (`scripts/`·`references/`·`assets/`); this may need user input (brand assets, docs). Added scripts must be tested by actually running them (a representative sample if many are similar). Delete example files/dirs the skill doesn't need. **Writing Guidelines:** imperative/infinitive form.

**ACI 체크리스트 (WARN)**: `scripts/` 번들 또는 CLI/도구 호출 지시가 있으면 `rules-on-demand/aci-design-guide.md`(파라미터 스키마·에러 반환 계약·출력 계약·few-shot 예시·최소권한)로 자가 점검. 하드 게이트 아님.

**본문은 매번 필요한 절차만.** 템플릿·예시·상세 규칙·레퍼런스 표는 `references/`로 빼고 조건부로 참조한다("X를 할 때만 `references/y.md`를 읽어라"). 250줄이 넘으면 분리 신호다.

### Step 6: Iterate
1. Use the skill on real tasks 2. Notice struggles or inefficiencies 3. Identify how SKILL.md or resources should change 4. Implement and test again
