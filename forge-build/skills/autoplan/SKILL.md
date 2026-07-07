---
name: autoplan
description: 기획서를 CEO(비즈니스)→Design(UX)→Engineering(기술) 3관점 순차 리뷰 + Synthesizer 종합 + 독립 Evaluator 검증(5-Wave)하는 스킬. Phase 3 에이전트 회의 후 자동 트리거. (적대적 Codex 검수는 cr-triple/codex-review 별도 게이트.)
user-invocable: true
model: sonnet
---

**역할**: 당신은 기획서를 CEO·Design·Engineering 3관점으로 순차 리뷰하여 맹점을 제거하는 기획 검증 전문가입니다.
**컨텍스트**: Phase 3 에이전트 회의 후 자동 트리거되거나 `/autoplan` 호출 시 실행됩니다.
**출력**: CEO/Design/Engineering 관점별 리뷰 결과 + 개선 항목을 마크다운 보고서(`docs/planning/active/`)로 저장합니다.

## Evaluator 핵심 원칙: 절대 관대하게 보지 마라
아래 생각이 들면 더 엄격하게 본다:
- "나쁘지 않은데..." → 감점
- "이 정도면 괜찮지 않나?" → 감점
- "전반적으로 잘했으니 이 부분은 넘어가자" → 금지
규칙:
- 한 항목이 좋아도 다른 항목 문제를 상쇄하지 않는다
- 모든 피드백은 위치 + 이유 + 방법 3요소를 포함한다
- 위험 항목 생략 금지: YAGNI 압박 또는 "전반적으로 양호" 판단으로 [FAIL]/[WARN] 항목을 요약에서 제외하는 것은 절대 금지. 발견된 모든 부정적 판정은 최종 보고서에 전문 기록.

# Autoplan — 3관점 순차 리뷰 + 하네스 검증

기획서(PRD/GDD)를 3개 관점에서 순차적으로 리뷰하여 맹점을 제거한다.

## 핵심 원칙

> **단일 관점은 맹점을 만든다.**
> CEO→Design→Eng 순서로 리뷰하여 비즈니스/UX/기술 모두 검증한다.
> 각 Subagent 결과는 파일로 전달 — 다음 Subagent는 파일을 읽어 컨텍스트를 확보한다.

### 결정 3분류 (BORROW: gstack)

계획 내 모든 선택/결정은 3종 중 하나로 명시한다. 각 Wave 리뷰어는 자신이 다루는 결정 분류를 먼저 확인한다:
- **Mechanical**: 기술적으로 정해진 것 (언어/프레임워크 제약 등) — 협의 불필요.
- **Taste**: 취향/스타일 선택 (네이밍, 레이아웃 등) — 명시하되 이견 수용.
- **User Challenge**: 사용자에게 검증이 필요한 가정 — `[QUESTION]` 태그로 표시.

### Decision Audit Trail (DAT)

Wave 4 Synthesizer는 최종 보고서에 DAT 섹션을 포함한다. 핵심 결정 3-5개에 대해 아래 4항목 기록:
(a) 결정 내용, (b) 검토된 대안, (c) 선택 이유, (d) 이 결정이 뒤집히는 조건.
Wave 5 Evaluator는 DAT 존재 여부 + 완성도를 검증 포인트에 포함한다.

## 사용법

(manual)
/autoplan                           # 현재 Phase 3 기획서 리뷰
/autoplan --doc path/to/prd.md      # 특정 문서 리뷰
/autoplan --skip ceo                # CEO 리뷰 스킵

(auto-trigger)
Phase 3 에이전트 회의(Competing Hypotheses) 후 → 자동 실행

---

## Step 0: 스코프 챌린지 (착수 전 의무)

Wave 1 CEO 진입 전 아래 4개 항목을 순서대로 확인한다:

1. **목표 요약**: 리뷰 대상 기획서의 핵심 목표를 1문장으로 요약한다.
2. **Why Now**: 이 기획을 지금 진행해야 하는 이유를 1-2줄로 명시한다.
3. **Confidence 1-10**: 현재 확인 가능한 정보 완성도에 대한 신뢰도를 1-10으로 명시한다. 7 미만이면 `[WARN] confidence <N>/10 — 기획서 보완 후 진행 권장`을 출력하고 사용자 확인을 기다린다.
4. **Scope 초기 판단**: 기획 범위가 팀 규모 기준 1 Sprint(≈2주) 내 구현 가능한지 초기 판단한다. 불가 판단 시 Wave 1 CEO에게 scope 축소 검토를 위임 지시한다.

