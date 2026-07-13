#!/usr/bin/env python3
"""
cu-runner.py — Anthropic Computer Use runner for /site-deep-analyze
AD-59: 시나리오 기반 인터랙티브 사이트 분석
"""
import argparse
import gc
import json
import os
import re
import sys
from pathlib import Path

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

AVG_SCREENSHOT_TOKENS = 1568   # Anthropic vision token estimate
AVG_RESPONSE_TOKENS = 500
PRICE_INPUT_PER_MTOK = 3.0     # claude-sonnet-4-6 input $/MTok
PRICE_OUTPUT_PER_MTOK = 15.0   # claude-sonnet-4-6 output $/MTok
DEFAULT_MAX_COST = 5.0
DEFAULT_MAX_ACTIONS = 50

# PII detection patterns
PII_PATTERNS = [
    "credit card", "ssn", "social security", "bank account",
    "cvv", "routing number", "신용카드", "계좌번호", "주민등록",
]

# C-1: Payment screen detection patterns
PAYMENT_PATTERNS = [
    "checkout", "결제", "payment", "주문하기", "pay now", "buy now",
    "place order", "submit payment", "purchase", "complete order",
    "결제하기", "구매하기",
]

# C-3: Token redact patterns
TOKEN_PATTERNS = [
    r"Bearer\s+\S+",
    r"sk-[A-Za-z0-9]{40,}",
    r"glpat-\S+",
    r"ghp_\S+",
    r"(?i)api[_\s-]?key[:\s=]+\S+",
]

# H-4: Output dir from environment variable
DEFAULT_OUTPUT_DIR = os.environ.get(
    "FORGE_CU_OUTPUT_DIR",
    str(Path.home() / "forge-outputs" / "05-design" / "site-analysis" / "cu-output"),
)

# ---------------------------------------------------------------------------
# Cost estimation
# ---------------------------------------------------------------------------

def estimate_cost(max_actions: int) -> float:
    total_input = max_actions * AVG_SCREENSHOT_TOKENS
    total_output = max_actions * AVG_RESPONSE_TOKENS
    cost_input = total_input / 1_000_000 * PRICE_INPUT_PER_MTOK
    cost_output = total_output / 1_000_000 * PRICE_OUTPUT_PER_MTOK
    return cost_input + cost_output


# ---------------------------------------------------------------------------
# Credential extraction (env:// format only)
# ---------------------------------------------------------------------------

def extract_credentials(cred_spec: str) -> dict:
    """env://VAR_NAME 형식만 허용. raw 자격증명 인자 차단."""
    if not cred_spec:
        return {}
    if not cred_spec.startswith("env://"):
        print(f"BLOCKED: 자격증명은 env://VAR_NAME 형식만 허용. raw 인자 차단.", file=sys.stderr)
        sys.exit(2)
    var_name = cred_spec[len("env://"):]
    value = os.environ.get(var_name, "")
    if not value:
        print(f"WARN: 환경변수 {var_name} 미설정 또는 빈 값", file=sys.stderr)
    creds = {"raw": value}
    return creds


# ---------------------------------------------------------------------------
# PII detection
# ---------------------------------------------------------------------------

def detect_pii(text: str) -> bool:
    text_lower = text.lower()
    return any(p in text_lower for p in PII_PATTERNS)


# ---------------------------------------------------------------------------
# C-1: Payment screen detection
# ---------------------------------------------------------------------------

def detect_payment_screen(action_block) -> bool:
    """action_block에서 텍스트 추출 후 결제 키워드 매칭."""
    text = json.dumps(action_block) if isinstance(action_block, (dict, list)) else str(action_block)
    text_lower = text.lower()
    return any(p.lower() in text_lower for p in PAYMENT_PATTERNS)


# ---------------------------------------------------------------------------
# C-3: Token redact
# ---------------------------------------------------------------------------

def redact_text(text: str) -> str:
    """토큰·자격증명 패턴을 [REDACTED]로 치환."""
    for pattern in TOKEN_PATTERNS:
        text = re.sub(pattern, "[REDACTED]", text)
    return text


def redact_actions(actions: list) -> list:
    """actions 리스트 내 모든 string 값에 redact_text 적용."""
    def _r(obj):
        if isinstance(obj, str):
            return redact_text(obj)
        if isinstance(obj, dict):
            return {k: _r(v) for k, v in obj.items()}
        if isinstance(obj, list):
            return [_r(item) for item in obj]
        return obj
    return [_r(a) for a in actions]


