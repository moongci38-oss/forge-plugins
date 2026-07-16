---
description: Forge Dev P5 진입 — Spec 기준 구현 + 빌드/린트 통과 게이트.
argument-hint: "[--spec <path>] [--coder claude:tier|codex:tier|sol|terra|luna|ab] [--advisor sol|terra|opus|fable]"
group: implement
model: sonnet
---

# /forge-implement — P5 구현 진입 커맨드

> 진입점: P4 Spec 승인 후 P5 구현 착수. Iron Law 강제.
> **하네스 패밀리 맵**: spec 있나?→forge-implement(oracle 有) / 없고 코드·문서·에셋?→forge-pge(oracle 無) / 버그?→forge-fix. 결정표: `${FORGE_ROOT:-$HOME/forge}/.claude/rules-on-demand/harness-family-map.md` 참조.

## Iron Law
승인된 Spec(§7~8 태스크 + 검증 기준) 없이 코드 작성 = **즉시 중단**. spec-write 먼저.
Check 5.x(5/5.5/5.6/5.7/**5.8**/5.9 — pipeline.md §Phase 5 참조) 생략 금지. `--skip-checks` 또는 동등한 우회 금지.

## 모델 라우팅 (2026-07-04)

| 작업 | 모델 | 방법 |
|------|------|------|
| 구현 본체(코드 작성·편집·리팩터·테스트) | **Sonnet** | 커맨드 frontmatter `model: sonnet`(실행자 계층) |
| 구현 본체 **--coder 지정 시** | claude:tier / **Codex(gpt-5.x)** / ab | `coder-model-resolve.sh` 라우팅(DMC 트랙C). Codex=mcp workspace-write+worktree |
| 탐색·검색(기계적 grep/glob/파일 위치) | **Haiku** | `Agent(model:"haiku")` subagent |
| 중요 의사결정 자문(§3.5 advisor) | **Opus** | `advisor-strategist` |
| 리뷰 판정(Check 5.7-X cr-triple) | **Opus**+Codex+Gemini | Claude 레그 Sonnet 고정 |
| Check 5.8 qa 엔진 | qa 자체 라우팅 | Sonnet 오케스트레이터 + Haiku 탐색 + Vision Sonnet |

근거: `~/.claude/rules/model-routing.md`(구현=claude-sonnet-5 / 결정·리뷰=claude-opus-4-8 / 탐색=claude-haiku-4-5). 구버전 핀(sonnet-4-6·opus-4-7·opus-4-6) 금지.

## Red Flags (무시 금지 — 자기합리화 차단)
| 이런 생각이 들면 | 강제 행동 |
|--------------|---------|
| "간단해서 Spec 없이 바로 짜도 돼" | Red Flag → spec-write 먼저 |
| "계획서는 나중에, 일단 시작" | Red Flag → Spec §8 태스크 먼저 |
| "비슷한 거 했으니 대충 알아" | Red Flag → 기존 Spec Read 후 진입 |
| "테스트는 나중에 추가" | Red Flag → 실패 테스트 먼저 (TDD) |
| "delete는 delete다" | Red Flag → 삭제 구현 전 삭제 scope 명시 후 승인 |
| "이게 맞겠지" (추측 구현) | Red Flag → 불명확 요구사항 = STOP, 확인 후 진행 |
| "일단 하고 나중에 보자" | Red Flag → blocker 발생 시 즉시 STOP, 우회 금지 |

> 출처: Superpowers Iron Law 패턴 (YT af3OJ0L1jEU 분석, 2026-05-21). "Claude는 규칙을 알지만 자기합리화로 우회 — 지식이 아니라 규율 문제."

## TDD Verify-RED 의무
구현 시작 전:
1. 실패하는 테스트 먼저 작성 (RED)
2. 테스트가 실제로 FAIL하는지 확인 (`npm test` 또는 동등 명령)
3. FAIL 확인 후 구현 시작 (GREEN)
4. 테스트 없이 구현 시작 = RED FLAG

> **예외 — DB/외부 서비스 의존 단위 테스트**: CI/통합 환경 미구성 시 RED 단계에서 mock 허용 (로직 부재로 FAIL임을 확인하는 것이 목적). DB 연결 오류로 FAIL하는 것은 RED 확인 불가. → mock으로 RED 확인 후 GREEN. "DB Mock 금지" 패턴 ①은 통합 테스트(GREEN 이후 E2E) 단계에 적용.

## 테스트 작성 금지 패턴
① **DB Mock 금지**: 실제 DB 대신 mock → 프로덕션 쿼리 차이 미감지. 통합 테스트(E2E, Green 이후)는 실 DB 사용. 단위 테스트 RED 단계는 위 예외 참조.
② **외부 API 전체 Mock**: 응답 구조만 mock → 실제 API 변경 감지 불가. 계약 테스트 병행.
③ **성공 케이스만 테스트**: 에러 경로, null 입력, 경계값 반드시 포함.
④ **테스트 내 테스트 로직**: assert 내부에 if/else → 테스트가 테스트를 검증 = 의미 없음.
⑤ **oracle 비독립(self-validating) 금지**: 테스트가 구현과 동일한 가정을 인코딩하면 무의미하다 — 구현 로직을 보고 기대값을 역산(逆算)하지 말 것. 기대값은 spec·레거시 동작·Human 판단에서 도출한다(qa AD-92-2 정합).

