# CU 분석 시나리오 템플릿

> AD-72 (2026-05-20). scenario 파일 작성 시 이 템플릿 사용.
> env:// 토큰은 자동 치환 안 됨 — 쉘 확장 필수.

## 사용 방법

```bash
# 쉘 확장으로 플레이스홀더 치환 후 실행
BYPASS_FORGE_CU_COST=1 python3 $HOME/.claude/scripts/cu-runner.py \
  --scenario-file /tmp/my-scenario.md \
  --credentials env://SITE_PASSWORD \
  --max-cost=30
```

## 템플릿

```markdown
## 목표
{분석 목표 1~2줄}

## 로그인 (필요 시)
- URL: {login_url}
- 계정: --credentials 인자로 전달 (env://VAR_NAME 형식)

## 탐색 순서
1. {action_1}
2. {action_2}
3. ...

## 수집 대상
- 화면: {screen_list}
- API: {api_pattern}
- 기타: {other}

## 완료 조건
- {done_condition}
```

## 플레이스홀더 규칙

| 플레이스홀더 | 설명 | 주입 방법 |
|------------|------|----------|
| `__LOGIN_USER__` | 로그인 계정명 | 쉘: `sed s/__LOGIN_USER__/$USER/` 후 파일 저장 |
| `__LOGIN_PASS__` | 패스워드 | `--credentials env://VAR_NAME` 사용 (raw 삽입 금지) |

> **보안**: 패스워드를 scenario 파일에 직접 기재 금지. 항상 `--credentials env://` 경유.
