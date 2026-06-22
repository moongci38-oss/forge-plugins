---
name: game-asset-generate
description: 게임 에셋(스프라이트, VFX, 배경, 3D, UI, 아이콘, 오디오)을 대량 생산하는 오케스트레이터. Library-First 탐색으로 MCP 비용을 절감하고, 12요소 Soul 프롬프트와 모델 어댑터(FLUX/Gemini/Replicate)로 품질을 극대화한다. style-guide.md가 준비된 후 게임 에셋 생성 시 사용. 리소스 파이프라인 P3 단계. MAS P1: + Codex image_gen 직접 생성 지원 (NanoBanana 병행).
user-invocable: true
context: fork
model: sonnet
paths:
  - "**/*.cs"
  - "**/*.unity"
  - "**/*.prefab"
---

**역할**: 당신은 게임 에셋(스프라이트, VFX, 배경, 3D, UI 등)을 대량 생산하는 에셋 오케스트레이터입니다.
**컨텍스트**: style-guide.md 준비 후 게임 에셋 생성 요청 시 호출됩니다.
**출력**: 12요소 Soul 프롬프트 기반 생성 에셋 파일 + 매니페스트을 반환합니다.
**--auto-apply**: 이 플래그가 존재하면, Step 10 Human 승인 후 자동으로 asset-injector를 실행하여 생성된 에셋을 Unity 프로젝트에 주입합니다.

# Game Asset Generate

게임 에셋 대량 생산 오케스트레이터. Library-First 탐색으로 비용을 절감하고, 12요소 Soul-Injected 프롬프트로 품질을 극대화한다.

## 전제조건

1. `style-guide.md` 존재 필수 (없으면 `/style-forge` 먼저 실행)
2. `art-direction-brief.md` 존재 필수 (없으면 슬롯 [1][8][9] fallback 적용 — 각 슬롯 주석 참조)
3. 관련 MCP 서버 연결 확인
4. `prompt-log.md` 존재 권장 (없으면 자동 생성)

**API 키 전제조건** (누락 시 해당 도구 스킵 + 폴백 전환):
- NanoBanana MCP 연결 필수 (기본 생성 도구)
- `GEMINI_API_KEY` 필수 (NanoBanana 이미지 생성/분석)
- `REPLICATE_API_TOKEN` (Replicate LoRA/FLUX 사용 시)
- Ludo.ai MCP 연결 (Ludo.ai 라우팅 에셋 유형 시)
- `PREFAB_LIBRARY_PATH` (Library-First 탐색, 미설정 시 Step 4 스킵)

### 실행 전 자동 체크

```bash
# 필수 (누락 시 [STOP])
[ -z "$STYLE_GUIDE_PATH" ] && STYLE_GUIDE_PATH="$(pwd)/style-guide.md"
[ ! -f "$STYLE_GUIDE_PATH" ] && echo "[STOP] style-guide.md 없음 — /style-forge 먼저 실행" && exit 1
[ -z "$GEMINI_API_KEY" ] && echo "[STOP] GEMINI_API_KEY 미설정" && exit 1
[ -z "$REPLICATE_API_TOKEN" ] && echo "[WARN] REPLICATE_API_TOKEN 미설정 — Replicate LoRA/FLUX 비활성화, NanoBanana 폴백 사용"
```

## 에셋 유형별 라우팅

| 에셋 유형 | 1차 도구 | 폴백 | 비고 |
|---------|---------|------|------|
| 스프라이트 시트 | Ludo.ai MCP | NanoBanana + 수동 슬라이싱 | 캐릭터 애니메이션 |
| VFX 이펙트 시트 | Ludo.ai MCP | NanoBanana | 파티클, 이펙트 |
| 2D 배경/타일 | Replicate (LoRA) | NanoBanana MCP | 배경, 지형 |
| 3D 모델 (OBJ/GLB) | Ludo.ai MCP → Blender MCP (hyper3d/polyhaven) | Asset Store 구매 | 3D 오브젝트 |
| UI 요소 | Ludo.ai MCP | NanoBanana | 버튼, 프레임, 게이지 |
| 아이콘 세트 | Replicate / Ludo.ai | NanoBanana | 스킬, 아이템 아이콘 |
| 오디오/SFX | Ludo.ai MCP | — | BGM, 효과음 |

## 워크플로우 (12단계)