## Preflight (진입 전 자동 점검)

C2/C3 훅 제거 후 command 내 preflight로 흡수 (B2 ADR, 2026-06-04).
> B2 ADR soft enforcement: 두 Preflight 모두 hook 미배선 — AI-instruction 전용. 1주 메트릭 후 hook 재도입 결정.

### Preflight-1: 브랜치 가드 (C2 흡수)

현재 브랜치 확인:
```bash
git branch --show-current
```
- `main` 또는 `develop` → **[WARN]** + 안내 (AI 강제, hook 미배선):
  ```
  [브랜치 가드] develop/main에서 직접 구현 비권장.
  feature 브랜치에서 진행: git checkout -b feature/{spec-slug}
  (1 Spec = 1 feature 브랜치 원칙)
  ```
- `feature/*` 또는 git repo 아님 → 계속

**stale-base 확인 (P2-⑦, WARN-first)**: 브랜치 이름만으로는 base가 최신인지 알 수 없다 — origin 대비 뒤처진 브랜치 위에서 구현을 시작하면 머지 시 충돌·회귀가 무경고로 누적될 수 있다.
```bash
git fetch origin develop 2>/dev/null && git rev-list --left-right --count origin/develop...HEAD
```
- fetch 실패(네트워크 불가·origin 미설정 등) → 조용히 skip, 브랜치 가드만으로 계속 (fail-open — hard 의존 아님)
- fetch 성공 + behind(좌측 카운트)가 크면(예: 10커밋+) → **[WARN]**:
  ```
  [stale-base 경고] 현재 브랜치가 origin/develop 대비 {behind}커밋 뒤처짐.
  최신 base 위 구현 권장: git rebase origin/develop (또는 재브랜치).
  (비차단 — 그대로 진행 가능, Human/AI 판단)
  ```
- behind가 작거나 fetch 불가 → 계속

### Preflight-1.5: Worktree 격리 — 항상 고려 (강제 아님)

**원칙**: forge-implement 구현 단계는 worktree 격리를 **기본 고려**한다(병렬 구현 충돌 방지 + 안전 롤백 + 메인 체크아웃 오염 방지). healer/forge-fix가 이미 사용하는 worktree 격리 규약(절대경로 강제, cwd-drift sentinel, HEAD/branch guard, 직렬 회귀 게이트 — `.claude/agents/healer.md §Worktree 격리 컨텍스트` 참조)을 그대로 상속한다. 새 worktree 로직 재정의 금지.

**강제가 아니라 "항상 고려"** — 다음 3개 판단 기준 중 하나라도 해당하면 worktree 격리 적용을 우선 검토하고, 전부 미해당이면 feature 브랜치 직접 구현을 허용한다:
1. **다중 파일/병렬 구현** — 2개 이상 FR을 동시 진행하거나 서로 다른 서브에이전트가 겹치지 않는 파일을 병렬 수정할 때
2. **실험적/롤백 가능성 높은 변경** — 아키텍처 접근이 비자명(§3.5 advisor 트리거와 동일 판단선)해서 되돌릴 가능성이 있는 구현
3. **Check 5.8 FR별 병렬 conformance 검증** — 아래 §4b에서 FR 단위 병렬 실측 검증을 수행할 예정일 때

단일 파일·명확한 구현(위 3개 전부 미해당)은 feature 브랜치 직접 진행이 기본값으로 남는다.

### Preflight-2: Spec 모호성 스캔 (C3 흡수)

`.specify/specs/*.md` 존재 시 spec 경로를 특정 후:
- 절차: `${FORGE_ROOT:-$HOME/forge}/.claude/rules-on-demand/spec-ambiguity-scan.md` **인라인 실행** — FR 전수 3유형(불명확·상충·미정의) 스캔
- HIGH 이상 모호 FR 발견 시 → **[STOP] 모호한 요구사항 확인 필수. '{모호한 내용}' 명확화 없이 진행 금지.**
- 강제 BLOCK — 모호 항목 AI 임의 해석 금지(AD-92-2)

### Preflight-2b: BE 계약 선실측 (2026-07-10, 계약 드리프트 방지)

FE↔BE 연동이 스코프에 포함되면 구현 착수 전:
- 대상 BE 엔드포인트의 **실재 + 요청/응답 계약**(필드명·casing·필수값)을 컨트롤러/라우트 소스에서 추출한다(탐색=Haiku subagent). spec의 계약과 불일치 시 → spec-code-discriminate 판별 후 [STOP] 정합 확인.
- **false-green 판별**: 화면이 "연동 완료"로 기록돼 있어도 **proxy-call 0 = mock** — 페이지 로드 성공을 연동 완료로 오판하지 않는다(2026-07-09 optool: FE 필드명 드리프트로 100% 실패 2건·mock 방치 6화면 실증).
- **pre-work branch sweep**: `${FORGE_ROOT:-$HOME/forge}/.claude/rules-on-demand/pre-work-branch-sweep.md` — 미머지 완성물 재작성 방지.

> ambiguity-cleared.json 마커 방식 폐기 (stale 마커 영구 우회 결함).

