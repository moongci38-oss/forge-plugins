# Wave 2 산출물 마크다운 템플릿

> SKILL.md에서 이관됨 — Lead가 Wave 2에서 2개 문서를 작성할 때 이 구조를 따른다.

## 산출물 1: AI 시스템 분석 리포트 (`01-research/daily/{date}/ai-system-analysis.md`)

```markdown
# {date} AI 시스템 일일 분석 리포트

## Executive Summary (3줄 요약)

## 1. 업계 주요 변화 (전일 기준)
### 1.1 공식 발표/업데이트
### 1.2 GitHub 생태계 변화
### 1.3 커뮤니티 시그널
### 1.4 주목 영상 콘텐츠
### 1.5 학술 연구 동향
### 1.6 📈 주식 브리핑
> stock-research-analyst의 daily 경량 브리핑(관심종목 1~2줄)을 요약 포함. 투자 자문 아님 배너 유지. watchlist 없으면 이 섹션 생략.

## 2. 우리 시스템 현황

### 2.0 WARN 다이제스트 (M3 소비 배선, 2026-07-16)
> `bash ${FORGE_ROOT:-$HOME/forge}/shared/scripts/warn-digest.sh` 실행 결과 3줄(반복/신규/무시)을 그대로 삽입.
> 실행 실패 시 "WARN 다이제스트 생성 실패(비차단)" 1줄만 — 리포트 진행 차단 금지(fail-open).
> 무시 판정 추가는 `audit/warn-ignore.jsonl`에 `{key, judged_by, reason, expires}` — 만료 시 자동 재표면.

## 3. 1:1 비교 분석 (업계 vs 우리)
| 영역 | 업계 최신 | 우리 현황 | 갭 | 영향도 | ACHCE 축 |

> **ACHCE 축 분류**: 각 갭 항목을 아래 5축 중 하나로 분류한다.
> - **A (Agentic)**: 자율성, 도구 사용, 멀티에이전트 조정
> - **C (Context)**: RAG, 메모리, 컨텍스트 윈도우 관리
> - **H (Harness)**: 평가 체계, 가드레일, 옵저버빌리티
> - **C (Cost)**: 토큰 경제학, 모델 라우팅, 캐싱
> - **E (Human-AI Escalation)**: 자율성 레벨, 게이트 설계, 신뢰 캘리브레이션

## 4. 갭 분석 + 영향도 평가
### Critical (즉시 대응)
### High (이번 주 내)
### Medium (이번 달 내)
### Low (모니터링)

## 5. 추천 시청/읽기 목록
### 영상
### 논문
### 블로그 포스트

## 6. 🎓 학습노트
> concept-notes-writer가 Synthesize 직후 그날 리포트에서 핵심 개념 1~3개를 선별해 `study-notes.md`로 생성. 개념 후보 0개면 이 섹션 생략.

## 출처 및 신뢰도
```

## 산출물 2: 적용 계획서 (`01-research/daily/{date}/system-improvement-plan.md`)

```markdown
# {date} 시스템 개선 계획서

## 오늘의 액션 아이템

### P0 (긴급 — 오늘 처리)
### P1 (높음 — 이번 주)
### P2 (보통 — 이번 달)

## 각 액션 상세
- 액션명
- 영향 범위 (프로젝트/시스템)
- 예상 작업량
- 의존성
- 참조 소스
- verify_cmd: "<주장이 참임을 증명하는 1줄 명령>"   # 필수
- verify_out: "<위 명령의 실제 실행 결과>"          # 비어 있으면 제안 생성 금지
- owner: ai | human                                  # human = AI가 처리 불가(콘솔 설정 등)
- carry_count: 0                                     # 기계 판독 이월 카운터

## 누적 미처리 액션 (이전 계획서에서 이월)
```