```
 1. style-guide.md 로드
    → 키워드, 팔레트, 모델별 어댑터(§6.1), 기술 규격(§9) 추출
    → 검증된 시드 레지스트리(§7.2) 로드

 2. art-direction-brief.md 로드
    → 디자인 철학 선언문(§5.5) 추출 → target_emotion, light_dark_principle
    → 감성→키워드 매핑(§1) 추출
    → 앵커 이미지 경로(§3) 추출
    → 의도적 긴장 규칙(§8) 로드

 2-EXT. Element Task Doc 참조 (있으면)
    → .specify/element-tasks/{spec-name}/ 하위 파일 탐색
    → Section 17 에셋 목록 → 생성 대상 자동 설정 (에셋명, 유형, 크기/스펙, 경로)
    → Section 10 디자인 토큰 → slot [6] palette에 토큰 값 자동 주입 (style-guide보다 우선)
    → 없으면 스킵 — style-guide 기본 팔레트 사용

 3. 에셋 유형 판별
    → 라우팅 테이블에서 1차 도구 선택
    → 에셋 Tier 판별: T1(핵심)/T2(주요)/T3(대량)

 4. Library 탐색 (Library-First)
    → Prefab Library _metadata.json 로드 (경로: 환경변수 PREFAB_LIBRARY_PATH)
    → 요청 키워드 ↔ tags/style_tags 매칭
    → 분기:
      ├─ 완전 매칭 (quality_score 4.0+)
      │   → "Library에 [에셋명] 있습니다. 직접 사용할까요?" → Human 확인
      │   → 사용 → usage_count++ → Step 11로 (MCP 0회)
      ├─ 부분 매칭 (유사 에셋 존재)
      │   → "유사 에셋 [에셋명]을 base로 리터치할까요?" → Human 확인
      │   → edit_image로 변형 → Step 10으로
      └─ 매칭 없음 → Step 5로 (신규 생성)

 5. 모델 어댑터 선택
    → style-guide.md §6.1 모델별 어댑터 참조
    → 에셋 유형 + 씬 성격에 따라 분기:
      ├─ 감성/이펙트 → Gemini (NanoBanana)
      ├─ UI 레이아웃/구도 정확 → FLUX (Replicate)
      └─ LoRA 학습 완료 시 → Replicate LoRA

 6. 12요소 Soul 프롬프트 조립
    → Tier에 따라 깊이 차등:
      T1 = 12요소 풀 Soul (250-350 토큰)
      T2 = 8요소 + 선택 Soul (120-200 토큰)
      T3 = 최소 키워드 (30-80 토큰)

    12요소 슬롯:
    [1. 철학 메타]    → brief §5.5 디자인 철학에서 추출 (brief 없으면: style-guide 아트 스타일 키워드로 대체)
    [2. 순간/서사]    → "the instant {moment}" 서사 키워드
    [3. 주체]         → 에셋 설명 + 물성 키워드
    [4. 구도/카메라]   → style-guide §8 카메라 사전 참조 + 긴장(비대칭)
    [5. 환경]         → 환경 키워드 + 텍스처
    [6. 색상(HEX)]    → 팔레트 HEX 직접 지정 + 긴장 악센트
    [7. 이펙트]       → 파티클/글로우 + 유기적 리듬
    [8. 감성 텍스처]   → brief 물성 키워드 사전 참조 (brief 없으면: style-guide 아트 스타일 키워드 사용)
    [9. 의도적 긴장]   → brief §8 긴장 규칙에서 1-2개 선택 (brief 없으면: 슬롯 생략)
    [10. 스타일]      → art style 키워드 + anti-AI미학
    [11. 기술 규격]    → style-guide §9 에셋 규격 참조
    [12. 제외]        → 안티패턴 금지 키워드 + Soul 안티 제외

    → 골든 레시피 확인: prompt-log.md에 동일 유형 성공 레시피 있으면 우선 참조

 7. 모델 어댑터 적용
    → Step 5에서 선택한 모델에 맞게 프롬프트 포맷 변환:
      ├─ FLUX: T5 서술형 문장 + CLIP 키워드 리스트. "prominently featuring" 강조
      ├─ Gemini: 메타 지시 → 상세 서술 단락. 앵커 이미지 첨부 (§3)
      └─ Replicate: {trigger_word} + 스타일 키워드 (150토큰 이내)

 8. MCP 도구 호출 → 에셋 생성
    → 주 도구: `mcp__nano-banana__generate_image` (Gemini 기반, 기본)
    → 편집 모드: `mcp__nano-banana__edit_image` (원본 이미지 변형)
    → 생성 실패 시 → 폴백 도구로 자동 전환 + Human 알림
    → 다중 생성: 같은 프롬프트로 3장 생성 (T1/T2 에셋)

 9. 크리틱 6항목 평가 — 독립 Evaluator Agent (생성자 ≠ 평가자)
    → 생성자 컨텍스트 격리: 평가자는 생성 프롬프트·추론 컨텍스트를 받지 않는다.
    → 평가자에게 전달: 생성된 이미지 파일 경로 + 아래 루브릭만.

    ```python
    Agent(
      subagent_type="general-purpose",
      model="sonnet",
      prompt="""
    당신은 게임 에셋 품질 독립 평가자입니다. 생성 과정의 맥락 없이 아래 이미지만 보고 평가합니다.

    평가 대상 이미지: {generated_image_path}
    style-guide 참조: {style_guide_path}
    art-direction-brief 참조: {brief_path} (없으면 ④ SKIP → 5점 처리)

    6축 루브릭 (각 1-5점):
    ① 계층감: 주/보조 요소 명확한 시각 계층
    ② 일관성: style-guide 팔레트·아트 스타일 일치
    ③ 안티패턴 없음: AI 클리셰(과도 광택, 오버블룸, 포토리얼 배경) 없음
    ④ 브리프 충실도: target_emotion 반영 (brief 없으면 SKIP → 5점)
    ⑤ 서사: "the instant {moment}" 느낌 전달 여부
    ⑥ 물성: 소재감·질감이 material 키워드와 일치

    판정 기준:
    - PASS: 평균 3.5+ AND ⑤ 3.0+ AND ⑥ 3.0+
    - FAIL: 그 외

    출력 형식:
    verdict: PASS | FAIL
    scores: {①:N, ②:N, ③:N, ④:N, ⑤:N, ⑥:N}
    avg: N.N
    feedback: [FAIL 항목별 개선 방향 1줄씩]
    """
    )
    ```

    → PASS: Step 10으로 진행
    → FAIL: §10 반복 개선 프로토콜 적용 (최대 3회 자동)
    → 3회 연속 FAIL: Human에게 프롬프트 전략 재설계 요청 후 [STOP]

10. Human 확인 대기 (1장씩 순차)
    → 승인 (✅) → Step 11
    → 거부 (❌) → 실패 원인 분류 → prompt-log 기록 → Step 6 재시도

11. 승인 후 기록 + --auto-apply 실행
    → resource-manifest.md 업데이트 (프롬프트 전문 + 시드 + 크리틱 점수)
    → prompt-log.md 기록 (Flywheel 루프 1: 성공 경험 축적)
    → Library 등록 후보 평가 (quality_score 4.0+ → 자동 등록 제안)
    → 앵커 이미지 후보 등록 (크리틱 평균 4.5+ → brief 앵커 후보)
    → **--auto-apply 플래그 확인**:
      ├─ 플래그 있음 → asset-injector 호출:
      │  ```bash
      │  python -m asset_injector \
      │    --manifest /tmp/game-asset-manifest.json \
      │    --project GodBlade \
      │    --dry-run false
      │  ```
      │  → 완료: "✅ [에셋명] Unity 프로젝트에 자동 주입됨"
      │  → 실패: 에러 메시지 + 수동 복사 가이드
      └─ 플래그 없음 → SKIP (사용자가 직접 복사)

12. 일관성 검증
    → 5개+ 누적 시 → 크로스 에셋 일관성 검증 제안
    → /screenshot-analyze 일관성 검증 모드 호출
```

