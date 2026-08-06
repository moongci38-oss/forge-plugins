# harness-backlog-loop — Human Gates & Budget

> 게이트 없이는 의도하지 않은 동작이, 예산 없이는 영구 실행이 발생한다. 두 섹션 모두 필수.

---

## Human Gates

| # | Gate | 트리거 조건 | 승인자 | 삭제 |
|---|------|-----------|-------|------|
| **G1** | Pre-run sign-off | 실제 데이터로 첫 실행 전 | 루프 소유자 | 불가 |
| **G2** | Verifier 이상 | `verify-item.sh` exit 1 이 같은 항목에 3회 / exit 2(MANUAL_VERIFY) / **역변조 실증 요구 항목** | 루프 소유자 | 불가 |
| **G3** | 게이트 항목 | `gate != "none"` 인 백로그 항목 — **자동 적용·판정 금지** | 항목별 소유자 | 불가 |
| **G4** | Push | 티어 경계에서 원격 push 전 | 루프 소유자 | 가능(리스크 수용 시) |
| **G5** | Wall-clock | 2시간 초과 | 자동 STOP | 불가 |

**자가 승인 금지.** 게이트 요청은 `STATE.md` 의 Gate ledger 에 기록하고, Human 이 명시 승인한 뒤에만 진행한다.

### G3 — 자동 적용 금지 항목 (백로그 실측 13건 = gate 12 + LOCAL 전제 1)

| gate 값 | 건수 | 사유 |
|---------|------|------|
| `human-settings` | 5 | `settings.json` 은 `settings-json-lock` 으로 **에이전트가 도달할 수 없다**(AD-168). 사람이 직접 편집 |
| `ad168` | 3 | 신규 BLOCK 훅·출력 레일 완화 — WARN-first 판단 + Human 등록이 선행 |
| `human-decision` | 2 | 배선이냐 폐기냐를 사람이 정해야 함(`branch-base-develop`, 타 PC 반복) |
| `human-secret` | 1 | `.env` 편집 — 값 노출 금지, 백업 선행 |
| `human-delete` | 1 | 파일 삭제 |
| (LOCAL, gate=none) | 1 | `L-1 forge-sync sync` — 루프 **전제 단계**로 Init 에서 자동 실행 |

**누적 skip 은 정지 사유가 아니다** — 보고 대상이다. 루프는 계속 진행하고 Report 에 목록을 낸다.

### G2 — 역변조(mutation) 실증이 필요한 항목

`mutation` 필드가 있는 항목은 verify PASS 만으로 `done` 처리하지 않는다.
**그 분기를 지웠을 때 verify 가 FAIL 하는지**를 사람이 확인하고 승인해야 한다.
(근거: 본 세션에서 판별력 0인 verify 가 실제로 오탐 PASS 를 냈다 — 백로그 `P0-8` note 참조)

---

## Budget / Stop (하드 상한)

| 항목 | 상한 | 초과 시 |
|------|------|--------|
| max iterations | 10 | 즉시 중단 |
| call-budget | 600 | Forge hook **WARN-only** → 사람 판단 (하드 차단 아님) |
| **wall-clock** | **2시간** | 즉시 중단 |

wall-clock 은 `STATE.md` 의 `wall_clock_start` 대비 경과 시간으로 체크한다.

---

## 게이트 처리 절차

1. 루프가 `STATE.md` Gate ledger 에 gate-request 기록 (항목 id + 사유 + 시각)
2. Human 이 명시 승인 (승인자·일시 기입)
3. 루프가 승인 확인 후 계속

---

## 첫 실행 전 G1 체크리스트

- [ ] `forge-sync sync` 완료 — 미러 stale 상태에서는 룰 항목 verify 가 무의미하다
- [ ] `verify-all.sh` 가 현재 상태에서 **rc=1**(미충족)을 반환하는지 확인 — rc=0 이면 이미 끝났거나 판정기가 고장난 것
- [ ] `verify-item.sh` 를 P0 항목 1건에 돌려 **FAIL(rc=1)** 이 나오는지 확인 (red 상태 확인 = 이후 PASS 가 의미를 가짐)
- [ ] 대상 레포에 다른 세션이 커밋 중인지 확인 (`git status --porcelain` + `.git/index.lock` 부재)
- [ ] push 는 G4 — 루프에 맡기지 않는다