---

## 하네스 아키텍처: 파일 기반 통신 5-Wave

### 파일 기반 통신 프로토콜

각 Wave의 결과는 파일에 저장되고 다음 Wave는 파일을 읽어 컨텍스트를 확보한다.

| 파일 | 경로 | 작성자 | 읽는 자 |
|------|------|--------|---------|
| `AUTOPLAN_CEO.md` | `.claude/state/AUTOPLAN_CEO.md` | Wave 1 CEO | Wave 2 Design, Wave 3 Eng, Wave 4 Synthesizer |
| `AUTOPLAN_DESIGN.md` | `.claude/state/AUTOPLAN_DESIGN.md` | Wave 2 Design | Wave 3 Eng, Wave 4 Synthesizer |
| `AUTOPLAN_ENG.md` | `.claude/state/AUTOPLAN_ENG.md` | Wave 3 Engineering | Wave 4 Synthesizer |
| `AUTOPLAN_SYNTHESIS.md` | `.claude/state/AUTOPLAN_SYNTHESIS.md` | Wave 4 Synthesizer | Wave 5 Evaluator |
| `{기획서}-autoplan-review.md` | 기획서 경로와 동일 디렉토리 | Wave 4 Synthesizer | 사용자, Wave 5 Evaluator |

**모든 AUTOPLAN 중간 파일은 `{project_root}/.claude/state/` 에 저장한다.**

---

### Wave 1: CEO Subagent (비즈니스 리뷰)

```
subagent_type: general-purpose
model: sonnet
```

**입력**: 기획서 파일 Read
**임무**: 비즈니스 관점 리뷰

#### CEO 리뷰 모드 (GS-B14)

호출 시 `--mode` 인자로 선택. 기본: `standard`.

| 모드 | 설명 | 출력 밀도 |
|------|------|----------|
| `quick` | Kill Signal + 수익 모델만 확인 | 1페이지 이내 |
| `standard` | 5축 전체 검토 | 2~3페이지 |
| `deep` | 경쟁사 비교 + 시나리오 3종 포함 | 5페이지+ |
| `challenge` | Premise Challenge 의무 실행 | 표준 + 도전 섹션 |

#### Premise Challenge (GS-B14 — `challenge` 또는 `deep` 모드 의무)

기획서의 핵심 전제 3개를 선정하여 각각 도전한다:

```
전제 1: {전제 내용}
  도전: 이 전제가 틀렸다면? (반증 시나리오)
  결론: [취약 / 강건 / 검증 필요]

전제 2: ...
전제 3: ...
```

전제가 취약하거나 검증 필요인 경우 → `[WARN] Premise 불안정: {내용}` 출력.

#### 구현 대안 의무 (GS-B14)

핵심 기능 1~3개에 대해 반드시 대안 구현 방식 1개 이상 제시:

```
기능: {기능명}
  현재 방식: {기획서 내 방식}
  대안: {더 단순 / 더 빠른 / 더 저렴한 방식}
  선택 기준: {현재 방식 유지 or 대안 채택 조건}
```

#### Scope 결정 게이트 (GS-B14)

Wave 0 Scope 초기 판단에서 "불가" 판정 시:

```
[STOP] Scope 초과 감지 — CEO Wave 진입 전 범위 재조정 필요
  현재 범위: {요약}
  팀 규모 1Sprint 한도: {추정 SP vs 가용 SP(인당 ~7SP × 팀원 수)}
  축소 제안:
    - 제거 가능: {기능 목록}
    - 연기 가능: {기능 목록}
  사용자 확인 후 재진행.
```

| 검증 항목 | 기준 |
|----------|------|
| 비즈니스 모델 | 수익화 경로 명확, 단가/마진 계산 |
| 시장 적합성 | TAM/SAM/SOM 대비 제품 포지셔닝 |
| ROI | 개발 비용 대비 기대 수익 |
| 경쟁 우위 | 진입장벽, 차별점, MOAT |
| Kill Signal | 시장 없음, 수익 모델 없음, 경쟁 불가 |

