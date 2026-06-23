---
name: harness-diet
description: "harness-legacy-scan 리포트의 low-risk 항목만 적용: CLAUDE.md 축소/절차→Skill 이동/긴 SKILL.md 분할/description 좁힘/삭제후보 archive. 트리거: /harness-diet"
metadata:
  eval_cases: off
---

# harness-diet

**역할**: harness-legacy-scan이 생성한 diet-queue.json을 소비해, diet_auto=true && risk=low 항목만 자동 적용.  
**컨텍스트**: `/harness-diet` 호출 시. 반드시 scan 리포트를 먼저 검토·납득한 후 실행할 것.  
**출력**: 7보고 섹션 (변경목록/이유/Before-After/diff요약/Claude행동변화/Human승인목록/smoke-test).

## 쓰지 말아야 할 때

- scan 리포트를 검토하지 않은 상태 → 먼저 `harness-legacy-scan` 실행 + 리포트 확인.
- medium+ 위험 변경을 자동 적용하려 할 때 → [STOP] 게이트 필수, Human 승인 후만.
- hook/MCP/allowed-tools 변경 → 본 스킬 절대 수정 불가 (gist 금지 7 준수).
- 앱 코드/test/build/deploy 임의 실행 → 금지.

## 의도 (§2 전문)

harness-legacy-scan 결과를 실제 SSoT(`${FORGE_ROOT:-$HOME/forge}/.claude/`)에 적용하는 actuator.  
안전 우선: diet_auto=true && risk=low만 자동. medium/high는 목록 반환 후 Human 승인.

### 허용 7가지

1. **CLAUDE.md 축소** — 중복/일반지침 섹션 제거 (Forge 특화 내용은 유지)
2. **절차 CLAUDE.md→Skills 이동** — 작업전용 워크플로우를 CLAUDE.md에서 skill로 분리
3. **긴 SKILL.md 분리** — SKILL.md + reference.md + examples.md로 분할
4. **description 좁힘** — 넓은 description에 "언제 쓰지 말아야 하는지" 섹션 추가
5. **자동호출 Skill에 negative guard 추가** — "사용하지 말아야 할 때" 섹션 삽입
6. **삭제후보 archive 이동** — 영구삭제 X, forge-outputs archive로 이동 (복구가능)
7. **변경이유 인라인주석 정리** — 인라인주석 대신 최종요약으로 집약

### 금지 7가지

1. 영구 삭제 금지 (archive 이동만)
2. hooks 수정 금지
3. MCP 설정 수정 금지
4. allowed-tools 확대 금지
5. 앱 코드 수정 금지
6. test/build/deploy 임의 실행 금지
7. 불확실한 변경 → 수동 승인 목록 반환 (자동 적용 X)

### 편집 SSoT

편집 대상 = `${FORGE_ROOT:-$HOME/forge}/.claude/` (SSoT). `$HOME/.claude/` 직접 편집은 block-forge-mirror-edit hook exit2로 차단됨.

### archive 경로

삭제후보는 `${FORGE_OUTPUTS:-$HOME/forge-outputs}/11-platform/pipelines/forge-dev/2026-06-08-v1-harness-diet/plans/archive/harness-diet-2026-06-08/`로 이동.

**주의**: gist 원안은 `.claude/archive/` 경로를 사용하지만, 이 경로는 forge-sync 미동기 + mirror orphan 이슈로 부적합. forge-outputs archive를 사용하면 git-tracked, 복구 가능, mirror 충돌 없음.

### forge-sync 삭제 미전파 FIX (CRITICAL)

스킬 archive(이동) 시 SSoT 폴더(`${FORGE_ROOT:-$HOME/forge}/.claude/skills/{name}/`) 이동 후  
**`$HOME/.claude/skills/{name}` mirror copy도 python3 shutil.rmtree로 반드시 제거**.  
안 하면 호출 가능한 orphan mirror가 잔존해 삭제가 반영되지 않음.  
rollback 시: archive에서 복원 후 `node $HOME/.claude/scripts/forge-sync.mjs sync` 실행.

### SAFETY carve-out

effectiveness=SAFETY-DETERRENT 또는 보안키워드(injection/redact/secret/permission/override/block/deny) 자산 → **자동 archive 절대 금지**. Human 승인 필수.  
미발동 ≠ 효과 없음.

