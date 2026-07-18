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

3. 5개 모두 활성화해줘:
   claude plugin enable forge-core forge-knowledge forge-build forge-design forge-game

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

## 안 될 때

| 증상 | 해결 |
|------|------|
| `/forge`를 쳐도 아무것도 안 뜸 | Claude Code를 한 번 더 완전히 껐다 켜기 |
| "claude: command not found" | 1단계 Claude Code 설치가 안 된 상태 — https://claude.ai/code |
| 설치 중 오류 메시지 | 그 메시지를 그대로 Claude Code에 붙여넣고 "이 오류 해결해줘"라고 요청 |

> 더 자세한 설명(역할별 선택 설치, RAG 검색 DB 설정 등)이 필요하면 [ONBOARDING.md](./ONBOARDING.md)를 보세요.
