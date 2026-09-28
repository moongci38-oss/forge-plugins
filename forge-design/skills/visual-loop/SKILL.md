---
name: visual-loop
description: "프론트엔드 변경을 실제 브라우저 렌더링으로 캡처해 Vision 분석한다. UI 코드를 수정한 직후 시각 회귀를 확인할 때 사용한다."
argument-hint: "[url] [--viewport=desktop,tablet,mobile]"
allowed-tools: "Bash,Read,Write,Edit,Glob,Grep,Skill,Agent"
context: fork
model: sonnet
---

# Visual Loop — 실브라우저 렌더링 시각 검증
**역할**: 정적 분석이 못 잡는 실제 렌더링 이슈(폰트·flex 깨짐·3rd-party CSS)를 캡처+aria+Vision closed loop 로 검증.
**출력**: 3 viewport 스크린샷 + Codex Vision(GPT-5.6 Sol) 분석 + 정적 분석 delta 리포트.
**호출**: 수동 `/visual-loop <url> [--viewport=desktop,tablet,mobile]`(기본 3개) · Check 8.6 후 · `.tsx/.jsx/.css` 변경 PR. 매 PR 자동 호출 금지(의심 PR만).
관련: `/screenshot-analyze`, `/playwright-cli`. 브라우저 보안 경계 → `${FORGE_ROOT:-$HOME/forge}/.claude/rules-on-demand/agent-browser-security.md`.

**Workflow**: `Workflow({ script: Bash("cat ~/.claude/skills/visual-loop/workflow.js") })` — 3 viewport Vision parallel(). `CLAUDE_CODE_DISABLE_WORKFLOWS=1` 이면 아래 직접 실행. 전제: Vision 용 approve-worker 토큰 3개(viewport별) 외부 선발행.

**토큰 캡**: Step 2·Step 7 시작 전 `VISUAL_LOOP_TOKEN_CAP`(기본 400000) 추정 도달 시 `[STOP] VISUAL_LOOP_TOKEN_CAP={cap} 도달. 현재 단계 시작 취소.` + 완료 스텝 결과·리포트 경로 반환. (추정은 보조, 결정론 bound = max-cycles)

## Step 1 — 사전 검증 (server 미가동 → 별도 터미널 `npm run dev` 안내 후 **대기 없이 종료**)
```bash
command -v playwright-cli || echo "playwright-cli 없음 — npm install -g @playwright/cli 필요"
curl -sf --max-time 3 -o /dev/null "$URL" && echo "server OK" || echo "server 미가동"
```

## Step 2 — 캡처 (viewport당 병렬 Agent 1개)
```bash
mkdir -p /tmp/visual-loop/
node "${FORGE_ROOT:-$HOME/forge}/shared/scripts/playwright-devtools-capture.mjs" \
  --url "$URL" --out-prefix /tmp/visual-loop/{vp} \
  --viewports {vp} --phase green
```
산출: `/tmp/visual-loop/{vp}-{vp}-shot.png` · `{vp}-aria.json`(Step 2.5 입력) · `{vp}-console.json`·`{vp}-network.json`.
- exit 3(`PLAYWRIGHT_UNAVAILABLE`) → `/playwright-cli` 로 스크린샷만 폴백, Step 2.5 skip.
- 그마저 실패 → ①조건 대기 재시도 2회 ②DOM 스냅샷·단위테스트·정적 분석 대체(수단 명시) ③리포트 `## 요약` 에 `시각 검증 미확인(unverified)` — PASS 도 FAIL 도 아님, GREEN 보고 금지.

## Step 2.5 — 기능축 판정 (aria, 결정론 — 스크립트가 판정)
요소 존재·활성은 Vision 이 아니라 aria snapshot 으로 판정. 캡처 Agent 가 곧바로 수행. LLM 은 기대 요소 목록만 쓴다:
```bash
cat > /tmp/visual-loop/{vp}-expected.json <<'JSON'
[{"target":"로그인 버튼","role":"button","name":"로그인","enabled":true}]
JSON
python3 "${FORGE_ROOT:-$HOME/forge}/shared/scripts/aria-functional-axis.py" \
  --aria /tmp/visual-loop/{vp}-aria.json \
  --expected /tmp/visual-loop/{vp}-expected.json \
  --viewport {vp} --out /tmp/visual-loop/{vp}-functional-axis.json
# rc 0 = fail_count 0 · rc 1 = 기능 FAIL · rc 2 = 판정 불가(PASS 로 읽지 마라)
```
트리에 요소 부재 = pruning 가능 → WARN. 매칭 규칙은 스크립트 헤더 주석이 정본.

