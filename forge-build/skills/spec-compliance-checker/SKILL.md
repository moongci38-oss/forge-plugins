---
name: spec-compliance-checker
description: "Spec 문서와 구현 코드의 추적성(FR별 파일 매핑·테스트 존재·누락 판정)을 검증한다. 구현 완료 후 스펙 충족 여부를 확인할 때 사용한다."
context: fork
agent: general-purpose
model: sonnet
---

**역할**: Spec 문서 ↔ 구현 코드 추적성(Traceability) 감사자. Forge Dev Check P5.5(`/forge-check-traceability`)에서 실행, 결과는 PASS/WARN/FAIL JSON.
**컨텍스트**: Forge Dev P5 구현 완료 후 Check P5.5에서 자동 실행됩니다.

## 실행 원칙 (CRITICAL)
- **반드시 독립 subagent** — 구현자(Generator) 컨텍스트 공유 금지(자기평가 편향). 읽기 전용, 수정은 Lead.
- 순서: Check 5 → **5.5(본 스킬)** → 5.6 → 5.7 → 5.9 순차(병렬 스폰 금지). P5.5 PASS/STOP 해소 후에만 다음 진입.

```python
Agent(subagent_type="general-purpose", model="sonnet", prompt="""
독립 Spec 준수 감사 에이전트. Spec 문서와 코드 파일만 직접 읽어 감사.
Spec 경로: {spec_path} / 브랜치: {branch} / Matrix(있으면): {matrix_path}
이 스킬 파일 Read: ${FORGE_ROOT:-$HOME/forge}/.claude/skills/spec-compliance-checker/SKILL.md
절차대로 감사 후 JSON만 반환. 저장: {result_path}""")
```
입력: `{spec_path}`=`.specify/specs/{spec-name}.md` · `{matrix_path}`=`.specify/traceability/{spec-name}-matrix.json` · `{result_path}`=`.claude/state/check-8.5-result.json`
**Pre-flight**: spec_path 미제공/미존재 → 즉시 [STOP] "spec_path가 제공되지 않았습니다. `/spec-write`로 먼저 Spec을 작성하세요." date stamp 비교 금지 — FR 구현 여부로 판단.

## 감사 태도 — 절대 관대하게 보지 마라
- 파일 존재 ≠ 요구사항 충족. FR 하나씩 코드를 직접 읽어 확인. 구현자의 `found` 주장을 믿지 않는다.
- 이슈는 **위치 + 이유 + 방법** 3요소 필수(누락 FR 항목 포함).
- **반전 검증**: ①파일이 실제로 FR 충족? ②테스트가 실패 시나리오를 검증? ③시그니처 일치 + 비즈니스 로직 올바름? — 1개라도 "아니오" = WARN.
- PASS 직전 DISCONFIRMATION: PASS 이유 3개 각각 "왜 틀릴 수 있나" → 반박 가능하면 WARN. 확증·기준점·매몰비용·가용성 편향 경계(마지막 FR도 첫 FR과 동일 엄격도).
- FR 5개+/파일 2개+ 추정 시 실제 수 선언. 예상 대비 >50% 초과 = `planning-fallacy: true`(summary) — 초과율은 `spec-compliance-verdict.py`가 `estimate`로 계산.

## 입력 우선순위
1. Matrix `.specify/traceability/{spec-name}-matrix.json` (matrixSource=`traceability-json`)
2. Spec `.specify/specs/{spec-name}.md` "## 기능 요구사항"/"## Functional Requirements"에서 FR-NNN·설명·우선순위 추출 (`spec-extracted`)
3. 둘 다 없음 → FAIL. Walkthrough(`docs/walkthroughs/`)는 크로스체크용.

## 4-Level 검증
| Level | 확인 | 실패 신호 |
|---|---|---|
| 1 Exists | 파일/함수 존재 | 없음 |
| 2 Substantive | 실제 로직 | placeholder/TODO |
| 3 Wired | import·DI·route 연결 | 미연결 |
| 4 Functional | 동작 + test assertion | assertion 없음 |
- High FR = Level 3 이상 필수, Level 1-2만 = WARN. goal-backward: FR → 증명 assertion → wired 구현 → stub 아님.
- Stub(Level 2 FAIL): `return null/undefined/{}` 단독 · `throw new Error('not implemented')`/`TODO:`만 · 본문 ≤3줄+테스트 0 · `// placeholder`/`// stub`.

