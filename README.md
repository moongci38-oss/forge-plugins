# forge-plugins

> 🚀 **처음이신가요? / 비개발자이신가요?** → [**QUICKSTART.md**](./QUICKSTART.md) 문서 하나로 5분 만에 설치됩니다.

Forge Claude Code Plugin Marketplace — 5개 플러그인 패키지(통합 4 + forge-game).

> **레포**: `github.com/moongci38-oss/forge-plugins` (public)

---

## 제거된 스킬 (2026-08-11)

아래 11종은 원본 시스템(forge SSoT)에서 미사용으로 제거됐고, **예고 후 플러그인에서도 제거**했습니다.
업데이트하면 이 스킬들은 사라집니다.

`agent-drift-auditor` · `decision-note` · `figma-design-sync` · `freeze` ·
`harness-backlog-loop` · `load-test` · `partner-onboarding-e2e` · `retro` · `site-clone` · `task-frontier` ·
`unit-test-gen`

**대체 수단**(완전 대체가 아닌 것은 한계를 함께 적습니다)

| 제거된 스킬 | 대체 | 한계 |
|---|---|---|
| `site-clone` | `/site-deep-analyze` | 재구현 **가이드**까지만. **코드 생성은 대체되지 않습니다** |
| `agent-drift-auditor` | `/system-audit` | **부분 대체**. ①삭제된 에이전트 호출 ②중간 산출물 잔여 ③미승인 외부 발신 ④모델 pin 부재·구버전 — 이 4개 검사는 없습니다 |
| 나머지 9종 | 없음 | 같은 일을 하는 다른 스킬이 없습니다 |

> ✅ **`forge-check-security-exec` 는 되살렸습니다**(2026-08-11). `/forge-check-security` 의 정적 스캔이
> 실행 경로 취약점을 놓치는 공백을 메웁니다 — `/forge-pr` 이 보안 민감 경로 변경을 감지하면 조건부로 호출합니다.

⚠️ **되돌릴 수 있습니다.** 계속 필요한 스킬이 있으면 알려 주십시오. 삭제 직전 상태는 커밋 `906648e` 에
그대로 남아 있습니다 — 복원은 한 줄입니다:

```bash
git checkout 906648e -- <plugin>/skills/<스킬명>
# 예: git checkout 906648e -- forge-core/skills/decision-note
```

복원 후 버전을 올려 재배포하면 다시 설치됩니다.

## 역할별 설치 추천

| 역할 | 설치 플러그인 |
|------|------------|
| 백엔드/풀스택 개발자 | forge-core + forge-build |
| 기획자 / PM | forge-core + forge-build + forge-knowledge |
| 리서처 | forge-core + forge-knowledge |
| 디자이너 | forge-core + forge-design |
| 게임 개발자 | forge-core + forge-design + forge-game |
| 시스템 감사자 | forge-core (감사·하네스 내장) |
| 전체 설치 | forge-core + forge-knowledge + forge-build + forge-design (+ forge-game) |

---

## 플러그인 목록

| 플러그인 | 버전 | 스킬 / 커맨드 / 에이전트 | 설명 | 의존성 |
|---------|------|------|------|--------|
| **forge-core** | v0.7.17 | 23 / 22 / 6 | 핵심 인프라 — cr-multi/approve-worker/rag-search + **세션관리 3종** + 하네스 정리(harness-legacy-scan/diet/external-sweep) + 감사(system-audit 6축·axis 5축·migration-audit) + 저작 도구(skill-creator/subagent-creator/slash-command-creator/hook-creator) | 없음 (기반) |
| **forge-build** | v0.4.24 | 32 / 24 / 7 | 제품 생성 파이프라인 — 기획(spec-write/writing-plans/autoplan) + 구현·검증(qa/healer/investigate/api-e2e/forge-fix/보안·성능·UI 검수) + GitNexus 코드 인텔리전스 6종 | forge-core |
| **forge-knowledge** | v0.2.22 | 15 / 7 / 6 | 지식·리서치 — learn/memory-manage/wiki-sync + article/yt/site-deep-analyze/weekly-research/daily-system-review + 문서 변환(pdf/docx/pptx), forge-tools MCP(ADR-174 unified_search) | forge-core |
| **forge-design** | v0.2.17 | 7 / 4 / 2 | 디자인·에셋 — image-orchestrate/visual-loop/figma-screen-capture/style-forge/asset-critic | forge-core |
| **forge-game** | v0.1.16 | 10 / 1 / 1 | 게임팩 — game-qa/game-asset-pipeline/asset-extract/dungeon 루프 2종 (Unity 전용) | forge-core, forge-design |

> **이 표의 숫자를 어떻게 셌나** (2026-09-08 관측). 버전은 각 번들의 `plugin.json` 이 정본이고,
> 개수는 폴더를 센 것입니다. 숫자가 의심스러우면 표를 믿지 말고 아래를 직접 돌려 보십시오.
>
> ```bash
> # 버전
> for p in forge-core forge-build forge-knowledge forge-design forge-game; do
>   echo -n "$p: "; python3 -c "import json;print(json.load(open('$p/.claude-plugin/plugin.json'))['version'])"
> done
> # 개수 (스킬 = 폴더 수, 커맨드·에이전트 = .md 파일 수)
> for p in forge-core forge-build forge-knowledge forge-design forge-game; do
>   echo "$p: skills=$(ls -1 $p/skills 2>/dev/null|wc -l) commands=$(ls -1 $p/commands/*.md 2>/dev/null|wc -l) agents=$(ls -1 $p/agents/*.md 2>/dev/null|wc -l)"
> done
> ```
>
> ⚠️ 구 표기 `forge-core v0.7.9 · forge-build v0.4.20 · forge-knowledge v0.2.18 · forge-design v0.2.13 · forge-game v0.1.15` 은
> 2026-09-08 폐기했습니다 — 손으로 적어 둔 값이라 실제 `plugin.json` 과 4단계 이상 벌어져 있었습니다.
> ⚠️ 구 표기 "**세션관리 5종**" 도 같은 날 폐기 — 모델별 분기(`/start-opus`·`/end-sonnet` 등)가
> 2026-08-01 에 통합돼, 지금 남은 세션 커맨드는 `/forge-start`·`/forge-checkpoint`·`/forge-end` **3종**과
> 보조 `/forge-resume` 1종입니다
> (재현: `ls forge-core/commands/ | grep -E 'forge-(start|end|checkpoint|resume)'` → 4건, 2026-09-08 관측).