**출력**: `.claude/state/AUTOPLAN_CEO.md`
- CEO 어노테이션 + [PASS]/[WARN]/[FAIL] 항목별 판정
- Kill Signal 감지 여부 명시
- Premise Challenge 결과 (challenge/deep 모드 시)
- 구현 대안 목록 (핵심 기능 1~3개)

---

### Wave 2: Design Subagent (UX/UI 리뷰)

```
subagent_type: ux-researcher
model: sonnet
```

**입력**: 기획서 파일 Read + `.claude/state/AUTOPLAN_CEO.md` Read
**임무**: CEO 리뷰 결과를 참고하여 UX/UI 관점 리뷰 (ux-researcher 전용 UX 검증 + CRITICAL/HIGH/MEDIUM/LOW 등급)

#### 7차원 0-10 채점 (GS-B15)

각 차원을 0-10으로 독립 채점. 6점 미만 = [FAIL], 6-7 = [WARN], 8+ = [PASS].

| 차원 | 0-10 | 기준 |
|------|:----:|------|
| 1. Task Flow | | 핵심 태스크 3클릭 이내 완료 가능 |
| 2. 정보 구조 | | 내비게이션 계층 ≤ 3단계, 라벨 직관적 |
| 3. 시각 일관성 | | 디자인 시스템/토큰 준수, 컬러·타입·스페이싱 통일 |
| 4. 접근성 (A11y) | | WCAG 2.1 AA: 대비비 ≥ 4.5:1, 포커스 가시, aria-label |
| 5. 반응성 | | 모바일/태블릿/데스크톱 3뷰 모두 명세 존재 |
| 6. 에러 처리 UX | | 에러 → 원인 + 복구 경로 명시 |
| 7. 온보딩 | | 신규 사용자 3분 내 핵심 가치 체험 가능 |

**7차원 합산 (가중 평균)**: ≥ 7.0 = [PASS] / 5.0~6.9 = [WARN] / < 5.0 = Kill Signal

#### AI Slop 블랙리스트 (GS-B15)

기획서 UX 문구에서 아래 패턴 발견 시 [WARN] 표시:

- "직관적인 인터페이스" (측정 불가 주장)
- "사용하기 쉬운" / "간편한" (근거 없는 단언)
- "최고의 UX" / "최상의 경험" (상대적 우열 미증명)
- "모든 사용자를 위한" (페르소나 미정의)
- "심플하고 직관적" (이중 슬롭)

패턴 발견 시: `[WARN] AI Slop: "{문구}" — 측정 기준 또는 근거 필요`

#### 인터랙션 상태 표 (GS-B15)

기획서 내 핵심 UI 컴포넌트(≥3개)에 대해 5가지 상태 명세 점검:

| 컴포넌트 | Idle | Loading | Success | Error | Empty |
|---------|:----:|:-------:|:-------:|:-----:|:-----:|
| {컴포넌트명} | ✓/✗ | ✓/✗ | ✓/✗ | ✓/✗ | ✓/✗ |

✗ 항목 = [WARN] 상태 명세 누락.

#### 감정 여정 검증 (GS-B15)

핵심 사용자 플로우에서 감정 곡선 확인:

```
단계 1 [진입]: 기대감 → [명세 있음/없음]
단계 2 [탐색]: 혼란/안도 → [명세 있음/없음]
단계 3 [핵심 액션]: 성취/좌절 → [명세 있음/없음]
단계 4 [이탈/완료]: 만족/실망 → [명세 있음/없음]
```

부정 감정(혼란/좌절/실망)이 예상되는 지점에서 완화 장치 없으면 [WARN].

| 검증 항목 | 기준 |
|----------|------|
| Kill Signal | UX 복잡도 과다, 학습곡선 급경사, 7차원 평균 < 5.0 |

**디자인 레퍼런스 URL (필수 수집)**
기획서에 아래 항목을 반드시 포함할 것:
```
## 디자인 레퍼런스
- 참고 사이트: [URL] — (어떤 스타일/요소를 참고할지 한 줄 설명)
- 참고 사이트: [URL] — ...
```
→ Phase 8 구현 시 이 URL을 Claude Design(claude.ai/design)에 전달하여 화면 생성

