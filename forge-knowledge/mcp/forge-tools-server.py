#!/usr/bin/env python3
"""
Forge Tools MCP Server
Managed Agents(Anthropic 클라우드)가 로컬 Forge 리소스에 접근하는 브리지.

실행:
  python3 forge-tools-server.py          # SSE 모드 (HTTP, 포트 8765)
  python3 forge-tools-server.py stdio    # stdio 모드 (로컬 Claude Code)

환경변수:
  FORGE_MCP_TOKEN  인증 토큰. **http 모드에서는 필수** — 미설정이면 서버가 기동을 거부한다.
                   클라이언트는 매 요청에 `X-Forge-Token: <토큰>` 헤더를 넣어야 한다.
                   stdio 모드는 HTTP 헤더 자체가 없으므로 이 토큰을 요구하지 않는다.
                   발급: bash shared/scripts/forge-mcp-token.sh
  FORGE_MCP_HOST   http 바인딩 주소 (기본: 127.0.0.1 — cloudflared 터널만 붙는 전제)
  FORGE_OUTPUTS    forge-outputs 경로 (기본: ~/forge-outputs)
  FORGE_ROOT       forge 루트 경로 (기본: ~/forge)
"""

import hmac
import os
import re
import sys
import time
import subprocess
from pathlib import Path
from typing import Optional
# root-cause: MCP 파라미터 검증 추가 (AD-161 v2 후속 — run_script arg injection + git_commit traversal)

from fastmcp import FastMCP

# root-cause: 2026-08-27 — 17개 도구 전량 무기록 + 터널 레인은 로컬 훅이 못 본다(P0 #6 잔여 절반).
sys.path.insert(0, str(Path(__file__).parent))
import mcp_audit

# ── 경로 설정 ──────────────────────────────────────────────────────────────
HOME = Path.home()
FORGE_OUTPUTS = Path(os.environ.get("FORGE_OUTPUTS", HOME / "forge-outputs"))
FORGE_ROOT = Path(os.environ.get("FORGE_ROOT", HOME / "forge"))
FORGE_MCP_TOKEN = os.environ.get("FORGE_MCP_TOKEN", "")
# 기본 바인딩을 0.0.0.0 → 127.0.0.1 로 좁힌다. cloudflared 는 localhost 로 붙으므로
# 터널 레인은 그대로 살고, LAN 에 열려 있던 문(門)만 닫힌다.
FORGE_MCP_HOST = os.environ.get("FORGE_MCP_HOST", "127.0.0.1")

# root-cause: AD-106 MCP-SEC — .env 자동 로드 = 파일 변조 시 토큰 오염 위험. shell env 직접 설정 필요.
# (구) telegram-workspace .env 자동 로드 제거됨.

# 실행 허용 스크립트 화이트리스트
ALLOWED_SCRIPTS = {
    "forge-codebase-health.sh": FORGE_ROOT / "shared/scripts/forge-codebase-health.sh",
    "md-to-docx.py": FORGE_ROOT / "shared/scripts/md-to-docx.py",
    "rag-search.py": FORGE_ROOT / "shared/scripts/rag/search.py",
    "workspace-build.sh": FORGE_ROOT / "shared/scripts/rag/workspace-build.sh",
    "lightrag-pilot.py": FORGE_ROOT / "shared/scripts/lightrag-pilot.py",
    "wiki-sync.sh": FORGE_ROOT / "shared/scripts/wiki-sync.sh",
}

# 접근 금지 경로
BLOCKED_PATHS = ["06-finance", "07-legal", "08-admin/insurance", "08-admin/freelancers"]

mcp = FastMCP("forge-tools")


# ── 감사 미들웨어 ──────────────────────────────────────────────────────────
# 도구 17개에 데코레이터를 하나씩 붙이지 않고 여기 1곳만 두는 이유:
# 앞으로 추가될 도구가 조용히 무기록으로 태어나는 것을 막는다.
try:
    from fastmcp.server.middleware import Middleware

    class _AuditMiddleware(Middleware):
        async def on_call_tool(self, context, call_next):
            t0 = time.monotonic()
            msg = getattr(context, "message", None)
            name = getattr(msg, "name", "?")
            args = getattr(msg, "arguments", None) or {}
            try:
                result = await call_next(context)
            except Exception as exc:
                mcp_audit.log_call(name, args, False, err=repr(exc),
                                   dur_ms=int((time.monotonic() - t0) * 1000))
                raise  # 원 예외를 반드시 되던진다 — 안 그러면 실패가 성공으로 둔갑한다
            mcp_audit.log_call(name, args, True,
                               dur_ms=int((time.monotonic() - t0) * 1000))
            return result

    mcp.add_middleware(_AuditMiddleware())
except Exception as _audit_exc:  # fastmcp 버전차 등 — 기록을 못 붙여도 서버는 뜬다(AD-168)
    print(f"[forge-tools] WARN: 감사 미들웨어 미배선 ({_audit_exc!r}) — 호출 기록 없음", file=sys.stderr)


