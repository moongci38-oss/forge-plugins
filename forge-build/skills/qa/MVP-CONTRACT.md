# AD-96-MVP Hook Contract (SSoT)

> 2026-10-18 실측: 이 표의 훅 11개 중 파일이 남은 것은 H7(`pixel-diff-gate.sh`) 하나다. 나머지(H1~H3·H6·H9·H10·H26~H28·helper)는
> #1358(훅 정리 · 안 쓰는 훅 84개 삭제)에서 지웠고 `HOOKS_ALLOWLIST`·`settings.json` 에도 없다 — 그 행은 이 표에서 뺐다.

## 남은 게이트 1

| Hook ID | 파일 | 종류 | 트리거 이벤트 | Input | Output | Fixture |
|---------|------|------|-------------|-------|--------|---------|
| H7 | `pixel-diff-gate.sh` | gate | Phase E a4 후 Bash | `<diff_json> [threshold]` | exit 0/2/**3** | `pixel-diff-{ok,over}.json` |

### H7 exit code 계약 (2026-08-06 — `exit 3` 신설)

> ⚠️ 다른 게이트는 전부 `0/2` 인데 H7 만 3-값이다. 이 표를 SSoT 로 읽는 호출자가
> `exit 3` 을 모르면 측정이 깨진 것을 FAIL 로 읽는다(옛 디스패처 `phase-gate.sh` 는 #2692 에서 삭제).

| code | 의미 | 호출자가 해야 할 일 |
|:---:|---|---|
| 0 | 통과 — diff ≤ threshold, **또는 결과 파일 부재**(미실행이므로 미강제) | 다음 단계 진행 |
| 2 | `diffPixelRatio > threshold` → 시각 회귀 **BLOCK** | 버그로 접수, 수정 후 재실행 |
| 3 | 결과 파일은 있는데 파싱 불가·필드 부재·**비유한 수치**(NaN/Infinity) → 명시적 실패 | 측정 자체가 깨진 것 — PASS 도 FAIL 도 아니다. 캡처를 고쳐 재측정 (조용한 fail-open 금지) |

정본 = `.claude/hooks/pixel-diff-gate.sh` 헤더 주석 · 계약 테스트 = `.claude/hooks/tests/pixel-diff-gate.test.sh`(검증기 체크 ID P1.4).

## Cross-reference

- `pixel-diff-gate.sh` 는 `HOOKS_ALLOWLIST`·`settings.json` 에 없다 — qa 단계가 Bash 로 직접 부른다.
- (구 `_ad97-pending/`: H4/H5/H8/H11~H25/H29 — AD-97 미진입 스텁) → 2026-09-24 아카이브(#1012). 복원: `git checkout archive/ad97-pending-20260924 -- .claude/hooks/_ad97-pending`

## bug-fix-plan.md 필수 필드 (H10 검증)

```yaml
유형: UI/UX | API | DB | 혼합
cross_repo: true | false   # Phase D 자동 감지 (영향 파일 repo root ≥ 2 → true)
Who: ...
What: ...
When: ...
Where: ...
Why_hypothesis: ...        # Phase D 필수 (H1 phase-d gate)
Why_root_cause: 미작성     # healer a4 후 채움 (H1 phase-f gate)
How: |
  재현 단계...
  재현율: N/3
# UI/UX 추가 필수
영향 컴포넌트: <Name>
viewport: [mobile, tablet, desktop]
발견 축: [1-7]
```