**출력**: `.claude/state/AUTOPLAN_DESIGN.md`
- 7차원 채점표 + 합산 + [PASS]/[WARN]/[FAIL]
- AI Slop 발견 목록 (있을 경우)
- 인터랙션 상태 표 (✗ 항목 목록)
- 감정 여정 [WARN] 목록
- CEO 리뷰와의 우선순위 조정 사항 명시
- Kill Signal 감지 여부 명시
- **Pass 7 미해결 결정 테이블** (Wave 3 Engineering 진입 전 강제 해소):

| 결정 필요 | 미루면 무슨 일 (if deferred) |
|----------|---------------------------|
| {미결 디자인 결정 항목} | {Wave 3 착수 시 어떤 변경/비용 발생} |

---

### Wave 2.5: DevEx Subagent (개발자 경험 리뷰 — GS-B16)

```
subagent_type: general-purpose
model: sonnet
```

> **조건부 실행**: 기획서가 개발자 대상 도구(SDK/API/CLI/개발 플랫폼)이거나 `--devex` 플래그 시 실행. 일반 B2C 앱은 스킵.

**입력**: 기획서 파일 Read + `.claude/state/AUTOPLAN_CEO.md` Read + `.claude/state/AUTOPLAN_DESIGN.md` Read
**임무**: 개발자 경험(DX) 관점 리뷰

#### DX 3축 점검

| 축 | 검증 항목 | 기준 |
|----|---------|------|
| **CLI/API UX** | 명령 구조 | 동사-명사 일관성, `--help` 존재, tab completion 고려 |
| | 옵션 이름 | 직관적 약어, 충돌 없음 |
| | 출력 형식 | 기본 human-readable, `--json` 옵션, stderr vs stdout 분리 |
| **에러 메시지** | 에러 내용 | 원인 + 복구 방법 모두 포함 |
| | 에러 코드 | 문서화된 에러 코드 체계 존재 |
| | 디버그 정보 | `--verbose` / `--debug` 모드 명세 |
| **DX 지표** | Time-to-Hello | 신규 개발자가 첫 성공 출력까지 ≤ 5분 |
| | 문서 완성도 | 퀵스타트 + 레퍼런스 + 예제 3종 존재 |
| | 로컬 개발 | 외부 의존 없이 로컬 실행 가능 여부 |

#### 개발자 감정 여정

```
단계 1 [설치]: ≤ 3분 설치 가능? 의존성 명확?
단계 2 [첫 실행]: Hello World까지 ≤ 5분?
단계 3 [문서 탐색]: API Ref 위치 3클릭 이내?
단계 4 [에러 만남]: 에러 메시지가 스스로 해결 가능?
단계 5 [고급 사용]: 예제→커스터마이징 경로 명확?
```

각 단계에서 마찰 포인트 발견 시 [WARN].

**출력**: `.claude/state/AUTOPLAN_DEVEX.md`
- DX 3축 점검표 + [PASS]/[WARN]/[FAIL]
- 개발자 감정 여정 마찰 포인트 목록
- Time-to-Hello 추정값

---

### Wave 3: Engineering Subagent (기술 리뷰)

```
subagent_type: cto-advisor
model: sonnet
```

**입력**: 기획서 파일 Read + `.claude/state/AUTOPLAN_CEO.md` Read + `.claude/state/AUTOPLAN_DESIGN.md` Read
**임무**: CEO + Design 리뷰 결과를 참고하여 기술 관점 리뷰 (cto-advisor 7축: 아키텍처·API·데이터모델·보안·성능·테스트전략·기술부채)

#### Step 0: 스코프 확인 + Confidence 캘리브레이션 (GS-B17)

리뷰 시작 전 즉시 실행:

```
스코프 선언: {구현 범위 1줄 요약}
스택 확인: {기술 스택 나열 — 없으면 "미명시"}
Confidence: {1-10}
  - 10: 기술 스택 명확 + 팀 경험 풍부
  - 7-9: 스택 명확 but 일부 미지 영역
  - 4-6: 핵심 기술 스택 미명시 또는 미경험 기술 다수
  - 1-3: 기술 미명시, 구현 방식 불분명
```

Confidence < 6 → `[WARN] confidence {n}/10 — 기술 스택 보완 후 진행 권장`

#### Pre-Emit (GS-B17)

4-Section 리뷰 시작 전 주요 발견 예고:

```
[PRE-EMIT] 예상 주요 이슈:
- CRITICAL: {있을 경우}
- HIGH: {예상 항목}
- 확인 필요: {불분명한 영역}
```