# ── 인증 미들웨어 ──────────────────────────────────────────────────────────
# 이 서버는 cloudflared 터널로 인터넷에 열린다(forge-mcp-service.sh). 그 문 앞에 파일 쓰기·
# git 커밋·스크립트 실행 도구가 17개 서 있는데 2026-08-27 까지 **문지기가 없었다** —
# 배너만 "인증: 활성화"라고 찍고 헤더를 검증하는 코드는 0곳이었다.
#
# ⚠️ 여기는 AD-168 fail-open 의 예외다. 감사(위)는 장부를 못 적어도 손님을 들이지만,
#    인증은 신분증 확인이 깨지면 **돌려보낸다**. 검증 도중 어떤 예외가 나도 거부다.
#
# 이 방어가 무력화되는 입력: **유효한 토큰을 손에 넣은 요청**. 헤더 값이 맞기만 하면
#   출처가 어디든(터널 너머 임의의 IP, 유출된 토큰을 재사용하는 제3자) 통과한다.
#   토큰은 bearer 자격증명이라 요청자를 구분하지 못한다 — 유출 시 즉시 재발급이 유일한 대응이다.
#
# ⚠️ 이 미들웨어가 덮지 않는 것(알고 남기는 경계):
#   - `on_notification` 경로. MCP 스펙상 도구 실행은 request(`tools/call`)뿐이라 알림으로는
#     도구가 돌지 않는다. 대칭성보다 표면적을 좁히는 쪽을 택했다.
#   - `@custom_route`(health 엔드포인트 등). fastmcp 미들웨어는 JSON-RPC 레벨이라 그 경로는
#     아예 지나지 않는다. 현재 이 서버에 custom_route 는 0곳이다 —
#     재현: `grep -c custom_route shared/mcp/forge-tools-server.py`. **추가하면 그 순간 갭이 된다.**
#
# 토큰을 받는 헤더가 둘인 이유: Managed Agent(Anthropic 클라우드)는 MCP 서버 설정에
#   `authorization_token` 만 넣을 수 있고 그것이 `Authorization: Bearer <토큰>` 으로 나간다
#   (anthropic SDK 0.113.0 `BetaRequestMCPServerURLDefinitionParam` 필드 실측 — 커스텀 헤더 불가).
#   `X-Forge-Token` 만 받으면 이 서버의 **존재 이유인 레인이 통째로 막힌다**.
_AUTH_HEADER = "x-forge-token"
_AUTH_WIRED = False

try:
    from fastmcp.exceptions import AuthorizationError
    from fastmcp.server.dependencies import get_http_request
    from fastmcp.server.middleware import Middleware as _AuthMiddlewareBase

    def _http_request_or_none():
        """현재 요청의 HTTP 컨텍스트. stdio·in-memory 면 None.

        get_http_request() 는 HTTP 컨텍스트가 없을 때만 RuntimeError 를 던진다.
        그 외 예외는 삼키지 않고 올려보낸다 — 호출부가 거부로 처리해야 하기 때문이다.
        """
        try:
            return get_http_request()
        except RuntimeError:
            return None

    def _serving_http() -> bool:
        """이 프로세스가 http 서버로 떠 있는가. __main__ 이 기동 시 env 에 심는다.

        요청 시점에 읽는다(import 시점 고정 X) — 테스트가 레인을 갈아끼울 수 있어야 한다.
        """
        return os.environ.get("FORGE_MCP_TRANSPORT") == "http"

    def _presented_token(request) -> str:
        """요청이 제시한 토큰. 두 형식을 받는다(둘 다 없으면 빈 문자열).

        `X-Forge-Token: <토큰>`        — 직접 붙는 클라이언트
        `Authorization: Bearer <토큰>` — Managed Agent (커스텀 헤더를 못 보낸다)
        """
        direct = request.headers.get(_AUTH_HEADER, "")
        if direct:
            return direct
        authz = request.headers.get("authorization", "")
        scheme, _, value = authz.partition(" ")
        return value.strip() if scheme.lower() == "bearer" else ""

    class _AuthMiddleware(_AuthMiddlewareBase):
        # on_call_tool 이 아니라 on_request 에 건다 — tools/call 뿐 아니라 initialize·
        # tools/list·resources/read 까지 한 지점에서 덮기 위해서다.
        async def on_request(self, context, call_next):
            try:
                request = _http_request_or_none()
                if request is None:
                    # 컨텍스트가 없다 = stdio·in-memory 레인(함정 #1: 무영향).
                    # ⚠️ 단 **http 로 떠 있는 프로세스**에서 컨텍스트가 없는 것은 정상이 아니다.
                    #    "없으니 신뢰 레인"으로 읽으면 fastmcp 가 어떤 HTTP 경로에서 컨텍스트를
                    #    심지 않게 되는 순간 그 경로가 조용히 무인증 통과한다 — fail-open 방향이다.
                    #    그래서 http 프로세스에서는 컨텍스트 부재를 **이상 신호로 보고 거부**한다.
                    if _serving_http():
                        raise AuthorizationError(
                            "unauthorized: http 레인인데 요청 컨텍스트가 없습니다"
                        )
                else:
                    presented = _presented_token(request)
                    # compare_digest = 상수시간 비교. `==` 는 앞자리부터 틀린 위치가
                    # 응답 시간에 새어나가 토큰을 한 글자씩 맞출 수 있다.
                    if not FORGE_MCP_TOKEN or not hmac.compare_digest(
                        presented.encode("utf-8"), FORGE_MCP_TOKEN.encode("utf-8")
                    ):
                        # 토큰 값·기대값을 절대 찍지 않는다(LN-03).
                        raise AuthorizationError(
                            "unauthorized: X-Forge-Token(또는 Authorization: Bearer) 헤더가 "
                            "없거나 올바르지 않습니다"
                        )
            except AuthorizationError:
                self._audit_denial(context)
                raise
            except Exception as exc:  # fail-closed — 검증이 깨지면 통과가 아니라 거부다
                self._audit_denial(context)
                raise AuthorizationError(
                    f"unauthorized: 인증 검증 실패 ({type(exc).__name__})"
                ) from exc
            return await call_next(context)

        @staticmethod
        def _audit_denial(context) -> None:
            """거부를 장부에 직접 남긴다.

            감사 미들웨어는 tools/call 만 본다. 그런데 인증은 initialize 부터 막으므로
            거부된 요청은 대개 tools/call 에 닿지도 못한다 — 그러면 제일 보고 싶은 줄
            (누가 문을 두드렸다)이 통째로 사라진다. 그래서 여기서 직접 적는다.
            제시된 토큰 값은 적지 않는다(LN-03 — 오타 토큰도 시크릿일 수 있다).
            """
            mcp_audit.log_call(
                f"auth-denied:{getattr(context, 'method', '?')}", {}, False,
                err="unauthorized: X-Forge-Token missing or invalid",
            )

    # 감사 미들웨어 **뒤에** 등록한다. fastmcp 는 먼저 등록된 것이 바깥이라,
    # 이 순서라야 인증 거부가 감사 장부에 ok=false 로 남는다(거부된 호출이 제일 중요한 줄이다).
    mcp.add_middleware(_AuthMiddleware())
    _AUTH_WIRED = True
