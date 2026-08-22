---
description: "Fable 5(대체 gpt-5.6-sol)를 advisor로 Sonnet/Haiku 실행자와 결합 호출 (API + advisor_20260301 tool) MAS P1: +Codex critic 추가."
argument-hint: "<task 설명> [파일 경로]"
group: ops
---

# /advisor

Forge 하네스에서 **advisor 패턴**을 간편히 호출하는 래퍼. 내부적으로 `shared/scripts/advisor-assist.py`를 Bash로 실행하고 결과를 받는다.

**핵심:** Executor(Sonnet/Haiku) 주도 + advisor 판단 지점 조언 → 프런티어 모델 단독 대비 30~85% 비용 절감하면서 품질 유지.

**비용:** Anthropic API 크레딧 필요 (Max 구독과 별개 과금). 월 $10~30 예상.
**진입점 구분:** `/advisor`=**API 과금**(advisor-assist.py 경유). Max 구독 내 **무과금** 조언은 `Agent(subagent_type="advisor-strategist")` 사용 — 동일 Advisor Strategy(executor 주도 + advisor 컨설트) 패턴을 API 없이 구현.

## advisor 모델 (기본 Fable 5 · 대체 gpt-5.6-sol)

**2026-08-12 Human 지시로 기본 조언자가 Opus → Fable 5 로 바뀌었다.** 쉽게 말하면 "물어보는 상대"가 바뀐 것이고, 일하는 모델(워커)은 그대로 저렴 tier다.

모델 결정은 `shared/scripts/advisor-model-resolve.sh` **한 곳**이 한다 — 호출자는 그 출력만 믿는다.

```bash
MODEL=$(bash "${FORGE_ROOT:-$HOME/forge}/shared/scripts/advisor-model-resolve.sh")
# claude-fable-5 (기본) | gpt-5.6-sol (대체) | claude-opus-5 (명시 요청 시)
```

| 상황 | 결과 |
|---|---|
| 기본(아무 설정 없음, 전 tier) | `claude-fable-5` |
| `FORGE_ADVISOR_FABLE=off` (kill-switch) | `gpt-5.6-sol` |
| `FORGE_FABLE_AVAILABLE=0` (미가용) | `gpt-5.6-sol` |
| 사람이 켠 캡(`FORGE_ADVISOR_FABLE_CAP=N`) 초과 | `gpt-5.6-sol` (미설정 = 무제한) |
| `FORGE_ADVISOR_MODEL=fable\|sol\|opus` | 그 값 (모든 가드보다 우선) |
| `FORGE_ADVISOR_FALLBACK=opus` | 대체재를 sol 대신 Opus 로 (구현 경로용) |

- ⚠️ **출력이 `gpt-*` 면 `Agent()` 로 스폰하면 안 된다** — Agent 의 model 열거형에 codex 모델이 없다. `mcp__codex__codex`(sandbox=read-only)로 조언 레그를 띄운다.
- ⛔ **리졸버를 건너뛰고 `Agent(subagent_type="advisor-strategist")` 를 직접 부르면 가드가 안 걸린다** — frontmatter 기본값(Fable)으로 그냥 뜬다. kill-switch·캡·미가용이 전부 우회된다.
- **tier 인자(T1~T4)는 더 이상 모델을 가르지 않는다**(로그 기록용). 기존 호출부가 `... T4` 로 넘기던 것을 그대로 둬도 안전하다.
- 💰 **과금 = 구독 정액**(Human 확인 2026-08-12) → **일일 캡 기본 0(무제한)**. 호출당 추가 과금이 없어 횟수를 막을 근거가 없다. 토큰·지연을 조이고 싶으면 `FORGE_ADVISOR_FABLE_CAP=N`(초과분 sol). 과금이 흔들린 경위 → `model-routing-rationale.md §Fable 5 과금 이력`
- 재현: `bash shared/scripts/test-advisor-model-resolve.sh` (52케이스 — peek 15 · 오타플래그 5 · stderr 청결 5 포함) · `bash shared/scripts/test-advisor-tier-gate.sh` (33케이스 — 역변조 3종 포함)

