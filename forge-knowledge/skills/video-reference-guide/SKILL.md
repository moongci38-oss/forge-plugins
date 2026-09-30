---
name: video-reference-guide
description: "게임 영상(mp4/YouTube)을 프레임 분석해 연출 구현 가이드를 만든다. 사용자가 영상으로 게임 연출·이펙트 분석을 요청할 때 사용한다."
context: fork
model: sonnet
---

**역할**: 게임 영상을 Codex CLI(Vision)로 프레임 분석해 Unity 구현 가이드를 만드는 분석가.
**컨텍스트**: 로컬 mp4/mov 또는 YouTube URL 의 게임 연출·이펙트·UI 전환 분석이 필요할 때.
**출력**: 프레임별 연출 분석 + Unity 구현 가이드 마크다운(지정 경로 저장).

# Video Reference Guide

| 도구 | 역할 | 대상 |
|------|------|------|
| `/yt` | 트랜스크립트 기반 분석 | 음성 설명이 있는 YouTube 영상 |
| **이 스킬** | 프레임 기반 시각 분석(연출·이펙트) | 무성 게임 영상, 로컬 녹화, YouTube |

**입력**: 로컬 영상(mp4·mov·avi·webm·mkv) 또는 YouTube URL + 분석 관점(선택: 연출/이펙트/UI 전환/타이밍).

## Step 1: 입력 확인
- `VIDEO_PATH`: 영상 경로 또는 URL
- `ANALYSIS_FOCUS`: 분석 관점(기본 "게임 연출 분석")
- `REF_NAME`: 레퍼런스 이름(파일명 또는 사용자 지정)

## Step 2: 영상 분석 실행

`analyze-video.sh` 로 Codex CLI 프레임 분석을 실행한다. 로컬 파일은 절대경로로 직접 전달, YouTube 등 페이지 URL 은 스크립트가 `yt-dlp` 로 먼저 내려받는다. output-file 이 이미 있으면 모델을 호출하지 않는다(캐시).

```bash
bash ~/.claude/scripts/analyze-video.sh \
  "{VIDEO_PATH}" \
  "docs/assets/video-refs/{YYYY-MM-DD}-{REF_NAME}-analysis.md" \
  "{ANALYSIS_FOCUS에 맞는 상세 프롬프트}"
```

**프롬프트 템플릿** (관점별):
- **연출(기본)**: 타임스탬프별 연출 요소(파티클·셰이더·애니메이션·사운드·UI 전환)의 시작/종료·이징·필요 Unity 컴포넌트를 표로. 출력 `| 시간 | 연출 설명 | 이펙트 요소 | 구현 가이드 |`
- **이펙트**: 파티클·셰이더 파라미터(색상·크기·수명·속도·블렌딩), 셰이더 기법, Unity 재현 설정값.
- **UI 전환**: 전환별 이징 함수·지속 시간·레이어 순서·알파/스케일/위치 변화, UGUI/DoTween 코드 구조.
- **타이밍**: 단계별 시작/종료·딜레이·오버랩·시퀀스 순서 타임라인, DoTween Sequence/Timeline 타이밍 차트.

## Step 3: 결과 구조화

Element Task Doc 작성 컨텍스트면 **Task Doc 모드** 자동 적용, 아니면 **기본 모드**(Spec Section 9.9 삽입 형식).

**Task Doc 모드** — 아래 3개 섹션으로 직접 출력:

- Section 3 — 타임라인 시퀀스 (타임스탬프는 0초 기준 상대 시간, 관계 After/With/Delay 는 관찰된 동시/순차로 판단)

| 시퀀스 # | 시작(s) | 종료(s) | 대상 | 액션 | 파라미터 | 관계 |
|:--------:|:-------:|:-------:|------|------|---------|:----:|

- Section 4 — 트윈 파라미터 (Ease 는 시각 추정: 급가속→EaseIn, 감속→EaseOut, 바운스→EaseOutBack · 불확실하면 `(추정)`)

| 대상 | Property | From | To | Duration(s) | Ease (추정) | Delay(s) | Loop | 비고 |
|------|----------|------|-----|:-----------:|------|:--------:|------|------|

- Section 16 — 레퍼런스 바인딩

| 레퍼런스 유형 | 원본 경로 | 참고 구간 | 적용 대상 | 분석 결과 요약 |
|-------------|----------|----------|----------|-------------|

**기본 모드** — Spec Section 9.9 삽입 형식:

```markdown
### 영상 레퍼런스: {레퍼런스 이름}
**원본**: `{파일 경로 또는 URL}` · **분석일**: YYYY-MM-DD
#### 타임스탬프별 연출 분석
| 시간 | 연출 설명 | 이펙트 요소 | 구현 가이드 |
#### 핵심 이펙트 목록
| 이펙트 | 유형 | Unity 구현 | 우선순위 |
#### 타이밍 차트
0.0s ─── {단계} ({지속}s)  … 오버랩은 같은 시작 시각으로 표기
```

## Step 4: 결과 전달
1. 구조화된 결과를 사용자에게 출력
2. `docs/assets/video-refs/` 에 분석 파일 저장(프로젝트 내 실행 시)
3. Spec 작성 중이면 Section 9.9 영상 레퍼런스 테이블 삽입 안내 (S3 기획서 → GDD 참고 자료 · Element Task Doc → Task Doc 모드 · 구현 전 → 상세 프롬프트로 재분석)

## Step 5: 독립 Evaluator
```python
Agent(subagent_type="general-purpose", model="sonnet", prompt="""
당신은 독립 분석 품질 검증자입니다. video-reference-guide 결과물을 검토하세요.
검증: 타임라인이 실제 프레임과 일치 / 구현 가이드 항목마다 구체 수치·파라미터 / 참조 소스 명시 / 애니메이션·이펙트 구현 난이도 평가 포함
판정: PASS / FAIL
피드백: [파일명+섹션] — [이유] → [방법]
""")
```

- PASS → 저장/발행 계속 · FAIL → 보완 후 재실행(1회 한도)
- 2회 연속 FAIL → [STOP] Human 에스컬레이션

## 환경·주의

- Codex CLI **0.156.1 이상** + 구독 인증(`auth_mode=chatgpt`, API 키 불필요) · `yt-dlp`(`pipx install yt-dlp`) · Python 3 · curl · `~/.claude/scripts/analyze-video.sh`
- 분석은 Codex 구독 사용량 소비 — 불필요한 반복 분석 금지. 비공개 YouTube 영상은 다운로드 불가라 분석 불가.
- 로컬 파일은 이 머신을 떠나지 않는다. 그래도 미공개 게임플레이·NDA 베타·내부 플레이테스트 영상은 사용자 확인 후 분석하고, 가능하면 공개된 레퍼런스로 대체한다.