except Exception as _auth_exc:
    # 여기서 서버를 죽이지 않는 이유: stdio 레인은 인증 대상이 아니라 계속 떠야 한다.
    # http 레인은 아래 __main__ 에서 _AUTH_WIRED 를 보고 기동을 거부한다.
    print(f"[forge-tools] WARN: 인증 미들웨어 미배선 ({_auth_exc!r})", file=sys.stderr)


# ── 보안 헬퍼 ──────────────────────────────────────────────────────────────

def _safe_outputs_path(path: str) -> Path:
    """경로 안전성 검증 — forge-outputs 외부 및 금지 경로 차단"""
    full = (FORGE_OUTPUTS / path).resolve()
    if not str(full).startswith(str(FORGE_OUTPUTS.resolve())):
        raise PermissionError(f"forge-outputs 외부 접근 불가: {path}")
    for blocked in BLOCKED_PATHS:
        if blocked in str(full):
            raise PermissionError(f"접근 금지 경로: {blocked}")
    return full


# root-cause: run_script args 미검증 = shell injection 가능 (script whitelist만으로 부족, args 통해 임의 실행)
_DANGEROUS_ARG_RE = re.compile(r'[;&|`<>()\n\\]|\$\(|\$\{')


def _validate_run_script_args(args: list) -> None:
    # root-cause: eval/subprocess 에 args 직전 검증 — injection 차단
    for a in (args or []):
        if _DANGEROUS_ARG_RE.search(str(a)):
            raise PermissionError(
                f"run_script: unsafe arg (shell metachar detected): {str(a)!r}"
            )


def _validate_commit_message(message: str) -> None:
    # root-cause: message 길이 무제한 = git history 오염 가능. null byte = git 커맨드 파싱 버그
    if len(message) > 2000:
        raise ValueError(
            f"git_commit: message too long ({len(message)} chars, max 2000)"
        )
    if '\x00' in message:
        raise ValueError("git_commit: null byte in message")


def _validate_commit_files(files: list) -> None:
    # root-cause: files에 '../' 포함 시 프로젝트 외부 파일 스테이징 가능 (path traversal)
    for f in (files or []):
        parts = Path(str(f)).parts
        if '..' in parts:
            raise PermissionError(f"git_commit: path traversal in file: {str(f)!r}")
        if str(f).startswith('/') or str(f).startswith('~'):
            raise PermissionError(f"git_commit: absolute path not allowed: {str(f)!r}")


# 시크릿 마스킹은 shared/scripts/secret_mask.py 가 **단일 정의**로 소유한다.
# root-cause(2026-08-14 cr-triple 3회차 HIGH): 여기에 2패턴짜리 축소판을 새로 짰는데,
#   같은 레포에 이미 11패턴 유틸이 있었다(validate-evals.py) — 재사용 사다리 ② 위반이고,
#   더 넓은 패턴이 필요한 자리에서 더 좁은 것을 고른 셈이었다. 합집합 모듈로 합쳤다.
sys.path.insert(0, str(FORGE_ROOT / "shared/scripts"))
try:
    from secret_mask import mask_secrets as _mask_secrets
except ImportError:  # 모듈 부재 시에도 노출을 막는다 — 마스킹 없이 통과시키지 않는다(fail-closed)
    def _mask_secrets(text):
        return "***(마스킹 모듈 부재 — 원문 보류)" if text else text


# ── 파일 도구 ──────────────────────────────────────────────────────────────

@mcp.tool()
def read_file(path: str) -> str:
    """forge-outputs/ 파일 읽기.

    Args:
        path: forge-outputs/ 기준 상대 경로 (예: "01-research/ai-report/2026-04-10.md")
    """
    full = _safe_outputs_path(path)
    if not full.exists():
        raise FileNotFoundError(f"파일 없음: {path}")
    return full.read_text(encoding="utf-8")


@mcp.tool()
def write_file(path: str, content: str) -> str:
    """forge-outputs/ 파일 쓰기.

    Args:
        path: forge-outputs/ 기준 상대 경로
        content: 파일 내용
    """
    full = _safe_outputs_path(path)
    full.parent.mkdir(parents=True, exist_ok=True)
    full.write_text(content, encoding="utf-8")
    return f"저장 완료: {path} ({len(content):,}자)"


@mcp.tool()
def list_files(path: str = "", pattern: str = "*") -> str:
    """forge-outputs/ 디렉토리 탐색.

    Args:
        path: forge-outputs/ 기준 상대 경로 (기본: 루트)
        pattern: glob 패턴 (기본: "*")
    """
    base = _safe_outputs_path(path) if path else FORGE_OUTPUTS
    if not base.is_dir():
        raise NotADirectoryError(f"디렉토리 아님: {path}")
    files = sorted(base.glob(pattern))
    lines = []
    for f in files[:100]:  # 최대 100개
        rel = f.relative_to(FORGE_OUTPUTS)
        mark = "/" if f.is_dir() else ""
        lines.append(f"{rel}{mark}")
    result = "\n".join(lines)
    if len(files) > 100:
        result += f"\n... (총 {len(files)}개 중 100개 표시)"
    return result or "(파일 없음)"


@mcp.tool()
def append_file(path: str, content: str) -> str:
    """forge-outputs/ 파일에 내용 추가 (기존 내용 보존).

    Args:
        path: forge-outputs/ 기준 상대 경로
        content: 추가할 내용
    """
    full = _safe_outputs_path(path)
    full.parent.mkdir(parents=True, exist_ok=True)
    with open(full, "a", encoding="utf-8") as f:
        f.write(content)
    return f"추가 완료: {path}"


# ── Git 도구 ──────────────────────────────────────────────────────────────

@mcp.tool()
def git_status(project: str = "forge") -> str:
    """프로젝트 git 상태 확인.

    Args:
        project: 프로젝트명 ("forge", "portfolio", "godblade") 또는 절대 경로
    """
    project_paths = {
        "forge": FORGE_ROOT,
        "portfolio": HOME / "mywsl_workspace/portfolio-project",
        "godblade": Path("/mnt/e/new_workspace/god_Sword/src"),
    }
    cwd = project_paths.get(project, Path(project))
    if not cwd.exists():
        raise FileNotFoundError(f"프로젝트 경로 없음: {cwd}")
    result = subprocess.run(
        ["git", "status", "--short", "--branch"],
        cwd=cwd, capture_output=True, text=True, timeout=30
    )
    return result.stdout or "(변경사항 없음)"


