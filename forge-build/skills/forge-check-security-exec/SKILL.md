---
name: forge-check-security-exec
disable-model-invocation: true
description: "⛔ DEPRECATED(2026-08-11) — 유지보수 중단. 실행 기반 보안 검증. 정적 STRIDE 스캔이 놓치는 false-negative를 실제 실행 경로로 보완한다. 배포 전 보안 확인이 필요할 때 사용한다."
---
> **⛔ DEPRECATED(2026-08-11) — 유지보수가 중단된 스킬입니다.**
>
> 원본 시스템(forge SSoT)에서 2026-08-11 에 미사용으로 제거됐습니다. 이 플러그인에는
> **기존 설치자를 깨뜨리지 않기 위해 남겨 둡니다** — 계속 동작하지만 더 이상 고쳐지지 않습니다.
>
> **대체**: `/forge-check-security` — 익스플로잇 패턴 검사(S14)가 근접 커버합니다.
>
> ⚠️ **완전한 대체가 아닙니다.** 이 스킬은 실제로 실행해서 판정했고, S14 는 **정적 패턴 탐지**입니다.
> 실행 경로에서만 드러나는 취약점은 여전히 놓칩니다 — 그 부분은 `/qa` 시나리오나 수동 확인으로 메우십시오.
>
> **모델이 자동으로 고르지 않습니다**(`disable-model-invocation`). 유지보수가 끝난 스킬을
> 모델이 계속 집어 쓰면 경고가 무의미해집니다 — `/forge-check-security-exec` 로 **명시 호출하면 그대로 동작**합니다.
>
> 다음 릴리스에서 제거될 수 있습니다. 계속 필요하면 알려 주십시오.


# forge-check-security-exec — 실행기반 보안 scorer

**역할**: 5종 공격 페이로드를 대상 함수/서버에 **실제 실행**해 deterministic 판정.
STRIDE 체크리스트가 문서 선언만 보는 곳에서 이 scorer가 실행 증거를 확인한다.

## 컨텍스트

opt-in 전용 — auth/payment/file-upload/Node 서버 경로에서 `forge-check-security` 완료 후 HIGH 이상 발견 시 수동 호출한다. 자동 파이프라인 default-on 배선 금지(enforcement-theater 회피).

## 출력

`docs/qa/security-exec-cases.jsonl`(scorer별 PASS/FAIL/SKIP/INFO 누적) — selftest 10/10(또는 node 부재 시 8/8) 통과가 배포 전 1순위 게이트.

| Scorer | 공격 유형 | 페이로드 |
|--------|---------|--------|
| sql | SQL Injection | `"x' OR '1'='1"` (in-memory sqlite3) |
| safe_path | Path Traversal | `../../etc/passwd` |
| auth | HMAC Token Tamper | user_id 교체 + 원본 서명 재사용 |
| email | Email Header Injection | `"ok@ok.com\nevil@evil.com"` (개행 주입) |
| todo | Node DoS (null-body POST) | `raw="null"` → proc.poll() is None 생사 판정 |

P3 advisory: `loc_stats()` — src vs test LOC 분리 (JSONL INFO 항목, 게이트 임계 변경 없음).

**출처**: ponytail `benchmarks/agentic/tasks.py` 공격 페이로드 + Forge verification 모드 adapt.

---

## 호출법

```bash
# 기본: 프로젝트 루트 자동 탐지
python3 ${FORGE_ROOT:-$HOME/forge}/.claude/skills/forge-check-security-exec/scripts/scorer.py \
  --target <프로젝트_루트>

# entry point 명시 (자동 탐지 실패 시)
python3 scorer.py \
  --target src/ \
  --sql-file   src/db.py \
  --auth-file  src/auth.py \
  --path-file  src/uploads.py \
  --email-file src/emailval.py \
  --todo-file  src/server.js        # JS 서버 파일 명시
  # 또는 --todo-dir src/            # 디렉토리 지정 (server.js/app.js/index.js 탐지)

# selftest (배포 전 scorer 자체 검증 — 필수)
python3 scorer.py --selftest
```

## Entry Point 자동 탐지

| Scorer | 탐지 패턴 파일명 | 탐지 함수명 / 조건 |
|--------|---------------|-----------|
| sql | db.py / database.py / models.py / queries.py | get_user / find_user / user_by_username / lookup_user |
| auth | auth.py / authentication.py / token.py / jwt.py | verify_token / verify / check_token / validate_token |
| safe_path | uploads.py / files.py / storage.py / fileutil.py | safe_upload_path / safe_path / secure_upload_path / build_upload_path |
| email | emailval.py / email_validator.py / validators.py / email.py | is_valid_email / validate_email / valid_email / is_email / check_email |
| todo | server.js / app.js / index.js | Node 서버 스폰 (`node not on PATH` → SKIP) |

파일 탐지 실패 시 해당 scorer SKIP (오탐 방지, 강제 FAIL 금지).
todo: `shutil.which("node")` 없으면 SKIP (FAIL 아님).

## Sandbox 격리

대상 파일을 `tempfile.mkdtemp()`에 복사 후 import — 라이브 트리 직접 실행 금지.
import 후 tmpdir 즉시 삭제. in-memory sqlite3 사용 (파일시스템 DB 쓰기 없음).

## 산출물

`docs/qa/security-exec-cases.jsonl` (프로젝트 루트 기준, `--out`으로 override):

```jsonl
{"scorer": "sql", "target_file": "src/db.py", "result": "FAIL", "safe": 0, "correct": 1, "reason": "SQL injection: payload returned rows", "ts": "..."}
{"scorer": "auth", "target_file": "src/auth.py", "result": "PASS", "safe": 1, "correct": 1, "reason": "ok", "ts": "..."}
{"scorer": "todo", "target_file": "src/server.js", "result": "FAIL", "safe": 0, "correct": 1, "reason": "crashed on null POST", "ts": "..."}
{"scorer": "loc", "result": "INFO", "src_files": 12, "src_loc": 480, "test_files": 4, "test_loc": 210, "ratio": 0.44, "ts": "..."}
```

판정: PASS(safe=1) / FAIL(safe=0, exit 2) / SKIP(파일 없음 or node 없음) / INFO(loc advisory).

## Opt-In 게이트 (default-on 금지)

**연결 시점**:
1. `forge-check-security` 완료 후 HIGH 이상 발견 시 수동 호출 (auth/payment/file-upload 경로)
2. QA Phase F 전 수동 추가 (보안 크리티컬 경로만)

자동 파이프라인 강제 배선 금지 — enforcement-theater 회피.

## selftest 패턴

`--selftest` 실행: good-ref(안전 구현) → safe=1 / bad-ref(취약 구현) → safe=0.

| 스코어 | 케이스 수 | 조건 |
|--------|---------|------|
| sql/safe_path/auth/email | 4×2 = 8 | 항상 |
| todo | 2 (bad-ref/good-ref) | node on PATH 시 — SKIP if absent |

node 있으면 10/10, 없으면 8/8 통과 필수. 불일치 시 비0 exit.

scorer가 틀리면 eval 자체가 무의미 → **selftest가 1순위 게이트**.

## forge-sync

```bash
node ${FORGE_ROOT:-$HOME/forge}/dev/scripts/forge-sync.mjs sync
```