### Preflight-3 — TDD RED 확인 3종 + slopsquatting gate + atomic close-out

**TDD RED 확인 3종 (구현 시작 전 전부 통과 필수)**:

| # | 확인 항목 | PASS 조건 |
|---|----------|----------|
| RED-1 | 테스트 파일 존재 | `.test.ts` / `.spec.ts` / `_test.go` 등 존재 |
| RED-2 | 테스트 실제 FAIL | `npm test` / `pytest` 실행 → 해당 케이스 RED 확인 |
| RED-3 | FAIL 원인이 "로직 부재" | 환경 오류·import 실패가 아닌 assertion fail |

- 3종 모두 PASS 후 구현 착수. 미통과 항목 있으면 **[STOP]**.
- RED-2 실행 출력(실패 로그 일부) 을 컨텍스트에 포함 후 진행.

**slopsquatting gate (신규 패키지·API 추가 시 필수)**:

AI 생성 코드에서 허위 패키지명·존재하지 않는 API 참조 차단:
```
1. 패키지명 실존 확인: npm info <pkg> 또는 pip show <pkg> 실행
2. API/메서드 실존 확인: 공식 문서 또는 레포 소스에서 직접 확인
3. 다운로드 < 1000/주 또는 첫 릴리스 < 30일 = [WARN] 사용자 확인
4. 패키지 존재 X = 즉시 STOP. 허위 패키지 install 절대 금지.
```

> 출처: "slopsquatting" — AI 생성 허위 패키지명을 공격자가 선점하는 supply-chain 공격 벡터.

**atomic close-out (태스크 완료 시 매 태스크마다)**:

각 태스크 완료 후 다음 태스크 착수 전 반드시:
```
1. 해당 태스크 테스트 GREEN 확인 (부분 통과 X — 해당 케이스 전부)
2. 원자 커밋: git commit -m "feat: {태스크 설명} — {spec-ref}"
3. 빌드/린트 PASS 확인 후 다음 태스크 시작
```
- 여러 태스크 묶음 커밋 금지 (추적성 소실, 롤백 단위 파괴)
- 검증 전 다음 태스크 착수 = Red Flag

**REFACTOR (GREEN 통과 후)** — root-cause: SP-B3 TDD 3-phase 완성:
```
GREEN 통과 확인 후:
1. 중복 제거: 동일 로직 함수화, 반복 상수화
2. 네이밍 개선: 의도가 드러나는 변수/함수명
3. 구조 정리: 단일 책임 위반, 불필요한 중간 변수 제거
4. 테스트 재실행 → 여전히 GREEN 확인 필수
```
- REFACTOR 중 기능 추가 금지 — 정리만 (기능 추가 = 새 RED로 시작)
- REFACTOR 후 GREEN 깨지면 즉시 revert (REFACTOR 범위 축소 후 재시도)

**codemod-first (기계적 리팩터 우선순위)**: rename·시그니처 변경·API 마이그레이션처럼 기계적·구조적인 변경은 `jscodeshift`/`ast-grep`/`@next/codemod` 등 codemod 도구를 우선 사용한다. LLM 자유편집은 (a) 모호한 비즈니스 로직 판단이 필요하거나 (b) codemod가 깨뜨린 부분을 수리하는 경우로 한정한다. 근거: AI 자유편집은 copy-paste 비중↑·순수 리팩터 비중↓로 churn·회귀 리스크가 커진다.

---

## 동작 (단일 절차)

### 0. Path Boundary Validation

**`--spec <path>` validation**:
- `.specify/specs/` 하위 강제 (절대경로 거부)
- `.md` 확장자 강제
- traversal 차단 (`../` 포함 → reject)
- NUL/newline 문자 reject
- 미충족 → exit 3

### 0.5. Readiness 판정 (요건 기반 3-way 게이트)

→ 공통 헬퍼: `/readiness-gate` 참조

forge-implement 진입 계약(A~H 요소) 기준으로 Spec 내용 스캔:
- 요소별 4-state 판정(ok/normalize/derive/absent)
- 라우팅:
  - 전부 ok       → **PASS** (Step 1 검증 진행)
  - normalize/derive만 → **ADAPT** (Spec 보완 후 Step 1 진행)
  - absent 1개+  → **GUIDE-STOP** (`forge-implement-readiness-{date}.md` 출력 후 정지)

GUIDE-STOP 시 phase4_complete 미설정은 "H: Phase 상태 absent" 항목에 포함.
침묵 종료(exit 1 무피드백) 금지 — 반드시 보강 가이드 + 재호출 안내 출력.

### 1. P4 Spec 승인 검증 (PHASE4-IRON-1 — 요건 계약 충족)

- Step 0.5 readiness 판정 PASS 확인 (absent=0)
- Spec 파일 (`.specify/specs/{name}.md`) 존재 + INDEX.md 등재 검증
- `state=phase4_complete` 또는 `phase5_pending` 확인
- **승인 실체성 교차확인 (P2-⑥, WARN-first)**: `state=phase4_complete`는 `session-state.mjs`의 범용 `cmdSet`으로 갱신되는 플래그라 **존재 자체가 실 Human 승인을 증명하지 않는다**(위조 가능). 플래그 단독 신뢰 금지 — Spec 파일(`.specify/specs/{name}.md`) 내 실 승인 표식(승인일자·승인자·Approved 섹션 등) 또는 P4 관련 handover/PR 승인 코멘트와 교차확인한다. 교차확인 근거를 못 찾으면 **[WARN]** 출력 후 진행(구체 승인 필드 스키마가 표준화되기 전까지 hard-BLOCK 아님 — AI-instruction 권고 단계).
- 미충족 항목 → GUIDE-STOP (exit 1 무피드백 금지)