@mcp.tool()
def git_commit(project: str, message: str, files: Optional[list[str]] = None) -> str:
    """프로젝트 파일 git 커밋.

    Args:
        project: 프로젝트명 또는 절대 경로
        message: 커밋 메시지 (Conventional Commits 형식 권장)
        files: 커밋할 파일 목록 (None이면 변경된 파일 전체)
    """
    project_paths = {
        "forge": FORGE_ROOT,
        "forge-outputs": FORGE_OUTPUTS,
        "portfolio": HOME / "mywsl_workspace/portfolio-project",
        "godblade": Path("/mnt/e/new_workspace/god_Sword/src"),
    }
    cwd = project_paths.get(project, Path(project))
    if not cwd.exists():
        raise FileNotFoundError(f"프로젝트 경로 없음: {cwd}")

    # root-cause: message/files 미검증 = 커밋 메시지 인젝션 + path traversal로 외부 파일 스테이징
    _validate_commit_message(message)
    _validate_commit_files(files)

    # Stage
    if files:
        subprocess.run(["git", "add"] + files, cwd=cwd, check=True, timeout=30)
    else:
        subprocess.run(["git", "add", "-A"], cwd=cwd, check=True, timeout=30)

    # Commit
    full_message = f"{message}\n\nCo-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"  # root-cause: model version bump — trailer identity → Sonnet 5 (D1)
    result = subprocess.run(
        ["git", "commit", "-m", full_message],
        cwd=cwd, capture_output=True, text=True, timeout=60
    )
    if result.returncode != 0:
        return f"커밋 실패: {result.stderr}"
    return f"커밋 완료: {result.stdout.strip()}"


@mcp.tool()
def git_log(project: str = "forge", n: int = 10) -> str:
    """최근 커밋 로그 확인.

    Args:
        project: 프로젝트명
        n: 표시할 커밋 수 (기본 10)
    """
    project_paths = {
        "forge": FORGE_ROOT,
        "forge-outputs": FORGE_OUTPUTS,
    }
    cwd = project_paths.get(project, FORGE_ROOT)
    result = subprocess.run(
        ["git", "log", f"--oneline", f"-{n}"],
        cwd=cwd, capture_output=True, text=True, timeout=30
    )
    return result.stdout or "(커밋 없음)"


# ── 스크립트 실행 도구 ──────────────────────────────────────────────────────

@mcp.tool()
def run_script(script_name: str, args: list[str] = []) -> str:
    """허용된 Forge 스크립트 실행 (화이트리스트 방식).

    Args:
        script_name: 스크립트명 (예: "forge-codebase-health.sh")
        args: 스크립트 인자 목록

    허용 스크립트:
        forge-codebase-health.sh  — Git 코드베이스 건강도 진단
        md-to-docx.py             — 마크다운 → DOCX 변환
        rag-search.py             — RAG 검색
        workspace-build.sh        — RAG 인덱스 빌드
    """
    if script_name not in ALLOWED_SCRIPTS:
        raise PermissionError(
            f"허용되지 않은 스크립트: {script_name}\n"
            f"허용 목록: {', '.join(ALLOWED_SCRIPTS.keys())}"
        )
    script_path = ALLOWED_SCRIPTS[script_name]
    if not script_path.exists():
        raise FileNotFoundError(f"스크립트 없음: {script_path}")

    # root-cause: args 미검증 = script whitelist 우회해 shell metachar로 임의 명령 실행 가능
    _validate_run_script_args(args)

    cmd = ["python3" if str(script_path).endswith(".py") else "bash",
           str(script_path)] + args
    result = subprocess.run(
        cmd, capture_output=True, text=True, timeout=600, cwd=FORGE_ROOT
    )
    output = result.stdout
    if result.returncode != 0:
        output += f"\n[STDERR]\n{result.stderr}"
    return output or "(출력 없음)"


@mcp.tool()
def rag_search(query: str, top_k: int = 5) -> str:
    """[ALIAS → unified_search] forge-outputs RAG 하이브리드 검색 (워크스페이스 RAG, 벡터+BM25).

    ADR-174 Phase 2 이후: unified_search 사용 권장. 이 alias는 30일 무호출 경과 시 deprecated.
    일반 검색·"어디 있었지?" 류 질문에 빠르게 답한다. 6K+ 문서 광범위 인덱스.

    Args:
        query: 검색 쿼리
        top_k: 반환할 결과 수 (기본 5)
    """
    # root-cause: backward-compat alias — 기존 호출 보존 (ADR-174 §KD5 만료정책)
    return run_script("rag-search.py", [query, "--top-k", str(top_k)])


@mcp.tool()
def wiki_search(query: str, mode: str = "hybrid") -> str:
    """[ALIAS → unified_search] Karpathy 3-layer 개인 지식 위키 검색 (LightRAG, 그래프 기반).

    ADR-174 Phase 2 이후: unified_search(context_filter='wiki') 사용 권장.
    이 alias는 30일 무호출 경과 시 deprecated.

    개념 간 관계, "왜/어떻게" 류 심층 질문에 강함. forge-outputs/20-wiki의
    Wiki Layer만 검색하며, 엔티티+관계 그래프를 활용해 추론한다.

    rag_search와 차이:
    - rag_search: 광범위(6K 문서), 빠른 단순 검색
    - wiki_search: 좁은 셋(수백 노트), 그래프 기반 깊은 추론

    Args:
        query: 검색 쿼리 (한국어 권장)
        mode: 'local' | 'global' | 'hybrid' (기본 hybrid)
    """
    # root-cause: backward-compat alias — ADR-174 §KD5 만료정책 (unified_search(context_filter='wiki') 권장)
    if mode not in ("local", "global", "hybrid"):
        return f"ERROR: mode must be local/global/hybrid, got '{mode}'"
    return run_script(
        "lightrag-pilot.py",
        ["query", query, mode, "--context", "wiki"],
    )


