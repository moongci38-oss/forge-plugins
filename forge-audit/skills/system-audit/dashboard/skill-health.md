# Skill Health Dashboard

> 자동 갱신: `/system-audit` 실행 시 Redundancy 6축 결과 반영.
> 수동 갱신: `eval_cases.jsonl` 업데이트 후 재실행.

## 스킬별 건강 지표

| 스킬 | last_called | eval_count | health_score | 상태 |
|------|:-----------:|:----------:|:------------:|:----:|
| (system-audit 실행 시 자동 채워짐) | — | — | — | — |

## 건강 점수 기준

| 점수 | 의미 |
|:----:|------|
| 🟢 80+ | 활성 + eval 충분 |
| 🟡 50~79 | 활성이나 eval 부족 |
| 🔴 <50 | 미사용 또는 deprecated 후보 |

## 미사용 후보 (eval 0건, 90일+)

| 스킬 | eval_count | 마지막 수정 | 권고 |
|------|:----------:|:----------:|------|
| (system-audit Redundancy 6축 결과 반영) | — | — | — |
