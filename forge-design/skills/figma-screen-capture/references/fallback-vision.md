# Figma MCP Rate Limit 폴백 — Vision 재분석

Figma MCP가 rate limit / 권한 / 비활성 시 사용.

## 트리거

다음 응답 감지 시 즉시 폴백:
- "You've reached the Figma MCP tool call limit"
- "Upgrade your seat or plan"
- HTTP 429
- 인증 실패

## 폴백 흐름

### Option A — 기존 PNG export 재분석 (즉시)

기존 `figma-export/images/` 디렉토리 존재 시:

1. PNG 파일 list (≤60장 권장)
2. **Codex Vision** 우선 (MAS P1+ 룰 — 정확도 우선)
   - Fallback: Gemini Vision (Flash · 토큰·spacing 추출용)
3. 분석 항목:
   - 컬러 팔레트 (HEX 추정)
   - 레이아웃 (LNB·GNB 폭/높이)
   - 컴포넌트 패턴 (배지·버튼·테이블·필터바)
   - 타이포 (font size 추정)
4. ANALYSIS-REPORT.md 갱신 (날짜 + Vision 분석 표기)
5. CLAUDE-DESIGN-PROMPTS.md 토큰 섹션 갱신

### Option B — 사용자 JSON export 요청

Figma → Local variables 패널 → Export → JSON share:

1. 사용자에게 export 절차 안내
2. JSON 수신 → `figma-export/variables.json` 저장
3. 토큰 추출 → MD doc 갱신

### Option C — 화면별 PNG share

사용자가 새 PNG 1~2장 share:

1. 임시 디렉토리 저장
2. Codex Vision 분석
3. 핵심 토큰만 갱신 (전체 X)

## 한계 명시 의무

Vision 분석 = 근사값. 결과 doc 상단에 표기:

```markdown
> ⚠️ **Vision 분석 (Figma MCP 미사용)**: 색상·spacing 근사값. pixel-perfect 정합도 보장 X. Figma MCP 사용 가능 시 재분석 권장.
```

## Codex Vision 호출 패턴

```python
# screenshot-analyze 스킬 호출 또는 직접 Codex MCP
Agent(
  description="Vision 분석",
  subagent_type="general-purpose",
  prompt="""
PNG 60장 분석. 추출:
- 컬러 (HEX 5종 이상)
- 레이아웃 (LNB·GNB·main spacing)
- 컴포넌트 (배지·버튼·테이블)
- 타이포 (size 4단계)
출력: ANALYSIS-REPORT.md 갱신 형식.
"""
)
```
