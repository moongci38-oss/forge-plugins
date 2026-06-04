---
skill: yt-analyze
version: 1
---

# Assessment: yt-analyze

## 테스트 입력

- input_1: "Re-analyze the pre-extracted YouTube JSON for deeper system insights"
- input_2: "Run Steps 2-9 analysis on existing YouTube transcript data"
- input_3: "Generate improvement proposals from previously extracted video analysis"

## 평가 기준 (Yes/No)

1. 기존 JSON 데이터 로드가 계획되어 있는가?
2. Step 2-9 분석(비판적 분석, 웹리서치, GTC, 시스템비교)이 포함되어 있는가?
3. GTC 게이트 검증이 언급되어 있는가?
4. 시스템 개선 제안이 ACHCE 축에 매핑되어 있는가?
5. 분석 결과 저장 경로가 명시되어 있는가?

## 채점

- 1건 pass = 5개 기준 모두 Yes
- pass_rate = pass 건수 / 전체 실행 수
- 목표: min_pass_rate 0.8 이상