### 1.5 M1 Intent-Lock 확인 (WARN-first)

- spec 헤더 `intent:` 확인 — `confirmed`면 통과 (기능당 restate 1회 원칙, 재요구 금지).
- `unconfirmed`이거나 필드 부재(구버전 spec)면: 4줄 계약(①동작 보장 ②왜 ③어디 붙나 ④핵심 결정)을 지금 제시하고 restate 요청. 거부·무응답 시 진행하되 구현 산출물 완료보고에 `intent-unconfirmed` 표시 + `${FORGE_OUTPUTS:-$HOME/forge-outputs}/.claude/audit/complement-protocol.jsonl` append (fail-open).
- spec 없는 직행 구현(P5 standalone): 착수 직전이 restate 시점 — 동일 절차.
- kill: 사용자가 "M1 끄자" 한마디면 이 스텝 skip (행동 규율 — env 불필요).

### 2. session-state 갱신

```bash
~/.claude/scripts/session-state.mjs checkpoint phase5
```

### 3. Iron Law 인쇄

PHASE4-IRON-1 + PHASE5-IRON-1 출력.

### 3.5. Advisor 조언 (조건부) — 구현 접근 비자명 판단점

**Advisor 조언 (조건부)** — `FORGE_ADVISOR_AUTO` 환경변수가 `"off"`가 아니고 아래 트리거 충족 시 `advisor-strategist` 호출:
- 트리거: **구현 접근 분기가 비자명** (라이브러리/패턴/아키텍처 선택지 2+가 동등하게 타당) **또는 예측 못한 hard 결정점** 발생 (Spec에 명시 없는 구현 방향 분기)
- PASS(Spec에 구현 방향 명시 + 단일 자명한 접근) → 스킵

```
Agent(
  subagent_type="advisor-strategist",
  prompt="""<구현 맥락 500토큰 이내>
기능: {Spec 기능명}
결정점: {비자명 선택 상황 설명}
선택지: {A 접근 vs B 접근 — 구체 라이브러리/패턴}
제약: {기존 스택, 성능 요건, 팀 규모}

질문: 권장 구현 접근 + 핵심 근거 1~2개만."""
)
```

→ 400~700토큰 조언 수령 후 구현 진행. 조언은 advisory — 실행자가 최종 판단.

### 3.6. 구현 실행자 라우팅 (--coder, DMC 트랙C — 2026-07-15)

`--coder <spec>` 지정 시 구현 본체를 Claude/Codex/ab로 라우팅. **미지정 = 기존 Sonnet(frontmatter) 유지**(무변경).

```bash
CODER_SPEC="${CODER_ARG:-}"   # --coder 값 파싱. 없으면 기존 동작.
[ -n "$CODER_SPEC" ] && MODEL=$("${FORGE_ROOT:-$HOME/forge}/shared/scripts/coder-model-resolve.sh" "$CODER_SPEC")
```

- **미지정** → 기존 Sonnet 구현 (무변경, no-op).
- **claude:tier** → `Agent(model=sonnet|opus|fable)`로 구현.
- **codex:tier** → `mcp__codex__codex`(sandbox=workspace-write, approval-policy=on-request, cwd=worktree, model=$MODEL). 단:
  - **Unity/게임 프로젝트 감지**(`ProjectSettings/ProjectVersion.txt` 존재) → **Claude 폴백**. Codex는 Linux 샌드박스라 Unity batchmode 불가(실측 확정 2026-07-15: Unity Windows 전용).
  - **시크릿 마스킹**: Codex diff·출력을 표시·머지 전 `secret-content-scan.sh` 경유(LN-03).
  - **advisor tier-gate (2026-07-16)**: `GATE=$("${FORGE_ROOT:-$HOME/forge}/shared/scripts/advisor-tier-gate.sh" "$CODER_SPEC")`. **`skip`**(구현자≥Opus: sol/terra/opus/fable) → §3.5 strategic advisor **생략**(하위 Opus가 상위 구현자 훈수하는 tier 역전 방지). **`advise`**(구현자<Opus) → advisor 발동 + **그 400~700토큰 조언을 Codex 프롬프트에 주입**(Codex는 메인 컨텍스트 미상속 → 명시 주입해야 실효). ⚠️ **bounding/STOP(T3 plateau·thrash 캡)·T4(비가역) 자문은 tier 무관 항상 유지**(제어 기능이지 capability 경쟁 아님).