## Flywheel 자동 행동

| 이벤트 | 자동 행동 |
|--------|----------|
| 에셋 ✅ 승인 | prompt-log 기록, 시드 레지스트리 갱신, 앵커 이미지 후보 등록 |
| 에셋 ❌ 거부 | 실패 원인 분류(구도/색상/스타일/디테일/안티패턴), 블랙리스트 갱신 |
| 동일 유형 성공 3건+ | 골든 레시피 자동 생성 제안 |
| 승인 에셋 20장+ | LoRA 학습 트리거 제안 (Human 승인 필요) |

## 입력

- **에셋 유형**: sprite / vfx / background / 3d / ui / icon / audio
- **설명**: 에셋 설명 (프롬프트에 포함)
- **수량**: 생성할 에셋 수 (순차 생성)
- **크기** (선택): 타겟 해상도 (미지정 시 style-guide §9 기본값)
- **Tier** (선택): T1(핵심) / T2(주요) / T3(대량) — 미지정 시 자동 판별

### 호출 예시

```
/game-asset-generate --type sprite --description "검사 캐릭터, 갑옷 착용, 정면 포즈" --quantity 3
/game-asset-generate --type ui --description "스킬 버튼 프레임, 금색 테두리" --tier T2
/game-asset-generate --type vfx --description "번개 이펙트 파티클" --quantity 1 --size 512x512
```

### --auto-apply (P4/P5 자동 주입)