def _rrf_merge(results_lists: list[list[dict]], k: int = 60) -> list[dict]:
    """Reciprocal Rank Fusion — 벡터 엔진 한정 병합.
    # root-cause: ADR-174 Phase 2 — pgvector+FAISS RRF 점수 단일화
    """
    scores: dict[str, float] = {}
    best_meta: dict[str, dict] = {}
    for results in results_lists:
        for rank, item in enumerate(results):
            key = item.get("file_path", "") + "|" + item.get("text", "")[:80]
            scores[key] = scores.get(key, 0.0) + 1.0 / (k + rank + 1)
            if key not in best_meta:
                best_meta[key] = item
    merged = sorted(scores.items(), key=lambda x: x[1], reverse=True)
    return [best_meta[k] for k, _ in merged]


def _retrieval_guard(results: list[dict]) -> list[dict]:
    # root-cause: H-d — BLOCKED_PATHS 부분문자열(4-path, open-ended)→AllowListGuard(fail-closed) 통일
    #   ingest와 동일 default-deny 정책: allow-list 외 경로 전부 차단 (신규 민감경로 자동 보호)
    try:
        from knowledge_store import AllowListGuard
        guard = AllowListGuard()
        return [r for r in results if guard.is_allowed(r.get("file_path", ""))]
    except ImportError:
        # fallback: knowledge_store 미로드 시 기존 BLOCKED_PATHS 로직 유지
        return [r for r in results if not any(b in r.get("file_path", "") for b in BLOCKED_PATHS)]


@mcp.tool()
def unified_search(
    query: str,
    top_k: int = 5,
    context_filter: Optional[str] = None,
    include_code: bool = False,
) -> str:
    """통합 지식 검색 — pgvector(T3)+FAISS(T2) RRF 병합 + AllowListGuard 필터.

    ADR-174 Phase 2: 파편화된 검색(rag_search/wiki_search)을 단일 라우터로 통합.
    FORGE_DB_URL 미설정 시 T2(FAISS)만 사용.

    Args:
        query: 검색 쿼리
        top_k: 결과 수 (기본 5)
        context_filter: 도메인 태그 필터 (예: 'research', 'wiki', 'marketing')
        include_code: True 시 GitNexus 코드 심볼 검색 포함 (별도 라우팅, RRF 제외)
    """
    # root-cause: ADR-174 Phase 2 unified_search 라우터 진입점
    sys.path.insert(0, str(FORGE_ROOT / "shared/scripts/rag"))
    try:
        from knowledge_store import KnowledgeStore
    except ImportError as e:
        return f"ERROR: knowledge_store 로드 실패 — {e}"

    results_lists: list[list[dict]] = []

    # T3 또는 T2 통합 검색 (index_dir=None → KnowledgeStore 기본값 사용)
    # root-cause: idx_dir 변수 미사용 제거
    try:
        ks = KnowledgeStore.from_config()
        t3_or_t2 = ks.search(
            query, top_k=top_k * 2, context_filter=context_filter
        )
        results_lists.append(t3_or_t2)
    except Exception as e:
        results_lists.append([])
        sys.stderr.write(f"[unified_search] KnowledgeStore 오류: {e}\n")

    # T3 활성 시 FAISS T2도 추가 (RRF 블렌드)
    # root-cause(2026-08-14 cr-triple 지적): search.py 가 T3 URL 을 3개 변수에서 해석하도록
    #   바뀌었는데(FORGE_T3_DB_URL > FORGE_DB_URL_SHARED > FORGE_DB_URL) 이 블록은 여전히
    #   `FORGE_DB_URL` 하나만 보고 하나만 지웠다. 그러면 나머지 두 변수가 프로세스 env 에 실리는
    #   순간 "진짜 T2 를 받으려던" 재호출이 **또 T3** 를 타고, RRF 블렌드가 T3+T2 가 아니라
    #   T3+T3 가 되어 다양성 확보라는 설계 의도가 조용히 무너진다. 세 변수를 한 곳에서 다룬다.
    #   ⚠️ 더 깊은 문제: env 에서 변수를 **지워도 소용이 없다.** search.py main() 은 `~/forge/.env` 를
    #   읽어 `os.environ.setdefault()` 로 되채운다 — 지운 변수가 그대로 되살아나므로 "진짜 T2" 재호출은
    #   애초에 성립한 적이 없다. 그래서 변수를 지우는 대신 search.py 가 **문서화한 스위치**
    #   `FORGE_RAG_ENGINE=t2`("T3 시도 자체 생략")를 쓴다. 이건 .env 재로드에 영향받지 않는다.
    # 변수 목록은 t3_url 모듈이 소유한다(SSoT). 여기 하드코딩하면 또 갈린다.
    sys.path.insert(0, str(FORGE_ROOT / "shared/scripts/rag"))
    try:
        from t3_url import T3_URL_VARS as _T3_URL_VARS
    except ImportError:
        _T3_URL_VARS = ("FORGE_T3_DB_URL", "FORGE_DB_URL_SHARED", "FORGE_DB_URL")
    if any(os.environ.get(v) for v in _T3_URL_VARS):
        try:
            # root-cause: C2 — ① --format json→--json(search.py:133 시그니처 정합)
            #                  ② FORGE_RAG_ENGINE=t2 로 진짜 T2 FAISS 결과 획득(.env 재로드 무관)
            #                  ③ startswith 의존→try JSON parse 견고화
            faiss_args = [query, "--top-k", str(top_k * 2), "--json"]
            _validate_run_script_args(faiss_args)
            faiss_env = {k: v for k, v in os.environ.items() if k not in _T3_URL_VARS}
            faiss_env["FORGE_RAG_ENGINE"] = "t2"
            faiss_proc = subprocess.run(
                ["python3", str(ALLOWED_SCRIPTS["rag-search.py"])] + faiss_args,
                capture_output=True, text=True, timeout=120,
                cwd=FORGE_ROOT, env=faiss_env
            )
            import json as _json
            try:
                faiss_results = _json.loads(faiss_proc.stdout)
                if not isinstance(faiss_results, list):
                    faiss_results = []
            except (_json.JSONDecodeError, ValueError):
                faiss_results = []
            results_lists.append(faiss_results)
        except Exception:
            pass  # FAISS 실패 시 T3 결과만 사용

    # RRF 병합 → retrieval guard → dedup → top_k
    merged = _rrf_merge(results_lists)
    safe = _retrieval_guard(merged)

    # root-cause: H4 — file_path 단위 dedup은 동일 파일 다청크 탈락. RRF 키(chunk 단위)와 정합.
    seen_chunks: set[str] = set()
    deduped: list[dict] = []
    for r in safe:
        fp = r.get("file_path", "")
        text_prefix = r.get("text", "")[:80]
        chunk_key = f"{fp}|{text_prefix}" if fp else text_prefix
        if chunk_key not in seen_chunks:
            seen_chunks.add(chunk_key)
            deduped.append(r)
        if len(deduped) >= top_k:
            break

    lines = []
    for i, r in enumerate(deduped, 1):
        lines.append(f"[{i}] {r.get('file_path', '?')}")
        if r.get("text"):
            lines.append(f"    {r['text'][:200]}")
        if r.get("score") is not None:
            lines.append(f"    score={r['score']:.4f}")

    # GitNexus 별도 라우팅 (RRF 제외)
    if include_code:
        lines.append("\n[GitNexus 코드 심볼 검색]")
        # root-cause: H-c — gitnexus-query.py 미등록 시 PermissionError 대신 명시적 미지원 안내
        if "gitnexus-query.py" not in ALLOWED_SCRIPTS:
            lines.append("(미지원 — gitnexus-query.py ALLOWED_SCRIPTS 미등록, MCP gitnexus 도구 직접 사용)")
        else:
            try:
                code_result = run_script("gitnexus-query.py", [query, "--top-k", str(top_k)])
                lines.append(code_result[:500])
            except Exception as e:
                lines.append(f"GitNexus 오류: {e}")

    return "\n".join(lines) if lines else "(결과 없음)"