- **--advisor 오버라이드 (2026-07-16)**: `--advisor <spec>`(sol/terra/opus/fable)로 advisor 모델을 경우별 선택. `AMODEL=$("${FORGE_ROOT:-$HOME/forge}/shared/scripts/coder-model-resolve.sh" "$ADVISOR_SPEC")` → 결과가 gpt/codex면 **`mcp__codex__codex`(sandbox=read-only)로 advisor 스폰**(sol/terra, Plus 정액=무료·독립 관점), claude면 `Agent(subagent_type="advisor-strategist", model=$AMODEL)`(opus/fable). 미지정=현행(Opus + tier-gate). ⚠️ **독립성: advisor 벤더 ≠ 구현자 벤더 권고**(같은 벤더=자기훈수 무의미 → Codex 구현엔 opus/fable advisor, Claude 구현엔 sol/terra advisor). fable은 **현재 구독 정액(종량 아님, 2026-07-16 사용자 확인)**이라 sol과 동급으로 자유 선택 가능(advisor-model-resolve 가드=kill-switch·가용성 폴백만 유지).
- **coder-attribution (기계 강제)**: 구현 직후 `coder-attribution.sh write "$WORKTREE" "$MODEL"` → 검수 진입 시 `MODE=$("${FORGE_ROOT:-$HOME/forge}/shared/scripts/coder-attribution.sh" review-mode "$WORKTREE")` 결과를 cr-* 에 `--cr $MODE`로 전달(codex 구현→`degrade`=codex 레그 배제 / 그 외→`on` / 무마커→`on` fail-open). 구현자≠검수자 산문 아닌 스크립트 강제.
- **ab** → claude:high + codex:max 두 레그 각 worktree 병렬 → Evaluator(독립) 채점 → 승자 채택.
- **산출물 = worktree만**, 커밋·머지는 기존 MERGE-IRON-1/forge-pr 게이트 경유(우회 금지).
- kill-switch `FORGE_DUAL_CODE=off` → codex 요청도 Claude 대체. Fail-open: Codex 미가용 → Claude(로그+경고).

> Check 5.x(5.8 Spec-Conformance E2E)·qa·cr-triple 게이트는 --coder 무관 유지. Codex 구현 시 검수는 codex 레그 배제(coder-attribution). 모델 id는 `model-registry.json` SSoT(버전무관).

**머지 브랜치 검증 (MERGE-IRON-1 강제)**:
```
머지 실행 전 무조건:
- source == feature/* AND target == develop  → autoMerge 허용
- target == main OR protected branch          → 무조건 [STOP] (MERGE-IRON-1)
- 위 조건 미충족                                → [STOP] (불명확 머지 차단)
develop→main 진입 = 항상 Human 승인 (autoMerge 우회 불가)
```

### 4. 빌드/린트 게이트 안내 출력

```
P5 구현 진입 완료.
성공 조건: 빌드 PASS + 린트 PASS
→ 구현 후 feature→develop 머지 (MERGE-IRON-1 준수)
```

빌드/린트/테스트가 `ENOENT node_modules`, `MODULE_NOT_FOUND`, `lockfile drift` 등 환경 파손 오류로 실패 시
→ **Node-Repair 단계** (하단 §Node-Repair) 실행 후 재시도. 코드 미수정 상태로 환경만 복구.

### 4a. PEV 재시도 루프 (GREEN/빌드/린트 FAIL 시) [BOUNDED]

> 추정=보조, 결정론 bound=max-cycles, 정확 enforcement=P4(agent-budget 훅)

GREEN 단계(테스트) 또는 빌드/린트가 FAIL 하면 즉시 중단하지 않고 bounded 재시도:

```
PEV_CYCLE=0
PEV_MAX=3
ISSUE_HASH=""   # sha256(실패파일경로:에러메시지 첫줄) — kernel 미가용 시 fallback 카운터

while [실패 존재] AND PEV_CYCLE < PEV_MAX:
  PEV_CYCLE += 1
  NEW_HASH = sha256(실패파일경로:에러메시지 첫줄)

  # same-issue stop: 아래 kernel 블록(§loop-kernel.js SSoT 연동)을 NEW_HASH로 실행한 뒤,
  #   trip = KERNEL_TRIPPED(=tripped:true)  OR  (NEW_HASH == ISSUE_HASH AND PEV_CYCLE >= 2)
  #   둘 중 먼저 걸리는 쪽이 정지. 로컬 cycle-2 조건이 kernel(SAME_ISSUE_MAX=3, cycle-3 trip)보다 항상 같거나 tighter →
  #   kernel 배선이 same-issue 조기정지를 절대 느슨하게 만들지 않는다(캡 소실·완화 금지).
  if same-issue-trip:
    → [STOP] 동일 오류 반복 감지. Human 개입 필요. (PEV_CYCLE 값 표시)
    exit 4

  ISSUE_HASH = NEW_HASH   # (kernel 호출·cycle-2 비교 이후에 갱신 — 비교는 직전 cycle 해시와 대조)

  # 라우팅
  if 오류 유형 == web/JS/TS 빌드·린트·테스트:
    → /healer (web) 호출 — 기존 fixer 재사용, 새 fixer 작성 금지
  else:
    → /forge-fix (general) 호출 — 기존 fixer 재사용

  # 재검증 (실패한 단계만 재실행)
  → 실패 단계 재실행: npm test / npm run build / eslint 등
  → 결과 수집

if 여전히 FAIL AND PEV_CYCLE == PEV_MAX:
  → [STOP] PEV 재시도 {PEV_MAX}회 초과. Human 개입 필요.
  exit 4
```