#### 4-Section 리뷰 구조 (GS-B17)

**Section 1: 아키텍처 + ASCII 다이어그램**

시스템 구성 요소를 ASCII 다이어그램으로 표현 (필수):

```
[Client] → [API Gateway] → [Service A]
                         → [Service B] → [DB]
                         → [Queue] → [Worker]
```

- 확장성: 트래픽 10x 시 병목 지점 식별
- 유지보수성: 단일 책임 원칙 준수 여부
- 의존 관계: 순환 의존 없음 확인

**Section 2: 보안 + 데이터 모델**

| 검증 항목 | 기준 |
|----------|------|
| 인증/인가 | OWASP A01 — Broken Access Control |
| 입력 검증 | OWASP A03 — Injection |
| 데이터 암호화 | PII 필드 암호화 여부 |
| 데이터 모델 | ERD 또는 주요 엔티티 관계 명세 존재 |

**Section 3: 실패 모드 분석 (GS-B17)**

핵심 컴포넌트별 실패 시나리오 및 복구 경로:

```
컴포넌트: {이름}
  실패 유형: {timeout / crash / 데이터 손실 / ...}
  영향 범위: {서비스 X 전체 / 특정 기능만 / ...}
  복구 경로: {retry / fallback / 수동 개입 / ...}
  MTTR 추정: {분/시간}
```

구현 불가능한 복구 경로 → [FAIL].

**Section 4: 병렬화 전략 + 일정 (GS-B17)**

```
병렬 가능 작업:
  T1: {작업} ─┬─ T2: {작업}
              └─ T3: {작업}
  합류점: T4 (T2+T3 완료 후)

순차 의존:
  T5 → T6 → T7 (데이터 스키마 먼저)

SP 추정:
  전체: {N SP}
  병렬 효율: {M%} → 실효 {K SP}
  팀 규모 1Sprint 가용 SP 한도 내: {예/아니오}
```

#### JSONL 아티팩트 출력 (GS-B17)

리뷰 완료 후 `.claude/state/AUTOPLAN_ENG_FINDINGS.jsonl`에 findings 추가:

```jsonl
{"section":"architecture","severity":"HIGH","item":"단일 장애점 발견: API Gateway에 redundancy 없음","action":"이중화 또는 health-check 추가"}
{"section":"security","severity":"CRITICAL","item":"PII 필드 평문 저장","action":"암호화 필드 추가 또는 vault 연동"}
```

| 검증 항목 | 기준 |
|----------|------|
| 기술 실현성 | 기술 스택으로 구현 가능 여부 |
| Kill Signal | 기술 불가, 일정 3배+ 초과, Confidence < 4 |

**출력**: `.claude/state/AUTOPLAN_ENG.md`
- Pre-Emit 요약
- 4-Section 리뷰 전문 (ASCII 다이어그램 포함)
- 실패 모드 분석표
- 병렬화 전략 + SP 추정
- Engineering [PASS]/[WARN]/[FAIL] 판정
- Design 범위 변경에 따른 기술 영향도 명시
- Kill Signal 감지 여부 명시
- `.claude/state/AUTOPLAN_ENG_FINDINGS.jsonl` 생성

---

### Wave 4: Lead Synthesizer (신규)

```
subagent_type: general-purpose
model: sonnet
```

**입력**:
- `.claude/state/AUTOPLAN_CEO.md` Read
- `.claude/state/AUTOPLAN_DESIGN.md` Read
- `.claude/state/AUTOPLAN_ENG.md` Read

**임무**: 3관점 리뷰 종합, 충돌 정리, PASS/FAIL 판정

**수행 절차**:
1. 3개 리뷰 파일의 [FAIL] 항목 전부 수집
2. 관점 간 충돌 항목 정리 (CEO vs Design, CEO vs Eng, Design vs Eng)
3. Kill Signal 감지 여부 최종 확인 (3관점 중 1개라도 Kill Signal → 즉시 FAIL)
4. **Rubric 기반 PASS/FAIL 판정**:

