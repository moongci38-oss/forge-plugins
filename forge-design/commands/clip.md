---
allowed-tools: Bash, Read
description: "클립보드 이미지 또는 파일 경로 이미지를 현재 대화에 표시 (다중 지원). 채팅창 Alt+V/Ctrl+V 가 1순위이고 이 커맨드는 폴백 — 이미지는 파일을 거치지 않고 메모리 base64 로 가져온다."
group: ops
---

Windows 클립보드 또는 지정 파일 경로에서 이미지를 가져와 표시합니다.

## 순위 — 이 커맨드는 폴백이다

1. **1순위 = 채팅창에서 직접 붙이기(`Alt+V` 또는 `Ctrl+V`).**
2. **`/clip`** = 1순위가 무반응일 때. 같은 클립보드를 PowerShell → 메모리 base64 로 읽되 **실패 사유를 그대로 보여준다.**
3. **`/clip <경로>`** = 클립보드도 WSL 공유도 타지 않는 유일하게 확실한 경로.

인자: `$ARGUMENTS`

⚠️ 인자가 이미지 경로가 아니라 질문·문장이면 클립보드 캡처로 처리한다. 경로 판정 = `/` 또는 `<드라이브>:\` 로 시작하는 토큰만.

**알려진 고장**: `\\wsl.localhost` 공유가 끊긴 머신에서는 리눅스 CWD 의 `powershell.exe`/`cmd.exe` 가 "Invalid argument" 로 뜨지 못한다(채팅창 Alt+V 도 무반응). 그래서 윈도우 exe 는 항상 `( cd /mnt/c && ... )` 서브셸로 띄운다(서브셸 = Bash 도구 CWD 오염 방지).

## 클립보드 캡처 (인자가 비어있거나 경로가 아닐 때)

```bash
bash "${FORGE_ROOT:-$HOME/forge}/shared/scripts/clip-capture.sh"
```

첫 줄 `STATUS=` 로 판정하고, 둘째 줄(마커)을 사용자에게 보여준다. 종료코드 0 = SAVED·NOIMAGE · 1 = SAVEFAIL · 2 = UNKNOWN(판정 불가). ⛔ 호출에 `2>/dev/null` 금지 — 실패가 '이미지 없음' 으로 위장한다. (PowerShell→base64·`LEN` 길이 대조·심링크 방어·`/mnt/c` 서브셸 기동은 스크립트 안에 있다.)

| 출력 | 뜻 | 안내 |
|---|---|---|
| `SAVED: /tmp/clip_0.png` | 성공 | `FILE=` 경로를 `Read` 로 표시한다 |
| `NOIMAGE` | 클립보드에 이미지 없음 | 아래 **NOIMAGE 안내** |
| `SAVEFAIL: …` | PNG 변환·디코드·길이 대조 실패 | 에러 원문을 **그대로** 보여준다 |
| `UNKNOWN: …` | PowerShell 미기동·예상 밖 출력 | 원문을 그대로 보여준다. `Invalid argument` 면 `/mnt/c` 마운트 여부(`ls /mnt/c`)부터 확인 |

### NOIMAGE 안내

1. `NOIMAGE` = PowerShell 은 정상 기동했고 그 세션 클립보드에 이미지가 없다. 공유가 끊긴 머신에서는 `Alt+V` 를 1순위로 안내하지 않는다(복구된 머신에서만 먼저 권한다).
2. **세션 격리를 확인한다** — RDP 다중 세션에서는 다른 세션의 클립보드를 읽을 수 없다:

```bash
( cd /mnt/c && echo "WSL 소유 세션: $(cmd.exe /c 'echo %SESSIONNAME%' 2>&1 | tr -d '\r\0')" )
( cd /mnt/c && query.exe user 2>&1 | tr -d '\r\0' | head -3 )
```

두 세션이 다르면:
> 지금 접속하신 세션과 WSL 이 실행 중인 세션이 달라 **클립보드를 읽을 수 없습니다**(윈도우가 세션별로 격리합니다).
> 이미지를 `E:\shot.png` 로 저장해 주시면 바로 읽겠습니다 — 또는 `/clip E:\shot.png` 로 부르셔도 됩니다.

## 경로 인자가 있을 때

공백 구분으로 각 경로를 처리(클립보드·WSL 공유를 타지 않는다):
- Windows 경로(`C:\...`)는 `wslpath`로 WSL 경로로 변환 · `/`로 시작하는 WSL 경로는 그대로
- 각 이미지를 번호와 함께 순서대로 Read로 읽어 표시
- 마지막에 "총 N개 이미지 표시됨" 안내

예: `/clip C:\Users\user\Desktop\a.png C:\Users\user\Desktop\b.png` · `/clip /tmp/screen1.png /tmp/screen2.png`