**출처:** 2026-04-10 Advisor 전략 상세 분석 (`forge-outputs/01-research/ai-report/2026-04-10-advisor-strategy-detailed.md`)

## 사용법 (인자 파싱)

```
/advisor <task> [input-file]
```

예시:
- `/advisor "이 계약서 을 측 리스크 3개" ./draft.md`
- `/advisor "grants 본문 전략 프레이밍 개선점" forge-outputs/09-grants/sme-tech-rd/03-core.md`
- `/advisor "이 PR의 보안 위험 감사" (파일 없으면 대화형 입력)`

## 실행 절차

### Step 1 — 인자 파싱

- `$ARGUMENTS`를 두 토큰으로 분리:
  - 첫 토큰: task 문구
  - 나머지: 입력 파일 경로 (있으면)

### Step 2 — Bash 호출

**파일 입력 있을 때:**
```bash
python3 ${FORGE_ROOT:-$HOME/forge}/shared/scripts/advisor-assist.py \
  --task "{task}" \
  --input {file} \
  --executor claude-sonnet-5 \
  --advisor claude-fable-5 \
  --max-uses 3 \
  2>/tmp/advisor-usage.log
```

**파일 없이 대화형:**
입력 내용을 사용자로부터 받아 stdin으로 전달:
```bash
cat <<EOF | python3 ${FORGE_ROOT:-$HOME/forge}/shared/scripts/advisor-assist.py --task "{task}"
{사용자 제공 내용}
EOF
```

### Step 3 — 결과 정리

1. stdout (advisor 결과)을 읽고 사용자에게 요약 제시
2. stderr (`/tmp/advisor-usage.log`)에서 비용 정보 추출 → 끝에 요약
3. 결과를 저장해야 하는 경우 저장 경로 확인 후 Write

## 사용 기준 (2026-08-12 개정 — advisor 전략 상시 가동)

> 정본 = `rules/model-routing.md §Advisor 전략 상시 가동`. **실행자가 Opus·Sonnet·`gpt-5.6-terra`·`gpt-5.6-luna`·Gemini 면 판단 지점에서 advisor 조언을 받는 것이 기본**이다(Human 지시 2026-08-12). 종전의 "Tier 2 — 비용 통제"(아껴 쓰기) 기준은 폐기했다 — Fable 이 구독 정액이라 호출당 비용이 없다. **다만 토큰·지연은 든다** — 아래 "부르지 않는 경우" 목록은 그대로 유효하다.
>
> ⚠️ 단, **이 커맨드(`/advisor`)는 Anthropic API 종량 과금 경로다.** 상시 가동은 무과금 경로(`Agent(subagent_type="advisor-strategist")` / `mcp__codex__codex`)를 기본으로 하고, `/advisor` 는 API 툴(`advisor_20260301`)이 꼭 필요할 때 쓴다.

**✅ 부르는 지점 (기본 수행):**
- 설계·구현 방식이 갈릴 때 (동등해 보이는 후보 2개 이상)
- PASS/FAIL·승인/거부 **경계** 판정
- 비가역·고위험 변경 착수 **직전** (마이그레이션·삭제·결제·보안·배포)
- 검수 결론 **확정 직전** 적대적 2차 의견 1회
- 워커가 **같은 실패 2회** 반복해 막혔을 때
- 정부과제 본문 최종 전략 검토 · 중대 계약서 조항 (외주·투자·M&A)

**❌ 부르지 않는 경우:**
- 1~2줄 수정·단순 오타·포매팅 (조언 오버헤드 > 작업)
- 기계적 반복 패턴 적용
- 이미 명확한 판단 (경계가 아닌 경우)

## 호출 2경로 · 미가용 폴백

