# forge-harness

Forge 하네스 도구 플러그인. AI 시스템 정합성 감사, 레거시 정리, 외부 하네스 비교 분석.

> **버전**: v0.1.0 | **의존성**: forge-core

---

## 설치

```bash
claude plugin marketplace add moongci38-oss/forge-plugins
claude plugin install forge-core      # 필수 (의존성)
claude plugin install forge-harness
```

---

## 언제 사용하나요?

| 상황 | 사용 스킬/커맨드 |
|------|----------------|
| 하네스 전체 상태 점검 | `/harness-legacy-scan` |
| 레거시 규칙·스킬 정리 | `/harness-diet` (scan 선행 필수) |
| 외부 AI 하네스와 비교 분석 | `/external-harness-sweep <repo_url>` |
| 파이프라인 Agent drift 감지 | `/agent-drift-auditor` |

---

## 권장 워크플로우

```
Step 1: /harness-legacy-scan        # 읽기전용 감사 (안전)
        → diet-queue.json 생성
        
Step 2: 리포트 확인 (사용자 검토)

Step 3: /harness-diet               # low-risk 항목만 자동 적용
        → CLAUDE.md 경량화
        → 레거시 스킬·훅 정리
        → diet-queue.json에서 처리된 항목 제거
```

---

## 스킬 목록

### harness-legacy-scan

Forge 하네스 전체를 읽기전용(read-only)으로 레거시 감사합니다. 실제 변경 없이 문제 목록과 정리 큐를 생성합니다.

**감사 항목**
- 낡은 규칙 (오래된 ADR 참조, 폐기된 패턴)
- 중복 정의 (동일 기능 SKILL.md 2개 이상)
- 과대 전역 컨텍스트 (CLAUDE.md 200줄 초과)
- 넓은 Skill (description이 과도하게 광범위한 스킬)
- 불필요한 Hook (실행 빈도 0인 훅)
- 불필요한 MCP (사용 안 하는 MCP 서버 등록)
- 제품 중복 (forge-dev와 forge-plan 양쪽에 정의된 기능)

**사용법**
```
/harness-legacy-scan
/harness-legacy-scan --scope=rules           # 규칙만
/harness-legacy-scan --scope=skills          # 스킬만
/harness-legacy-scan --scope=hooks           # 훅만
```

**산출물**
```
docs/harness/
├── legacy-scan-report.md          — 전체 감사 리포트 (CRITICAL/HIGH/MEDIUM/LOW)
└── diet-queue.json                — /harness-diet 입력 큐
```

**diet-queue.json 형식**
```json
{
  "version": "1",
  "generated_at": "2026-06-29T12:00:00Z",
  "items": [
    {
      "id": "LQ-001",
      "risk": "low",
      "type": "claude-md-trim",
      "target": "~/.claude/rules/old-rule.md",
      "action": "archive",
      "reason": "ADR-50 이후 폐기된 패턴"
    }
  ]
}
```

---

### harness-diet

`harness-legacy-scan`이 생성한 `diet-queue.json`의 **low-risk 항목만** 자동 적용합니다. high/critical 항목은 사용자 확인 후 수동 처리.

**적용 가능 액션**

| 액션 타입 | 설명 |
|----------|------|
| `claude-md-trim` | CLAUDE.md 내 레거시 섹션 제거·축소 |
| `skill-move` | 절차 설명을 별도 SKILL.md로 이동 |
| `skill-md-split` | 긴 SKILL.md를 여러 파일로 분할 |
| `description-narrow` | 과도하게 넓은 description 구체화 |
| `archive` | 삭제 후보를 `.archive/`로 이동 |
| `hook-remove` | 실행 빈도 0 훅 제거 |

**사용법**
```
/harness-diet                     # diet-queue.json 기반 자동 적용
/harness-diet --dry-run           # 적용 예정 항목만 출력 (실제 변경 없음)
/harness-diet --item LQ-001       # 특정 항목만 적용
```

> **선행 조건**: `/harness-legacy-scan` 실행 후 `diet-queue.json`이 존재해야 합니다.

---

### external-harness-sweep

