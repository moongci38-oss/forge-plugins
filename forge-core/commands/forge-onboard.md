---
description: 신규 프로젝트를 Forge 파이프라인에 온보딩 — 등록부터 환경 설정까지 4단계 자동화
allowed-tools: Bash, Read, Write, Edit, Glob, Grep, Agent
argument-hint: <project-path> --name <name> --type <web|game> [--description "설명"]
group: ops
---

# /forge-onboard — 신규 프로젝트 온보딩

forge-onboard 스킬을 실행합니다.

## 인자 파싱

사용자가 제공한 인자에서 추출:
- `project-path`: 프로젝트 경로 (필수)
- `--name`: 프로젝트 이름 (필수, kebab-case)
- `--type`: web 또는 game (필수)
- `--description`: 설명 (선택)

누락된 필수 인자는 사용자에게 확인.

## 실행

forge-onboard 스킬의 4단계를 순서대로 실행:

1. **Phase 1**: forge-sync init → manifest 등록
2. **Phase 2**: forge-sync sync → 규칙/템플릿 배포
3. **Phase 3**: 프로젝트 스캐폴딩 (CLAUDE.md, constitution, agent-teams, verify.sh, docs/)
4. **Phase 4**: forge-workspace.json 연결

완료 후 체크리스트로 검증.

## Multi-doc Ingestion + Precedence Chain (WI-24)

프로젝트 문서를 일괄 수집하고 우선순위 체계를 적용한다.

### 문서 수집 (ingest-docs)

`--docs <path>` 또는 `--docs-dir <dir>` 인자로 기존 문서를 일괄 ingestion:

```bash
/forge-onboard <project-path> --name <name> --type web --docs ./legacy-docs/
```

수집 대상: ADR, Spec, PRD, README, ERD, API 명세, 기타 설계 문서.

### 우선순위 체계 (precedence chain)

수집된 문서 간 충돌 시 아래 순서로 우선 적용:

```
ADR > SPEC > PRD > DOC
```

| 등급 | 설명 | 처리 |
|------|------|------|
| **ADR** | 아키텍처 결정 기록 — 번복 불가 결정 | 항상 우선. 충돌 시 다른 문서 수정 제안 |
| **SPEC** | 구현 명세 — 승인된 설계 계약 | ADR 다음. PRD와 충돌 시 Spec 우선 |
| **PRD** | 제품 요구사항 — 비즈니스 목표 | Spec 없을 때 기준 |
| **DOC** | 일반 문서 — 참고용 | 충돌 시 항상 하위 |

### BLOCKER 게이트

ingestion 중 다음 발견 시 **[STOP]** 사용자 확인 필수:
- ADR ↔ Spec 직접 충돌 (ADR 결정을 Spec이 위반)
- 동일 기능에 대한 Spec 2개+ 존재 (버전 불일치)
- PRD에 명시된 필수 요구사항이 기존 Spec에 누락

BLOCKER 없으면 → `precedence-check: PASS` 명시 후 Phase 1 진입.