---

## 신규 설치 (팀원용)

### Step 1 — Marketplace 등록 (최초 1회)

```bash
claude plugin marketplace add moongci38-oss/forge-plugins
```

### Step 2 — 역할에 맞는 플러그인 설치

```bash
claude plugin install forge-core          # 필수 (모든 역할)
claude plugin install forge-knowledge     # 지식·리서치 (권장 — 모든 역할)

claude plugin install forge-build         # 개발자/기획자 (구현+기획 파이프라인)
claude plugin install forge-design        # 디자이너
claude plugin install forge-game          # 게임 개발자 (forge-design도 함께)
```

### Step 3 — Claude Code 재시작

설치 후 Claude Code를 재시작해야 플러그인이 활성화됩니다.

```bash
# Claude Code 재시작 (IDE 익스텐션이면 창 닫고 다시 열기)
```

### Step 4 — 설치 확인

```bash
claude plugin list
```

`forge-core` 등 설치한 플러그인이 목록에 표시되면 완료.

---

## 첫 세션 자동 온보딩

Claude Code 세션 시작 시 `forge-core`의 SessionStart 훅이 자동 실행:

```
[forge-onboard] orch-token.key created: ~/.config/forge/orch-token.key
[forge-onboard] rules installed: behavior-core.md
[forge-onboard] rules installed: context-engineering.md
[forge-onboard] rules installed: dev-workflow-rules.md
[forge-onboard] rules installed: forge-core.md
[forge-onboard] rules installed: model-routing.md
[forge-onboard] rules installed: security-agent-input.md
[forge-onboard] rules installed: success-is-silent.md
[forge-onboard] rules installed: tool-rules.md
[forge-onboard] session dir created: $HOME/.claude/handover/sonnet
[forge-onboard] session dir created: $HOME/.claude/handover/opus
[forge-onboard] session dir created: $HOME/.claude/checkpoints
[forge-onboard] skill script installed: $HOME/.claude/skills/cr-multi/workflow.js
```

- **orch-token.key** — forge approve-worker 인증 토큰 (없으면 자동 생성, 이후 스킵)
- **rules** — `$HOME/.claude/rules/` 에 번들 규칙 **전량** 설치. 개수를 손으로 박아 두지 않았습니다 —
  훅이 `rules/*.md` 를 통째로 훑기 때문입니다(`forge-core/hooks/forge-onboard.sh` §2).
  지금 몇 개인지는 `ls -1 forge-core/rules/*.md | wc -l` → **8** (2026-09-08 관측).
  ⚠️ **이미 있는 파일은 덮어쓰지 않습니다** — 여러분이 고친 규칙이 업데이트로 날아가지 않도록 한 것이고,
  뒤집어 말하면 **규칙 개선분은 자동으로 오지 않습니다**(받으려면 그 파일을 지우고 세션을 다시 여십시오).
- **session dirs / skill scripts** — 세션관리 디렉터리와, 마켓플레이스 설치본에서 `/cr-multi`·`/approve-worker`
  가 찾는 스크립트를 `$HOME/.claude/` 로 복사합니다(없을 때만).

온보딩은 한 번만 실행됩니다. 이미 파일이 있으면 자동으로 스킵.

> ⚠️ 구 표기 "forge 규칙 **3종** 설치"(forge-core·behavior-core·tool-rules)는 2026-09-08 폐기했습니다.
> 훅은 처음부터 폴더를 통째로 훑는데 README 만 3개로 굳어 있었고, 그 사이 규칙이 8개로 늘었습니다.
> 재현: `grep -n 'RULES_SRC"/\*.md' forge-core/hooks/forge-onboard.sh` → 반복문이 와일드카드입니다.

---

## 업데이트 방법

**자동 업데이트 없음.** 개발자가 플러그인을 고도화하면 팀원이 수동으로 업데이트해야 합니다.

### 팀원 업데이트 절차

```bash
# 1. 업데이트 실행
claude plugin update forge-core
claude plugin update forge-knowledge    # 설치한 것만
claude plugin update forge-build

# 2. Claude Code 재시작
```

### 업데이트 알림