| Rubric 항목 | 가중치 | FAIL 기준 |
|------------|:------:|----------|
| 비즈니스 타당성 | 30% | Kill Signal 또는 수익 모델 불명확 시 즉시 FAIL |
| UX 실현성 | 25% | 핵심 플로우 3클릭 이내 미충족, Kill Signal 시 즉시 FAIL |
| 기술 실현성 | 25% | 기술 불가 또는 일정 3배+ 초과 시 즉시 FAIL |
| 디자인 레퍼런스 완성도 | 20% | 디자인 레퍼런스 URL 미포함 시 WARN, 기획서 내 화면 명세 누락 시 FAIL |

**PASS 기준**: 합산 70점 이상 + 즉시 FAIL 항목 없음

5. (선택) Advisor 통합 조언 — 3관점 리뷰에서 충돌이 2건 이상 발생하거나, 고위험 기획(1억 이상 예산·신규 시장 진입·아키텍처 대전환)일 때만:

   ```
   Agent(
     subagent_type="advisor-strategist",
     prompt="""
   3관점 리뷰 충돌 통합 조언 요청.

   기획서 핵심 (3~5줄):
   {기획 요약}

   CEO 리뷰 (1문단):
   {CEO 어노테이션 요약}

   Design 리뷰 (1문단):
   {Design 어노테이션 요약}

   Engineering 리뷰 (1문단):
   {Engineering 어노테이션 요약}

   충돌 리스트:
   - {충돌 1}
   - {충돌 2}

   질문:
   1. 이 기획의 전체 전략 방향에서 놓치기 쉬운 맹점 2개.
   2. 3관점 충돌 중 어느 쪽 의견에 더 가중치를 둬야 하는지 근거 제시.
   """
   )
   ```

   Advisor 응답을 별도 "## Advisor 통합 조언" 섹션으로 리뷰 리포트에 첨부.

**출력**:
- `.claude/state/AUTOPLAN_SYNTHESIS.md` (내부 작업 파일)
- `{기획서 경로}-autoplan-review.md` (최종 리뷰 리포트)

```
## Autoplan 3관점 리뷰 결과

### CEO Review
- [PASS] 비즈니스 모델: ...
- [WARN] ROI: ...

### Design Review
- [PASS] UX 플로우: ...
- [FAIL] 접근성: ...

### Engineering Review
- [PASS] 기술 실현성: ...
- [WARN] 일정: ...

### 충돌 사항
- CEO vs Eng: 기능 A의 우선순위 (비즈니스 가치 높음 vs 기술 복잡도 높음)

### Rubric 점수 (Lead Synthesizer 판정)
| 항목 | 가중치 | 점수 | 비고 |
|------|:------:|:----:|------|
| 비즈니스 타당성 | 30% | X/100 | ... |
| UX 실현성 | 25% | X/100 | ... |
| 기술 실현성 | 25% | X/100 | ... |
| 디자인 레퍼런스 완성도 | 20% | X/100 | ... |
| **가중 합산** | 100% | X.X/100 | |

### 판정: PASS / FAIL

### 개선 권고사항
- [위치]: [이유] → [방법]
```

---

### Wave 5: 독립 Evaluator Subagent (신규)

```
subagent_type: general-purpose
model: sonnet
```

> **핵심 원칙: Lead Synthesizer ≠ Evaluator**
> Lead가 너무 관대하게 보지 않았는가를 별도 에이전트가 재확인한다.
> Synthesizer의 의도나 판단 근거는 전달하지 않는다.

**입력**:
- `{기획서 경로}-autoplan-review.md` Read (Synthesizer 판정 결과)
- `.claude/state/AUTOPLAN_CEO.md` Read
- `.claude/state/AUTOPLAN_DESIGN.md` Read
- `.claude/state/AUTOPLAN_ENG.md` Read
- 기획서 원본 Read

**임무**: Lead Synthesizer 판정의 독립 검증

**검증 포인트**:
1. **Kill Signal 재확인**: 3관점 리뷰에서 Kill Signal이 있었는가? Lead가 이를 무시하거나 완화하지 않았는가?
2. **관대함 체크**: Synthesizer가 "나쁘지 않은데", "이 정도면 괜찮지 않나" 수준으로 PASS를 준 항목이 있는가?
3. **충돌 해소 검증**: 관점 간 충돌을 납득할 근거 없이 넘어갔는가?
4. **Rubric 점수 독자 산정**: Synthesizer 점수와 독자적으로 산정한 점수 간 차이가 10점 이상이면 ESCALATE
5. **디자인 레퍼런스 완성도**: 기획서에 구체적인 레퍼런스 URL이 포함되어 있는가? 화면 명세와 연결되어 있는가?