**Step 3 — Codex Vision 분석 (외관축 한정)**: 각 `{vp}-{vp}-shot.png` 에 `/screenshot-analyze` 병렬 Agent. 프롬프트: "{viewport} viewport({width}x{height}) 분석 — 요소 존재/활성 판정 금지(aria축 전담). 1 시각 계층 2 색 대비 3 Touch target(모바일) 4 Layout 깨짐(overflow·overlap·잘림) 5 애니메이션/차트/그라디언트. 각 PASS/WARN/FAIL, JSON 반환." → `/tmp/visual-loop-analysis-{viewport}.json`
## Step 3.4 — pixel-diff 게이트 (조건부 — diff 파일 있을 때만)
`bash "${FORGE_ROOT:-$HOME/forge}/shared/scripts/visual-loop-pixel-gate.sh" {vp}` — 내부에서 `pixel-diff-gate.sh` 를 임계 0.01 로 호출, `{vp}-pixel-diff-gate.rc`·`.log` 기록.
출력 `PIXEL_GATE=skip|pass|fail` · `RC=`. rc 0 통과 · 2 임계 초과 → 외관 FAIL · 3 결과 거부 → 외관 FAIL · `PIXEL_GATE=skip`(파일 없음) = graceful skip(ad-hoc 기본).
diff 파일이 있으면 외관 최종 판정은 `pixel-diff-gate.sh` rc 우선(Vision 은 보조).

## Step 3.5 — 독립 Evaluator (자기평가 금지)
`Agent(subagent_type="general-purpose", model="sonnet")` — Generator 컨텍스트 미공유, 파일만 근거. 프롬프트 요지:
- 입력: `{vp}-functional-axis.json`×3 · `{vp}-pixel-diff-gate.rc`(+.log, 있을 때만) · `/tmp/visual-loop-analysis-{vp}.json`×3 · 스크린샷 · (선택) `{project-root}/DESIGN.md`(토큰/anti-slop 대조) · (선택) 외부 정적 분석 `{static_analysis_result_path}`
- 1 fail_count 합산(재판정 금지) 2 rc 파일 있으면 값 그대로 인용, 없으면 skip(FAIL 아님) 3 Vision JSON 에서 tree-불가 외관 P0/P1 만 추출 4 DESIGN.md 대조 5 정적 결과와 delta 분류
- **FAIL 조건**(하나라도): (a) 임의 viewport fail_count ≥1 (b) Vision P0 ≥1 (c) rc 파일 존재 & 값 ≠0(rc 값과 .log 첫 줄 인용)
- 관대 금지("전체적으로 괜찮다" 금지·의도 추정 용납 금지·rubric 점수 최적화 금지, intent 로 판정). FAIL 유발 축 명시.
- 출력: `/tmp/visual-loop-evaluator-result.json`
## Step 4 — 정적 분석 Delta (Evaluator JSON 기반 요약)
| 정적 | 시각 | 판정 |
|---|---|---|
| PASS | PASS | 일치 |
| PASS | WARN/FAIL | **시각 발견**(핵심 가치) → 리포트 |
| FAIL | PASS | 정적 오탐 가능 → 재검토 |
| FAIL | FAIL | 이슈 확정 |

## Step 5 — 통합 리포트
`forge-outputs/docs/reviews/visual-loop/{YYYY-MM-DD}-{slug}-report.md`:
```markdown
# Visual Loop Report — {URL}
**날짜:** {date}  **Viewport:** {desktop/tablet/mobile}
## 요약
- 시각 분석: {PASS X / WARN Y / FAIL Z}
- **시각 발견(정적 누락):** {count}
- **Evaluator 최종 판정**: PASS / FAIL
## 스크린샷 / ## Delta 상세  (시각 발견 표: 항목 | Viewport | Vision 소견 | 제안 수정 / 오탐 가능)
## 권고 조치  (P0 즉시 / P1 이번 주)
```

**Step 6 — 자동 fix (선택)**: 시각 발견이 명확하면 변경 제안을 diff 로 출력 → **[STOP] 사용자 승인 대기** → 승인 시 Edit 수정 + Step 7.

**Step 7 — re-verify (cap=1)**: 토큰 캡 확인 → Step 2 재캡처 → 2.5 → 3 → 3.4 → 3.5 Evaluator 재스폰.
PASS → "✅ re-verify PASS. Step 6 수정 확인됨." + 리포트 갱신 / FAIL → "❌ re-verify FAIL. 수정 미해결. Human 개입 요청." + delta. 2회차 이상 → [STOP] Human 위임.

**제약·트러블슈팅**
- Dev server 필수 · WSL `playwright install chromium` · Codex CLI 0.156.1+ 구독 인증 · localhost 한정.
- 빈 화면 → `--wait-until networkidle` · Codex rate limit → viewport 축소 · Evaluator 스폰 실패 → frontmatter `allowed-tools` 에 Agent 확인.
- 실패 시 [[pev-self-correction]] 적용.