팀 채널에서 업데이트 공지를 확인하세요. 버전 변경 내역은 아래 [Changelog](#changelog)에서 확인.

---

## cr-* 커맨드 사전 조건

`/cr-triple`, `/cr-double` 등 cr-* 계열은 **Codex MCP + Gemini MCP** 필수.
MCP 없으면 cr-* 커맨드 동작 X.

**왜 남의 모델을 부르나**: 자기가 쓴 답안을 자기가 채점하면 같은 착각을 두 번 합니다.
그래서 검수는 **벤더가 다른 세 모델**에게 따로 시킵니다(tier 를 올리는 게 아니라 **출제자를 바꾸는** 설계입니다).

| 레그 | 현행 기본 모델 | 경유 |
|------|---------------|------|
| Claude | **Fable 5.1** | 세션 내 subagent |
| Codex | **gpt-6-astra** | Codex MCP |
| Gemini | **gemini-3.8-flash** | Gemini MCP |

reasoning **effort = xhigh** (Gemini 레그는 MCP 릴레이라 effort 개념이 없습니다).

> 정본은 이 레포가 아닙니다 — `$HOME/.claude/rules/model-routing.md §세션 운영 모델` 입니다.
> 모델은 자주 바뀌므로, 이 표와 정본이 어긋나면 **정본이 이깁니다**.
> ⚠️ 구 표기 `Claude=Opus · Codex=gpt-5.6-sol · Gemini=gemini-3.5-flash` 는 2026-09-08 폐기했습니다
> (근거: `model-routing.md §세션 운영 모델` — Codex 레그는 2026-09-06 에 `gpt-6-astra` 로,
> Gemini 레그는 2026-09-03 에 `gemini-3.8-flash` 로 올라갔습니다).
> ⚠️ `--sol`·`--terra`·`--luna` 는 이제 **셋 다 하향 스위치**입니다(예전엔 `--sol` 이 기본과 같아 아무 일도 안 했습니다).
> `--fable` 은 이미 기본이라 no-op 입니다.

### Step 1 — API 키 환경변수 설정

```bash
# ~/.bashrc 또는 ~/.zshrc 에 추가
export OPENAI_API_KEY="sk-..."       # Codex MCP용
export GEMINI_API_KEY="AIza..."      # Gemini MCP용
```

### Step 2 — MCP 서버 설치

```bash
# Codex MCP (npm 전역 설치)
npm install -g @openai/codex

# Gemini MCP (npx 자동 설치 — 별도 설치 불필요)
```

### Step 3 — ~/.claude.json MCP 서버 등록

`~/.claude.json` 파일에 아래 추가:

```json
{
  "mcpServers": {
    "codex": {
      "type": "stdio",
      "command": "codex",
      "args": ["mcp-server"],
      "env": {}
    },
    "gemini": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@fre4x/gemini"],
      "env": {
        "GEMINI_API_KEY": "<your-gemini-api-key>"
      }
    }
  }
}
```

### Step 4 — Claude Code 재시작

MCP 등록 후 재시작해야 적용됩니다.

> MCP 없이도 forge-core 나머지 스킬과 forge-build/forge-knowledge/forge-design/forge-game 정상 동작.

> ⚠️ **위 Gemini 블록의 `@fre4x/gemini` 는 이 레포가 검증한 값이 아닙니다.** 이 저장소 어디에서도
> 그 패키지를 참조하지 않습니다(재현: `grep -rn 'fre4x' .` → 이 README 줄 외 0건, 2026-09-08 관측).
> 개발팀 내부는 forge 체크아웃이 소유한 `gemini-text` MCP 를 쓰는데, 그건 이 플러그인 번들에
> 들어 있지 않아 외부 설치자에게는 대안 예시를 적어 둔 것입니다.
> **동작하는 Gemini stdio MCP 라면 무엇이든 됩니다** — 위 블록은 형식 예시로 읽으십시오.

---

## MCP API 키 설정 (선택)

`forge-core`는 Codex/Gemini MCP를 포함. 사용하려면 환경변수 설정:

```bash
# ~/.bashrc 또는 ~/.zshrc 에 추가
export OPENAI_API_KEY="sk-..."       # Codex MCP (cr-triple 2차 검수)
export GEMINI_API_KEY="AIza..."      # Gemini MCP (vision 분석)
```

> MCP 없이도 forge-core/forge-build 기본 스킬 정상 동작.

---

## 프로젝트 경로 환경변수

일부 스킬은 **여러분의 프로젝트 경로**를 참조합니다. 이 저장소는 **공개**라 특정 개발 환경의
절대경로·식별자를 기본값으로 넣지 않았습니다. 그래서 해당 스킬을 쓰려면 직접 설정해야 합니다.

### 설정하는 것 — `GODBLADE_ROOT` 하나뿐입니다

```bash
# ~/.bashrc 또는 ~/.zshrc — 아래 스킬을 쓸 때만
export GODBLADE_ROOT="/path/to/your/unity-project/src"
```

| 쓰는 곳 | 플러그인 | 미설정 시 |
|---------|----------|-----------|
| `dungeon-play-loop`·`dungeon-uiux-loop` (STATE 경로·`verify.sh`) | forge-game | 경로가 빈 문자열로 확장돼 **동작 실패** |
| `forge-tools` MCP — `project="godblade"` 조회 | forge-knowledge | 해당 조회만 `프로젝트 경로 없음: <set GODBLADE_ROOT>` |
| `image-orchestrate` — 게임 에셋 출력 경로 | forge-design | 일반 출력은 정상, 게임 에셋 경로만 미해석 |

```bash
# 확인
echo "GODBLADE_ROOT=$GODBLADE_ROOT" && ls "$GODBLADE_ROOT" 2>/dev/null || echo "미설정 또는 경로 없음"
```

### ⚠️ 설정해도 소용없는 것 — 문서 플레이스홀더 2종

아래 둘은 **환경변수처럼 생겼지만 읽는 코드가 없습니다.** 공개 저장소라 원래 있던 실제 값을
지운 자리이며, `export`해도 아무 일도 일어나지 않습니다.

| 이름 | 나오는 곳 | 본인 값으로 쓰려면 |
|------|-----------|-------------------|
| `${NOTION_DB_ID}` | `daily-analyze`·`daily-system-review` SKILL.md의 `DB URL:` 줄 (2건) | 그 줄을 직접 교체(업데이트 시 덮어써짐) 또는 **Notion MCP에서 대상 DB 지정**(권장) |
| `${BOARDGAMES_ROOT}` | `game-qa/references/project-stacks.md` 참조표 | 그 문서를 본인 환경에 맞춰 읽고 판단 — 자동 해석 안 됨 |

직접 확인: `grep -rn 'NOTION_DB_ID\|BOARDGAMES_ROOT' <플러그인>/` — 문서 줄에만 나옵니다.

> ⚠️ 구 표기 "`weekly-research` SKILL.md 의 `DB URL:` 줄" 은 2026-09-08 폐기했습니다 — 그 파일엔 없습니다.
> 재현: `grep -c NOTION_DB_ID forge-knowledge/skills/weekly-research/SKILL.md` → **0** ·
> `grep -rn NOTION_DB_ID --include=SKILL.md .` → daily-system-review·daily-analyze **2건** (2026-09-08 관측).

**왜 기본값을 안 넣었나**: 기본값에 실제 경로를 넣으면 공개 저장소에 개발 환경 구조가 그대로 실립니다.
또 잘못된 기본 경로로 조용히 동작하는 것보다, 없으면 없다고 말하고 멈추는 편이 낫습니다 —
그래서 `프로젝트 경로 없음: <set GODBLADE_ROOT>`처럼 **무엇을 설정해야 하는지가 그대로 노출**됩니다.

> 위 스킬을 설치하지 않았다면 아무것도 설정할 필요가 없습니다.
> 플러그인별 상세는 `forge-game/README.md`·`forge-design/README.md`·`forge-knowledge/README.md`.

---

## 로컬 클론 방식 (대안)

Marketplace 방식 대신 직접 클론해서 사용할 수 있습니다.

```bash
# 레포 클론
git clone https://github.com/moongci38-oss/forge-plugins.git ~/forge-plugins-repo

# $HOME/.claude/settings.json 에 영구 등록
```

`$HOME/.claude/settings.json`:
```json
{
  "plugins": [
    { "path": "~/forge-plugins-repo/forge-core" },
    { "path": "~/forge-plugins-repo/forge-knowledge" },
    { "path": "~/forge-plugins-repo/forge-build" }
  ]
}
```

이 방식은 `git pull`로 업데이트 가능:
```bash
cd ~/forge-plugins-repo && git pull
# Claude Code 재시작 → 새 버전 자동 로드
```

---

## 설치 후 사용법

설치 완료 후 Claude Code 채팅창에서 `/` 입력하면 스킬 목록이 자동 표시됩니다.

> 📖 **아래 표는 "전부"가 아니라 "자주 쓰는 것"입니다.** 손으로 관리하는 목록이라 새 스킬이 늘어도
> 여기 자동으로 붙지 않습니다 — 실제로 2026-09-08 실측에서 forge-core 스킬 23개 중 이 표에 적힌 건
> 절반뿐이었습니다. **채팅창의 `/` 자동완성이 항상 정답**이고, 파일로 세고 싶으면:
>
> ```bash
> ls -1 forge-core/skills forge-build/skills forge-knowledge/skills forge-design/skills forge-game/skills
> ls -1 forge-core/commands/*.md forge-build/commands/*.md   # 커맨드
> ```

### forge-core (모든 역할 공통)

| 스킬/커맨드 | 사용법 | 설명 |
|------------|--------|------|
| `/cr-triple` | `/cr-triple <파일>` | Fable+Codex+Gemini 3중 검수 (중요 Spec/PR) — 모델은 위 [cr-* 사전 조건](#cr--커맨드-사전-조건) 표 |
| `/cr-double` | `/cr-double <파일>` | Codex+Gemini 2중 검수 (기본) |
| `/advisor` | `/advisor <질문>` | 갈림길에서 최상위 모델에게 400~700토큰 조언만 받기 (코드 작성 X) |
| `/cr-multi` | `/cr-multi <파일>` | 멀티 검수 오케스트레이터 (double/triple 통합) |
| `/cr-code` | `/cr-code <파일>` | 코드 전용 검수 |
| `/cr-plan` | `/cr-plan <파일>` | 계획서/ADR 검수 |
| `/cr-bug` | `/cr-bug <파일>` | 버그 리포트 검수 |
| `/cr-test` | `/cr-test <파일>` | 테스트 코드 검수 |
| `/cr-analysis` | `/cr-analysis <파일>` | 분석 문서 검수 |
| `/cr-final` | `/cr-final <PR번호>` | PR 머지 직전 최종 검수 (blocking) |
| `/approve-worker` | `/approve-worker` | forge 승인 워커 실행 |

### forge-core — 세션관리

| 커맨드 | 사용법 | 설명 |
|--------|--------|------|
| `/forge-start` | `/forge-start` | 세션 시작 — 모델 자동 감지 + handover·체크포인트 회수 |
| `/forge-end` | `/forge-end` | 세션 종료 — handover 작성 + learnings 추가 |
| `/forge-checkpoint` | `/forge-checkpoint` | Mid-session 체크포인트 — /compact 전 상태 스냅샷 저장 |

> **세션 흐름**: `/forge-start` → 작업 → (토큰 70~90%면 `/forge-checkpoint` → `/compact` → 계속) → `/forge-end`
> 모델별 분기(`/start-opus`·`/end-sonnet` 등)는 2026-08-01 삭제됐다 — 단일 레인이고 모델은 자동 감지된다.

### forge-core — 하네스 관리 (v0.6.0 흡수)

| 스킬/커맨드 | 사용법 | 설명 |
|------------|--------|------|
| `/harness-legacy-scan` | `/harness-legacy-scan <경로>` | 레거시 하네스 패턴 탐지 |
| `/harness-diet` | `/harness-diet <경로>` | 불필요한 하네스 코드 정리 |
| `/external-harness-sweep` | `/external-harness-sweep <레포>` | 외부 하네스 레포 1:1 sweep (gstack/gsd/superpowers/gbrain) |

### forge-core — AI 감사 시스템 (v0.6.0 흡수)

| 스킬/커맨드 | 사용법 | 설명 |
|------------|--------|------|
| `/system-audit` | `/system-audit` | Forge 전체 시스템 ACHCE 6축 감사 |
| `/audit-agentic` | `/audit-agentic <경로>` | 에이전틱 AI 역량 감사 (자율성·도구·MAS·성숙도) |
| `/audit-context` | `/audit-context <경로>` | 컨텍스트 엔지니어링 감사 (RAG·메모리·윈도우·지식 아키텍처) |
| `/audit-cost` | `/audit-cost <경로>` | AI 비용 효율 감사 (토큰 경제·라우팅·캐싱·추론 최적화) |
| `/audit-harness` | `/audit-harness <경로>` | AI 하네스 엔지니어링 감사 (평가·가드레일·옵저버빌리티) |
| `/audit-human-ai` | `/audit-human-ai <경로>` | Human-AI 경계 설계 감사 (자율성 레벨·에스컬레이션·게이트) |
| `/migration-audit` | `/migration-audit <경로>` | DB 마이그레이션 감사 |

`system-audit`이 스폰하는 6축 감사 에이전트(`advisor-strategist` + `axis-agentic`/`axis-context`/`axis-cost`/`axis-harness`/`axis-human-ai`)도 forge-core에 번들되어 있습니다.

### forge-core — 하네스 저작 도구 (내 도구를 내가 만든다)

| 스킬 | 사용법 | 설명 |
|------|--------|------|
| `/skill-creator` | `/skill-creator` | 새 스킬 생성 — ⛔ SKILL.md 직접 작성 금지, 항상 이걸 경유 |
| `/subagent-creator` | `/subagent-creator` | 전용 시스템 프롬프트를 가진 서브에이전트 생성 |
| `/slash-command-creator` | `/slash-command-creator` | 슬래시 커맨드 생성 |
| `/hook-creator` | `/hook-creator` | 훅(자동 실행 규칙) 생성·설정 |
| `/forge-loop-maker` | `/forge-loop-maker` | "자동으로 계속 돌게 해줘" → 정지조건까지 갖춘 루프 설계 |
| `/eval-rubric` | `/eval-rubric <대상>` | 4축 0~2점 루브릭으로 산출물 정량 채점 |
| `/rag-search` | `/rag-search <질문>` | forge-outputs 문서 벡터+BM25 하이브리드 검색 |

> ⚠️ 위 7종은 2026-09-08 에 추가한 항목입니다 — 번들에는 진작 들어 있었는데 README 표에만 빠져 있었습니다
> (재현: `ls -1 forge-core/skills | wc -l` → 23, 구 README 표에 적힌 건 12개뿐이었습니다).

### forge-build (개발자)

| 스킬 | 사용법 | 설명 |
|------|--------|------|
| `/qa` | `/qa` | QA 파이프라인 실행 |
| `/qa-setup` | `/qa-setup` | QA 환경 초기 설정 |
| `/healer` | `/healer` | 버그 자동 수정 |
| `/investigate` | `/investigate <증상>` | 버그 원인 분석 |
| `/api-e2e` | `/api-e2e` | API E2E 테스트 |
| `/playwright-cli` | `/playwright-cli` | Playwright 브라우저 테스트 |
| `/playwright-parallel-test` | `/playwright-parallel-test` | Playwright 병렬 테스트 |
| `/bug-report` | `/bug-report` | 버그 리포트 생성 |
| `/benchmark` | `/benchmark` | 성능 벤치마크 |
| `/canary` | `/canary` | 카나리 배포 모니터링 |
| `/forge-check-security` | `/forge-check-security` | 보안 체크 |
| `/spec-compliance-checker` | `/spec-compliance-checker` | Spec 준수 여부 검증 |
| `/inspection-checklist` | `/inspection-checklist` | 코드 인스펙션 체크리스트 |
| `/screenshot-analyze` | `/screenshot-analyze <이미지>` | 스크린샷 UI 분석 |
| `/codex-review` | `/codex-review <파일>` | Codex 단독 코드 리뷰 |
| `/forge-pge` | `/forge-pge <목표>` | Plan-Generate-Execute — 복잡한 구현 자동화 |
| `/forge-fix` | `/forge-fix <이슈설명>` | Hotfix 흐름으로 빠른 버그 처리 |
| `/forge-implement` | `/forge-implement` | Spec 기반 구현 (/spec-write → /forge-implement → /qa 순서) |
| `/forge-pr` | `/forge-pr` | PR 생성 + `cr-triple` 적대적 검수 + 머지 게이트 (⛔ `gh pr create` 직접 호출로 우회 금지) |
| `/forge-check-traceability` | `/forge-check-traceability` | 추적성 체크 (Spec → 코드 → 테스트 연결 검증) |
| `/forge-check-ui` | `/forge-check-ui` | UI 품질 체크 (Lighthouse/a11y 기준) |

> **참고**: `/migration-audit`는 `forge-core`(하네스/감사 흡수)에 있습니다. `/agent-drift-auditor` 는 2026-08-11 제거됐습니다(부분 대체: `/system-audit`).
>
> ⚠️ 구 표기 "`/forge-pr` = PR 자동 생성 (Check 9 기준 검증 + **gh pr create**)" 은 2026-09-08 폐기했습니다.
> 지금 `/forge-pr` 은 `cr-triple` 적대적 검수와 머지 게이트를 **먼저** 통과시킨 뒤 PR 을 엽니다 —
> `gh pr create` 를 직접 부르면 그 게이트를 통째로 건너뜁니다
> (재현: `head -3 forge-build/commands/forge-pr.md`, 2026-09-08 관측).
>
> **위 표에 없는 forge-build 스킬**(2026-09-08 추가분): GitNexus 코드 인텔리전스 6종
> (`gitnexus-exploring`·`-impact-analysis`·`-debugging`·`-refactoring`·`-guide`·`-cli` — "이걸 고치면 뭐가 깨지나"를
> 호출 그래프로 답합니다) · `frontend-design`(프런트 코드 직접 작성) · `forge-check-docs` ·
> `forge-check-security-exec`(정적 스캔이 놓치는 실행 경로 취약점) · `cto-advisor`.

### forge-build — 기획 (PM/기획자, v0.2.0 흡수)

| 스킬/커맨드 | 사용법 | 설명 |
|------------|--------|------|
| `/spec-write` | `/spec-write <기능명>` | Spec 문서 작성 |
| `/forge-spec` | `/forge-spec <기능 설명>` | Spec 작성 단독 실행 (옛 /sdd Phase 0~2) |
| `/prd` | `/prd <제품명>` | PRD 작성 |
| `/forge-plan` | `/forge-plan` | 기획 파이프라인 실행 |
| `/writing-plans` | `/writing-plans` | 기획서 작성 |
| `/autoplan` | `/autoplan <목표>` | 자동 플랜 생성 |

### forge-knowledge (리서처)

| 스킬/커맨드 | 사용법 | 설명 |
|------------|--------|------|
| `/article` | `/article <URL>` | 기사 분석 |
| `/yt` | `/yt <URL>` | YouTube 영상 분석 |
| `/site-deep-analyze` | `/site-deep-analyze <URL>` | 사이트 심층 분석 |
| `/weekly-research` | `/weekly-research <주제>` | 주간 심층 리서치 파이프라인 |
| `/daily-system-review` | `/daily-system-review` | AI 시스템 일일 경량 스캔 (Critical/Breaking/Deprecated 알람) |
| `/forge-find-item` | `/forge-find-item <아이템>` | 비즈니스 아이템 후보 5신호 검증 |
| `/grants` | `/grants <기관/사업명>` | 지원사업 파이프라인 (GR-1~6) |
| `/meeting` | `/meeting` | 미팅/대화 구조화 저장 (메타데이터+결정+액션아이템) |
| `/pdf`·`/docx`·`/pptx` | `/pdf <파일>` | 문서 읽기·생성·변환 |

### forge-knowledge — 지식·메모리 (구 forge-brain)

| 스킬/커맨드 | 사용법 | 설명 |
|------------|--------|------|
| `/learn` | `/learn` | 세션 학습 내용을 learnings.jsonl에 기록 |
| `/wiki-sync` | `/wiki-sync` | Obsidian vault ↔ forge-outputs 양방향 동기화 |
| `/memory-manage` | `/memory-manage` | MEMORY.md 항목 추가·수정·삭제·GC |

> **참고**: RAG 검색(`/rag-search`)은 `forge-core`에 있습니다. `forge-knowledge`는 `forge-tools` MCP로 ADR-174 pgvector `unified_search`를 함께 제공합니다. `FORGE_DB_URL` 설정 시 자동 연동.

### forge-design (디자이너)

| 스킬/커맨드 | 사용법 | 설명 |
|------------|--------|------|
| `/image-orchestrate` | `/image-orchestrate` | 이미지 생성 오케스트레이션 |
| `/generate-image` | `/generate-image <설명>` | 이미지 1장 생성 (gpt-image-1 우선, Gemini 폴백) |
| `/visual-loop` | `/visual-loop` | 프론트 변경을 실제 브라우저로 캡처해 Vision 분석 |
| `/style-forge` | `/style-forge` | 참조 에셋에서 스타일 추출 → style-guide.md (에셋 생성 전 선행) |
| `/asset-critic` | `/asset-critic <에셋>` | AI 생성 에셋을 6축 정량 루브릭으로 채점 |
| `/figma-screen-capture` | `/figma-screen-capture <URL>` | Figma 화면 캡처 |
| `/forge-design-review` | `/forge-design-review` | 디자인 검수 단일 진입 (게이트 → 필요 시 라이브 루프) |
| `/forge-design` | `/forge-design [--track web\|game] <설명>` | PRD(web) / GDD(game) 기획서 작성 디스패처 |
| `/clip` | `/clip` | 클립보드/경로 이미지를 대화에 붙이기 |

### forge-game (게임 개발자)

| 스킬/커맨드 | 사용법 | 설명 |
|------------|--------|------|
| `/gdd` | `/gdd` | 게임 기획서(GDD) 작성 |
| `/game-qa` | `/game-qa` | 게임 QA 파이프라인 |
| `/game-asset-pipeline` | `/game-asset-pipeline` | 게임 에셋 파이프라인 |
| `/game-asset-generate` | `/game-asset-generate` | 게임 에셋 생성 |
| `/asset-extract` | `/asset-extract` | Unity 에셋 추출 |
| `/game-logic-visualize` | `/game-logic-visualize` | FSM·확률표·전투공식을 Mermaid/Draw.io 로 그리기 |
| `/gamedesign-analyze` | `/gamedesign-analyze` | 게임 디자인 분석 |
| `/game-reference-collect` | `/game-reference-collect` | 경쟁작 레퍼런스(영상·스크린샷) 수집 |
| `/dungeon-play-loop`·`/dungeon-uiux-loop` | — | Unity 던전 반복 검증 루프 (`GODBLADE_ROOT` 필요) |
| `/game-bug-runtime-loop` | — | 런타임 버그 반복 수정 루프 |

> ⚠️ 구 표기에서 forge-design 은 스킬 1개, forge-game 은 4개만 적혀 있었습니다 — 2026-09-08 폐기.
> 실측은 각각 **7개·10개**입니다(재현: `ls -1 forge-design/skills | wc -l` → 7 ·
> `ls -1 forge-game/skills | wc -l` → 10, 2026-09-08 관측).

### 빠른 시작 예시

```
# 코드 검수
/cr-multi src/auth/login.ts

# 버그 분석
/investigate 로그인 시 토큰이 만료됨

# 기사 분석
/article https://techcrunch.com/...

# 유튜브 요약
/yt https://youtube.com/watch?v=...

# Spec 작성 후 구현
/forge-spec 사용자 알림 기능
/forge-implement

# 세션 시작/종료
/forge-start
/forge-end

# 지식 검색
/rag-search ADR-174 통합 두뇌 설계 근거
```

---

## 문제 해결

### 설치 후 스킬이 안 보임

```bash
# 1. 설치 확인
claude plugin list

# 2. Claude Code 재시작 (필수)

# 3. 여전히 안 보이면 재설치
claude plugin remove forge-core
claude plugin install forge-core
```

### 온보딩 훅이 실행 안 됨

훅 파일의 위치는 설치 방식에 따라 다릅니다. **경로를 외우지 말고 찾아서 실행하십시오.**

```bash
# 1) 훅 찾기 (마켓플레이스 설치본·버전 캐시 어디에 있든 잡힙니다)
find "$HOME/.claude/plugins" -name forge-onboard.sh 2>/dev/null

# 2) 나온 경로로 실행 — 여러 개가 나오면 경로에 `marketplaces/` 가 들어간 쪽이 최신입니다
bash "$(find "$HOME/.claude/plugins" -path '*marketplaces*' -name forge-onboard.sh 2>/dev/null | head -1)"
```

> ⚠️ 구 표기 `bash $HOME/.claude/plugins/forge-core/hooks/forge-onboard.sh` 는 2026-09-08 폐기했습니다.
> **그 경로에는 아무것도 없습니다.** 없는 폴더를 뒤져 놓고 "훅이 없네"라고 결론 내리게 만드는 안내였습니다.
> 실제 위치는 `~/.claude/plugins/marketplaces/forge-plugins/forge-core/hooks/` 또는
> `~/.claude/plugins/cache/forge-plugins/forge-core/<버전>/hooks/` 입니다.
> 재현: `ls "$HOME/.claude/plugins/forge-core"` → `No such file or directory` ·
> `find "$HOME/.claude/plugins" -name forge-onboard.sh` → 실재 경로 (2026-09-08 관측).

### Marketplace 등록 오류

```bash
# 등록 해제 후 재등록
claude plugin marketplace remove moongci38-oss/forge-plugins
claude plugin marketplace add moongci38-oss/forge-plugins
```

---

## 파일 구조

```
forge-plugins-repo/
├── .claude-plugin/marketplace.json    — 마켓플레이스 인덱스 (5개 플러그인)
├── forge-core/                        — (v0.7.17) 기반 + 하네스 정리 + AI 감사 + 저작 도구
│   ├── .claude-plugin/plugin.json
│   ├── skills/                        — 23개
│   │   ├── approve-worker/            — forge 승인 워커
│   │   ├── cr-multi/                  — 멀티 검수 오케스트레이터
│   │   ├── rag-search/                — 하이브리드 RAG 검색
│   │   ├── forge-loop-maker/          — Generic refinement loop
│   │   ├── skill-creator/ subagent-creator/ slash-command-creator/ hook-creator/  — 저작 4종
│   │   ├── eval-rubric/ doc-verifier/ office-hours/ product-manager-toolkit/
│   │   ├── harness-legacy-scan/ harness-diet/ external-harness-sweep/  — 하네스 정리 3종
│   │   └── system-audit/ audit-agentic/ audit-context/ audit-cost/ audit-harness/ audit-human-ai/ migration-audit/  — 감사 7종
│   ├── agents/                        — 6개 (advisor-strategist + axis-agentic/context/cost/harness/human-ai)
│   ├── commands/                      — 22개 슬래시 커맨드
│   ├── hooks/                         — 실행본 7개 (+ 테스트 2개, lib/)
│   │   ├── forge-onboard.sh           — SessionStart 자동 실행 (규칙·디렉터리·스크립트 설치)
│   │   ├── main-write-guard.sh        — 배포 브랜치 직접 쓰기 차단
│   │   ├── brain-integrity-check.sh / brain-placement-guard.sh   — 지식 레인 무결성
│   │   ├── forge-plugin-learn-inject.sh / -reminder.sh           — learnings 주입·리마인드
│   │   └── session-placement-advisory.sh
│   └── rules/                         — 8개 (세션마다 자동 로드되는 전역 규칙)
│       ├── forge-core.md              — 경로·보안·병렬 실행·Git
│       ├── behavior-core.md           — 자율실행·외과적변경·완료선언 게이트·존댓말
│       ├── tool-rules.md              — 도구·스킬 발동 정책
│       ├── model-routing.md           — 모델 tier·advisor·검수 3레그 (검수 모델 정본)
│       ├── context-engineering.md     — 컨텍스트 예산·subagent 위임·L1~L4
│       ├── dev-workflow-rules.md      — 브랜치·배포·SDD 진입
│       ├── security-agent-input.md    — 외부 입력 프롬프트 인젝션 방어
│       └── success-is-silent.md       — 성공 시 침묵
├── forge-build/                       — (v0.4.24) 구 forge-dev + forge-plan 통합
│   ├── .claude-plugin/plugin.json
│   ├── skills/                        — 32개 (qa/healer/investigate/api-e2e + spec 계열/writing-plans/autoplan + gitnexus 6종 등)
│   ├── commands/                      — 24개 (forge-implement/forge-qa/forge-fix/forge-pr + forge-spec/prd/forge-plan/forge-deploy 등)
│   └── agents/                        — 7개 (canary-judge/code-reviewer/cto-advisor/healer/performance-checker/spec-writer-base/ui-quality-checker)
├── forge-knowledge/                   — (v0.2.22) 구 forge-brain 개명 + forge-research 통합
│   ├── .claude-plugin/plugin.json
│   ├── skills/                        — 15개 (learn/memory-manage/wiki-sync/yt/article/weekly-research/daily-system-review + pdf·docx·pptx 등)
│   ├── commands/                      — 7개 (article/site-deep-analyze/forge-find-item/find-item/wiki-sync/grants/meeting)
│   ├── agents/                        — 6개 (academic-researcher/article-analyst/fact-checker/yt-cross-analyst/yt-research-followup/yt-video-analyst)
│   └── mcp/                           — forge-tools-server.py (ADR-174 unified_search)
├── forge-design/                      — (v0.2.17)
│   ├── skills/                        — 7개 (image-orchestrate/visual-loop/figma-screen-capture/style-forge/asset-critic/doc-writer/design-plan-closeout)
│   ├── commands/                      — 4개 (forge-design/forge-design-review/generate-image/clip)
│   └── agents/                        — 2개 (doc-writer/gemini)
└── forge-game/                        — (v0.1.16)
    ├── skills/                        — 10개 (game-qa/game-asset-pipeline/asset-extract/game-logic-visualize/dungeon 루프 2종 등)
    ├── commands/                      — 1개 (gdd)
    └── agents/                        — 1개 (gdd-writer)
```

> **세는 명령** (2026-09-08 관측):
> `for p in forge-core forge-build forge-knowledge forge-design forge-game; do echo "$p: skills=$(ls -1 $p/skills 2>/dev/null|wc -l) commands=$(ls -1 $p/commands/*.md 2>/dev/null|wc -l) agents=$(ls -1 $p/agents/*.md 2>/dev/null|wc -l)"; done`
>
> ⚠️ **폐기한 서술 3건** (2026-09-08):
> ① `handover-manager.sh` — **번들에 없습니다.** v0.7.0(2026-07-26)에 설치 블록을 지웠습니다.
>    `/forge-start`·`/forge-end` 통합으로 참조가 0이 됐고, 안 쓰는 파일을 계속 심는 건 그 자체가 부채였습니다.
>    재현: `ls forge-core/hooks/handover-manager.sh` → 없음 · 사유 원문은 `forge-core/hooks/forge-onboard.sh` §5 주석.
> ② `rules/` 3개 나열 — 실제 **8개**입니다(재현: `ls -1 forge-core/rules/*.md | wc -l` → 8).
> ③ 번들 버전·개수 — 위 세는 명령 결과와 어긋나 있었습니다(forge-build 스킬 30→**32**, forge-design 3→**7**, forge-game 4→**10**).

---

## Changelog

### 2026-09-08 — forge SSoT 동기 (82 파일) + README 현행화

**한 줄 요약**: 팀원이 받는 번들이 원본보다 82개 파일 뒤처져 있어 낡은 스킬·규칙을 쓰고 있었습니다. 맞췄습니다.

- **동기 82개 파일** — forge-core 40 · forge-build 30 · forge-knowledge 9 · forge-design 3.
  `forge-game` 은 변경 0이라 **버전을 올리지 않았습니다**(빈 업데이트를 밀지 않기 위해서입니다).
  재현: `PLUGIN_ROOT=$(pwd) python3 scripts/sync-from-forge.py --verify` → `DRIFT_REMAINING=0` (2026-09-08 관측).
- **버전 상향**: forge-core `0.7.16→0.7.17` · forge-build `0.4.23→0.4.24` ·
  forge-knowledge `0.2.21→0.2.22` · forge-design `0.2.16→0.2.17` · forge-game `0.1.16` 유지.
  ⚠️ 버전을 안 올리면 `claude plugin update` 가 "이미 최신"이라며 그냥 넘어가서 **파일을 고쳐도 도달하지 않습니다.**
- **README 현행화** — 낡은 버전표·검수 모델명·온보딩 규칙 개수·파일 구조를 실측값으로 교체했고,
  지운 자리마다 `⚠️ 구 표기 … 폐기` 흔적과 재현 명령을 남겼습니다.
- **주의(알려진 미해결)**: `DRIFT_REMAINING=0` 은 "완전 동기화"가 아닙니다. forge SSoT 에 있으나
  **어느 번들도 담지 않은 파일이 116개**(`INBOUND_NOT_CARRIED`) 있습니다 — 드리프트 수치에 안 잡힙니다.
  전량 목록: `python3 scripts/sync-from-forge.py --verify --inbound-all`.

### v0.3.0 (2026-07-07) — 플러그인 통합 9→5
- **forge-core v0.6.0**: 구 `forge-harness`(harness-legacy-scan/diet/external-sweep/agent-drift-auditor) + 구 `forge-audit`(system-audit/audit-agentic/context/cost/harness/human-ai/migration-audit) 흡수. axis-* 에이전트 6종(advisor-strategist 포함) 번들.
- **forge-build v0.2.0** 신규 (구 `forge-dev` 개명 + 구 `forge-plan` 흡수): 기획(spec-write/writing-plans/autoplan) + 구현·검증 파이프라인 통합. axis-* 에이전트는 forge-core로 이동, cto-advisor/spec-writer-base 신규 편입.
- **forge-knowledge v0.2.0** 신규 (구 `forge-brain` 개명 + 구 `forge-research` 흡수): brain(learn/memory-manage/wiki-sync) + research(article/yt/site-deep-analyze/weekly-research/forge-find-item) 통합. forge-tools MCP(ADR-174 unified_search) 유지.
- **forge-design v0.1.5**, **forge-game v0.1.2**: 통합 대상 제외, 현행 유지.
- 구 플러그인명(`forge-dev`/`forge-plan`/`forge-brain`/`forge-harness`/`forge-audit`/`forge-research`)은 더 이상 설치 대상이 아님 — 각 커맨드 슬래시(`/forge-plan` 등)는 새 플러그인 하위에서 그대로 유효.

### v0.2.1 (2026-07-04)
- **forge-research v0.1.6**: DEPRECATED orphan 스킬 `yt-analyze` 제거 (`/yt`·`daily-analyze`/`weekly-analyze`로 완전 대체, SSoT 없음)

### v0.2.0 (2026-06-29)
- **forge-harness v0.1.0** 신규: harness-legacy-scan/harness-diet/external-harness-sweep/agent-drift-auditor
- **forge-audit v0.1.0** 신규: system-audit(ACHCE 6축) + 단위 감사 5종(agentic/context/cost/harness/human-ai) + migration-audit
- **플러그인 패키지 7개 → 9개** 확장

### v0.1.4 / forge-brain v0.1.0 (2026-06-23)
- **forge-core v0.2.0**: 세션관리 5종 추가 (start/end-sonnet, checkpoint, start/end-opus), handover-manager.sh 번들
- **forge-dev v0.1.4**: workflow.js 동기화 확인 완료
- **forge-plan v0.1.2**: forge-spec 커맨드 추가 (옛 /sdd Phase 0~2 단독 실행)
- **forge-brain v0.1.0** 신규: learn/wiki-sync/memory-manage + ADR-174 pgvector 연동 (rag-search는 forge-core)

### v0.1.2 (2026-06-05)
- forge-core: B2 게이트 + gemini-text 레그 변경분 반영
- forge-dev: gemini-text MCP 정합 업데이트
- forge-research: `yt-analyze` 제거 (Tier C 개인 워크플로우, 팀 공용 아님)
- SHA-256 테스트 증명(AD-161) + MCP 파라미터 검증 반영

### v0.1.1 (2026-06-04)
- forge-plan / forge-design / forge-game: SSoT refresh (81개 항목 갱신)
- forge-design: `multiformat-image` 제거 (Tier D, image-orchestrate와 중복)
- forge-dev / forge-plan: 버전 bump (v0.1.0 → v0.1.1)

### v0.1.0 (2026-06-02)
- forge-core / forge-dev / forge-plan / forge-research / forge-design / forge-game 최초 패키징
- Marketplace 지원 (`.claude-plugin/marketplace.json`)
- forge-core 규칙 3종 번들: forge-core.md / behavior-core.md / tool-rules.md
- SessionStart 온보딩 훅: orch-token 자동 생성 + 규칙 설치