외부 AI 하네스/스킬 레포를 Forge와 1:1 전수 대조하여 도입 매트릭스를 생성합니다.

**실행 단계 (5 Phase)**

| Phase | 이름 | 설명 |
|-------|------|------|
| 1 | Scout | 레포 구조 탐색, seed 기능 탐지 |
| 2 | Inventory | 전체 스킬·규칙·에이전트 열거 |
| 3 | Compare | Forge와 항목별 1:1 대조 (MATCH/GAP/NEW) |
| 4 | Refute | 적대적 검증 — 외부 항목이 실제로 유용한지 반박 |
| 5 | Synthesize | 도입 매트릭스 생성 (ADOPT/ADAPT/SKIP/DEFER) |

**판정 기준**

| 판정 | 의미 |
|------|------|
| `ADOPT` | Forge에 직접 도입 가능 |
| `ADAPT` | Forge 스타일로 변환 후 도입 |
| `SKIP` | 비호환 또는 Forge에 이미 있음 |
| `DEFER` | 추후 검토 필요 |

**사용법**
```
/external-harness-sweep https://github.com/garrytan/gstack
/external-harness-sweep https://github.com/open-gsd/gsd-core
/external-harness-sweep https://github.com/obra/superpowers
/external-harness-sweep --local ~/reference-source/gbrain   # 로컬 클론
```

**산출물**
```
docs/harness/sweep-{repo-name}-{date}/
├── sweep-report.md                — 전체 비교 리포트
├── adoption-matrix.md             — ADOPT/ADAPT/SKIP/DEFER 매트릭스
└── refutation-log.md              — 적대적 검증 결과
```

---

### agent-drift-auditor

Forge Dev Check 8.9 하네스 무결성 감사. 파이프라인 내 agent drift 3종을 검사합니다.

**감사 항목 3종**

| 유형 | 설명 | 심각도 |
|------|------|--------|
| 삭제 Agent 호출 | `subagent_type` 참조 vs `agents/*.md` 실재 불일치 | CRITICAL |
| 중간 산출물 잔존 | FR 결과가 handover/docs에 미기록 | HIGH |
| Human 게이트 누락 | Telegram/PR/이메일 발송 코드에 `[STOP]` 승인 지점 없음 | HIGH |

**판정 기준**
- `CRITICAL/HIGH` → `[STOP]` — 즉시 수동 수정 필요
- `MEDIUM` → `WARN` — 다음 PR 전 수정 권고
- `LOW` → 참고 사항

**사용법**
```
/agent-drift-auditor                  # 전체 파이프라인 감사
/agent-drift-auditor --check deleted  # 삭제 Agent 참조만
/agent-drift-auditor --check artifacts # 산출물 잔존만
/agent-drift-auditor --check gates    # Human 게이트만
```

> read-only grep 기반 subagent 격리 — 실제 파일 변경 없음.

---

## 커맨드

| 커맨드 | 사용법 | 설명 |
|--------|--------|------|
| `/harness-legacy-scan` | `/harness-legacy-scan [--scope]` | 하네스 레거시 감사 실행 → diet-queue.json 생성 |
| `/harness-diet` | `/harness-diet [--dry-run]` | scan 결과 기반 low-risk 항목 자동 정리 |
| `/external-harness-sweep` | `/external-harness-sweep <url>` | 외부 레포 전수 대조 실행 |

---

## 빠른 시작

```bash
# 1. 하네스 현재 상태 점검
/harness-legacy-scan

# 2. 리포트 확인 후 안전한 항목 정리
/harness-diet --dry-run     # 먼저 미리보기
/harness-diet               # 실제 적용

# 3. 외부 하네스와 비교 (선택)
/external-harness-sweep https://github.com/obra/superpowers

# 4. 파이프라인 Agent drift 감지
/agent-drift-auditor
```

---

## Changelog

### v0.1.0
- 초기 릴리스
- harness-legacy-scan: 7가지 레거시 패턴 감지
- harness-diet: low-risk 5종 자동 적용
- external-harness-sweep: 5 Phase 비교 파이프라인
- agent-drift-auditor: Check 8.9 통합
