#!/usr/bin/env python3
"""
AD-92 P1-A R4 — 라우트 페어 빌더
입력: parity-route-map.md + 1E static coverage md
출력: docs/qa/migration-route-pairs.json

실행:
  python3 route-pair-builder.py \
    --route-map  admin/docs/qa/parity-route-map.md \
    --coverage   docs/infrastructure/2026-05-22-phase1-1e-static-coverage.md \
    --output     admin/docs/qa/migration-route-pairs.json
"""
import re
import json
import argparse
import sys
from pathlib import Path


# ── 1E coverage 섹션별 도메인 매핑 ─────────────────────────────────────────────
SECTION_DOMAIN = {
    "§1": "member",
    "§2": "shop",
    "§3": "access",
    "§4": "order_record",
    "§5": "log",
    "§6": "calculate_recode",
    "§7": "system_manager",
    "§8": "ai_config",
    "§9": "notice",
    "§10": "manager",
}

# parity-route-map legacy URL → coverage 도메인 매핑 힌트
LEGACY_TO_DOMAIN = {
    "member":           "member",
    "access":           "access",
    "shop":             "shop",
    "order_record":     "order_record",
    "log":              "log",
    "calculate_recode": "calculate_recode",
    "system_manager":   "system_manager",
    "ai_config":        "ai_config",
    "notice":           "notice",
}

# 추출 규칙 파일 경로 규칙
EXTRACTION_RULES_BASE = "docs/qa/extraction-rules"
IMPLEMENTED_EXTRACTION = {"member", "shop", "order_record", "system_manager", "ai_config", "log"}


def parse_route_map(path: Path) -> list[dict]:
    """parity-route-map.md §1 테이블 파싱 → legacy URL + 신축 라우트 추출"""
    text = path.read_text(encoding="utf-8")
    pairs = []

    # 테이블 행: | # | legacy 라벨 | legacy URL | 신축 라우트 | 상태 |
    row_re = re.compile(
        r"\|\s*(\d+)\s*\|[^|]*\|"          # # | 라벨
        r"\s*`?([^`|]+?)`?\s*\|"            # legacy URL
        r"\s*`?([^`|]+?)`?\s*\|"            # 신축 라우트
        r"\s*([^|]+?)\s*\|"                 # 상태
    )
    for m in row_re.finditer(text):
        idx = int(m.group(1))
        legacy_url = m.group(2).strip().strip("`")
        new_page   = m.group(3).strip().strip("`")
        status_raw = m.group(4).strip()

        # 도메인 추출 (legacy URL의 두 번째 세그먼트)
        parts = legacy_url.split("/")
        domain = parts[1] if len(parts) >= 2 else ""

        # 신축 API URL: /api/v1 + newPageUrl (BUG-2 fix)
        # 실측 검증: NestJS 컨트롤러는 newPageUrl 경로와 일치함
        # 구버전 휴리스틱(/api/v1/{domain}) 제거 — 실제 404 발생 확인됨
        new_api = f"/api/v1{new_page}" if new_page.startswith("/") else f"/api/v1/{new_page}"

        pairs.append({
            "idx": idx,
            "legacyUrl": legacy_url,
            "newPageUrl": new_page,
            "newApiUrl": new_api,
            "domain": domain,
            "routeMapStatus": "EXISTS" if "✅" in status_raw else "PLACEHOLDER",
        })

    return pairs


def parse_coverage(path: Path) -> dict[str, dict]:
    """1E coverage md §N 테이블 파싱 → legacy경로 → {coverageStatus, domain}

    실제 파일 형식:
      ## §1. member (유저) — 22 화면
      | # | legacy 화면 | legacy 경로 | admin 대응 경로 | 분류 | 비고 |
      | 1 | 유저목록 | `member/members/index` | `member/page.tsx` | **COVERED** | ... |
    """
    text = path.read_text(encoding="utf-8")
    coverage_map: dict[str, dict] = {}

    current_section = None
    current_domain = None

    # 실제 형식: | 번호 | 화면명 | `legacy경로` | `admin경로` | **STATUS** | 비고 |
    # STATUS는 **COVERED**, **PARTIAL**, **MISSING**, **FALSE POSITIVE** 등
    status_re = re.compile(r"\*\*(COVERED|PARTIAL|MISSING|FALSE[+\s]?POSITIVE?)\*\*", re.IGNORECASE)
    # legacy 경로 열 추출 (backtick 제거)
    legacy_path_re = re.compile(r"`([^`]+)`")

    for line in text.splitlines():
        # 섹션 헤더 감지: ## §N.
        sec_m = re.match(r"^## (§\d+)\.", line)
        if sec_m:
            current_section = sec_m.group(1)
            current_domain = SECTION_DOMAIN.get(current_section, "")
            continue

        if not current_domain or not line.startswith("|"):
            continue

        # 헤더/구분 행 스킵
        if re.match(r"\|[\s:-]+\|", line):
            continue

        # STATUS 추출
        status_m = status_re.search(line)
        if not status_m:
            continue

        raw_status = status_m.group(1).upper()
        if "FALSE" in raw_status:
            status = "FALSE+"
        else:
            status = raw_status  # COVERED / PARTIAL / MISSING

        # legacy 경로 추출 (3번째 backtick 항목)
        backtick_items = legacy_path_re.findall(line)
        if not backtick_items:
            continue
        # 첫 번째 backtick 항목이 legacy 경로 (번호/이름 제외)
        # 형식상 | # | 화면명 | `legacy경로` | ... 이므로 첫 backtick = legacy 경로
        legacy_path = backtick_items[0].strip().rstrip("/")

        # 경로에서 screen key 추출 (마지막 세그먼트 또는 전체)
        # e.g. member/members/index → members/index
        parts = legacy_path.split("/")
        if len(parts) >= 2:
            screen = "/".join(parts[1:])  # 도메인 prefix 제거
        else:
            screen = legacy_path

        key = f"{current_domain}/{screen}"
        coverage_map[key] = {
            "coverageStatus": status,
            "domain": current_domain,
            "section": current_section,
            "legacyPath": legacy_path,
        }

    return coverage_map