# ---------------------------------------------------------------------------
# Main runner
# ---------------------------------------------------------------------------

def _log_cache_stats(source: str, model: str, cache_read: int, cache_creation: int, raw_input: int, phase: str = "cu-runner") -> None:
    """AD-105: cache hit 통계를 $HOME/.claude/cache-stats.jsonl에 기록 (H2 wiring: phase 파라미터 추가)."""
    import subprocess, shutil
    logger = shutil.which("cache-stats-logger.sh") or os.path.expanduser("$HOME/.claude/scripts/cache-stats-logger.sh")
    if os.path.isfile(logger):
        subprocess.run(
            ["/bin/bash", logger, source, model, str(cache_read), str(cache_creation), str(raw_input), phase],
            capture_output=True,
        )


def run_cu(scenario: str, output_dir: Path, max_cost: float, max_actions: int,
           credentials: str | None, dry_run: bool) -> None:
    """Computer Use 시나리오 실행."""

    # 시나리오 검증
    if not scenario or len(scenario.strip()) < 5:
        print("STOP: 시나리오 텍스트 불명확. 구체적인 단계를 명시하세요.", file=sys.stderr)
        sys.exit(2)

    # PII 감지
    if detect_pii(scenario):
        print("STOP: 시나리오에 PII 의심 키워드 감지. 계좌·SSN·신용카드 정보 입력 금지.", file=sys.stderr)
        sys.exit(2)

    # C-2: 자동 로그아웃 주입 (자격증명 사용 + logout 키워드 없는 경우)
    if credentials and "logout" not in scenario.lower() and "로그아웃" not in scenario:
        scenario = scenario + "\n\n시나리오 완료 후 반드시 로그아웃 버튼을 클릭하여 세션을 종료하세요."

    # 비용 estimate
    estimated = estimate_cost(max_actions)
    print(f"INFO: 예상 비용 = ${estimated:.4f} USD (max_actions={max_actions}, max_cost=${max_cost})")

    if estimated > max_cost:
        print(f"STOP: 예상 비용 ${estimated:.4f} > max-cost ${max_cost}. --max-cost 또는 --max-actions 조정 필요.", file=sys.stderr)
        sys.exit(1)

    if dry_run:
        print("INFO: dry-run 모드. 실제 API 호출 X.")
        print(json.dumps({
            "mode": "dry-run",
            "scenario": scenario[:80],
            "estimated_cost_usd": round(estimated, 4),
            "max_cost_usd": max_cost,
            "max_actions": max_actions,
            "output_dir": str(output_dir),
        }, indent=2, ensure_ascii=False))
        return

    # API key 확인
    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        print("FAIL: ANTHROPIC_API_KEY 환경변수 미설정", file=sys.stderr)
        sys.exit(1)

    # 자격증명 추출 (env:// only)
    creds = {}
    if credentials:
        creds = extract_credentials(credentials)

    # H-5: Anthropic SDK 설치 확인
    try:
        import anthropic
    except ImportError:
        print("FAIL: anthropic Python SDK 미설치", file=sys.stderr)
        print("설치: pip3 install anthropic", file=sys.stderr)
        sys.exit(1)

    client = anthropic.Anthropic(api_key=api_key)

    try:
        output_dir.mkdir(parents=True, exist_ok=True)
        actions = []
        actual_cost = 0.0

        # AD-112: Messages API system insert — 안전 경계 명시
        # root-cause: system 파라미터 없음 = 모델이 안전 경계 컨텍스트 없이 시작
        system_prompt = (
            "You are a browser automation agent. Follow the scenario steps exactly. "
            "Never access payment screens, personal data, or credentials. "
            "If you detect a payment or PII screen, stop immediately."
        )
        print(f"INFO: system prompt set ({len(system_prompt)} chars)")

        response = client.beta.messages.create(
            model="claude-3-5-sonnet-20241022",  # CU beta requires this model
            max_tokens=4096,
            system=system_prompt,
            tools=[{
                "type": "computer_20241022",
                "name": "computer",
                "display_width_px": 1920,
                "display_height_px": 1080,
                "cache_control": {"type": "ephemeral"},
            }],
            messages=[{"role": "user", "content": scenario}],
            betas=["computer-use-2024-10-22", "prompt-caching-2024-07-31"],
        )

        for block in response.content:
            if actual_cost > max_cost:
                print(f"STOP: 실제 비용 ${actual_cost:.4f} > max-cost ${max_cost}")
                break
            if len(actions) >= max_actions:
                print(f"STOP: 액션 수 {len(actions)} >= max-actions {max_actions}")
                break
            action_data = block.model_dump() if hasattr(block, "model_dump") else str(block)
            # C-1: 결제 화면 감지 → exit 3
            if detect_payment_screen(action_data):
                print("STOP: 결제 화면 감지. 결제 진행 금지 (Human 확인 필요).", file=sys.stderr)
                (output_dir / "actions.json").write_text(
                    json.dumps(redact_actions(actions), indent=2, ensure_ascii=False), encoding="utf-8"
                )
                (output_dir / "status.json").write_text(
                    json.dumps({"status": "payment_stop"}, indent=2), encoding="utf-8"
                )
                sys.exit(3)
            actions.append(action_data)

        # 실제 비용 계산 (usage 정보) + cache stats 로깅
        if hasattr(response, "usage"):
            u = response.usage
            actual_cost = (
                getattr(u, "input_tokens", 0) / 1_000_000 * PRICE_INPUT_PER_MTOK +
                getattr(u, "output_tokens", 0) / 1_000_000 * PRICE_OUTPUT_PER_MTOK
            )
            cache_read = getattr(u, "cache_read_input_tokens", 0) or 0
            cache_creation = getattr(u, "cache_creation_input_tokens", 0) or 0
            raw_input = getattr(u, "input_tokens", 0) or 0
            _log_cache_stats("cu-runner", "claude-3-5-sonnet-20241022",
                             cache_read, cache_creation, raw_input)

        # 결과 저장 (C-3: redact 적용)
        (output_dir / "actions.json").write_text(
            json.dumps(redact_actions(actions), indent=2, ensure_ascii=False), encoding="utf-8"
        )
        (output_dir / "cost.json").write_text(
            json.dumps({
                "estimated_usd": round(estimated, 4),
                "actual_usd": round(actual_cost, 4),
                "actions_count": len(actions),
            }, indent=2),
            encoding="utf-8",
        )
        print(f"완료: {len(actions)} 액션, 실제 비용 ${actual_cost:.4f} USD")

    finally:
        # 자격증명 즉시 제거
        if creds:
            del creds
            gc.collect()


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def main() -> None:
    parser = argparse.ArgumentParser(
        description="Anthropic Computer Use runner for site-deep-analyze (AD-59)\n"
                    "주의: scenario 내 env:// 토큰은 자동 치환 안 됨 — 사용자 쉘 확장 필수. "
                    "자격증명은 --credentials env://VAR_NAME 형식으로 별도 전달. (AD-72)"
    )
    # C-4: mutually exclusive scenario/scenario-file
    scenario_group = parser.add_mutually_exclusive_group(required=True)
    scenario_group.add_argument("--scenario", help="시나리오 텍스트")
    scenario_group.add_argument("--scenario-file", dest="scenario_file", help="시나리오 파일 경로 (.md)")
    parser.add_argument("--max-cost", dest="max_cost", type=float, default=DEFAULT_MAX_COST,
                        help=f"최대 비용 USD (default={DEFAULT_MAX_COST})")
    parser.add_argument("--max-actions", dest="max_actions", type=int, default=DEFAULT_MAX_ACTIONS,
                        help=f"최대 액션 수 (default={DEFAULT_MAX_ACTIONS})")
    parser.add_argument("--credentials", help="자격증명 (env://VAR_NAME 형식만)")
    parser.add_argument("--output-dir", dest="output_dir",
                        default=DEFAULT_OUTPUT_DIR,
                        help="결과 저장 경로")
    parser.add_argument("--dry-run", dest="dry_run", action="store_true",
                        help="estimate만 출력, 실제 API 호출 X")
    # C-5: --cu 제거 (script 단독 = 항상 CU 모드. --cu 의미는 wrapper level에서만)

    args = parser.parse_args()

    # 시나리오 파일 우선
    scenario = args.scenario
    if args.scenario_file:
        sf = Path(args.scenario_file)
        if not sf.exists():
            print(f"FAIL: scenario-file 없음: {sf}", file=sys.stderr)
            sys.exit(1)
        scenario = sf.read_text(encoding="utf-8")

    run_cu(
        scenario=scenario,
        output_dir=Path(args.output_dir),
        max_cost=args.max_cost,
        max_actions=args.max_actions,
        credentials=args.credentials,
        dry_run=args.dry_run,
    )


if __name__ == "__main__":
    main()
