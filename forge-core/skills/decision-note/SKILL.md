---
name: decision-note
description: "소규모 설계/구현 판단을 3조각(문제정의 1문단·판단기준 5줄·결정기록)으로 기록. PRD/Spec/ADR 작성은 과한데 나중에 \"이거 왜 이렇게 했지\"를 물을 만한 결정을 내렸을 때 사용. /decision-note로 명시 호출. SKIP: 정식 기능 명세(→ forge-spec/PRD), 여러 FR에 걸친 결정(→ ADR, forge-adr-index.sh 대상)."
disable-model-invocation: true
---

# Decision Note — 경량 판단기록

**역할**: 세션/태스크 단위의 소규모 판단을 3조각으로 빠르게 남긴다. PRD·Spec·ADR 같은 중량 문서를 쓸 정도는 아니지만, 왜 이 선택을 했고 무엇을 버렸는지는 남겨야 나중에(자신이든 다른 세션이든) 같은 논쟁을 반복하지 않는다.
**컨텍스트**: 사용자가 `/decision-note`로 명시 호출할 때만 실행(model-invoked 아님 — 상주 비용 0).
**출력**: `{FORGE_OUTPUTS}/docs/decisions/{YYYY-MM-DD}-{slug}.md`에 저장된 3조각 markdown 파일 1개.

**출처**: 2026-08-02 영상분석("아직도 하네스 쓰세요?") P2 제안 — "기획 하네스 3조각"은 모델이 아무리 좋아져도 안 사라진다(정보 문제·취향 문제·책임 문제라서, 성능 문제가 아니라서).

## 언제 쓰나

- A vs B 중 하나를 골랐고, 그 이유가 코드나 커밋 메시지만 봐서는 안 드러날 때
- "왜 이렇게 안 하고 저렇게 했지?"를 나중에 물을 게 뻔할 때
- ADR을 쓰기엔 너무 작고, 아무 기록도 안 남기기엔 아까운 결정일 때

## 3조각 템플릿

```markdown
# {결정 제목} — {YYYY-MM-DD}

## 문제정의 (1문단)
누가·언제·뭘 못해서·뭘 포기하는가.

## 판단기준 + 제약 (5줄 이내)
- 옵션: A vs B (vs C…)
- 선택: {고른 것}
- 왜냐하면: {핵심 이유 1~2개}
- 버린 것과 트레이드오프: {B를 버렸다면 뭘 포기했나}
- 제약: {선택에 영향을 준 시간/비용/기존 코드 제약}

## 결정기록
- 날짜: {YYYY-MM-DD}
- 결정자: {사람 / AI 제안+사람 승인 / AI 단독}
- 번복 조건: {이 결정을 다시 열어봐야 할 신호가 있다면}
```

## 저장

```bash
mkdir -p "${FORGE_OUTPUTS:-$HOME/forge-outputs}/docs/decisions"
```

파일명: `{FORGE_OUTPUTS}/docs/decisions/{YYYY-MM-DD}-{slug}.md` (slug = 결정 제목 kebab-case).
같은 날 여러 건이면 파일명 뒤에 `-2`, `-3` 붙여 구분(덮어쓰기 금지 — append-only 원칙과 동일).

## 하지 않는 것

- ADR 승격 판단(여러 프로젝트·FR에 걸치는 결정이면 `forge-adr-index.sh`가 스캔하는 S4 development-plan.md의 정식 ADR 섹션으로 옮긴다 — 이 스킬은 그 전 단계의 가벼운 기록일 뿐)
- Notion·Slack 등 외부 발행(로컬 markdown 저장까지만)
- 결정 재평가·번복 여부 판단(순수 기록 도구 — 판단은 사람 또는 다른 스킬 몫)