@mcp.tool()
def run_health_check(project: str = "forge", months: int = 12) -> str:
    """프로젝트 코드베이스 건강도 진단.

    Args:
        project: 프로젝트명 또는 경로
        months: 분석 기간 (개월, 기본 12)
    """
    project_paths = {
        "forge": str(FORGE_ROOT),
        "portfolio": str(HOME / "mywsl_workspace/portfolio-project"),
        "godblade": "/mnt/e/new_workspace/god_Sword/src",
    }
    project_path = project_paths.get(project, project)
    return run_script("forge-codebase-health.sh", [project_path, str(months)])


# root-cause(2026-08-14 실사고): 이 서버의 도구는 forge-outputs 안 파일읽기 + 허용 스크립트
#   6개뿐이라, Managed Agent 는 로컬 하네스(.env·프로세스·터널·인덱스)를 **측정할 수단이 없었다.**
#   그런데 daily/weekly 리포트는 하네스 상태를 단정해서 썼고, 실행한 적 없는 셸 명령을
#   "(결과: 없음)"과 함께 근거로 제시했다 — 전부 추측이었다. 측정 수단이 없으면 추측이 나온다.
#   → 추측을 금지하기 전에 **측정할 수 있게** 해준다. 이 도구가 그 유일한 창구다.
# 보안(LN-03): 값은 절대 반환하지 않는다 — .env 는 **키 이름의 존재 여부(bool)** 만,
#   DB URL·호스트·자격증명·비밀번호는 어떤 형태로도 출력하지 않는다.
@mcp.tool()
def harness_probe() -> str:
    """로컬 Forge 하네스의 **실측** 상태 — 검색 계층(T3/T2)·터널·인덱스 신선도·설정 키 존재.

    daily/weekly 리포트에서 하네스 상태를 언급하려면 **반드시 이 도구를 먼저 호출하고
    그 출력을 인용**한다. 이 도구가 답하지 못하는 항목은 "측정 불가(도구 없음)"로 적는다 —
    셸 명령을 실행한 것처럼 쓰거나, 값을 추측해서 적지 않는다.

    반환에 시크릿은 없다(키 이름의 존재 여부만). 읽기 전용 — 아무 상태도 바꾸지 않는다.
    """
    lines: list[str] = ["# harness_probe (실측)"]

    def sh(cmd: list[str], timeout: int = 20) -> tuple[int, str]:
        try:
            p = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)
            return p.returncode, (p.stdout or p.stderr or "").strip()
        except Exception as e:  # fail-open — 한 항목 실패가 전체를 막지 않는다
            return -1, f"({type(e).__name__})"

    # 1) 검색 계층 — 공용 T3 에 실제로 붙는가(질의 1회 왕복)
    t3 = FORGE_ROOT / "shared/scripts/t3-check.sh"
    if t3.exists():
        _, out = sh(["bash", str(t3)])
        lines.append(f"- 검색계층: {out or '(무출력)'}")
    else:
        lines.append("- 검색계층: 측정 불가(t3-check.sh 없음)")

    # 2) SSH 터널 (공용 DB 는 터널로만 닿는다)
    # 포트를 하드코딩하면 .env 에서 RAG_TUNNEL_LOCAL_PORT 를 바꾼 순간 이 줄만 0개로 오보고한다 —
    # 바로 윗줄이 T3_OK 인데 아랫줄이 "터널 0개"로 모순되면 이 도구의 존재 이유(추측 금지)가 무너진다.
    _tunnel_port = os.environ.get("RAG_TUNNEL_LOCAL_PORT", "15432")
    # env 값이 그대로 정규식에 들어가면 메타문자 하나로 패턴이 깨져 터널 수를 오보고한다.
    rc, out = sh(["pgrep", "-cf", rf"[s]sh.*-L {re.escape(_tunnel_port)}"], timeout=10)
    lines.append(f"- SSH터널 프로세스: {out if out.isdigit() else '0'}개")

    # 3) 로컬 T2 인덱스 신선도 — 강등 시 이 날짜의 지식만 보인다
    idx = Path(os.environ.get("FORGE_RAG_INDEX_DIR", str(FORGE_OUTPUTS / ".rag-index")))
    if idx.exists():
        import datetime as _dt
        # t3-check.sh local_index_build()과 **같은 파일·같은 순서**를 본다.
        # 다른 기준을 쓰면 한 리포트 안에서 날짜가 갈리고(예: 07-07 vs 07-23), 읽는 사람은
        # 어느 쪽이 맞는지 알 수 없다 — 숫자가 어긋나는 순간 리포트 전체 신뢰가 깎인다.
        stamp = "unknown"
        for cand in ("meta.json", "file_hashes.json", "docstore.json"):
            f = idx / cand
            if f.exists():
                stamp = _dt.datetime.fromtimestamp(f.stat().st_mtime).strftime("%Y-%m-%d")
                break
        lines.append(f"- 로컬T2 인덱스: {idx} · 빌드 {stamp} (기준 = t3-check.sh와 동일)")
    else:
        lines.append(f"- 로컬T2 인덱스: 없음 ({idx})")

    # 4) .env 설정 키 — **이름의 존재 여부만**. 값·호스트·비밀번호는 반환하지 않는다.
    env_file = FORGE_ROOT / ".env"
    watched = [
        "FORGE_T3_DB_URL", "FORGE_DB_URL_SHARED", "FORGE_DB_URL", "RAG_DB_HOST", "RAG_DB_PORT",
        "RAG_DB_USER", "RAG_DB_PASSWORD", "RAG_SSH_HOST", "RAG_SSH_USER",
    ]
    if env_file.exists():
        try:
            present = {
                ln.split("=", 1)[0].strip()
                for ln in env_file.read_text(errors="ignore").splitlines()
                if "=" in ln and not ln.strip().startswith("#")
            }
            lines.append("- .env 키 존재여부(값 미노출): " + ", ".join(
                f"{k}={'있음' if k in present else '없음'}" for k in watched
            ))
        except Exception:
            lines.append("- .env 키 존재여부: 측정 불가(읽기 실패)")
    else:
        lines.append("- .env: 파일 없음")

    # 5) 최근 재색인 결과 — 공유 DB 쓰기가 실제로 돌고 있는지
    audit = FORGE_OUTPUTS / ".claude/audit/index-refresh.jsonl"
    if audit.exists():
        try:
            tail = [ln for ln in audit.read_text(errors="ignore").splitlines() if '"rag"' in ln][-3:]
            # ⚠️ 이 로그는 index.py 의 **가공되지 않은 stderr** 를 담는다(index-refresh.sh 가 의도적으로
            #   버리지 않는다). DB 예외 메시지에 접속 문자열이 섞이면 harness_probe 의 "값 미노출" 계약이
            #   이 경로로 우회된다(2026-08-14 cr-triple 지적). 내보내기 전에 자격증명을 지운다.
            tail = [_mask_secrets(t) for t in tail]
            lines.append("- 최근 RAG 재색인 3건:")
            lines.extend(f"    {t[:180]}" for t in tail)
        except Exception:
            lines.append("- 최근 RAG 재색인: 측정 불가(로그 읽기 실패)")
    else:
        lines.append("- 최근 RAG 재색인: 로그 없음")

    lines.append(
        "\n※ 이 목록에 없는 항목(프로세스 목록·임의 파일·임의 셸 명령)은 이 서버가 제공하지 않는다. "
        "그런 항목은 리포트에 '측정 불가(도구 없음)'로 적고, 실행하지 않은 명령을 근거로 인용하지 않는다."
    )
    return "\n".join(lines)


