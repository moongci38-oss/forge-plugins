#!/usr/bin/env python3
"""
디자인 레퍼런스 데이터셋 조회기 (CSV-safe) + 무결성 검증.

왜 grep 대신 이걸 쓰나 (cr-final 2026-07-24 medium 수용):
  - grep/cut 은 인용부호 안의 콤마·필드 내 개행에서 조용히 어긋난다. 현재 데이터엔
    그런 행이 0건이지만(실측), ATTRIBUTION 의 갱신 절차가 상류 재반입을 허용하므로
    데이터가 바뀌면 언제든 깨진다. 파서를 쓰면 데이터와 무관하게 옳다.
  - 이 CSV 는 **untrusted 외부 콘텐츠**다. 셀에 터미널 escape/제어문자가 들어오면
    출력만으로 단말이나 에이전트 컨텍스트가 오염될 수 있어, 출력 전에 제거한다.

사용:
  python3 query.py products fintech          # 파일 지정 + 키워드
  python3 query.py styles glassmorphism --col "Style Category"
  python3 query.py stacks/react form
  python3 query.py --list                    # 조회 가능한 데이터셋 + 실제 행수
  python3 query.py --verify                  # 무결성 검증 (CI/갱신 후)
"""

import argparse
import csv
import glob
import io
import os
import re
import sys

BASE = os.path.dirname(os.path.abspath(__file__))

# 터미널 escape·제어문자 (탭 제외) — untrusted 셀 출력 전 제거
_CTL = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]|\x1b\[[0-9;]*[A-Za-z]")

# 상류 재반입 시 다시 딸려오면 안 되는 파일 (ATTRIBUTION §반입하지 않은 것)
EXCLUDED = {"google-fonts.csv"}


def sanitize(value):
    """untrusted 셀 값을 출력 안전하게 만든다. 내용은 보존하되 제어문자만 제거."""
    return _CTL.sub("", str(value)).replace("\n", " ⏎ ")


def datasets():
    files = sorted(glob.glob(os.path.join(BASE, "*.csv")))
    files += sorted(glob.glob(os.path.join(BASE, "stacks", "*.csv")))
    return files


def rel(path):
    return os.path.relpath(path, BASE)


def read_rows(path):
    with io.open(path, encoding="utf-8", newline="") as f:
        return list(csv.reader(f))


def cmd_list():
    print(f"{'데이터셋':<28} 행수  컬럼")
    for p in datasets():
        rows = read_rows(p)
        header = rows[0] if rows else []
        print(f"{rel(p):<28} {len(rows)-1:>4}  {len(header)}")
    print("\n조회: python3 query.py <데이터셋명(확장자 생략 가능)> <키워드> [--col 컬럼명]")


def cmd_verify():
    """갱신 후 무결성 검증 — 파일셋·파싱·제외목록·오염 스캔. 실패 시 exit 1."""
    problems = []
    files = datasets()
    if not files:
        problems.append("CSV 0건 — 데이터셋이 비어 있음")

    for p in files:
        name = os.path.basename(p)
        if name in EXCLUDED:
            problems.append(f"{rel(p)}: 제외 대상인데 반입됨 (ATTRIBUTION §반입하지 않은 것)")
        raw = io.open(p, encoding="utf-8", errors="replace", newline="").read()
        try:
            rows = list(csv.reader(io.StringIO(raw)))
        except csv.Error as e:
            problems.append(f"{rel(p)}: CSV 파싱 실패 — {e}")
            continue
        if len(rows) < 2:
            problems.append(f"{rel(p)}: 데이터 행 없음")
        # 셀 폭 불균일 = 상류 스키마 변경 신호
        widths = {len(r) for r in rows if r}
        if len(widths) > 1:
            problems.append(f"{rel(p)}: 행마다 컬럼 수가 다름 {sorted(widths)} — 스키마 확인 필요")
        n_ctl = len(_CTL.findall(raw))
        if n_ctl:
            problems.append(f"{rel(p)}: 제어문자/터미널 escape {n_ctl}건 — untrusted 오염 의심")

    print(f"검증 대상: {len(files)}개 CSV")
    if problems:
        print(f"\n❌ 문제 {len(problems)}건:")
        for x in problems:
            print(f"   • {x}")
        return 1
    total = sum(len(read_rows(p)) - 1 for p in files)
    print(f"✅ 무결성 PASS — {len(files)}개 파일 / 데이터 {total}행 / 제어문자 0")
    return 0


def cmd_query(name, keyword, col=None, limit=10):
    # 확장자·경로 유연 매칭
    cands = [p for p in datasets()
             if rel(p) == name or rel(p) == f"{name}.csv" or os.path.basename(p) == f"{name}.csv"]
    if not cands:
        print(f"❌ 데이터셋 '{name}' 없음. --list 로 확인하세요.")
        return 1
    path = cands[0]
    rows = read_rows(path)
    if not rows:
        print("❌ 빈 파일")
        return 1
    header, body = rows[0], rows[1:]
    idx = None
    if col:
        if col not in header:
            print(f"❌ 컬럼 '{col}' 없음. 사용 가능: {', '.join(header)}")
            return 1
        idx = header.index(col)

    kw = keyword.lower()
    hits = [r for r in body
            if (kw in (r[idx].lower() if idx is not None and idx < len(r) else ""))
            or (idx is None and any(kw in c.lower() for c in r))]

    print(f"# {rel(path)} — '{keyword}' 매치 {len(hits)}행 (표시 {min(len(hits), limit)})")
    if not hits:
        print("  (없음) — 키워드를 넓히거나 --list 로 데이터셋을 확인하세요.")
        return 0
    for r in hits[:limit]:
        print()
        for h, v in zip(header, r):
            v = sanitize(v).strip()
            if v:
                print(f"  {h}: {v}")
    print(f"\n출처 인용 형식: `{rel(path)}#{sanitize(hits[0][1]) if len(hits[0]) > 1 else keyword}`")
    return 0


def main():
    ap = argparse.ArgumentParser(description="디자인 레퍼런스 데이터셋 조회 (CSV-safe)")
    ap.add_argument("dataset", nargs="?", help="데이터셋명 (예: products, styles, stacks/react)")
    ap.add_argument("keyword", nargs="?", help="검색 키워드")
    ap.add_argument("--col", help="특정 컬럼만 검색")
    ap.add_argument("--limit", type=int, default=10)
    ap.add_argument("--list", action="store_true", help="데이터셋 목록 + 실제 행수")
    ap.add_argument("--verify", action="store_true", help="무결성 검증 (갱신 후 실행)")
    a = ap.parse_args()

    if a.verify:
        sys.exit(cmd_verify())
    if a.list or not a.dataset:
        cmd_list()
        sys.exit(0)
    if not a.keyword:
        print("❌ 키워드가 필요합니다. 예: python3 query.py products fintech")
        sys.exit(2)
    sys.exit(cmd_query(a.dataset, a.keyword, a.col, a.limit))


if __name__ == "__main__":
    main()