**Agent 경로(무과금, 기본)**
```
MODEL=$(bash "${FORGE_ROOT:-$HOME/forge}/shared/scripts/advisor-model-resolve.sh")
# claude-* → Agent(subagent_type:"advisor-strategist", model:"fable"|"opus")
# gpt-*    → mcp__codex__codex (sandbox=read-only)
```

**API 경로(종량 과금)**
```bash
python3 ${FORGE_ROOT:-$HOME/forge}/shared/scripts/advisor-assist.py \
  --task "{판단 요지 — 반대근거·실패시나리오 우선}" \
  --input {decision-doc.md} \
  --executor claude-sonnet-5 \
  --advisor claude-fable-5 \
  --max-uses 2 \
  2>/tmp/advisor-fable-usage.log
```

**미가용 시 자동 폴백:** Fable 미승인·접근거부 시 `advisor-assist.py`가 `claude-opus-5`로 폴백하고 stderr에 표시한다(`[advisor] ⚠️ claude-fable-5 unavailable (...) → claude-opus-5 fallback`). **크레딧 잔액 부족은 폴백 대상 아님**(Opus도 실패하므로 그대로 에러 표출).

> ⚠️ **API 경로의 폴백은 `gpt-5.6-sol` 이 될 수 없다.** 이 스크립트는 Anthropic Messages API + `advisor_20260301` tool 전용이라 Codex 모델을 호출할 수단이 없다. sol 을 조언자로 쓰려면 Agent 경로(`mcp__codex__codex`)를 쓴다.

### Fable 을 쓰지 않는 경우 (되돌리기)

| 원하는 것 | 하는 법 |
|---|---|
| 이 세션만 Opus 조언 | `export FORGE_ADVISOR_MODEL=opus` |
| 이 세션만 sol 조언(벤더 교차) | `export FORGE_ADVISOR_MODEL=sol` |
| Fable 전면 차단(kill-switch) | `export FORGE_ADVISOR_FABLE=off` → sol 로 감 |
| 하루 N회로 제한 | `export FORGE_ADVISOR_FABLE_CAP=N` (미설정=무제한, 초과분 sol) |

⚠️ **캡 값에 오타를 내면 캡이 꺼지는 게 아니라 5 로 적용된다.** `CAP=5O`(영문 O) 같은 비숫자를 주면 무제한으로 뭉개지 않고 보수적 양수로 떨어뜨린다 — 변수를 준 것 자체가 "가드를 켜려는 의도"이기 때문이다. 정말 무제한을 원하면 `CAP=0` 을 명시하거나 변수를 지운다.

- **집계**: Fable 디스패치 시 `/tmp/advisor-fable-usage.log`(또는 `FORGE_ADVISOR_FABLE_LOG`)에 기록 — 캡 카운트 + ROI 리뷰 겸용.
- **범위 — 2026-08-22 부터 자문·검수 레그 모두 O**(구 제목 "검수 레그 X" 는 폐기): 2026-08-12 에 승격된 것은 **advisor 자문 레그**뿐이었다. `forge-pr`·`forge-plan` 의 advisor 자문도 이제 리졸버를 따른다(그 커맨드들의 "advisor = Opus 고정" 문구는 2026-08-12 폐기).
  ✅ `cr-multi`/`cr-triple` 의 **검수 워커 레그**도 2026-08-22 부터 Fable 기본이다(구 금지 조항 폐기 — 2026-08-22 Human 지시로 해제(구독 3계정 정액 운용 — 호출당 비용 0)). 정본 → `model-routing.md §세션 운영 모델`.
  ✅ 반면 `forge-deploy`·`forge-rollback`·`forge-check-*`·`forge-milestone-close`·`forge-dev-undo` 는 **advisor 자문 레그가 실재한다** — 이 PR 에서 그 커맨드들의 "Fable 5 미배선 · 리졸버 호출 금지" 문구를 **폐기**하고 리졸버 경유로 바꿨다. (2026-08-12 이전에 "그 커맨드들은 advisor 를 안 쓴다"고 적혀 있던 것은 사실이 아니었다.)