## 실행 절차
**Step 0 oracle-manifest**: `.specify/oracle-manifest.json` 있으면 로드 → `oracleStatus: "full"`, uiux 화면을 `FR-UI-{screen-id}`로 추가(`frontend_source="extracted"`면 uiux 면제), 매핑 수 < 화면 수 → WARN("uiux 매핑 미완성: {mapped}/{total}") — gitnexus `route_map` 우선, 없으면 grep. 없으면 `spec-only`, 프론트(*.tsx/*.vue/*.svelte) 감지 시 WARN. PRD→FR 파생 불명확 → WARN "완결성체인 갭: FR-NNN PRD 파생 불명확"(LLM 판정).
**Step 1** 입력 소스 결정(위 우선순위).
**Step 2 구현**: Matrix `implementationFiles` 존재 확인 / 추출 시 FR 키워드 Grep(*.ts, *.tsx, *.service.ts, *.controller.ts) → `implStatus`.
**Step 3 테스트**: Matrix `testFiles` + describe/it 키워드 / 추출 시 `*.spec.ts`·`*.test.ts`·`*.e2e-spec.ts` Grep → `testStatus` + describe 블록명.
**Step 3.5 AC-testability**: FR별 `acceptance_predicate`(spec은 "acceptance_predicate:"/"AC predicate:") 미작성 → `acceptance_predicate_missing` + WARN. "동작한다"/"성공한다" 단독 = tautology WARN.
**Step 4 API 계약**: Spec 엔드포인트(Method·경로·인증) ↔ `@Get/@Post/@Put/@Delete/@Patch` + `@UseGuards(...)`.
**Step 5 데이터 모델**: Spec 엔티티/필드 ↔ `*.entity.ts` `@Column`/`@PrimaryGeneratedColumn`.
**Step 5.5 소스 커버리지**: Spec §2.0 표 — `uncovered`/매핑 FR 공란 → `unmappedFRs` (`source_feature`|`business_rule`) + WARN · `범위외` 사유 없음 WARN · 표 부재 WARN.
**Walkthrough(선택)**: Files Changed 존재 확인은 스크립트 — `missing > 0`이면 목록을 WARN 근거로 인용(재확인 금지). "Spec 대비 검증" 상태 불일치는 LLM 판정 WARN.
```bash
bash shared/scripts/walkthrough-files-exist-check.sh <walkthrough.md> <project_root> --json
```
**Step 6 집계 — 스크립트가 판정**(룩업·5-state 집계·개수·planning-fallacy·경로 대조). LLM은 의미 구현 여부·verifiedLevel·CHANGED/UNVERIFIABLE만.
```bash
python3 "${FORGE_ROOT:-$HOME/forge}/shared/scripts/spec-compliance-verdict.py" --input <체커결과.json> --root "$PWD" --json
```
rc `0`=PASS/WARN · `1`=FAIL · `2`=판정불가. 반환 `status`·`frTotal`·`frByState`·`summary`를 그대로 쓴다.

## frState (5-state — 이 스킬이 유일한 생산자)
| frState | 조건 |
|---|---|
| DONE | impl found AND test found AND Level ≥3 |
| PARTIAL | test missing 또는 Level 1~2만 |
| NOT_DONE | impl missing |
| CHANGED | spec과 범위·인터페이스 다름(`reason` 근거) |
| UNVERIFIABLE | 검증 수단 부재. "안 해봤다"는 해당 안 됨 — 확인하라 |
- 불변식 `sum(frByState) == len(requirements)`. `NOT_DONE`·`UNVERIFIABLE` 1건 → [STOP] 머지 금지. `/forge-check-traceability`가 `docs/qa/fr-verdict.json`(`fr_by_state`)으로 옮김. 축 `status`와 직교.
- 판정: **PASS** = 모든 High FR impl+test found(oracleStatus=full이면 uiux FR 포함), Level ≥3, predicate 전부 · **WARN** = Medium/Low 누락·uiux WARN·Level 1-2만·predicate 미작성·소스 커버리지 갭 · **FAIL** = High FR impl/test missing(unmappedFRs 등록).

## 출력 JSON (~500 토큰, 구조화 JSON만)
```json
{"checkId":"check-8.5","status":"PASS|WARN|FAIL","oracleStatus":"full|spec-only","matrixSource":"traceability-json|spec-extracted",
 "requirements":[{"id":"FR-001","description":"","priority":"High|Medium|Low","implStatus":"found|missing","implFile":"","testStatus":"found|missing","testFile":"","testType":"unit|integration|both","relatedDescribeBlocks":[],"acceptance_predicate":null,"frState":"DONE|PARTIAL|NOT_DONE|CHANGED|UNVERIFIABLE","verifiedLevel":1}],
 "unmappedFRs":[{"id":"FR-003","type":"impl|test|uiux|acceptance_predicate|source_feature|business_rule","reason":""}],
 "acceptance_predicate_missing":[],"frByState":{"DONE":0,"PARTIAL":0,"NOT_DONE":0,"CHANGED":0,"UNVERIFIABLE":0},
 "axisStatus":{"api-contract":"PASS|WARN|FAIL|null","data-model":"PASS|WARN|FAIL|null"},"summary":"전체 N개, 구현 N개 (N%), 테스트 N개 (N%), 누락 N개","autoFixable":false}
```
Matrix 포맷: `{spec, plan, createdAt, requirements:[{id, description, priority, implementationFiles[], testFiles[], task, owner}]}`. 실패 시 [[pev-self-correction]].

## Workflow 실행
`Workflow({ script: Bash("cat ~/.claude/skills/spec-compliance-checker/workflow.js"), args: { specPath, branch, repoRoot: "<감사 대상 레포 절대경로>", estimate: { frs, files } } })`
- `repoRoot` 필수 권장 — 없으면 경로 대조 skip(`pathCheck.skipped`). `repoRoot`·`forgeRoot`는 `[A-Za-z0-9._/+@-]` 절대경로만.
- 관측표는 판정 필드만 순수 ASCII로 넘기고 `--expect-sha256` 대조(불일치 = 판정불가). `axisStatus` FAIL → 최종 FAIL, 반환값에도 실음. `pathCheck.root` ≠ `repoRoot` → 판정불가.
- `CLAUDE_CODE_DISABLE_WORKFLOWS=1` → Subagent 격리 방식 fallback.
