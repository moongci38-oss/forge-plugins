#!/usr/bin/env python3
"""공용 시크릿 마스킹 — 감사 로그에 명령 원문을 남기는 훅이 쓴다.

root-cause(2026-08-01 실사고): forge-destructive-op-block.sh 가 BOUNDARY_WARN 을 남길 때
명령 원문을 무마스킹으로 기록해 `-p'<평문>'` 형태 DB 자격증명이 git 추적 파일
(.claude/audit/boundary-warn.jsonl)에 커밋·푸시됐다. 기존 마스커 task-log.sh:mask_text() 는
`KEY=VALUE` 형태만 덮어 **CLI 플래그형(-p/--password)과 접속 URL userinfo 를 놓쳤다** —
그 갭이 이 파일의 존재 이유다.

근거: 감사 로그는 git 추적 대상(멀티 PC 전파)이라 평문 1행이 곧 영구 노출이고,
히스토리 재작성 없이는 되돌릴 수 없다. 그래서 기록 시점에 막는 것이 유일한 예방선이다.
폐기조건: 훅 로깅 경로가 명령 원문 자체를 저장하지 않도록 재설계되면 이 모듈은 불필요해진다.

계약
----
mask(text) -> str
  * 리터럴 시크릿 **값만** '***' 로 치환한다.
  * `$VAR` `${VAR}` `$(...)` `` `...` `` 등 **변수·치환 참조는 보존**한다.
    (감사 가치 유지 — "무엇을 참조했는가"는 유출이 아니라 증거다)
  * 멱등이다: 이미 마스킹된 문자열을 다시 통과시켜도 같은 결과.

CLI: stdin -> stdout. 실패 시 종료코드 non-zero (호출측이 fail-closed 처리).

이 방어가 무력화되는 입력
------------------------
셸이 해석해야만 값이 드러나는 형태 — 예: `mysql -p$(cat pw.txt)` 는 `$(...)` 참조로 보존되고
(그 자체로는 유출 아님), 반대로 **인식하지 못한 새 플래그**(예: 가상의 `--dbsecret x`)는
그대로 통과한다. 즉 이 마스커는 알려진 자격증명 표기법에 대한 방어이지 임의 비밀의 탐지기가 아니다.
"""

import re
import sys

MASK = "***"

# 값이 "참조"인가(= 유출 아님) — $VAR, ${VAR}, $(...), `...`, 그리고 그 인용형
_REF = re.compile(r"""^\s*(?:['"]?\s*)?(?:\$\{?\w|\$\(|`)""")

# 자격증명으로 취급할 변수/키 이름
_SECRET_NAME = (
    r"(?:[A-Z0-9_]*(?:PASSWORD|PASSWD|PGPASSWORD|MYSQL_PWD|SECRET|TOKEN|"
    r"API_?KEY|ACCESS_KEY|PRIVATE_KEY|AUTH)[A-Z0-9_]*)"
)

# mysql 계열 클라이언트가 명령에 등장할 때만 `-p<값>` 을 비밀번호로 본다.
# (psql 의 -p 는 포트다 — 게이트 없이 마스킹하면 멀쩡한 감사 정보를 망친다)
_MYSQL_FAMILY = re.compile(
    r"\b(?:mysql|mysqldump|mysqladmin|mariadb|mariadb-dump|mariadb-admin)\b"
)


def _is_ref(value: str) -> bool:
    return bool(_REF.match(value or ""))


def _mask_kv(m: re.Match) -> str:
    head, quote, value = m.group(1), m.group(2) or "", m.group(3)
    if _is_ref(quote + value):
        return m.group(0)
    return f"{head}{quote}{MASK}{quote}"


def mask(text: str) -> str:
    if not text:
        return text

    # 1) 개인키/인증서 블록 — 통째로 제거
    text = re.sub(
        r"-----BEGIN[^-]{0,40}-----.*?-----END[^-]{0,40}-----",
        "[REDACTED_KEY]",
        text,
        flags=re.DOTALL,
    )

    # 2) NAME=value / export NAME=value (따옴표 유무 모두). 참조($VAR)는 보존.
    text = re.sub(
        rf"""((?:export\s+)?{_SECRET_NAME}\s*=\s*)(['"]?)([^\s'";|&]+)\2""",
        _mask_kv,
        text,
        flags=re.IGNORECASE,
    )

    # 3) --password=value / --password value / --api-key value 등 긴 플래그
    text = re.sub(
        r"""(--(?:password|passwd|pass|api[-_]?key|auth[-_]?token|access[-_]?token|secret)"""
        r"""[=\s]+)(['"]?)([^\s'";|&]+)\2""",
        _mask_kv,
        text,
        flags=re.IGNORECASE,
    )

    # 4) mysql 계열의 붙여쓰기 `-p<값>` (공백 있으면 비밀번호가 아니라 대화형 프롬프트다)
    if _MYSQL_FAMILY.search(text):
        text = re.sub(
            r"""(?<![\w-])(-p)(['"]?)([^\s'";|&]+)\2""",
            _mask_kv,
            text,
        )

    # 5) 접속 URL 의 userinfo — scheme://user:pass@host
    def _mask_url(m: re.Match) -> str:
        if _is_ref(m.group(2)):
            return m.group(0)
        return f"{m.group(1)}{MASK}@"

    text = re.sub(r"(://[^/\s:@]+:)([^@/\s]+)@", _mask_url, text)

    # 6) Bearer / Authorization 헤더 토큰
    text = re.sub(
        r"\b(Bearer\s+)([A-Za-z0-9._~+/=-]{8,})", rf"\1{MASK}", text, flags=re.IGNORECASE
    )

    return text


def main() -> int:
    data = sys.stdin.read()
    sys.stdout.write(mask(data))
    return 0


if __name__ == "__main__":
    sys.exit(main())