# ── Telegram 알림 도구 ─────────────────────────────────────────────────────

@mcp.tool()
def notion_create_page(database_id: str, properties: dict, content: str = "") -> str:
    """Notion 데이터베이스에 새 페이지 생성.

    Args:
        database_id: Notion DB ID (예: "43829f7b-8d3f-47f1-90a1-84f40d39239e")
        properties: 페이지 속성 딕셔너리 (title, date, status 등)
        content: 페이지 본문 (Markdown — Notion 블록으로 변환)
    """
    import urllib.request
    import json

    token = os.environ.get("NOTION_API_TOKEN", "")
    if not token:
        return "NOTION_API_TOKEN 미설정 — Notion 등록 불가"

    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
        "Notion-Version": "2022-06-28",
    }

    # properties → Notion API 포맷 변환
    def _notion_props(props: dict) -> dict:
        result = {}
        for key, val in props.items():
            if isinstance(val, str) and key.lower() in ("제목", "title", "name", "이름"):
                result[key] = {"title": [{"text": {"content": val[:2000]}}]}
            elif isinstance(val, str) and "날짜" in key.lower() or "date" in key.lower():
                result[key] = {"date": {"start": val}} if val else {"date": None}
            elif isinstance(val, (int, float)):
                result[key] = {"number": val}
            elif isinstance(val, str):
                result[key] = {"rich_text": [{"text": {"content": val[:2000]}}]}
        return result

    # content → Notion 블록 (단락으로 분할, 최대 100블록)
    def _content_blocks(text: str) -> list:
        blocks = []
        for chunk in text.split("\n\n")[:100]:
            chunk = chunk.strip()
            if not chunk:
                continue
            blocks.append({
                "object": "block",
                "type": "paragraph",
                "paragraph": {
                    "rich_text": [{"type": "text", "text": {"content": chunk[:2000]}}]
                }
            })
        return blocks

    payload = {
        "parent": {"database_id": database_id},
        "properties": _notion_props(properties),
        "children": _content_blocks(content) if content else [],
    }

    data = json.dumps(payload).encode()
    req = urllib.request.Request(
        "https://api.notion.com/v1/pages",
        data=data, headers=headers
    )
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            result = json.loads(resp.read())
            page_id = result.get("id", "unknown")
            url = result.get("url", "")
            return f"Notion 페이지 생성 완료: {page_id}\nURL: {url}"
    except Exception as e:
        return f"Notion 생성 실패: {e}"


