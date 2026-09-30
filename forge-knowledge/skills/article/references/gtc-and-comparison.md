# article — gtc-and-comparison

> Step 2.85 GTC-1·2·3 실측 대상 경로와 Step 2.9 비교 매트릭스·개선 제안 등급.
> 원문 출처: `SKILL.md` 에서 **그대로 옮김**(이슈 #1014, 2026-09-24 목차화 — 내용 무변경).

## 목차

- Step 2.85 — GTC-1·2·3 읽을 파일 목록 (구 SKILL.md L243-257)
- Step 2.9 — 비교 매트릭스·개선 제안 등급 (구 SKILL.md L312-321)

---

## Step 2.85 — GTC-1·2·3 읽을 파일 목록

**GTC-1: 관련성 필터** — 기사에서 언급된 도구/서비스가 우리 시스템에서 실제 사용 중인지:
- Read: `~/forge/.mcp.json`, `~/.claude.json` (MCP 서버 목록)
- Read: `~/forge/forge-workspace.json` (활성 프로젝트)
- Glob: `~/.claude/skills/*/SKILL.md`, `~/forge/.claude/agents/*.md`
- **미사용 도구에 대한 High+ 제안** → 영향도 Low로 강제 + "미사용" 표기

**GTC-2: 기구현 확인** — 기사의 제안/패턴이 이미 존재하는지:
- Glob: `~/forge/.github/workflows/*.yml`, `~/forge/.claude/skills/*/SKILL.md`, `~/forge/.claude/hooks/*.sh`
- Glob: `~/forge/.claude/rules/*.md`, `~/.claude/rules/*.md`
- **이미 구현된 기능 제안 시** → 비교 매트릭스에 "이미 적용" 표기, 제안에서 제거

**GTC-3: 핵심 커버리지** — Forge/Forge Dev 파이프라인 현황을 실제 파일로 확인:
- Read: `~/forge/forge-workspace.json` → 활성 프로젝트 + gate-log 위치
- Read: 각 프로젝트의 `gate-log.md` → 현재 Gate


---

## Step 2.9 — 비교 매트릭스·개선 제안 등급

**비교 매트릭스:**

| 기사 제안/발견 | 우리 현황 | 갭 | 영향도 | 난이도 |
|--------------|---------|:--:|:----:|:----:|
| 적용 가능 패턴 | 이미 적용/부분/미적용 | 구체적 갭 | H/M/L | H/M/L |

**개선 제안 (GTC-4 통과 항목만 P1 이상):**
- **P0**: 현재 병목 해소, Quick Win (1시간 이내)
- **P1**: 반나절~1일, 명확한 ROI, **GTC-4 통과 필수**
- **P2**: 설계 변경, 장기 가치 (이번 달)
