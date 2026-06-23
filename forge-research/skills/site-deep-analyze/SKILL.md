---
name: site-deep-analyze
description: 특정 사이트 URL → 정밀 분석 → 재구현 가이드 생성. Playwright 크롤 + DOM 컴포넌트 패턴 + CSS 토큰 + API 엔드포인트 추론 + Gemini Vision 시각 분석 + Tavily 시맨틱 추출. 산출물 7종(analysis-report/screenshots/style-guide/components/api-schema/network-trace/reconstruction-spec). 코드 직접 복제 금지 — 영감 받은 자체 구현 가이드만 생성. /site-deep-analyze <URL> [options] 형식으로 호출.
user-invocable: true
context: fork
model: sonnet
group: research
input: 사이트 URL + 옵션 (--depth, --pages, --task, --viewport, --cu, --dry-run)
output: 05-design/site-analysis/{slug}/ 7종 산출물 (analysis-report.md, style-guide.md, components.md, api-schema.json, network-trace.har, reconstruction-spec.md, screenshots/)
eval_cases: off
---

# /site-deep-analyze

사이트 URL → 정밀 분석 → 재구현 가이드 생성. 기존 5종 도구(playwright-cli, screenshot-analyze, Tavily, style-forge, visual-loop) wrapper.

## 호출

```bash
/site-deep-analyze <URL>                              # 기본
/site-deep-analyze <URL> --depth=3 --pages=50         # 깊은 크롤
/site-deep-analyze <URL> --task=ui-audit              # UI 위주
/site-deep-analyze <URL> --task=api-discovery         # BE API 위주
/site-deep-analyze <URL> --viewport=desktop,mobile    # 반응형 한정
/site-deep-analyze <URL> --cu --scenario "..." --max-cost=5  # Computer Use (AD-59)
/site-deep-analyze <URL> --dry-run                    # estimate만 출력
```

## 윤리·법적 가드레일 (필수 준수)

| 항목 | 룰 |
|------|-----|
| robots.txt | Phase 0에서 자동 확인. `Disallow: /` → [STOP] |
| ToS | 사전 확인 권고. 위반 의심 시 [STOP] |
| 저작권 자산 | 이미지·로고·텍스트 직접 복제 금지. 참조용 캡처만 보존 |
| 코드 직접 복제 | 금지. 영감 받은 자체 구현 가이드만. JSX·HTML·CSS 원본 그대로 변환·재배포 X |
| trademark | 로고·브랜드명 보존된 자산 그대로 사용 X |
| PII | 분석 대상 사이트의 실제 사용자 PII 캡처 X |
| 마스킹 | 산출물에서 토큰·세션 키·이메일·전화번호 자동 redact (`{REDACTED}` 치환) |
| Rate limit | 1s/req delay 기본 (`--delay` 조정 가능, 최소 0.5s) |

## Computer Use 가드레일 (--cu 사용 시 추가 준수)

| 항목 | 룰 |
|------|-----|
| 자격증명 | `env://VAR` 형식만 허용. raw 인자 차단 |
| PII 입력 감지 | 신용카드·SSN·계좌 화면 감지 시 자동 [STOP] |
| 결제 단계 | 실제 결제 X. 결제 직전 [STOP] (decision gate) |
| 자동 로그아웃 | 시나리오 종료 시 강제 로그아웃 액션 추가 |
| 스크린샷 redact | 자격증명·토큰 화면 자동 마스킹 |
| max-cost | `--max-cost=5` USD default. 초과 시 [STOP] |
| max-actions | `--max-actions=50` default. 초과 시 [STOP] |
| 시나리오 검증 | 시나리오 텍스트 불명확 시 [STOP] 사용자 보완 요청 |

## Workflow 통합 (계획서 P2-6)

**패턴 (Phase 2 deep-research a+e 적용)**:
Gate(윤리검증) → Crawl(Playwright) → **parallel 5각도 fan-out** → **Coverage Loop(completeness critic, cap 2)** → **Phase 2.5 추론검증(adversarial)** → Semantic(Tavily) → Output.

### (a) Fan-out 분석 각도 (multi-modal sweep)

Analyze 단계에서 5개 독립 agent를 `parallel()`로 동시 스폰:

| 각도 | label | 분석 대상 |
|------|-------|----------|
| by-component + by-API | `analyze:static` | DOM 컴포넌트 패턴 + CSS + HAR API 엔드포인트 |
| by-page-type | `analyze:by-page-type` | 라우트 유형 분류 (auth/list/detail/dashboard/landing/form) |
| by-interaction | `analyze:by-interaction` | 이벤트 핸들러·폼·내비게이션 패턴 |
| by-css-token | `analyze:by-css-token` | CSS 변수·컬러 시스템·스페이싱 스케일 |
| vision (skipGemini=false 시) | `analyze:vision` | Gemini Vision 레이아웃·UX 패턴 |

### (e) Coverage Loop (completeness critic)

fan-out 완료 후 completeness critic agent가 미탐색 항목 식별:
1. 미분류 컴포넌트 유형 / 미크롤 페이지 카테고리 / 미매핑 API 패턴 감지
2. gap 있으면 타겟 재분석 1회 실행 (round 1)
3. 여전히 gap 있으면 round 2 (최대)
4. **cap 2라운드** — 잔여 gap은 `log()`로 드롭 명시 후 Phase 2.5 진행

참조: `$HOME/.claude/rules-on-demand/research-verification-protocol.md` (coverage-loop)

실행: `Workflow({ script: Bash("cat $HOME/.claude/skills/site-deep-analyze/workflow.js"), args: { url, depth, pages, task, skipGemini } })`
skipGemini=true(Gemini 토큰 없는 경우 정적 분석만). `CLAUDE_CODE_DISABLE_WORKFLOWS=1` 시 기존 6 Phase 방식 fallback.

