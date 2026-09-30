# Forge 플러그인 설치 — 비개발자용 (5분)

> **개발 지식 필요 없습니다.** 아래 순서대로만 하면 됩니다.

---

## 1단계 — Claude Code 설치 (처음 한 번만)

> 💡 Node.js 같은 건 설치 안 해도 됩니다. 아래 방법이 알아서 다 받습니다.

**🪟 윈도우**: 시작 메뉴에서 **PowerShell** 실행 → 아래 한 줄 붙여넣기:
```
irm https://claude.ai/install.ps1 | iex
```

**🍎 맥**: **터미널** 실행 → 아래 한 줄 붙여넣기:
```
curl -fsSL https://claude.ai/install.sh | bash
```

설치 확인: `claude --version` 입력 시 `2.1.xxx (Claude Code)`가 나오면 성공.

---

## 1-2단계 — Forge 본체(`~/forge`) 받기 (처음 한 번만, 꼭 필요)

플러그인은 Forge 본체 폴더(`~/forge`)에 있는 스크립트를 불러 씁니다.
이 폴더가 없으면 명령을 칠 때 "No such file or directory" 오류가 납니다.
Forge 본체는 **비공개 저장소**입니다 — 접근 권한이 있는 팀원만 받을 수 있습니다.
먼저 `gh auth login` 으로 GitHub 에 로그인하면 **SSH 키 없이** https 로 받아집니다
(윈도우 PowerShell·맥 터미널 모두 같은 줄):

```
gh auth login
git clone https://github.com/moongci38-oss/forge.git "$HOME/forge"
```

- "gh: command not found" 가 나오면 gh(GitHub CLI) 가 없으면 먼저 설치하세요 — https://cli.github.com (윈도우 `winget install GitHub.cli` · 맥 `brew install gh`).
- 로그인 중 "GitHub.com 에 git 작업할 때 무엇을 쓸까요?" 를 물으면 **HTTPS** 를 고르세요.
- 받기가 실패하면(권한 없음·404) 관리자에게 forge 저장소 접근 권한을 요청하세요.
- "git: command not found" 가 나오면 Git 을 먼저 설치하세요 — 윈도우 https://git-scm.com/download/win · 맥은 터미널에 `xcode-select --install`.
- "already exists" 가 나오면 이미 받아 둔 것이니 그대로 다음 단계로 가면 됩니다.

---

## 2단계 — 이 문장을 Claude Code에 그대로 붙여넣기

Claude Code를 열고, 아래 회색 상자 안 내용을 **통째로 복사해서 붙여넣은 뒤 엔터**를 치세요.
나머지는 Claude가 알아서 설치·설정·확인까지 해줍니다.

```
아래 순서대로 실행해줘. 각 단계 결과를 확인하고 다음으로 진행해줘.

1. Forge 플러그인 마켓플레이스를 등록해줘:
   claude plugin marketplace add moongci38-oss/forge-plugins

2. 아래 5개 플러그인을 순서대로 설치해줘 (이미 설치된 건 건너뛰어):
   claude plugin install forge-core@forge-plugins
   claude plugin install forge-knowledge@forge-plugins
   claude plugin install forge-build@forge-plugins
   claude plugin install forge-design@forge-plugins
   claude plugin install forge-game@forge-plugins

3. 5개 모두 활성화해줘 (한 번에 하나씩 — 이름을 몰아 쓰면 오류가 납니다):
   claude plugin enable forge-core
   claude plugin enable forge-knowledge
   claude plugin enable forge-build
   claude plugin enable forge-design
   claude plugin enable forge-game

4. 설치가 끝나면, "Claude Code를 껐다 켜라"고 한국어로 안내해줘.
```

> 💡 붙여넣기가 번거로우면, 이 저장소를 받은 뒤 Claude Code에서 이렇게만 말해도 됩니다:
> **"install-plugins.sh 실행해줘"**

---

## 3단계 — Claude Code 껐다 켜기

설치가 끝나면 Claude Code를 **완전히 종료했다가 다시 실행**하세요.
(재시작해야 새 플러그인이 로드됩니다.)

---

## 4단계 — 잘 됐는지 확인

다시 켠 Claude Code에서 아래처럼 입력해 보세요:

```
/forge
```

명령 목록이 뜨면 **설치 성공**입니다. 🎉

---

## 5단계 — 나중에 최신으로 받기 (업데이트)

플러그인은 **저절로 갱신되지 않습니다.** 팀 채널에 "플러그인 업데이트하세요" 공지가 뜨면
Claude Code에서 아래를 그대로 말하면 됩니다. **순서가 중요합니다** — 마켓플레이스 목록을 먼저 새로 받아야
플러그인이 새 버전을 찾습니다.

```
아래 순서대로 실행해서 forge 플러그인을 전부 업데이트해줘:

1. Forge 본체도 같이 최신으로 받아줘 (플러그인이 이 폴더의 스크립트를 씁니다):
   cd ~/forge && git pull

2. 마켓플레이스 목록을 새로 받아줘:
   claude plugin marketplace update forge-plugins

3. 플러그인을 하나씩 업데이트해줘:
   for p in forge-core forge-knowledge forge-build forge-design forge-game; do
     claude plugin update ${p}@forge-plugins
   done

4. 끝나면 "Claude Code를 완전히 껐다 켜라"고 한국어로 안내해줘.
```

업데이트 후에는 **Claude Code를 완전히 껐다 켜야** 새 버전이 로드됩니다.
다시 켠 뒤 `claude plugin list` 를 실행해 버전 번호가 올라갔는지 확인하세요.

> ⚠️ **한 줄에 이름 5개를 몰아 쓰면 안 됩니다.** `claude plugin update` 는 플러그인을 **한 번에 하나만** 받습니다.
> 재현: `claude plugin update --help | head -1` → `Usage: claude plugin update [options] <plugin>` (2026-09-08 관측).
> `install`·`enable` 도 똑같이 단수입니다. 그래서 이 저장소의 `install-plugins.sh` 와
> `ONBOARDING.md` §6-4 는 처음부터 **반복문**으로 돌고 있습니다 — 위 블록도 거기에 맞췄습니다.

> 💡 "이미 최신입니다"라고 나오면 정말 최신인 게 맞습니다 — 버전 번호가 바뀌어야만 새로 받아옵니다.

---

## 안 될 때

| 증상 | 해결 |
|------|------|
| `/forge`를 쳐도 아무것도 안 뜸 | Claude Code를 한 번 더 완전히 껐다 켜기 |
| "claude: command not found" | 1단계 Claude Code 설치가 안 된 상태 — https://claude.ai/code |
| 설치 중 오류 메시지 | 그 메시지를 그대로 Claude Code에 붙여넣고 "이 오류 해결해줘"라고 요청 |

> 더 자세한 설명(역할별 선택 설치, RAG 검색 DB 설정 등)이 필요하면 [ONBOARDING.md](./ONBOARDING.md)를 보세요.