**loop-kernel.js SSoT 연동 (커널 단일화, 2026-07-05 — fallback 필수)**: same-issue **fingerprint 카운팅 메커니즘과 `SAME_ISSUE_MAX` 상수**를 재구현하지 않고 forge-loop-maker `scripts/loop-kernel.js`(`checkSameIssue` — SSoT)를 실호출해 단일소싱한다. 단, forge-implement의 로컬 same-issue 정지는 **kernel(cycle-3 trip)보다 tighter한 cycle-2 floor를 유지**한다 — 이유는 healer의 정직한-경계 독트린과 동일: forge-implement의 PEV_MAX=3은 경량 web 재시도 예산(game-qa max2와 대칭)이라, kernel의 threshold-3 same-issue가 max_cycles와 겹쳐 무력화·완화되지 않도록 로컬 cycle-2 조건을 **co-primary**로 병행한다(위 pseudocode `trip = KERNEL_TRIPPED OR 로컬 cycle-2`). healer.md가 이미 검증한 호출 패턴을 그대로 이식(재구현 금지):

```bash
KERNEL="${FORGE_ROOT:-$HOME/forge}/.claude/skills/forge-loop-maker/scripts/loop-kernel.js"
STATE_FILE="docs/qa/artifacts/pev-kernel-state.json"   # 사이클 불변 — same-issue 카운트는 cycle 간 누적돼야 함(파일명에 PEV_CYCLE 넣으면 매 사이클 빈 상태를 읽어 절대 trip 안 됨). healer의 bug-${N} 키와 동일 원리(run 단위 stable).
mkdir -p docs/qa/artifacts   # standalone 실행(qa/healer 미선행)에서 디렉토리 부재로 write 실패 → 누적 붕괴 방지
FINDING="[{\"id\":\"${NEW_HASH}\",\"severity\":\"stop\",\"passed\":false,\"detail\":\"${에러메시지 첫줄:0:80}\"}]"   # 현재 cycle fingerprint(NEW_HASH) — ISSUE_HASH(직전 cycle)를 넣으면 카운트가 한 사이클 밀려 trip 불발

KERNEL_OUT=$(timeout 10 node --input-type=module -e '
const { checkSameIssue } = await import(process.argv[1]);
const issueCounts = JSON.parse(process.argv[2] || "{}");
const findings = JSON.parse(process.argv[3]);
const r = checkSameIssue(findings, issueCounts);
console.log(JSON.stringify({ tripped: r.tripped, key: r.key, count: r.count, issueCounts }));
' "$KERNEL" "$(cat "$STATE_FILE" 2>/dev/null || echo '{}')" "$FINDING" 2>/tmp/forge-implement-kernel-err-${PEV_CYCLE}.log)
KERNEL_RC=$?

# 누적 상태 write-back — 반드시 .issueCounts만 추출(전체 KERNEL_OUT을 쓰면 다음 cycle이 wrapper 객체를 issueCounts로 오독 → 카운트 리셋)
if [ "$KERNEL_RC" -eq 0 ] && [ -n "$KERNEL_OUT" ]; then
  echo "$KERNEL_OUT" | jq -c '.issueCounts' > "$STATE_FILE"
fi
```

- **정지 판정**: `KERNEL_OUT`의 `tripped==true` **또는** 로컬 `NEW_HASH == ISSUE_HASH AND PEV_CYCLE >= 2` → [STOP](위 pseudocode). 둘의 OR라 로컬 cycle-2가 항상 kernel보다 같거나 먼저 걸림 → 캡 완화 없음.
- **폴백(캡 소실 금지)**: `KERNEL_RC≠0`(timeout exit 124 포함) 또는 `KERNEL_OUT` 빈 값이면 kernel 결과를 무시하고 로컬 `NEW_HASH == ISSUE_HASH AND PEV_CYCLE >= 2` 비교만으로 정지 판정 — kernel 미가용이어도 원래 cycle-2 same-issue 캡이 그대로 살아 있다. (참고: `loop-kernel.js`는 `package.json` 없는 ESM 모듈이라 `await import()`가 Node ≥22.7(ESM 자동감지)에서 동작 — 구버전 Node면 throw→`KERNEL_RC≠0`→폴백 발동, 캡은 양쪽 경로 모두 안전.)
- 상세 근거·안전설계는 `.claude/agents/healer.md §loop-kernel.js SSoT 연동`(2026-07-05) 참조 — 새 script 파일을 만들지 않고 동일 kernel을 재사용한다.

**루프 상한**: max 3 cycles (결정론적 bound, kernel과 무관하게 caller 소유 — healer와 동일 원칙).
**라우팅 원칙**: 기존 /healer (web) 또는 /forge-fix (general) 재사용. 새 fixer 작성 금지.
**스코프**: GREEN(테스트), 빌드, 린트 실패에만 적용. Node-Repair(환경 파손)는 §Node-Repair 별도 처리.

### 4a-1. UI FR 70→100 하드닝 체크리스트 (완료 선언 전 self-check)