@mcp.tool()
def telegram_notify(message: str) -> str:
    """Telegram으로 완료 알림 발송. chat_id는 환경변수 고정.

    Args:
        message: 전송할 메시지
    """
    # root-cause: AD-106 MCP-SEC — chat_id 파라미터 허용 = exfiltration 경로. env 고정으로 제한.
    token = os.environ.get("FORGE_AGENT_SERVER_BOT_TOKEN") or os.environ.get("TELEGRAM_BOT_TOKEN", "")
    cid = os.environ.get("FORGE_AGENT_SERVER_BOT_CHAT_ID") or os.environ.get("TELEGRAM_CHAT_ID", "")

    if not token or not cid:
        return "TELEGRAM_BOT_TOKEN 또는 TELEGRAM_CHAT_ID 환경변수 미설정 — 알림 스킵"

    import urllib.request
    import json
    url = f"https://api.telegram.org/bot{token}/sendMessage"
    data = json.dumps({"chat_id": cid, "text": message}).encode()
    req = urllib.request.Request(url, data=data,
                                  headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            return f"Telegram 발송 완료 (status: {resp.status})"
    except Exception as e:
        return f"Telegram 발송 실패: {e}"


# ── 웹 검색/조회 도구 ─────────────────────────────────────────────────────

@mcp.tool()
def web_search(query: str, count: int = 5) -> str:
    """Brave Search API로 웹 검색.

    Args:
        query: 검색 쿼리
        count: 결과 수 (기본 5, 최대 20)
    """
    api_key = os.environ.get("BRAVE_API_KEY", "")
    if not api_key:
        return "BRAVE_API_KEY 미설정 — 웹 검색 불가"

    import urllib.request
    import urllib.parse
    import json

    params = urllib.parse.urlencode({"q": query, "count": min(count, 20)})
    url = f"https://api.search.brave.com/res/v1/web/search?{params}"
    req = urllib.request.Request(url, headers={
        "Accept": "application/json",
        "Accept-Encoding": "gzip",
        "X-Subscription-Token": api_key,
    })
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            import gzip
            raw = resp.read()
            if resp.headers.get("Content-Encoding") == "gzip":
                raw = gzip.decompress(raw)
            data = json.loads(raw)
        results = data.get("web", {}).get("results", [])
        lines = []
        for r in results[:count]:
            lines.append(f"**{r.get('title', '')}**\n{r.get('url', '')}\n{r.get('description', '')}\n")
        return "\n".join(lines) or "(결과 없음)"
    except Exception as e:
        return f"검색 오류: {e}"


@mcp.tool()
def web_fetch(url: str, max_chars: int = 8000) -> str:
    """URL 페이지 내용 조회.

    Args:
        url: 조회할 URL
        max_chars: 최대 문자 수 (기본 8000)
    """
    import urllib.request

    req = urllib.request.Request(url, headers={
        "User-Agent": "Mozilla/5.0 (compatible; ForgeBot/1.0)",
        "Accept": "text/html,application/xhtml+xml,text/plain",
    })
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            content_type = resp.headers.get("Content-Type", "")
            raw = resp.read(max_chars * 3)

        # HTML → 텍스트 간략 변환
        text = raw.decode("utf-8", errors="replace")
        if "html" in content_type.lower():
            import re
            text = re.sub(r'<script[^>]*>.*?</script>', '', text, flags=re.DOTALL | re.IGNORECASE)
            text = re.sub(r'<style[^>]*>.*?</style>', '', text, flags=re.DOTALL | re.IGNORECASE)
            text = re.sub(r'<[^>]+>', ' ', text)
            text = re.sub(r'\s+', ' ', text).strip()

        return text[:max_chars]
    except Exception as e:
        return f"조회 오류: {e}"


# ── 서버 실행 ──────────────────────────────────────────────────────────────

if __name__ == "__main__":
    transport = "stdio" if len(sys.argv) > 1 and sys.argv[1] == "stdio" else "http"
    os.environ.setdefault("FORGE_MCP_TRANSPORT", transport)

    if transport == "http":
        # 기동 거부 2건 — 둘 다 "열린 채로 뜨느니 안 뜬다"는 같은 원칙이다.
        if not _AUTH_WIRED:
            print("[forge-tools] FATAL: 인증 미들웨어가 배선되지 않아 http 기동을 거부합니다.",
                  file=sys.stderr)
            print("  stdio 모드(로컬 Claude Code)는 영향 없습니다: python3 forge-tools-server.py stdio",
                  file=sys.stderr)
            sys.exit(1)
        if not FORGE_MCP_TOKEN:
            print("[forge-tools] FATAL: FORGE_MCP_TOKEN 미설정 — http 기동을 거부합니다.",
                  file=sys.stderr)
            print("  이 서버는 터널로 인터넷에 열리고 파일 쓰기·git 커밋·스크립트 실행 도구를 갖고 있어",
                  file=sys.stderr)
            print("  토큰 없이 뜨면 아무나 호출할 수 있습니다.", file=sys.stderr)
            print("  발급: export FORGE_MCP_TOKEN=$(bash \"$FORGE_ROOT/shared/scripts/forge-mcp-token.sh\")",
                  file=sys.stderr)
            print("  토큰이 필요 없는 로컬 레인: python3 forge-tools-server.py stdio", file=sys.stderr)
            sys.exit(1)

        print(f"Forge Tools MCP Server 시작 (streamable-http)")
        print(f"  주소: http://{FORGE_MCP_HOST}:8765/mcp")
        print(f"  forge-outputs: {FORGE_OUTPUTS}")
        print(f"  forge-root: {FORGE_ROOT}")
        # 배너는 실제 동작만 말한다 — 종전 '활성화' 표기는 검증 코드가 0곳인 채로 찍혔다.
        print(f"  인증: 활성화 — 모든 요청에 X-Forge-Token 헤더 필수 (없거나 틀리면 거부)")
        print(f"  허용 스크립트: {', '.join(ALLOWED_SCRIPTS.keys())}")
        print(f"  감사로그: {mcp_audit.AUDIT_LOG}")
        print()

    if transport == "stdio":
        # stdio 는 HTTP 헤더가 없는 레인이라 토큰을 요구하지 않는다(요구하면 로컬 MCP 가 죽는다).
        mcp.run(transport="stdio")
    else:
        mcp.run(transport=transport, host=FORGE_MCP_HOST, port=8765)
