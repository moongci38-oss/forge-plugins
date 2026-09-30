---
name: site-deep-analyze
description: "사이트 URL 정밀분석(DOM패턴·CSS토큰·API)→재구현가이드. 구조/디자인 분석 요청 시 사용."
context: fork
model: sonnet
---

# /site-deep-analyze

사이트 URL → 정밀 분석 → 재구현 가이드. 5종 도구(playwright-cli, screenshot-analyze, Tavily, style-forge, visual-loop) wrapper.

## 호출
```bash
/site-deep-analyze <URL> [--depth=3 --pages=50] [--task=ui-audit|api-discovery] [--viewport=desktop,mobile]
/site-deep-analyze <URL> --cu --scenario "..." --max-cost=5   # Computer Use
/site-deep-analyze <URL> --dry-run                            # estimate만
```

## 윤리·법적 가드레일
| 항목 | 룰 |
|---|---|
| robots.txt | Phase 0 자동 확인. `Disallow: /` → [STOP] |
| ToS | 사전 확인 권고. 위반 의심 → [STOP] |
| 저작권·trademark | 이미지·로고·텍스트·브랜드 자산 직접 복제/사용 금지. 참조용 캡처만 |
| 코드 복제 | 금지. JSX·HTML·CSS 원본 변환·재배포 X, 자체 구현 가이드만 |
| PII | 대상 사이트 실사용자 PII 캡처 X |
| 마스킹 | 산출물의 토큰·세션 키·이메일·전화번호 `{REDACTED}` 치환 |
| Rate limit | 1s/req 기본(`--delay`, 최소 0.5s) |

## Computer Use 가드레일 (--cu)
| 항목 | 룰 |
|---|---|
| 자격증명 | `env://VAR` 만 허용, raw 인자 차단 |
| PII 입력 감지 | 신용카드·SSN·계좌 화면 → 자동 [STOP] |
| 결제 | 실제 결제 X. 결제 직전 [STOP] |
| 종료 | 시나리오 종료 시 강제 로그아웃 · 자격증명·토큰 화면 스크린샷 마스킹 |
| max-cost | `--max-cost=5` USD 기본. 초과 → [STOP] |
| max-actions | `--max-actions=50` 기본. 초과 → [STOP] |
| 시나리오 | 텍스트 불명확 → [STOP] 사용자 보완 요청 |

## Workflow 실행
흐름: Gate(윤리) → Crawl(Playwright) → 5각도 parallel fan-out → Coverage Loop(cap 2) → Phase 2.5 추론검증 → Semantic(Tavily) → Output.

`Workflow({ script: Bash("cat ~/.claude/skills/site-deep-analyze/workflow.js"), args: { url, depth, pages, task, skipVision } })`
- `skipVision=true` = Vision 없이 정적 분석만 · `CLAUDE_CODE_DISABLE_WORKFLOWS=1` → 아래 6 Phase 수동 fallback

**Fan-out** (`parallel()` 5 agent): `analyze:static`(DOM 컴포넌트+CSS+HAR API) · `analyze:by-page-type`(auth/list/detail/dashboard/landing/form) · `analyze:by-interaction`(이벤트·폼·내비) · `analyze:by-css-token`(CSS 변수·컬러·스페이싱) · `analyze:vision`(skipVision=false 시, GPT-5.6 Sol Codex 레그 레이아웃·UX)

**Coverage Loop**: completeness critic 이 미분류 컴포넌트/미크롤 페이지/미매핑 API 감지 → gap 있으면 타겟 재분석, **최대 2라운드**. 잔여 gap 은 `log()` 로 드롭 명시 후 Phase 2.5.

## 6 Phase 절차

**Phase 0 — 입력 검증 + 윤리 게이트**
1. URL 차단: `localhost`/`127.0.0.1`/RFC1918/IPv6 loopback/`169.254.169.254`/`file://`
2. `{base_url}/robots.txt` WebFetch → `Disallow: /` 시 [STOP]
3. ToS 사용자 컨펌 게이트 · `FORGE_SELF_SITES` env 매핑 URL 은 게이트 skip