Step 10 Human 승인 후 `--auto-apply` 플래그가 있으면 자동으로 asset-injector를 실행한다.

```bash
/game-asset-generate --type ui --description "헬스바 UI" --auto-apply

# 내부적으로 Step 10 승인 후 실행:
python -m asset_injector \
  --manifest /tmp/game-asset-manifest.json \
  --project GodBlade
```

**전제조건**: 프로젝트가 project_registry.json에 등록되어야 함.
**롤백**: `Assets/_Backup/<timestamp>/` 에 자동 백업됨 — Unity Editor에서 복구 가능.

## 출력

- 생성된 에셋 파일: `${ASSET_PROJECT_ROOT}/Assets/Generated/{AssetType}/` (ASSET_PROJECT_ROOT 미설정 시 `./Assets/Generated/{AssetType}/`)
- resource-manifest.md 업데이트 (프롬프트 전문 + 시드 + 크리틱 점수)
- prompt-log.md 업데이트 (성공/실패 기록)

## 에셋 편집 모드 (JSON 분석→치환→생성)

기존 에셋의 특정 속성(색상/재질/패턴)만 변경하여 배리에이션을 생성한다.
전체 재생성 대비 형태 일관성 100% 보장 + 생성 시간 80% 단축.

### 진입 조건

- 원본 이미지 경로가 제공됨
- 변경할 속성이 명시됨 (예: "색상: #FFD700, 재질: 금속광택")
- 또는 "배리에이션", "색상 변경", "편집" 키워드가 포함된 요청

### 편집 파이프라인 (3단계)

```
Step 1 [분석]: 원본 이미지 → JSON 속성 추출
  → mcp__nano-banana__edit_image로 원본 분석 요청
  → 프롬프트: "Analyze this image and describe: dominant colors (hex),
    material/texture, pattern, shape, lighting, background"
  → 출력: image_attributes (색상, 재질, 패턴, 형태, 조명, 배경)

Step 2 [치환]: 속성 JSON에서 변경 대상만 교체
  → 원본 속성 중 사용자가 지정한 필드만 새 값으로 치환
  → 미지정 필드는 원본 값 유지 → 형태 일관성 보장
  → 색상은 반드시 Hex Code (#RRGGBB)로 지정

Step 3 [재생성]: 원본 이미지 + 치환된 속성으로 편집
  → mcp__nano-banana__edit_image 호출 (원본 이미지 + 편집 프롬프트)
  → 프롬프트: "Keep the exact same {유지 속성}. Change only: {변경 속성}"
  → Step 9 6축 독립 Evaluator 검증 (기존 파이프라인 유지)
```

### 편집 모드 예시

```
입력: sword_iron.png + "색상: #FFD700, 재질: 금속광택 강화"

Step 1 → 분석 결과:
  colors: ["#808080 (iron gray)", "#4A4A4A (dark steel)"]
  material: "matte brushed metal"
  pattern: "straight blade, crossguard"
  shape: "longsword, single-edge"

Step 2 → 치환:
  colors: ["#FFD700 (gold)", "#B8860B (dark gold)"]  ← 변경
  material: "polished reflective metal"               ← 변경
  pattern: "straight blade, crossguard"               ← 유지
  shape: "longsword, single-edge"                     ← 유지

Step 3 → 편집 프롬프트:
  "Keep the exact same sword shape, blade pattern, and composition.
   Change only: colors to #FFD700 gold and #B8860B dark gold,
   material to polished reflective metal with strong specular highlights"

출력: sword_gold.png
```

### 배리에이션 일괄 생성

여러 변형을 한 번에 요청할 수 있다:

```
입력: sword_iron.png + 배리에이션 목록:
  - Common:  색상 #808080, 재질 무광
  - Rare:    색상 #0095F6, 재질 광택
  - Epic:    색상 #9B59B6, 재질 마법 발광
  - Legend:  색상 #FFD700, 재질 금속광택 + 오라

→ Step 1 (분석)은 1회만 실행
→ Step 2-3을 배리에이션 수만큼 반복 (순차, 1장씩 Human 확인)
```

## Diamond Architecture 단계

이 스킬은 리소스 파이프라인의 **P3 (대량 생산)** 단계를 담당한다.

```
P0 (/style-forge) → P1 (Brief) → P2 (프로토타입) → P3 (/game-asset-generate) → P4 (검증)
```

## 할루시네이션 가드레일 (편집 모드)

> arXiv 2512.15110 기반: NanoBanana Pro는 지각 품질(NIQE) 최고 수준이나 픽셀 정확도(PSNR/SSIM) 4~19% 열위.
> 의미적 그럴듯함을 우선하므로 편집 시 형태 왜곡 가능.

