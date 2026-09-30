---
name: forge-check-security-exec
description: "실행 기반 보안 검증. 정적 STRIDE 스캔이 놓치는 false-negative를 실제 실행 경로로 보완한다. 배포 전 보안 확인이 필요할 때 사용한다."
---

# forge-check-security-exec — 실행기반 보안 scorer

**역할**: 5종 공격 페이로드를 대상 함수/서버에 **실제 실행**해 deterministic 판정. STRIDE 체크리스트가 문서 선언만 보는 곳에서 실행 증거를 확인한다.

## 호출 조건 (opt-in · default-on 배선 금지)

1. `forge-check-security` 완료 후 HIGH 이상 발견 시 수동 호출 (auth/payment/file-upload/Node 서버 경로)
2. QA Phase F 전 수동 추가 (보안 크리티컬 경로만)
3. `/forge-pr` 조건부 자동 호출 — diff 가 **보안 민감 경로 또는 이 게이트 자신**을 건드린 PR 에서만(`§실행 기반 보안 게이트`). 조건을 넓혀 모든 PR 에서 돌게 하지 않는다.

## Scorer

| Scorer | 공격 유형 | 페이로드 |
|--------|---------|--------|
| sql | SQL Injection | `"x' OR '1'='1"` (in-memory sqlite3) |
| safe_path | Path Traversal | `../../etc/passwd` |
| auth | HMAC Token Tamper | user_id 교체 + 원본 서명 재사용 |
| email | Email Header Injection | `"ok@ok.com\nevil@evil.com"` (개행 주입) |
| todo | Node DoS (null-body POST) | `raw="null"` → proc.poll() is None 생사 판정 |

P3 advisory: `loc_stats()` — src vs test LOC 분리 (JSONL INFO 항목, 게이트 임계 변경 없음).

## 호출법

```bash
# 기본: 프로젝트 루트 자동 탐지
python3 ~/forge/.claude/skills/forge-check-security-exec/scripts/scorer.py \
  --target <프로젝트_루트>

# entry point 명시 (자동 탐지 실패 시)
python3 scorer.py \
  --target src/ \
  --sql-file   src/db.py \
  --auth-file  src/auth.py \
  --path-file  src/uploads.py \
  --email-file src/emailval.py \
  --todo-file  src/server.js        # 또는 --todo-dir src/ (server.js/app.js/index.js 탐지)

# selftest (배포 전 scorer 자체 검증 — 필수)
python3 scorer.py --selftest
```

## Entry Point 자동 탐지

| Scorer | 탐지 파일명 | 탐지 함수명 / 조건 |
|--------|---------------|-----------|
| sql | db.py / database.py / models.py / queries.py | get_user / find_user / user_by_username / lookup_user |
| auth | auth.py / authentication.py / token.py / jwt.py | verify_token / verify / check_token / validate_token |
| safe_path | uploads.py / files.py / storage.py / fileutil.py | safe_upload_path / safe_path / secure_upload_path / build_upload_path |
| email | emailval.py / email_validator.py / validators.py / email.py | is_valid_email / validate_email / valid_email / is_email / check_email |
| todo | server.js / app.js / index.js | Node 서버 스폰 (`shutil.which("node")` 없음 → SKIP) |

- 파일 탐지 실패 → 해당 scorer SKIP (강제 FAIL 금지).
- `node_modules`·`.next`·`dist` 는 탐색에서 제외. 다른 의존성 폴더(`vendor/` 등)는 후보가 되므로 `--todo-file` 로 명시.
- Sandbox: 대상 파일을 `tempfile.mkdtemp()` 에 복사 후 import(라이브 트리 직접 실행 금지) → import 후 tmpdir 즉시 삭제. in-memory sqlite3.

## 산출물

`docs/qa/security-exec-cases.jsonl` (프로젝트 루트 기준, `--out` 으로 override) — scorer별 누적:

```jsonl
{"scorer": "sql", "target_file": "src/db.py", "result": "FAIL", "safe": 0, "correct": 1, "reason": "SQL injection: payload returned rows", "ts": "..."}
{"scorer": "loc", "result": "INFO", "src_files": 12, "src_loc": 480, "test_files": 4, "test_loc": 210, "ratio": 0.44, "ts": "..."}
```

판정: PASS(safe=1) / FAIL(safe=0) / SKIP(파일 없음 or node 없음) / INFO(loc advisory).

## 종료코드 계약

| exit | 뜻 | 게이트에서 |
|---|---|---|
| 0 | 실행된 scorer 1개 이상 + FAIL 0 | 통과 |
| 2 | FAIL 1개 이상 | **[STOP]** |
| 3 | **INCONCLUSIVE** — 5종 전부 SKIP. JSONL 에 `{"scorer":"overall","result":"INCONCLUSIVE"}` | **통과 아님** — `--*-file` 로 대상 명시 재실행 또는 스택에 맞는 수동 실측 증거 첨부. 증거 없으면 [STOP] |

0·2 만 아는 소비자는 3 을 비0 으로 보고 멈춘다(보수적 낙하).

## selftest (1순위 게이트)

`--selftest`: good-ref(안전 구현) → safe=1 / bad-ref(취약 구현) → safe=0.

| 스코어 | 케이스 수 | 조건 |
|--------|---------|------|
| sql/safe_path/auth/email | 4×2 = 8 | 항상 |
| todo | 2 (bad-ref/good-ref) | node on PATH 시 — 없으면 SKIP |

node 있으면 10/10, 없으면 8/8 통과 필수. 불일치 시 비0 exit. scorer 가 틀리면 eval 자체가 무의미하다.

## forge-sync

```bash
node ~/forge/dev/scripts/forge-sync.mjs sync
```