UI FR을 "완료"로 선언하기 전, 구현자가 스스로 다음을 확인한다. Check 5.8 qa 루브릭이 사후(post-hoc) 검증을 수행하지만, 이 체크리스트는 그 이전 단계에 전진배치된 self-check다 — qa FAIL로 되돌아오는 왕복을 줄이는 목적.

| # | 항목 | 확인 내용 |
|---|------|---------|
| 1 | 상태 커버리지 | loading / empty / error / partial(부분 성공) 4개 상태 모두 렌더 확인 |
| 2 | 접근성 | 키보드만으로 전체 흐름 조작 가능 + focus 이동 시각적 확인 + live-region(동적 갱신) aria 존재 |
| 3 | 실제 길이 콘텐츠 | placeholder 텍스트가 아닌 **실제 길이의 데이터**로 렌더 — 짧은 placeholder는 안 깨지고 실제 긴 이름/목록/숫자에서 깨지는 레이아웃이 흔함 |
| 4 | 디자인 품질 | DESIGN.md 존재 시 committed direction·토큰 준수 / anti-slop(forge-check-ui 블랙리스트) 자기점검 / generic 형용사(clean·modern) 아닌 named-style·극단값 구현 확인 (실 콘텐츠 = §3과 동일 축) |

4개 전부 확인 후 완료 선언. 미확인 상태로 완료 선언 = Red Flag(§Red Flags 표와 동일 급).

> 근거: forge-implement 자체 하드닝이 기능축만 덮던 갭 — 디자인 craft는 forge-check-ui/forge-pge에만 강배선돼 있었음(2026-07-05 갭분석).

### 4b. Check 5.8 — Spec-Conformance E2E (구현 완료 필수, 2026-07-04)

빌드/테스트 통과를 넘어, **실행 중인 앱이 스펙대로 실질 동작**하는지 실DB·브라우저·F12 DevTools 번들·프로젝트 루브릭으로 확인한다. 구현 완료 선언 전 필수 — `--skip-checks`/동등 우회 금지(Iron Law 확장).

