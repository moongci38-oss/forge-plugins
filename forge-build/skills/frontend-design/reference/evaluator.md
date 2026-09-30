# 평가 상세 (Planner rubric · Evaluator · 파일 프로토콜)

## Planner Rubric 기본값

**Planner Rubric 기본값 (맥락에 따라 조정):**

| 항목 | 가중치 | FAIL 기준 |
|------|:------:|----------|
| 요구사항 충족도 | 35% | 핵심 화면/컴포넌트 미구현 시 즉시 FAIL |
| 디자인 품질 | 30% | AI 슬롭 패턴(보라 그라데이션, Inter 단독, 카드 3열 등 — 생성 전 `forge-check-ui` 블랙리스트 전 패턴을 negative constraint로 선주입: 생성시점 회피, 사후감사 아님) 감지 시 0점 |
| 코드 완성도 | 20% | 실제 렌더링 불가, 빠진 import, broken CSS 시 0점 |
| 문서/명확성 | 15% | Rubric 자체검토 누락 시 5점 이하 |

> 근거(shift-left): 블랙리스트를 사후(Check 8.6)뿐 아니라 생성 프롬프트에 선주입 시 재작업↓ (Anti-Slop Framework 2026).

**PASS 기준**: 합산 70점 이상 + 요구사항 즉시 FAIL 없음

## FD_EVAL_REPORT.md 양식

**출력**: `{project_root}/.claude/state/FD_EVAL_REPORT.md`
```
## FD Evaluator 판정 (독립 에이전트)

### Rubric 점수
| 항목 | 가중치 | 점수 | 비고 |
|------|:------:|:----:|------|
| 요구사항 충족도 | 35% | X/100 | ... |
| 디자인 품질 | 30% | X/100 | ... |
| 코드 완성도 | 20% | X/100 | ... |
| 문서/명확성 | 15% | X/100 | ... |
| **가중 합산** | 100% | X.X/100 | |

### 판정: PASS / FAIL

### AI Slop 감지 결과
- Typography: [OK / 지적사항]
- Color: [OK / 지적사항]
- Layout: [OK / 지적사항]
- Motion: [OK / 지적사항]

### 개선 지시 (FAIL 항목)
- [위치]: [이유] → [방법]
```

## Evaluator 판정 원칙·검증 항목

**Evaluator 판정 원칙:**
- "나쁘지 않은데..." → 감점
- "이 정도면 괜찮지 않나?" → 감점
- Generator의 SELF_CHECK를 그대로 믿지 않는다 — 직접 코드에서 확인
- 한 항목이 좋아도 다른 항목 문제를 상쇄하지 않는다
- 모든 피드백: **위치 + 이유 + 방법** 3요소 필수

**Evaluator 검증 항목:**
1. FD_SPEC.md의 화면 요구사항 충족 여부 (1:1 대조)
2. Rubric 항목별 점수 산정 (독자적으로)
3. AI 슬롭 패턴 독립 감지 (Typography, Color, Layout, Motion)
4. 코드 실행 가능성 확인 (import, CSS 문법, syntax)
5. 골든 레퍼런스(Codex 코더 목업 · 폴백 Claude Design) 대비 구현 충실도 (레퍼런스 있는 경우)

## 파일 기반 통신 프로토콜

| 파일 | 경로 | 작성자 | 읽는 자 | 내용 |
|------|------|--------|---------|------|
| `FD_SPEC.md` | `.claude/state/FD_SPEC.md` | Planner | Generator, Evaluator | 화면 요구사항 + 컴포넌트 구조 + 레퍼런스 URL + Rubric |
| `FD_SELF_CHECK.md` | `.claude/state/FD_SELF_CHECK.md` | Generator | Evaluator | 자체 점검 결과 (Rubric 항목별) |
| `FD_EVAL_REPORT.md` | `.claude/state/FD_EVAL_REPORT.md` | Evaluator | Generator (피드백 시) | Rubric 점수 + 판정 + 개선 지시 |

**모든 FD 중간 파일은 `{project_root}/.claude/state/` 에 저장한다.**

## Evaluator 프롬프트 예시 (디자인 품질 세부 5축)

```python
Agent(
  subagent_type="general-purpose",
  prompt="""
당신은 독립 UI 품질 평가자입니다. Generator의 산출물을 엄격하게 평가하세요.

산출물: [Generator 출력 코드]
골든 레퍼런스 원본: [Codex 코더 목업 `s3-mockup/<화면ID>/screen.html` + `s3-mockup/<화면ID>.png` · 폴백 Claude Design export/스크린샷 · S3 레퍼런스 URL]

**디자인 품질 세부 채점 축 (각 20점)** — 아래 5축은 §Phase 3 rubric 의 **`디자인 품질(30%)` 한 칸**을
채우는 세부 기준이다. **최종 판정은 여기서 하지 않는다.**

1. Typography — 독창적 서체 페어링, Inter/Roboto 단독 금지
2. Color — 맥락 맞는 팔레트, 보라 그라데이션 금지
3. Layout — 비대칭/오버랩/대각선 흐름 여부
4. Motion — 고임팩트 1개 집중 여부
5. AI Slop 부재 — 라이브러리 기본값, rounded-corners 과잉 여부

⚠️ **최종 판정은 §Phase 3 rubric 의 4축 가중합 · 70점 기준이고, 계산은 `rubric-weighted-score.py` 가 한다.**

FAIL 시 → Generator에게 구체적 수정 지시 전달 (최대 2회 재시도)
"""
)
```

**Evaluator 독립 원칙:**
- Generator가 자신의 결과를 최종 합격 선언 금지
- Evaluator는 Generator 코드를 보지 않고 루브릭만으로 판정
- 2회 재시도 후에도 FAIL이면 Human 에스컬레이션
> Evaluator FAIL 시 `.claude/logs/{session}/errors.jsonl` 참조하여 재시도
