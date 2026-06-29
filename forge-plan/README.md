# forge-plan

Forge 기획 파이프라인 플러그인 — 요구사항 명확화부터 Spec 작성, PRD/GDD 완성, 상세 기획 패키지까지 S1~S3 전 단계를 지원합니다.

> **버전**: v0.1.2 | **의존성**: forge-core

---

## 설치

```bash
claude plugin marketplace add moongci38-oss/forge-plugins
claude plugin install forge-core   # 필수 선행 설치
claude plugin install forge-plan
```

---

## 스킬 목록

| 스킬 | 설명 |
|------|------|
| `autoplan` | 기획서 3관점(CEO·Design·Engineering) 리뷰 + Evaluator 검증 |
| `requirements-clarity` | 구현 전 모호한 요구사항 대화식 명확화 |
| `writing-plans` | Spec → 구체적 구현 계획서 변환 |

### autoplan

기획서를 CEO(비즈니스) → Design(UX) → Engineering(기술) 3관점으로 순차 리뷰하고, Synthesizer가 종합하며 독립 Evaluator가 검증하는 5-Wave 스킬입니다.

- **트리거**: Phase 3 에이전트 회의 후 자동, 또는 `/autoplan` 직접 호출
- **입력**: 기획서 경로 (PRD/GDD 문서)
- **출력**: 3관점 리뷰 + 통합 평가 리포트

```
/autoplan docs/planning/prd-notification.md
```

### requirements-clarity

구현 착수 전 모호한 요구사항을 2가지 핵심 질문으로 명확화합니다.

- **Why?** — YAGNI 체크: 정말 필요한가?
- **Simpler?** — KISS 체크: 더 단순한 방법은?

복잡한 기능(2일 이상 예상), 팀 간 조정 필요 시, 요구사항이 불분명할 때 사용하세요.

```
/requirements-clarity
```

### writing-plans

Spec 또는 요구사항 문서를 TDD 지향의 구체적인 구현 계획서로 변환합니다.

- **출력**: 파일 경로 명시 + 2~5분 단위 액션 시퀀스 + 각 스텝별 테스트 검증 방법
- **사용 시점**: 코드 변경 시작 **전** 실행 (계획서 완성 후 구현)

```
/writing-plans
```

---

## 커맨드 목록

| 커맨드 | 사용법 | 설명 |
|--------|--------|------|
| `/forge-plan` | `/forge-plan` | Forge 기획 Phase 4 — 상세 기획 패키지 작성 |
| `/forge-spec` | `/forge-spec <기능 설명>` | Spec 작성 단독 실행 |
| `/spec-write` | `/spec-write <기능명>` | Spec 작성 (forge-spec 별칭) |
| `/prd` | `/prd <제품명>` | PRD(제품 요구사항 문서) 작성 |
| `/forge-design` | `/forge-design` | PRD(web) 또는 GDD(game) 기획서 작성 |

### /forge-plan

Forge 기획 파이프라인 Phase 4를 실행합니다. PRD/GDD 기획서를 바탕으로 산출물 3종(UI/UX 기획서·상세 기획서·개발 계획서)과 검증 3종(autoplan·CTO 검토·UX 검증)을 완성합니다. 완료 후 [STOP] 승인 게이트.

```
/forge-plan
```

### /forge-spec

Spec 문서를 단독으로 작성합니다. 기능 설명을 입력하면 요구사항 명확화 → Spec 완성 → [STOP] 승인 순서로 진행합니다.

```
/forge-spec 사용자 알림 기능
/forge-spec 결제 위젯 리디자인
```

### /spec-write

`/forge-spec`의 별칭 커맨드입니다. 동일하게 동작합니다.

```
/spec-write 소셜 로그인 OAuth2 연동
```

### /prd

아이디어를 입력하면 요구사항 명확화 대화 후 완성된 PRD(Product Requirements Document)를 생성합니다.

```
/prd 실시간 협업 노트 앱
```

### /forge-design

웹 서비스(PRD 트랙)와 게임(GDD 트랙)을 자동 분기하여 기획서를 작성합니다.

```
/forge-design          # 현재 프로젝트 트랙 자동 감지
```

---

## 에이전트

| 에이전트 | 역할 |
|----------|------|
| `cto-advisor` | S4 기술 검토 — 7축 분석 + CRITICAL/HIGH/MEDIUM/LOW 이슈 리포트 |
| `spec-writer-base` | Spec 문서 작성 전문가 — Constitution 기반 정확한 형식 |

### cto-advisor

Forge S4 Phase 4-② 기술 검토 전문 에이전트입니다. 7개 축으로 기술 리뷰를 수행하고 이슈 등급별 리포트(`wave3-cto-{date}.md`)를 생성합니다.

검토 7축:
1. **아키텍처** — 구조 설계 적합성
2. **API** — 인터페이스 설계 일관성
3. **데이터 모델** — 스키마 및 관계 설계
4. **보안** — 위협 모델 및 방어 설계
5. **성능** — 병목 예상 및 캐싱 전략
6. **테스트 전략** — 커버리지 및 테스트 접근법
7. **기술 부채** — 장기 유지보수 영향

### spec-writer-base

Spec 문서를 Constitution 기반으로 작성하는 전문가 에이전트입니다. 새 기능 Spec 작성이나 기존 Spec 업데이트 시 자동으로 스폰됩니다.

---

## 기획 파이프라인 전체 흐름

```
S1. 기회 발견
    ↓
/requirements-clarity       ← 요구사항 명확화 (Why? + Simpler?)
    ↓
S2. 기획서 작성
    /prd <제품명>            ← 웹 서비스 PRD
    /forge-design            ← 웹/게임 기획서 (트랙 자동 분기)
    ↓
/autoplan                   ← 3관점 기획 검토 + Evaluator 검증
    ↓
S3. 기획서 완성
    /forge-plan              ← 상세 기획 패키지 (산출물 6종)
    ↓
[STOP] 승인 게이트
    ↓
/forge-spec <기능>          ← Spec 작성
    ↓
[STOP] Spec 승인
    ↓
/forge-implement             ← 구현 착수 (forge-dev 플러그인)
```

---

## 빠른 시작 예시

```
# 새 기능 기획 시작
/requirements-clarity

# PRD 작성
/prd 실시간 채팅 기능

# 기획서 3관점 리뷰
/autoplan docs/planning/prd-chat.md

# 상세 기획 패키지 완성
/forge-plan

# Spec 작성 후 구현
/forge-spec 채팅 메시지 전송 API
/forge-implement
```

---

## 의존 플러그인

| 플러그인 | 필수 여부 | 용도 |
|---------|----------|------|
| forge-core | ✅ 필수 | cr-multi 검수, 세션관리 |
| forge-dev | 구현 단계 | /forge-implement, /forge-qa |

---

## Changelog

### v0.1.2 (2026-06-23)
- `/forge-spec` 커맨드 추가 (옛 `/sdd` Phase 0~2 단독 실행)
- `spec-writer-base` 에이전트 추가
- `autoplan` 5-Wave 독립 Evaluator 도입

### v0.1.1 (2026-06-04)
- forge-core 의존성 정합 업데이트

### v0.1.0 (2026-06-02)
- 최초 패키징: autoplan, requirements-clarity, writing-plans
- forge-plan, forge-spec, spec-write, prd, forge-design 커맨드