- **DB 격리 실증 게이트 (P0)**: 아래 실DB spec-conformance E2E(`/qa --diff-aware`, db_query 접촉) 실행 직전 필수 — `bash "${FORGE_ROOT:-$HOME/forge}/shared/scripts/assert-db-isolation.sh"`. 출력 `DB_ISOLATION: WARN`(격리 미증명: dev/prod/불명) 시 mutation 중단하고 DATABASE_URL을 격리 DB(*_test/*_qa)로 지정 후 재확인. WARN-first(non-blocking) — `FORGE_DB_ISOLATION_ENFORCE=1` 시 hard-BLOCK, fail-open(해석 불가=WARN+진행).
- **실행**: 구현/변경된 FR에 대해 diff-aware 스코프 spec-conformance E2E — qa 엔진 재사용(로직 단일화): `/qa --diff-aware --scope={구현 FR/파일}`. qa 8축 Health Score 루브릭 + DevTools 증거 번들(F12 전수) + 실DB db_query + 브라우저 렌더/스크린샷.
- **디자인 품질 감사 (WARN-우선 · DESIGN.md 게이팅)**: 구현 FR이 UI/프론트일 때 — **DESIGN.md 존재 시** `/forge-check-ui` 디자인 엔진(19패턴 블랙리스트+6-Pillar)을 **advisory 자동 실행**(non-blocking WARN, `docs/qa/design-check.jsonl`에 pillar 점수·slop 위반 append). **DESIGN.md 부재 시** = 옵트인 권고(baseline = qa 축5 UI일관성). Vision 비용은 DESIGN.md 커밋 프로젝트로 bound. 강제(BLOCK) 아님 — **~2026-07-12 metrics 리뷰 후 enforce 승격 판정**(verify-tier advisory→enforce 선례 준용, `FORGE_DESIGN_CHECK` off로 override). qa 축5=baseline, forge-check-ui=미학 craft 심층.
- **완료 바(프로젝트 루브릭)**: qa 8축 Health Score **70점+ AND 기능성 즉시-FAIL 0**(프로젝트/Framework별 기준 = qa `reference.md §Rubric`). 미달 → [STOP] 재작업(§4a PEV 루프 준용 또는 /forge-fix 라우팅).
- **FR conformance 축 (통짜 E2E 1회가 아닌 FR별 실측 대조)**: Check 5.8은 spec의 FR/AC를 항목별로 리스트업해 각 FR이 실행 앱에서 충족되는지 개별 대조한다. 판정 로직은 새로 정의하지 않고 `/forge-check-traceability`(FR별 5-state — DONE/PARTIAL/NOT DONE/CHANGED/UNVERIFIABLE, `docs/qa/fr-verdict.json` 산출)를 재사용해 FR↔구현↔실측증거를 매핑한다. 각 FR의 DONE 판정 근거는 해당 FR과 연결된 playwright 헬퍼 산출물(스냅샷/console.json/network.json/db_query 행)로 뒷받침한다. NOT DONE/UNVERIFIABLE로 남는 FR은 버그가 아니라 **conformance gap(구현 미달)**으로 리포트 — spec-code-discriminate의 IMPL_GAP 축과 정합.
- **병렬 단위 = FR**: FR이 여럿이면 FR별 conformance 검증은 (Preflight-1.5 worktree 격리 하에) FR 단위로 병렬화할 수 있다 — 이번 배선은 명시만, 실제 병렬 구현 실행은 별도.
- **증거**: 실DB 실측(db_query) + 브라우저 렌더 + F12 번들(콘솔 전레벨/네트워크 전요청/JS예외/실패리소스/경고/서버·프론트로그).
- **체인 vs standalone**: SDD 체인(spec→implement→qa→pr)에서는 **직후 P6 qa 전체 실행이 Check 5.8을 충족**(별도 인라인 불필요, 이중 실행 방지). **standalone `/forge-implement`는 완료 선언 전 위 diff-aware qa를 인라인 실행 필수.**
- **standalone 자가채점 격리 권고 (P2-⑧, WARN-first)**: standalone에서 위 인라인 qa를 구현과 **동일 컨텍스트(같은 대화·같은 subagent)**로 실행하면 구현자가 자기 결과를 채점하는 self-grading 위험이 있다. 가능하면 인라인 qa 호출을 **별도 subagent로 격리**(forge-pge Evaluator subagent 패턴 준용 — 구현 컨텍스트를 공유하지 않는 독립 `Agent(...)` 스폰)해 독립성을 확보할 것을 권고한다. 강제(BLOCK) 아님 — 세션 구조상 분리 불가 시 인라인 실행 허용하되 자가채점 위험을 인지하고 진행한다.
- **환경 부재 처리(non-blocking)**: 앱/브라우저/DB를 띄울 수 없어 E2E 실행 자체가 불가하면 → **GUIDE-STOP**(환경 구성 안내 출력 후 정지). 침묵 완료선언 금지, 침묵 block도 금지. 실행 가능한데 루브릭 미달 = [STOP] 재작업.
- **게이트 티어**: qa 내부 티어 상속 — screenshot/console/network·db_query·기능성 = hard, F12 세부필드(js_errors/failed_resources/warnings/front_log) = WARN-우선. 새 PreToolUse hook 도입 아님(기존 Check 5.x와 동일 AI-instruction [STOP] 클래스).

### 5. exit 0

---

## Exit 코드

| code | 의미 |
|:-:|---|
| 0 | P5 진입 성공 |
| 1 | P4 Spec 미승인 [STOP] |
| 3 | path validation FAIL (boundary violation) |

---

## 호출 예시

```
/forge-implement
/forge-implement --spec .specify/specs/auth-refactor.md
```

---

## Node-Repair 단계 (WI-34 — 환경 파손 복구)

빌드/린트/테스트가 의존성 환경 파손으로 실패 시 (ENOENT node_modules, MODULE_NOT_FOUND 등):

### 진단 먼저
```bash
# 증상 확인
node --version && npm --version
ls node_modules/.bin/ | head -5  # 존재 여부
cat package-lock.json | python3 -c "import json,sys; d=json.loads(sys.stdin.read()); print('lockfileVersion:', d.get('lockfileVersion'))"
```

### 복구 절차 (순서대로)

| # | 단계 | 명령 | 적용 조건 |
|---|------|------|---------|
| R-1 | 클린 재설치 | `rm -rf node_modules && npm ci` | lockfile 있을 때 |
| R-2 | lockfile 재생성 | `rm -rf node_modules package-lock.json && npm install` | lockfile 손상 시 |
| R-3 | 캐시 무효화 | `npm cache clean --force && npm ci` | R-1 실패 시 |
| R-4 | Python 환경 재설치 | `pip install -r requirements.txt` | Python 프로젝트 |
| R-5 | 빌드 캐시 삭제 | `rm -rf .next dist build .cache && npm run build` | 빌드 아티팩트 파손 시 |

복구 후 RED-2 (테스트 FAIL 확인) 재실행 필수 — 환경 파손 해소 전 구현 착수 금지.

---

## 관련 파일

- `~/forge/pipeline.md` P5 — 전체 절차 (정본)
- `~/forge/.claude/commands/forge-fix.md` — 단일 hotfix wrapper
- `~/forge/.claude/commands/spec-write.md` — P4 Spec 작성
> 실패 시 [[pev-self-correction]] 적용

---

## Worker-Evaluator 분리 불필요 (설계 근거)

P5의 모든 검증은 **결정론적(deterministic)**: 빌드/린트/테스트 exit code가 PASS/FAIL을 판정한다.
LLM이 주관적으로 "스펙을 충족하는가"를 자기채점하는 단계가 없으므로 별도 Evaluator Agent 불필요.
FAIL 시 PEV 루프 → `/healer`(web) 또는 `/forge-fix`(general) 라우팅 — healer는 자체 Vision evaluator를 보유한다.
결정론적 검증 + healer 위임 = 자기채점 편향 없음.

단 Check 5.8 spec-conformance E2E는 qa **독립 evaluator·루브릭**(Vision evaluator 등)을 재사용한다 — 구현자 자기채점이 아니므로 "자기채점 편향 없음" 원칙은 유지. 결정론적 게이트(빌드/테스트) + 독립 E2E(qa 루브릭) = 이중 안전. (= forge-pge Evaluator subagent와 동일 원칙(독립 채점자), 소싱만 다름 — forge-implement=qa Check 5.8 위임 / forge-pge=자체 Evaluator subagent.)
