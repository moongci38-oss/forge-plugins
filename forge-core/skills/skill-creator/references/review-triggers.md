# 스킬 유효성 재검토 (분기 GC 사이클)

## 트리거 — 하나 이상 충족 시 재검토

1. **모델 메이저 업데이트** — Opus/Sonnet/Haiku 메이저 버전 변경 후
2. **3개월 이상 미사용** — git log 또는 메트릭 기준 호출 0회
3. **오류율 20% 초과** — 분자 = 최근 30일 호출 중 (명시적 STOP / FAIL JSON · 5분 내 `/skill` 재호출 · skill 내부 에러 stdout) 횟수, 분모 = 최근 30일 총 호출, 임계 = 분자/분모 > 0.20. 분모 < 10 → "사용 빈도 부족" 라벨(#2 우선).
   - ⚠️ **지금은 계산할 수 없다** — `~/.claude/metrics/*.jsonl` 에 스킬별 필드가 없고 `skill-telemetry.py` 도 호출 횟수만 있다. 결과는 **"판정 불가(스킬별 실패 기록 부재)"** 로 적는다 — 분자를 추정해 퍼센트를 만들지 마라(0% 는 "건강함"으로 둔갑한다).
   - 재확인: `python3 -c "import json,glob;print(sum(any('skill' in k.lower() for k in json.loads(l)) for f in sorted(glob.glob('$HOME/.claude/metrics/*.jsonl'))[-30:] for l in open(f)))"` → 0 이면 여전히 판정 불가

## 결과 3택

- **keep**: 그대로 유지 (재검토일 갱신)
- **simplify**: 도구·옵션·프롬프트 축소 (Single-purpose tool design)
- **deprecate**: 사람 승인 후 삭제

## 절차

1. metrics jsonl read → skill별 호출·실패 카운트 집계
2. 분자/분모 계산 → 임계값 체크
3. 임계 초과 skill = 재검토 후보 list
4. 사용자 승인 게이트 통과 후 keep/simplify/deprecate 결정
5. 결과 = 분기 Harness GC 사이클 result.md에 기록