### 필수 프롬프트 제약

편집 모드 Step 3 프롬프트에 반드시 포함:
- `"preserve shape exactly"` — 실루엣/비율 변형 방지
- `"change ONLY [target attributes]"` — 변경 범위 명시적 제한
- `"maintain identical [silhouette/proportions/composition]"` — 보존 대상 명시

### 고위험 편집 (추가 주의)

| 편집 유형 | 할루시네이션 위험 | 대응 |
|----------|:----------------:|------|
| 색상 변경 | 낮음 | 기본 제약 충분 |
| 재질 변경 | 중간 | 형태 키워드 강화 + Step 9 6축 독립 Evaluator 검증 |
| 텍스트/로고 포함 이미지 | 높음 | 텍스트 왜곡 빈발 → 편집 후 수동 확인 필수 |
| 배경 교체 | 중간 | 전경 객체 보존 명시 |
| 그림자/조명 변경 | 높음 | 새 요소 생성(손/물체) 가능 → Step 9 6축 독립 Evaluator 검증 필수 |

### 사후 검증

- 편집 결과물은 Step 9 6축 독립 Evaluator 검증 (특히 §1 계층/§2 일관성 축)
- 형태 보존 실패 판정 기준: 실루엣 불일치 또는 새 요소 생성 감지
- 실패 시: 프롬프트 제약 강화 후 1회 재시도 → 재실패 시 전체 재생성 경로로 전환

## Blender MCP 파이프라인 (nano-banana → 3D)

Blender가 실행 중이고 blender-mcp 애드온이 활성화된 경우 추가 3D 생성 경로:

```
nano-banana (컨셉아트 2D) → mcp__blender__generate_hyper3d_model_via_images → GLB 저장
nano-banana (설명 텍스트) → mcp__blender__generate_hyper3d_model_via_text → GLB 저장
없는 에셋 → mcp__blender__search_polyhaven_assets → mcp__blender__download_polyhaven_asset
```


**활성화 요구사항**:
1. Blender 설치 (Windows) + blender-mcp 애드온 활성화 (포트 9876)
2. Claude 세션에서 `mcp__blender__*` 도구 사용 가능 여부 확인


## 토큰 캡 가드 (배치 실행 비용 통제, P1 신규)

배치 실행(다수 에셋 순차 생성) 시 전체 토큰 예산을 초과하지 않도록 **각 에셋 생성 전** 확인한다.

```
GAME_ASSET_TOKEN_CAP = 환경변수 GAME_ASSET_TOKEN_CAP (기본: 300000)

에셋 N번째 생성 시작 전 (Step 5 진입 전):
  if estimated_tokens_used ≥ GAME_ASSET_TOKEN_CAP:
    "[STOP] GAME_ASSET_TOKEN_CAP={cap} 도달. 에셋 {N}번째 생성 취소."
    "생성 완료: {완료 목록} / 미생성: {잔여 목록}"
    resource-manifest.md를 현재까지 완료분으로 저장 후 STOP 반환

에셋당 토큰 추정 (보수):
  - T1(풀 Soul): ~80000 (프롬프트 조립+MCP 호출+6축 크리틱)
  - T2(8요소): ~50000
  - T3(최소): ~20000
```

- `GAME_ASSET_TOKEN_CAP` 미설정 시 기본값 **300000** 적용.
- 배치 시작 전 총 예상 토큰 = Σ(에셋별 추정) 계산 → 초과 예상 시 사전 WARN 출력.
- 3회 크리틱 재시도(Step 9)도 토큰 추정에 포함 (T1: 80000 + 재시도 3× 40000 = 최대 200000/에셋).
- ⚠️ **추정치 정직성**: 추정치 = best-effort (LLM 자가추정, 정확 토큰 카운트 불가). **결정론적 bound = max-cycles**; 토큰 추정은 보조 가드. 정확한 토큰 enforcement는 P4 (agent-budget 훅 연동) 예정.

## 주의사항

- **1장씩 순차 생성** — 병렬 생성 금지 (Human 피드백 루프)
- MCP 도구별 API 키 필요 (Replicate, Ludo.ai 등)
- 3D 모델 생성은 실험적 — 품질 불안정 시 Asset Store 구매 권장
- Git LFS 정책 준수: 10MB+ 파일은 LFS 트래킹 필수
- Library 탐색 실패(PREFAB_LIBRARY_PATH 미설정) 시 Step 4 스킵 → Step 5로
- 프롬프트 조립 시 골든 레시피가 있으면 반드시 참조 (재현성 확보)
