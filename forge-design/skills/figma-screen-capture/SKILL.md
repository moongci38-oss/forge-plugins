---
name: figma-screen-capture
disable-model-invocation: true
description: >
  Extract Figma frames by node-id whitelist → screens/ PNG + manifest.json + 화면정의.md + mockup/index.html gallery.
  Input: Figma fileKey + node-id whitelist (CSV or mapping table) + output directory.
  Output: screens/*.png + manifest.json + 02-화면정의.md + mockup/index.html (standalone gallery).
  Use when: (1) given a whitelist of Figma node-ids and need per-frame screenshots, (2) generating 화면정의서 (screen definition docs) from Figma, (3) building a standalone meeting mockup gallery HTML.
  SKIP for: full Figma design-token sync (use figma-design-sync), code extraction from Figma, or non-whitelist bulk export.
  Triggers: "화면정의", "목업 갤러리", "Figma 프레임 추출", "figma-screen-capture".
---

# figma-screen-capture

Figma 화이트리스트 프레임 → 화면정의서 + 목업 갤러리 자동화.

## 역할

Figma 화이트리스트 프레임을 화면정의서(02-화면정의.md)와 독립형 목업 갤러리(mockup/index.html)로 변환하는 추출기. 전수 열거가 아닌 화이트리스트 지정 노드만 처리하며, 코드 추출은 하지 않는다(구조정의만).

## 컨텍스트

Figma node-id 화이트리스트(CSV 또는 매핑표)와 함께 "화면정의"/"목업 갤러리"/"Figma 프레임 추출" 요청 시 발동. 전체 디자인 토큰 동기화는 `figma-design-sync`가 담당하므로 이 스킬의 범위 밖.

## 출력

`{out_dir}/manifest.json`(SSoT) + `{out_dir}/screens/*.png` + `02-화면정의.md` + `mockup/index.html`(자립형 갤러리, CDN 0).

## 제약

- **화이트리스트만** — 전수 열거 X. MCP 호출 ≤60.
- **구조정의만** — 코드 추출 X (개발 단계 React 재구현).
- **미러 주의**: `$HOME/.claude/skills/` 직접 편집 차단. SSoT = `${FORGE_ROOT:-$HOME/forge}/.claude/skills/`. 작성 후 `node $HOME/.claude/scripts/forge-sync.mjs sync` 필수.
- node-id MCP 형식: `:` → `-` 변환 (예: `40010405:23928` → `40010405-23928`).

## 핵심 로직 (Claude 실행 순서)

```
① URL/fileKey + 화이트리스트 수집
② node-id : → - 변환
③ manifest.json 초기화 (figma_capture.py init)
④ 화이트리스트 각 node → get_screenshot → screens/ 저장
⑤ 구조 파악: get_metadata (선택, 호출 예산 여유 시)
⑥ manifest.json 업데이트 (components/interactions/domain_diff 기입)
⑦ 02-화면정의.md 생성 (figma_capture.py gen-md)
⑧ mockup/index.html 생성 (figma_capture.py gen-html)
⑨ rate-limit → fallback-vision.md 참조
```

## 스크립트 사용법

```bash
# ① manifest 초기화 (node-id 화이트리스트 → skeleton)
python3 $HOME/.claude/skills/figma-screen-capture/scripts/figma_capture.py init \
  --whitelist "40010405:23928,40010405:24045" \
  --names "로그인_크리에이터,플랫폼미선택" \
  --sections "로그인,로그인" \
  --out /abs/path/to/login-signup-approval/ \
  --file-key Ke2sPiVdS1yvfLlYBgFXfY \
  --page-node "63801:6816"

# ⑦ 화면정의.md 생성
python3 $HOME/.claude/skills/figma-screen-capture/scripts/figma_capture.py gen-md \
  --manifest /abs/path/.../manifest.json \
  --out /abs/path/to/login-signup-approval/ \
  --title "로그인·회원가입·승인 화면정의서"

# ⑧ mockup HTML 생성
python3 $HOME/.claude/skills/figma-screen-capture/scripts/figma_capture.py gen-html \
  --manifest /abs/path/.../manifest.json \
  --template $HOME/.claude/skills/figma-screen-capture/assets/mockup-template.html \
  --out /abs/path/to/login-signup-approval/
```

## MCP 호출 패턴

```
# get_screenshot (필수)
fileKey: Ke2sPiVdS1yvfLlYBgFXfY
nodeId: <mcp_node_id>  # : → - 변환된 형태
maxDimension: 1024  # 기본; 세부 확인 시 2048

# get_metadata (선택 — 구조 파악용, 호출 예산 여유 시)
fileKey: Ke2sPiVdS1yvfLlYBgFXfY
nodeId: <mcp_node_id>
```

PNG 저장 경로: `screens/{name}_{mcp_node_id}.png` (curl 다운로드 or base64).

## 산출물 구조

```
{out_dir}/
├── manifest.json          — 화면명/node-id/구조노트/상태/배지 (단일 소스)
├── 02-화면정의.md          — 화면정의서 (manifest 기반 자동 생성)
├── screens/               — PNG 파일
│   └── {name}_{nodeid}.png
└── mockup/
    └── index.html         — 자립형 갤러리 (CDN 0, 상대경로 ../screens/)
```

## 배지·상태 규칙

| 배지 | 의미 |
|------|------|
| ✅로컬PNG | 로컬에 이미 PNG 존재 |
| ⚠️MCP추출 | MCP get_screenshot으로 추출 |
| ❌ClaudeDesign신규 | Figma 없음 → Claude Design TODO |

`data_status` (검토중/확정/이슈): manifest.json에서 수동 설정.

## Rate-limit 폴백

→ `references/fallback-vision.md` 참조.

## ⚠️TODO 처리

Figma에 해당 화면 없는 경우:
- manifest.json `status: "❌ClaudeDesign신규"` 기입
- 02-화면정의.md 해당 섹션에 `> ⚠️TODO: Claude Design 신규 디자인 필요` 명시
- 신규 디자인 생성 X (별도 안건)

## 참조 파일

- `scripts/parse_figma_url.py` — Figma URL → fileKey + nodeId
- `scripts/figma_capture.py` — manifest/md/html 생성 헬퍼
- `assets/mockup-template.html` — 자립형 갤러리 HTML 템플릿
- `references/fallback-vision.md` — rate-limit 폴백 흐름

## 자동 평가 (eval-rubric 통합)

산출물 저장 직후 자동 eval-rubric 4축 채점 → eval_cases.jsonl 누적. 통합 패턴(절차·holdout·dedupe·비활성·통합효과·보안) 정본 → `eval-rubric/references/skill-integration.md`.

- **target**: 02-화면정의.md 저장 완료 후 · mockup/index.html 브라우저 렌더 확인 후 산출물 경로
- **case_id**: `EC-figma-screen-capture-{N}`