**Phase 1 — 사이트 매핑**: `playwright-cli` 스킬, depth=2·pages≤20 기본. 페이지마다 3 viewport(1920×1080/768×1024/375×667) 스크린샷 + DOM HTML + HAR. UA `Forge Site Analyzer/1.0 (+forge-outputs)`, 1s/req.

**Phase 2 — 정적 분석**: DOM → 컴포넌트 빈도(버튼·폼·카드·내비·모달·테이블) · CSS → `/style-forge` Mode A 형식(palette/typography/spacing/radius/shadow/breakpoint) · HAR → API(URL pattern·method·status·응답 schema·인증 방식)

**Phase 3 — 시각 분석**: 핵심 화면 5-10개 → `/screenshot-analyze`(GPT-5.6 Sol, `codex-critic` 경유: grid/flex 레이아웃·UX 패턴·인터랙션 단서) → `components.md`

**Phase 2.5 — 추론검증** (label `verify:adversarial`, phase `'Verify'`) — 수집된 HAR·DOM 만 사용, **신규 네트워크 호출 0**. 핵심 주장마다 반증 탐색 1회 이상
1. 기계 대조 먼저 (stdin = apiEndpoints JSON 배열 · harPath 는 **작은따옴표 인용** · domPaths 는 전부 JSON 배열 파일로 — 크롤러 경로는 untrusted, 큰따옴표 금지):
   `python3 "${FORGE_ROOT:-$HOME/forge}/shared/scripts/har-endpoint-verify.py" --har '<harPath>' --endpoints - [--dom-list <domPaths.json> --components <components.json>]`
   - rc 0 → verified/unverified(API·컴포넌트)를 **그대로** 옮기고 재판정 금지, `residual[]` 만 직접 판단. 매칭 규칙은 스크립트 헤더가 정본
   - rc≠0(2 = HAR 부재·파싱 실패, 1 = 예상 외 실패) 또는 `stats.components_checked=false` → 수동 대조
2. API: HAR 에 실제 요청 있음 → `verifiedApis[]{endpoint, evidence_har_url, method}` / 없음 → `unverifiedApis[]{endpoint, confidence:"low", unverified:true}`
3. 컴포넌트: DOM 에 근거 selector 있음 → `verifiedComponents[]{name, selector_evidence}` / 없음 → `unverifiedComponents[]{name, unverified:true}`
4. 결과를 Phase 5 Output agent 에 전달. 라벨링:
   - `api-schema.json`: 미검증 `"x-inference-label": "[INFERRED — no direct evidence]"` + `"confidence": "low"` / 검증 `"confidence": "high"` + `"evidence": "<har_url>"`
   - `reconstruction-spec.md`: 미검증 컴포넌트명 뒤 **[INFERRED — no direct evidence]** / 검증 `(selector: <selector_evidence>)`
   - `analysis-report.md`: 영감 고지 직후 추론검증 요약(`verifyResult.summary`)

**Phase 4 — 시맨틱**: Tavily MCP `tavily_extract` → 본문 + OG tags + JSON-LD + 다국어 감지

**Phase 4.5 — Computer Use (--cu 만)**: `scripts/cu-runner.py` — 비용 estimate → 사용자 컨펌 → 인증(`env://VAR`) → 시나리오 실행 → `cu-scenarios/{scenario-slug}/`(actions.json + screenshots/ + transitions.md + cost.json)

**Phase 5 — 산출물**: `${FORGE_OUTPUTS:-$HOME/forge-outputs}/05-design/site-analysis/{slug}/` (slug = hostname kebab-case ≤30자)
- `analysis-report.md`(종합+재구현 권고) · `screenshots/` · `style-guide.md`(/style-forge Mode A) · `components.md` · `api-schema.json`(OpenAPI 3.0) · `network-trace.har` · `reconstruction-spec.md`(Forge Phase 4 draft)
- `analysis-report.md` 첫 줄 필수:
```
> **본 분석은 영감 받은 자체 재구현을 위한 가이드입니다. 원본 사이트의 코드·이미지·텍스트를 직접 복제하지 않습니다. 사이트 ToS·저작권·trademark 준수가 사용자 책임입니다.**
```

**Phase 6 — 다음 액션**: `/forge-plan --from-site-analysis 05-design/site-analysis/{slug}/` · `/wiki-sync` · 재분석 `/site-deep-analyze <URL> --re-run`
