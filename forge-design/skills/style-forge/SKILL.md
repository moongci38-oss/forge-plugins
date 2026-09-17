---
name: style-forge
description: "참조 에셋에서 스타일을 뽑아 style-guide.md 를 만든다(또는 LoRA 파인튜닝). /game-asset-generate 전 필수 선행. SKIP: 시각 에셋 작업이 아닐 때, 참조 이미지 없이 스타일만 논의할 때, 유효한 style-guide.md 가 이미 있을 때."
context: fork
model: sonnet
---

# Style Forge

프로젝트의 시각적 일관성을 위한 스타일 정의 도구. 두 가지 모드를 지원한다.

## 사용하지 말아야 할 때 (When NOT to use)

아래 중 하나라도 해당하면 이 스킬을 호출하지 않는다.

- **시각 에셋 작업이 아님** — 코드·문서·기획 등 이미지 스타일과 무관한 작업.
- **참조 에셋 0개** — 이미지 없이 스타일을 "상의"만 하는 단계(아래 §환경 요구사항 입력 검증의 [STOP] 조건과 동일).
- **이미지 1~2장** — 공통 스타일 추출이 성립하지 않는다. `/screenshot-analyze` 를 직접 쓴다.
- **유효한 style-guide.md 존재** — 갱신이 필요할 때만 재실행한다. 그대로 쓰면 되는 경우 재추출 불필요.
- **웹/앱 UI 디자인** — 이 스킬은 게임 에셋 파이프라인 P0 전용이다. UI 는 `tool-rules.md §디자인 도구 순위` 를 따른다.

## 모드

### Mode A: 스타일 추출 (P0)

기존 에셋 5-10개에서 공통 스타일을 추출하여 `style-guide.md`를 생성한다.

**워크플로우:**
1. 사용자가 에셋 폴더 경로를 제공한다
2. `/screenshot-analyze --mode style-extraction --assets {에셋폴더경로}` 호출 → YAML 형식 팔레트·아트키워드·패턴 반환
3. `${FORGE_ROOT:-$HOME/forge}/planning/templates/style-guide-template.md` 기반으로 `style-guide.md` 생성
   - **DESIGN.md 스키마 필수**: YAML front matter(palette, art_style, lora_model 등) + Markdown body
   - front matter의 팔레트/아트스타일은 screenshot-analyze 결과로 채워 기계 파싱 가능하게 유지
4. Human 확인 후 확정

**입력**: 에셋 폴더 경로 (5-10개 이미지)
**출력**: `{project-path}/style-guide.md`

### Mode B: LoRA 학습 (선택)

기존 에셋으로 Replicate LoRA 모델을 학습한다.

**전제조건:**
- `REPLICATE_API_TOKEN` 환경변수 설정
- Replicate MCP 연결 확인
- 학습 이미지 5-10개 (일관된 스타일)

**워크플로우:**
1. Mode A 실행 (style-guide.md 먼저 생성)
2. 학습 이미지를 ZIP으로 압축
3. Replicate MCP로 LoRA fine-tuning 작업 시작
4. 학습 완료 후 style-guide.md에 `모델 ID` + `트리거 워드` 기록
5. 테스트 이미지 1장 생성 → Human 검증

**입력**: 에셋 폴더 경로 + 트리거 워드
**출력**: Replicate 모델 ID + 업데이트된 `style-guide.md`

## 환경 요구사항

**실행 전 자동 체크** (누락 시 [STOP]):
```bash
# Mode A 실행 전 — Vision 은 Codex CLI(구독)로 돈다. 열쇠가 아니라 CLI 버전이 조건이다.
command -v codex >/dev/null 2>&1 || { echo "[STOP] codex CLI 미설치 — Mode A Vision 불가"; exit 1; }
# Mode B 실행 전 (추가)
[ -z "$REPLICATE_API_TOKEN" ] && echo "[STOP] REPLICATE_API_TOKEN 미설정" && exit 1
```
- **Mode A**: `codex` CLI (**0.153.4 이상** — `screenshot-analyze` 의존). 재현: `codex --version`
- **Mode B**: `REPLICATE_API_TOKEN` (Replicate MCP 의존)

⚠️ **구 Mode A 체크(Google 키 요구)는 2026-09-12 폐기.** 의존 대상인 `screenshot-analyze` 가
**2026-09-07 Gemini 전면 철수로 Codex Vision 으로 이관**되면서 그 키가 필요 없어졌는데
(`screenshot-analyze/SKILL.md:366` — "API 키가 필요 없어지고 Codex CLI(구독)로 이미지를 직접
첨부하는 방식으로 바뀌었다") 이 하드 게이트만 남아 **키 없는 머신에서 Mode A 가 그냥 죽었다.**
없는 열쇠를 요구하며 문을 잠그고 있던 셈이다.

⚠️ **이 체크가 무력화되는 입력**: `codex` 가 설치돼 있으나 **0.153.4 미만**이면 통과한 뒤
`ASTRA_MODEL=gpt-6-astra` override(사람 명시) 요청이 HTTP 400 으로 죽는다 — 증상이 계정 문제처럼 보여 헷갈린다(기본값은 2026-09-17 부터 sol).
셸 버전 비교는 오탐을 만들기 쉬워 넣지 않았고, 대신 여기 적어 둔다.
⚠️ Vision 용 `codex-critic` approve-worker 토큰 선발행이 **별도로** 필요하다
(`screenshot-analyze/SKILL.md:413`) — 이 체크는 그것까지 보지 않는다.

**입력 검증** (Mode A 진입 시):
- 에셋 폴더 존재 여부 확인
- 이미지 파일 수 5개 미만이면 [WARN] 후 계속 (3개 이상이면 허용)
- 이미지 파일 수 0개이면 [STOP]
- style-guide.md 이미 존재하면 "덮어쓸까요?" Human 확인 후 진행

## Diamond Architecture 단계

이 스킬은 리소스 파이프라인의 **P0 (스타일 정의)** 단계를 담당한다.

```
P0 (/style-forge) → P1 (Art Direction Brief) → P2 (프로토타입) → P3 (대량 생성) → P4 (품질 검증)
```

**P2·P3 의 실제 생성 경로 = `/forge-image`(구독, GPT Image 2.5).** 이 스킬이 만든 `style-guide.md` 를
그대로 넘겨야 스타일이 생성에 반영된다 — 넘기지 않으면 가이드는 문서로만 남는다:

```bash
bash "${FORGE_ROOT:-$HOME/forge}/shared/scripts/generate-image-codex.sh" \
  --prompt "<무엇을 그릴지>" --style-guide "<style-guide.md 절대경로>" \
  --output "<절대경로>/asset.png"
```

⚠️ 구 서술의 `/game-asset-generate` 는 **아카이브됐다**(`.claude/skills-archived/`, 2026-08-07 게임 트랙 이관) —
이름만 보고 부르면 없다. 재현: `find .claude/skills .claude/commands -iname '*game-asset*'` → 0건.
근거: 사람 결정 2026-09-15(이미지 1순위 = 구독 GPT Image 2.5) · 계획서 `2026-09-15-astra-lanes-plan.md` 레인3-3.
폐기조건: 이미지 1순위가 바뀌거나 게임 트랙이 복원되면 이 절을 그 경로로 다시 쓴다.

## 주의사항

- LoRA 학습은 Replicate 종량제 과금 ($0.5-2/학습)
- 학습 시간: 15-30분 (이미지 수/해상도에 따라)
- 학습 결과가 불만족스러우면 이미지 교체 후 재학습 (재과금)