## 확장 비전 — Profile-based Skill Surface Budget (P2, WI-17)

현재 harness-diet = 개별 스킬 크기 축소 actuator.
미래 확장: 세션 컨텍스트별 스킬 표면 제어 (78 skills 전체 로드 → 필요 스킬만 로드).

### 설계 원칙

**프로파일 tier** (예시):
- `core`: 핵심 forge 커맨드만 (forge-onboard / forge-implement / forge-fix / qa 등 8~10개)
- `standard`: core + 자주 쓰는 리서치/리뷰 스킬 (13~15개)
- `full`: 전체 (현재 기본값)

**requires: 의존성 클로저**:
- 각 SKILL.md frontmatter에 `requires: [skill-a, skill-b]` 선택적 필드 추가
- 프로파일 해소 시 BFS transitive closure로 의존 스킬 자동 포함
- 현재 SKILL.md frontmatter(name/description) additive 추가 — 기존 호환 유지

**에이전트 파생 (agent derivation)**:
- SKILL.md 본문에서 `/skill-name` 호출 패턴 스캔 → 해당 에이전트 자동 포함
- orphan 에이전트 스텁 방지

**마커 파일 (.forge-profile)**:
- `$HOME/.claude/` 또는 프로젝트 `.claude/`에 프로파일 마커 저장
- 마커 우선, 없으면 `full` 기본

### install-profile 선택 레이어 (WI-17)

harness-diet 호출 시 `--profile` 인자로 적용 스킬 표면을 지정한다.

**명시 선택**:
```
/harness-diet --profile=핵심      # core: 구현 필수 커맨드만
/harness-diet --profile=확장      # standard: core + 리서치/리뷰
/harness-diet --profile=전체      # full: 모든 스킬 (기본값)
```

**profile별 핵심/확장/전체 설치 구분**:
| 프로파일 | alias | 포함 스킬 | 목표 수 | 적합 세션 |
|---------|-------|----------|--------|---------|
| 핵심 | `core` | forge-implement · forge-fix · qa · forge-pr · spec-write · pge · checkpoint · end-sonnet | ~8 | 집중 구현 |
| 확장 | `standard` | 핵심 + cr-* · investigate · harness-diet · healer · doc-writer | ~16 | 일반 개발 |
| 전체 | `full` | `$HOME/.claude/skills/` 전체 | 현재 78+ | 기본값 |

**환경 감지 auto-profile** (프로파일 명시 없을 때):
1. 프로젝트 `.claude/.forge-profile` 존재 → 파일 값 사용 (로컬 우선)
2. `$HOME/.claude/.forge-profile` 존재 → 파일 값 사용 (전역)
3. 마커 없고 스킬 수 ≥ 60 → `standard` 권장 안내 출력 (자동 변경 X)
4. 마커 없고 스킬 수 < 60 → `full` 유지

**마커 설정**:
```bash
echo "standard" > $HOME/.claude/.forge-profile    # 전역 고정
echo "core" > .claude/.forge-profile          # 프로젝트 오버라이드
```

> 현재 actuator는 diet-queue.json 단위 항목 적용. 프로파일 기반 bulk 설치/제거 = 하네스 GC(2026-08-01) 이후 구현. WI-17 = 명세 + 인터페이스 정의.

### 구현 트리거

- Claude Max extra usage 실측 증가 추세 지속 시
- `$HOME/.claude/skills/` 스킬 수 100+ 초과 시
- `context-engineering.md` §컨텍스트 토큰 관리 임계치 반복 도달 시

### 작업 경로

구현 준비 시: `forge-outputs/11-platform/skills/skill-surface-budget/` 작업 폴더 생성 + plan.md 작성 후 사용자 승인.

> **주의**: 현재 delta는 설계 문서화만. 78개 스킬 전체 `requires:` 필드 소급 적용은 별도 L effort 작업.
> 하네스 GC 2026-08-01 전까지 plan.md 작성 → 사용자 승인 → 마이그레이션 순서 권장.

---

## 호출

```
Workflow({
  script: Bash("cat ${FORGE_ROOT:-$HOME/forge}/.claude/skills/harness-diet/workflow.js"),
  args: { queuePath: "/path/to/diet-queue.json" }
})
```

기본 queuePath: `${FORGE_OUTPUTS}/11-platform/pipelines/forge-dev/2026-06-08-v1-harness-diet/diet-queue.json`