## 6 Phase 절차

### Phase 0 — 입력 검증 + 윤리 게이트

1. URL boundary 차단: `localhost` / `127.0.0.1` / RFC1918 사설망 / IPv6 loopback / `169.254.169.254` / `file://`
2. robots.txt 자동 확인: `{base_url}/robots.txt` WebFetch → `Disallow: /` 시 [STOP]
3. ToS 사전 확인 권고 (사용자 컨펌 게이트)
4. `FORGE_SELF_SITES` env에 URL 매핑 시 게이트 skip

### Phase 1 — 사이트 매핑 (Playwright)

`playwright-cli` 스킬 호출:
- depth=2 (default), pages≤20 (default)
- 각 페이지: 스크린샷 3 viewport (1920×1080 / 768×1024 / 375×667) + DOM HTML + HAR
- User-Agent: `Forge Site Analyzer/1.0 (+forge-outputs)`
- Delay: 1s/req

### Phase 2 — 정적 분석

DOM → 컴포넌트 패턴 (버튼·폼·카드·내비·모달·테이블 빈도)

CSS → `/style-forge` Mode A 호환 형식 (color palette / typography / spacing / border-radius / shadow / breakpoint)

네트워크 HAR → API 엔드포인트 (URL pattern + HTTP method + status + 응답 schema 추론 + 인증 방식)

### Phase 3 — 시각 분석

핵심 화면 5-10개 선정 → `/screenshot-analyze` 호출:
- Gemini Vision: 레이아웃 grid/flex + UX 패턴 분류 + 인터랙션 단서
- 결과 → `components.md`

### Phase 2.5 — 추론검증 (adversarial inference verification)

Phase 2 정적 분석이 추론한 `apiEndpoints[]`·`components[]`를 Phase 5 산출물에 반영하기 전,
이미 수집된 HAR·DOM 아티팩트만으로 각 추론의 근거를 역검증한다 (**신규 네트워크 호출 0**).

**참조 표준**: `$HOME/.claude/rules-on-demand/research-verification-protocol.md` #4 반증탐색

검증 절차:
1. **API 엔드포인트**: HAR 파일에서 해당 URL 패턴의 실제 요청 존재 여부 확인
   - 존재 → `verifiedApis[]` `{endpoint, evidence_har_url, method}`
   - 없음 → `unverifiedApis[]` `{endpoint, confidence:"low", unverified:true}`
2. **컴포넌트**: DOM HTML에서 해당 컴포넌트를 지지하는 CSS class/selector 실재 여부 확인
   - 근거 selector 존재 → `verifiedComponents[]` `{name, selector_evidence}`
   - 근거 없음 → `unverifiedComponents[]` `{name, unverified:true}`
3. 결과는 Phase 5 Output agent에 전달 — `[INFERRED — no direct evidence]` 라벨 부착 트리거

**[INFERRED] 라벨링 규칙** (deep-research (d) 미검증 라벨 컨벤션):
- `api-schema.json`: 미검증 엔드포인트 → `"x-inference-label": "[INFERRED — no direct evidence]"` + `"confidence": "low"`
- `api-schema.json`: 검증된 엔드포인트 → `"confidence": "high"` + `"evidence": "<har_url>"`
- `reconstruction-spec.md`: 미검증 컴포넌트명 뒤 **[INFERRED — no direct evidence]** 표기
- `reconstruction-spec.md`: 검증된 컴포넌트 → `(selector: <selector_evidence>)` 증거 표기
- `analysis-report.md`: 영감 고지 직후 추론검증 요약 섹션 삽입 (`verifyResult.summary`)

workflow.js agent label: `verify:adversarial` / phase: `'Verify'`

### Phase 4 — 시맨틱 추출

Tavily MCP `tavily_extract` 호출 (JS 렌더링 처리):
- 본문 텍스트 + OG tags + JSON-LD + 다국어 감지

### Phase 4.5 — Computer Use 인터랙션 (--cu 옵션 시만)

`scripts/cu-runner.py` 호출:

1. 비용 estimate → 사용자 컨펌 게이트
2. 인증 처리 (`env://VAR` only)
3. 시나리오 실행 (actions + screenshots + DOM snapshot)
4. 결과 → `cu-scenarios/{scenario-slug}/` (actions.json + screenshots/ + transitions.md + cost.json)

### Phase 5 — 산출물 생성

저장 경로: `${FORGE_OUTPUTS:-$HOME/forge-outputs}/05-design/site-analysis/{slug}/` (slug = hostname kebab-case ≤30자)

```
{slug}/
├── analysis-report.md       # 종합 분석 + 재구현 권고
├── screenshots/             # desktop/tablet/mobile × N 페이지
├── style-guide.md           # /style-forge Mode A 호환
├── components.md            # 컴포넌트 카탈로그
├── api-schema.json          # BE API 모델 추론 (OpenAPI 3.0)
├── network-trace.har        # Playwright HAR
└── reconstruction-spec.md   # 재구현 가이드 (Forge Phase 4 draft)
```

`analysis-report.md` 첫 줄 필수:
```
> **본 분석은 영감 받은 자체 재구현을 위한 가이드입니다. 원본 사이트의 코드·이미지·텍스트를 직접 복제하지 않습니다. 사이트 ToS·저작권·trademark 준수가 사용자 책임입니다.**
```

### Phase 6 — 다음 액션 안내

- Forge Phase 4: `/forge-plan --from-site-analysis 05-design/site-analysis/{slug}/` (AD-60 후)
- Wiki 등재: `/wiki-sync`
- 재분석: `/site-deep-analyze <URL> --re-run`