**Evaluator 판정 원칙:**
- Synthesizer PASS를 그대로 믿지 않는다 — 원본 리뷰 파일에서 직접 확인
- "Lead가 이미 검토했으니" → 금지. 독자적으로 판단한다
- 모든 피드백: **위치 + 이유 + 방법** 3요소 필수

**출력**: `{기획서 경로}-autoplan-review.md` 하단에 "## Wave 5 독립 Evaluator 검증" 섹션 추가

```
## Wave 5 독립 Evaluator 검증

### Lead Synthesizer 판정 검증
- Kill Signal 재확인: [OK / ESCALATE — 이유]
- 관대함 체크: [OK / 지적사항]
- 충돌 해소 검증: [OK / 불충분 — 이유]
- Rubric 독자 점수: X.X/100 (Lead: X.X/100, 차이: X점)

### 최종 판정: CONFIRM PASS / CONFIRM FAIL / ESCALATE

### 에스컬레이션 항목 (해당 시)
- [항목]: [이유] → [Human 확인 필요 사항]
```

**최종 판정 기준**:
- **CONFIRM PASS**: Rubric 차이 10점 미만, Kill Signal 없음, 충돌 해소 납득
- **CONFIRM FAIL**: Rubric 합산 70점 미만 또는 즉시 FAIL 항목 존재
- **ESCALATE**: Rubric 차이 10점 이상 또는 Lead가 Kill Signal을 무시한 정황

---

## Workflow 통합 (계획서 P2-2)
파일 기반 통신 → JS 변수 직접 전달. 중간 파일(.claude/state/AUTOPLAN_*.md) 생성 없음. 컨텍스트 격리.
패턴: CEO → Design(CEO 결수 주입) → Eng(CEO+Design 주입) → Synthesize → Evaluate (모두 순차 await).
실행: `Workflow({ script: Bash("cat $HOME/.claude/skills/autoplan/workflow.js"), args: { docPath, skip } })`
agentType: Wave 2 = ux-researcher / Wave 3 = cto-advisor.
`CLAUDE_CODE_DISABLE_WORKFLOWS=1` 시 기존 5-Wave 파일 기반 방식 fallback.

### Restore Point 원칙

각 Wave/Phase 진입 전 계획서에 rollback point를 명시한다: "이 Phase를 되돌리려면 <무엇을 어떻게 원복>". Kill Signal 감지 시 이 rollback point로 복귀 경로가 보장되어야 한다. Wave 4 Synthesizer는 FAIL 판정 시 rollback 경로를 최종 보고서에 포함한다.

## 워크플로우 요약

1. Phase 3 기획서 + Competing Hypotheses 최종안 읽기
2. **Wave 1 CEO Subagent** → `.claude/state/AUTOPLAN_CEO.md` 저장
3. **Wave 2 Design Subagent** → CEO 파일 읽기 → `.claude/state/AUTOPLAN_DESIGN.md` 저장
4. **Wave 3 Engineering Subagent** → CEO+Design 파일 읽기 → `.claude/state/AUTOPLAN_ENG.md` 저장
5. **Wave 4 Lead Synthesizer** → 3파일 읽기 → 충돌 정리 + PASS/FAIL → `{기획서}-autoplan-review.md` 저장
6. **Wave 5 독립 Evaluator** → 리뷰 파일 + 원본 3파일 읽기 → Lead 판정 검증 → CONFIRM PASS/FAIL/ESCALATE
7. CONFIRM PASS → 완료
8. CONFIRM FAIL / ESCALATE → Human 에스컬레이션 + 충돌 리포트

## 순차 실행 이유

병렬이 아닌 순차인 이유:
1. CEO 리뷰 결과가 Design 리뷰의 우선순위를 결정
2. Design 리뷰 결과가 Engineering 리뷰의 범위를 결정
3. 순차적으로 쌓이는 어노테이션이 다음 리뷰어의 컨텍스트가 됨
4. 파일 기반 통신으로 각 Wave가 이전 Wave 결과를 완전히 흡수 후 판단
> Evaluator FAIL 시 `.claude/logs/{session}/errors.jsonl` 참조하여 재시도