def build_pairs(route_pairs: list[dict], coverage_map: dict[str, dict]) -> list[dict]:
    """라우트 페어 + 1E 커버리지 조인"""
    results = []
    for rp in route_pairs:
        domain = rp["domain"]
        legacy_path = rp["legacyUrl"].split("/")[-1]  # 마지막 세그먼트

        # coverage 조회: domain/legacy_path 키 시도
        cov_key = f"{domain}/{legacy_path}"
        cov = coverage_map.get(cov_key)
        if not cov:
            # 폴백: 도메인 전체 스캔
            for k, v in coverage_map.items():
                if k.startswith(domain + "/") and legacy_path in k:
                    cov = v
                    cov_key = k
                    break

        coverage_status = cov["coverageStatus"] if cov else "UNKNOWN"
        section = cov["section"] if cov else ""

        # 추출 규칙 경로
        extraction_file = f"{EXTRACTION_RULES_BASE}/{domain}.json" if domain in IMPLEMENTED_EXTRACTION else None
        extraction_todo = domain not in IMPLEMENTED_EXTRACTION

        results.append({
            "idx": rp["idx"],
            "legacyUrl": rp["legacyUrl"],
            "newApiUrl": rp["newApiUrl"],
            "newPageUrl": rp["newPageUrl"],
            "domain": domain,
            "coverageStatus": coverage_status,
            "coverageKey": cov_key if cov else None,
            "section": section,
            "routeMapStatus": rp["routeMapStatus"],
            "extractionRule": extraction_file,
            "extractionTodo": extraction_todo,
        })

    return results


def summarize(pairs: list[dict]) -> dict:
    from collections import Counter
    status_counts = Counter(p["coverageStatus"] for p in pairs)
    return {
        "total": len(pairs),
        "COVERED": status_counts.get("COVERED", 0),
        "PARTIAL": status_counts.get("PARTIAL", 0),
        "MISSING": status_counts.get("MISSING", 0),
        "UNKNOWN": status_counts.get("UNKNOWN", 0),
        "extractionImplemented": sum(1 for p in pairs if not p.get("extractionTodo")),
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--route-map",  required=True, help="parity-route-map.md 경로")
    parser.add_argument("--coverage",   required=True, help="1E static coverage md 경로")
    parser.add_argument("--output",     required=True, help="migration-route-pairs.json 출력 경로")
    args = parser.parse_args()

    route_map_path = Path(args.route_map)
    coverage_path  = Path(args.coverage)
    output_path    = Path(args.output)

    if not route_map_path.exists():
        print(f"ERROR: route-map 파일 없음: {route_map_path}", file=sys.stderr)
        sys.exit(1)
    if not coverage_path.exists():
        print(f"ERROR: coverage 파일 없음: {coverage_path}", file=sys.stderr)
        sys.exit(1)

    print(f"파싱: {route_map_path}")
    route_pairs = parse_route_map(route_map_path)
    print(f"  → {len(route_pairs)}개 라우트 페어")

    print(f"파싱: {coverage_path}")
    coverage_map = parse_coverage(coverage_path)
    print(f"  → {len(coverage_map)}개 커버리지 항목")

    pairs = build_pairs(route_pairs, coverage_map)
    summary = summarize(pairs)

    output = {
        "_generated": "route-pair-builder.py",
        "_sources": {
            "routeMap": str(route_map_path),
            "coverage": str(coverage_path),
        },
        "summary": summary,
        "pairs": pairs,
    }

    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(output, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"\n출력: {output_path}")
    print(f"요약: {json.dumps(summary, ensure_ascii=False)}")

    # R5 필터 예시 출력
    covered = [p for p in pairs if p["coverageStatus"] == "COVERED"]
    print(f"\n▶ COVERED (테스트 대상): {len(covered)}건")
    partial = [p for p in pairs if p["coverageStatus"] == "PARTIAL"]
    if partial:
        print(f"▶ PARTIAL (별도 섹션): {len(partial)}건")
    missing = [p for p in pairs if p["coverageStatus"] in ("MISSING", "UNKNOWN")]
    if missing:
        print(f"▶ MISSING/UNKNOWN (스킵): {len(missing)}건")


if __name__ == "__main__":
    main()