- **구현(coder) 경로 예외**: `coder-model-resolve.sh` 는 `FORGE_ADVISOR_FALLBACK=opus` 를 박아 넘긴다 — `--coder fable` 이 안 될 때 벤더를 말없이 Codex 로 바꾸지 않기 위해서다(그 스크립트의 기존 계약 유지).

## 비용 예시

| 태스크 | 실행자 | 입력 | 예상 비용 |
|---|---|---|---|
| grants 전략 검토 | Sonnet | 10k 토큰 | $0.15 + advisor $0.3 = **$0.45** |
| PR 보안 감사 | Sonnet | 15k 토큰 | $0.20 + advisor $0.9 = **$1.10** |
| Spec 경계 판정 | Haiku | 3k 토큰 | $0.06 + advisor $0.6 = **$0.66** |

월 10회 사용 시: ~$7~15

## 옵션 플래그 (advisor-assist.py 직접 호출)

```bash
# Executor를 Haiku로 (더 저렴)
python3 ${FORGE_ROOT:-$HOME/forge}/shared/scripts/advisor-assist.py \
  --task "판정" --executor claude-haiku-4-5-20251001 \
  --max-uses 2

# Advisor 호출 횟수 증가 (더 많은 조언)
python3 ${FORGE_ROOT:-$HOME/forge}/shared/scripts/advisor-assist.py \
  --task "복잡한 전략 결정" --max-uses 5

# JSON 출력
python3 ${FORGE_ROOT:-$HOME/forge}/shared/scripts/advisor-assist.py \
  --task "검토" --input file.md --format json > result.json

# Dry run (API 호출 없이 요청 payload 확인)
python3 ${FORGE_ROOT:-$HOME/forge}/shared/scripts/advisor-assist.py \
  --task "test" --dry-run <<< "content"
```

## 트러블슈팅

| 증상 | 원인 | 해결 |
|---|---|---|
| `credit balance is too low` | API 크레딧 부족 | https://console.anthropic.com/settings/billing 충전 |
| `ANTHROPIC_API_KEY 미설정` | 환경변수 없음 | `source ${FORGE_ROOT:-$HOME/forge}/.env` 또는 export 직접 |
| advisor tool 응답 없음 | beta 헤더 누락 | script가 자동 설정하므로 정상 작동 예상 |
| 과다 비용 | max_uses 설정 과다 | `--max-uses 1~2`로 축소 |
| Fable 요청했는데 Opus로 응답 | Fable 미출시(~07-07)/usage-credits 미승인 | 자동 폴백 정상 — stderr 폴백 표시 확인, 크레딧이면 충전 |

## Forge 하네스 통합 예시

### 스킬에서 호출 (grants-write.md Step 7)
```markdown
### Step 7 — 최종 전략 조언 (선택, 고가치 과제만)

```bash
cat {project}/03-strategy.md | python3 ${FORGE_ROOT:-$HOME/forge}/shared/scripts/advisor-assist.py \
  --task "평가위원 관점에서 감점 요인 3가지" \
  --executor claude-sonnet-5 \
  --max-uses 2 \
  > {project}/.advisor-feedback.tmp
```
```

### PGE Evaluator에서 호출
```markdown
### Evaluator 보강 (경계 케이스만, 55~65점 구간)

if 점수가 58~65점 사이면:
```bash
cat work.md | python3 ${FORGE_ROOT:-$HOME/forge}/shared/scripts/advisor-assist.py \
  --task "이 결과물의 PASS/FAIL 재판정" \
  --executor claude-haiku-4-5-20251001 \
  --max-uses 2
```
```

## 관련

- 구현: `${FORGE_ROOT:-$HOME/forge}/shared/scripts/advisor-assist.py`
- 분석 원본: `forge-outputs/01-research/ai-report/2026-04-10-advisor-strategy-detailed.md`
- 적용 계획: `forge-outputs/01-research/ai-report/2026-04-10-forge-application-plan.md`
- API docs: https://docs.claude.com/en/api/messages#advisor
