# Frontmatter 작성 기준 (skill-creator 상세)

## 트리거 모드 먼저 정한다 (생략 금지)

`description`은 **항상 컨텍스트에 상주**한다(body는 invoke 시에만 로드). model-invoked 스킬 하나마다 **모든 세션이 그 description 만큼 토큰을 낸다.**

| 이 스킬은… | 설정 | 결과 |
|---|---|---|
| 사람이 `/name`으로 **명시 호출**하는 워크플로·파이프라인·세션의식 | `disable-model-invocation: true` | **상주 비용 0.** 모델 자동호출 차단 |
| Claude가 작업 도중 **자율 발동**해야 하는 것 (코드 작성 후 검사, 자료 질문 시 검색 등) | 미설정(기본) | description 상시 상주 — 짧고 트리거 중심으로 |

판단 기준: **"사용자가 이 스킬 이름을 기억하고 직접 칠 수 있는가?"** 그렇다면 `disable-model-invocation: true`. 단 이 설정은 Claude의 모든 호출(파이프라인·subagent 프리로드 포함)을 막는다 — 다른 스킬·커맨드가 부르는 스킬이면 붙이지 않는다(`skill-lint.py` INFO 참조).

## description (AD-115 description-as-router)

- **트리거 중심으로만** 쓴다. "what it does" 설명은 body에.
- "when to use" / "when NOT to use" 트리거 조건은 전부 여기 — body 는 트리거 후에만 로드된다.
- 예 (`docx`): "Use when working with .docx files for: (1) Creating new documents, (2) Modifying or editing content, (3) Working with tracked changes, (4) Adding comments. SKIP when user only needs plain text output."
- `<`·`>` 금지(quick_validate FAIL) · 1024자 이하.

| 기준 | 좋은 예 | 나쁜 예 |
|------|--------|--------|
| 동사로 시작 | "Analyze, extract, compare..." | "This skill is for..." |
| 구체적 트리거 | "Use when user pastes Figma URL" | "Use for design tasks" |
| 부정 트리거 포함 | "SKIP when importing openai" | (트리거만 기술) |
| 번호 열거 | "Use for: (1) create, (2) edit" | "document processing tasks" |
| 100단어 이내 | 압축적, 중복 없음 | 장황, 반복 있음 |

## 공식 필드만 쓴다

Claude Code는 아래 목록에 없는 키를 **파싱하지 않고 버린다**(죽은 메타데이터). `input`·`output`·`group`·`role` 같은 키는 쓰지 않는다 — `quick_validate.py` 가 FAIL 로 막는다.

```
name  description  model  context  disable-model-invocation  user-invocable
when_to_use  argument-hint  arguments  allowed-tools  disallowed-tools
effort  agent  hooks  paths  shell
```
(`quick_validate.py` 는 추가로 `license`·`metadata` 를 허용한다 — Forge 내부 도구용.)

- `user-invocable`은 **기본값 true** — `user-invocable: true`는 no-op, 쓰지 않는다. 감출 때만 `false`.
- **`tools:` 필드는 SKILL.md에 넣지 않는다** — `agents/*.md` 전용. 상세: `rules-on-demand/skill-vs-agent-tools.md`.
- `---`는 **반드시 1행에서 시작**. 앞에 주석·공백 한 줄만 있어도 스킬로 인식되지 않는다.
- 입력·출력 경계는 frontmatter 가 아니라 본문 상단 `**역할**`·`**컨텍스트**`·`**출력**` 줄로 적는다(quick_validate 3요소 검사).

## eval_cases 끄기

eval-rubric 불요 스킬은 `metadata:` 아래에 둔다(최상위 `eval_cases:` 는 공식 필드가 아니라 quick_validate FAIL):
```yaml
metadata:
  eval_cases: off
```
