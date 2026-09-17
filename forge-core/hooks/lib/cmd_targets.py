"""cmd_targets.py — 셸 명령에서 **실제 쓰기 대상 경로**를 뽑는 공용 파서.

출처: settings-json-lock.sh 의 인라인 파서(G-13~G-16 8세대 누적). 2026-08-29 에
형제 훅 block-sensitive-bash.sh 가 같은 판정을 필요로 해서 여기로 **옮겼다**.

왜 공용인가: 이 계열 훅의 고질병은 하나다 — "명령이 무엇을 겨냥하나" 대신 "명령문에
어떤 글자가 보이나"로 판정하는 것. 그 판정을 두 벌로 구현하면 한쪽만 고쳐지고 그 차이가
곧 구멍이거나 오탐이 된다. 실제로 2026-08-29 하루에 같은 계열 오탐이 3회 터졌다.

⚠️ 이 파서가 무력화되는 입력: 경로를 변수·글롭·문자열 조립으로 가린 명령
   (`P=~/x; cp a "$P"`). 리터럴이 없으면 원리적으로 못 잡는다 — 호출부는 인자를 하나도
   못 뽑았을 때(miss>0) fail-closed 하도록 설계돼 있다.

호출부: settings-json-lock.sh(SJL_LIB) · block-sensitive-bash.sh(BSB_LIB)
"""
import re  # noqa: F401  (아래 함수들이 쓴다)

def mask_quotes(s):
    """따옴표 '안'의 문자를 공백으로 덮은 사본. 길이·인덱스는 보존한다.
    G-15 (2026-08-10, C1): 큰따옴표 안의 백슬래시-이스케이프(\\") 를 몰라 따옴표
    닫힘으로 오인하던 결함을 고친다 — echo "some \" quote" > ~/.claude/settings.json
    이 \" 를 닫는 따옴표로 셈해 그 뒤 진짜 `>` 가 "따옴표 안"으로 마스킹돼 사라졌다
    (targets() 가 이 마스킹을 공유해 탐지에서 사라짐).
    G-15b (2026-08-10, 오케스트레이터 재검수 — 짝수 백슬래시·따옴표 밖 잔여우회):
    최초 G-15 는 "백슬래시 다음 문자가 딱 닫는따옴표일 때만" 건너뛰어, 백슬래시가
    2개 이상 연속되면(\\\\", \\\\\\\\ 등 짝수 개) 패리티가 다시 어긋나 재발했다
    (echo "a \\" > ~/.claude/settings.json 실제쓰기 발생, 훅은 통과시킴 — 실측 확인).
    또한 **따옴표 밖**에서도 bash 는 백슬래시가 다음 글자를 그대로 이스케이프하므로
    (\" 는 새 따옴표 시작이 아니라 리터럴 " 한 글자다) 이 함수가 그걸 몰라 진짜
    따옴표 시작으로 오인하면 그 뒤 전부가 "따옴표 안"으로 잘못 마스킹된다
    (cat foo \" > ~/.claude/settings.json 도 실제쓰기 발생, 훅 통과 — 실측 확인).
    고친 규칙: **백슬래시를 만나면 (따옴표 안이든 밖이든, 홑따옴표 안만 제외) 다음
    문자가 무엇이든 무조건 2칸을 한 쌍으로 소비**한다 — 홀/짝 어느 쪽이든 뒤이은
    진짜 따옴표(또는 리다이렉트)의 판정이 흔들리지 않는다(2칸씩 짝지어 소비하면
    홀수 개의 마지막 한 개가 자연히 다음 글자와 짝지어져 실제 bash 이스케이프
    규칙과 일치한다). 홑따옴표 안에서는 bash 가 백슬래시를 이스케이프로 취급하지
    않으므로 그 상태(q == "'")에서는 이 규칙을 적용하지 않는다(원문 그대로 유지).
    알려진 한계: 문자열이 홀수 개 백슬래시로 끝나 짝을 지을 다음 문자가 없으면
    (i+1>=n) 그 마지막 백슬래시 하나는 평범한 문자로 처리한다 — 실제 bash 에선
    이 경우 명령이 아예 미완성 문법(줄바꿈 계속으로 이어지는 등)이라 이 훅이
    보는 단일 커맨드 문자열 범위 밖이다."""
    out = []
    i, n = 0, len(s)
    q = None
    while i < n:
        ch = s[i]
        if q == "'":
            out.append(ch if ch == q else ' ')
            if ch == q:
                q = None
            i += 1
            continue
        # G-15b: 큰따옴표 안(q == '"') 이든 따옴표 밖(q is None) 이든, 백슬래시는
        # 다음 문자가 무엇이든 함께 소비한다 — 홀/짝 패리티를 실제 bash 와 맞춘다.
        if ch == '\\' and i + 1 < n:
            out.append(' ' if q else ch)
            out.append(' ' if q else s[i + 1])
            i += 2
            continue
        if q == '"':
            out.append(ch if ch == q else ' ')
            if ch == q:
                q = None
        elif ch in ("'", '"'):
            q = ch
            out.append(ch)
        else:
            out.append(ch)
        i += 1
    return ''.join(out)

def read_token(s, m, k):
    """원문 s 의 위치 k 에서 토큰 하나를 읽는다(따옴표 제거). (토큰, 다음위치)"""
    n = len(s)
    while k < n and m[k] in ' \t':
        k += 1
    tok, q = [], None
    while k < n:
        ch = s[k]
        if q:
            if ch == q:
                q = None
            else:
                tok.append(ch)
        elif ch in ("'", '"'):
            q = ch
        elif ch in ' \t\n;|&<>':
            break
        else:
            tok.append(ch)
        k += 1
    return ''.join(tok), k

def targets(s):
    """따옴표 밖 리다이렉트(>, >>)와 tee 의 파일 타깃 목록."""
    m = mask_quotes(s)
    n, i, out = len(s), 0, []
    while i < n:
        ch = m[i]
        if ch == '>':
            j = i
            while j + 1 < n and m[j + 1] == '>':
                j += 1                      # >> 흡수
            k = j + 1
            if k < n and m[k] == '&':        # >&2 등 fd 복제 — 파일 타깃 아님
                i = k + 1
                continue
            # G-15 (2026-08-10, C2): `>|` = bash noclobber 강제 오버라이드(실제 쓰기).
            # '|' 는 read_token() 의 break 문자라 그대로 넘기면 빈 토큰이 나와 타깃이
            # 통째로 사라졌다(printf '{}' >| ~/.claude/settings.json 이 무탐지 통과).
            # '>' 뒤에 공백 없이 붙은 '|' 만 이 연산자다(공백이 있으면 애초에 bash 문법
            # 오류) — 그 한 글자만 건너뛰고 read_token 을 그 다음 위치에서 시작한다.
            if k < n and m[k] == '|':
                k += 1
            tok, k = read_token(s, m, k)
            if tok:
                out.append(tok)
            i = max(k, i + 1)
            continue
        # tee — 따옴표 밖의 단어 경계일 때만
        if m.startswith('tee', i) and (i == 0 or m[i - 1] in ' \t;|&(') \
           and (i + 3 >= n or m[i + 3] in ' \t'):
            k = i + 3
            while True:
                tok, k = read_token(s, m, k)
                if not tok:
                    break
                if not tok.startswith('-'):  # 옵션(-a 등)은 건너뛴다
                    out.append(tok)
                if k >= n or m[k] in '\n;|&<>':
                    break
            i = max(k, i + 1)
            continue
        i += 1
    return out

# G-16 정밀화 (2026-08-26): cp/mv/dd/truncate/sed -i 의 **인자**를 뽑는다.
# 배경 — 아래 OTHER_WRITE 는 명령 텍스트 **어디든** 이 낱말이 보이기만 하면 1이 됐고,
# 그 쓰기가 실제로 무엇을 겨냥하는지는 보지 않았다. 그래서 settings 경로가 heredoc 데이터나
# 주석에만 있고 진짜 대상은 무관한 .md 인 명령이 차단됐다(실측 2026-08-26: /forge-checkpoint
# 가 체크포인트 .md 를 쓰다 BLOCK). G-14 가 open() 에 한 정밀화를 같은 계열로 여기에도 한다.
#
# 반환 (targets, miss): targets = 비옵션 인자 전부. miss = 인자를 하나도 못 뽑은 호출 수
#   — 하나라도 있으면 호출부가 fail-closed 한다(파서가 놓친 쓰기가 있다는 뜻).
# 목적지만이 아니라 **인자 전부**를 담는 이유: `cp a b` 에서 목적지만 고르려면 옵션 문법을
#   명령마다 알아야 하고(dd 는 of=, truncate 는 마지막 토큰), 틀리면 차단을 놓친다. 전부
#   담으면 차단은 절대 놓치지 않고, 대가는 settings 를 **원본**으로 읽는 복사가 계속 막히는
#   것뿐이다 — 그건 종전 동작과 같아서 회귀가 아니다.
# ⚠️ 이 방어가 무력화되는 입력: 경로를 변수에 담아 `sed -i … "$P"` 로 쓰면 리터럴이 없어
#   못 잡는다(G-15 에 이미 적힌 기지 한계). 또 `sed -i` 의 **스크립트 식**에 settings 리터럴이
#   들어 있으면(`sed -i 's|.claude/settings.json|x|' /tmp/a.md`) 인자로 잡혀 차단된다 —
#   fail-closed 방향의 과탐이라 그대로 둔다.
WRITE_CMDS = ('cp', 'mv', 'dd', 'truncate')

def strip_comments(s, m):
    """따옴표 밖 `#` 주석 구간을 개행으로 지운 (s, m) 사본. 길이는 보존한다.

    왜 필요한가: 주석은 실행되지 않는데, 안 지우면 `sed -i … a.md   # …settings.json`
    의 **주석 낱말까지** 인자로 주워 담아 그 자리에서 다시 오탐이 된다(2026-08-26 실측 —
    이 정밀화의 1차 구현이 정확히 그렇게 실패했다). 개행으로 바꾸는 이유는 read_token 이
    개행을 토큰 종료로 보기 때문이다 — 별도 종료 규칙을 새로 만들지 않는다.
    """
    # 경계 집합에 **여는 괄호를 넣지 않는다**(2026-08-26 적대적 검수 실적발).
    #   bash 는 배열 대입 안의 `#` 을 주석으로 보지 않는다 — `array=(#) cp … <settings>` 는
    #   rc=0 으로 **실행된다**(실측: bash -n). 여기에 `(` 를 넣으면 우리만 그 구간을 지워서
    #   진짜 `cp` 를 못 보고 통과시킨다. 지우는 쪽이 위험하고 남기는 쪽이 안전하므로,
    #   bash 가 확실히 주석으로 보는 경계(공백·탭·개행·`;`·`|`·`&`)만 넣는다.
    #   실측(경계별 `true<X>#; echo EXECUTED` → 주석처리 여부): 위 6종 전부 주석처리 확인.
    #   ⚠️ 이 판정이 무력화되는 입력: 여기 없는 경계 뒤의 `#` 은 지우지 않으므로 그 주석의
    #   낱말이 인자로 잡혀 **과탐**이 될 수 있다 — 안전 방향이라 그대로 둔다.
    s2, m2 = list(s), list(m)
    i, n = 0, len(s)
    while i < n:
        if m2[i] == '#' and (i == 0 or m2[i - 1] in ' \t\n;|&'):
            while i < n and m2[i] != '\n':
                s2[i] = m2[i] = '\n'
                i += 1
            continue
        i += 1
    return ''.join(s2), ''.join(m2)

def wcmd_at(m, i, n, write_cmds=WRITE_CMDS, sed_aware=True):
    """m[i] 에서 시작하는 쓰기 명령 이름(없으면 None).

    셸 쪽 탐지 정규식(`(cp|mv|dd) |truncate|sed -i`)과 **같은 대상**을 봐야 한다 —
    한쪽만 넓으면 그 차이가 곧 구멍이거나 오탐이다.
    """
    if not (i == 0 or m[i - 1] in ' \t\n;|&('):
        return None
    for w in write_cmds:
        if m.startswith(w, i) and i + len(w) < n and m[i + len(w)] in ' \t':
            return w
    if sed_aware and m.startswith('sed', i) and i + 3 < n and m[i + 3] in ' \t':
        return 'sed'
    return None

def sed_inplace_opt(tok):
    """sed 옵션 토큰이 in-place 쓰기를 켜는가. `-i` 뿐 아니라 **결합 단축옵션**(`-ni`)도 본다.

    2026-08-26 적대적 검수 지적: `sed -ni 's/a/b/' <settings>` 는 실제로 파일을 덮어쓰는데
    `tok.startswith('-i')` 로는 안 잡혔다(구판도 못 잡던 기존 구멍 — 셸 정규식 `sed -i` 도
    `-ni` 에 매치되지 않는다). W: 타깃은 아래 `grep -qF` 정밀 대조가 직접 보므로, 여기서
    잡으면 그 구멍이 닫힌다. 판정은 **넓은 쪽(더 잘 막는 쪽)** 으로 기운다.
    """
    if tok.startswith('--'):
        return tok.startswith('--in-place')
    return 'i' in tok[1:]

def norm_path(p):
    """`//` · `/./` · `a/../` 를 접은 경로. 리터럴 비교가 표기 차이로 새는 것을 막는다.

    2026-08-26 적대적 검수 지적(구판에도 있던 구멍): `cp /tmp/x ~/.claude//settings.json` 은
    실제로 settings 를 덮어쓰는데 `grep -qF '.claude/settings.json'` 이 슬래시 하나 차이로
    비껴갔다. Edit/Write 경로는 R6 에서 realpath 로 정규화했지만 Bash 경로는 안 돼 있었다.
    여기서는 파일시스템을 건드리지 않는 **문자열 정규화만** 한다(심링크 해석은 R6 의 몫).
    ⚠️ 이 정규화가 무력화되는 입력: 변수·글롭으로 가려진 경로는 여전히 리터럴이 없어 못 잡는다.
    """
    lead = '/' if p.startswith('/') else ''
    parts = []
    for seg in p.split('/'):
        if seg in ('', '.'):
            continue
        if seg == '..' and parts and parts[-1] != '..':
            parts.pop()
            continue
        parts.append(seg)
    return lead + '/'.join(parts)

# ── H-2 R1 (2026-09-16): 결합 표기(`--opt=값` · `-d@파일` · `-T경로`)의 값 부분 ──────────
#
# 갭(cr-final r1 H1, 양 레그 공통 실측): 아래 파서는 `-` 로 시작하는 토큰을 **통째로 버렸다**.
#   그래서 `wget --post-file=~/.aws/credentials` · `curl --upload-file=~/.aws/credentials` ·
#   `curl --data-binary=@~/.aws/credentials` · `curl -d@~/.aws/credentials` 가 전부 통과했다
#   (공백으로 분리한 꼴만 막혔다). 같은 명령의 **같은 동작**이 표기 하나로 갈렸다 —
#   G-22 가 남긴 "케이스를 두 표기로 넣어라" 교훈의 재발이다.
# 고친 방식: 옵션 토큰이어도 `=`·`@` 뒤(또는 짧은 옵션에 붙은 경로)를 **대상 후보에 추가**한다.
#   옵션 이름 자체는 넣지 않는다 — 넣으면 `tail -f` 같은 호출이 "인자를 뽑았다"가 돼
#   miss>0 의 fail-closed(뭉툭한 차단)가 풀린다(G19l·G20m 이 그걸 고정한다).
# ⚠️ 이 추출이 무력화되는 입력: 값이 변수·글롭인 결합 표기(`--post-file=$P`)는 리터럴이 없어
#   여기서도 못 잡는다. 판정은 항상 넓은(더 막는) 쪽으로만 기운다.
# ⚠️ G2 (2026-09-16, r2 회귀): **옵션 형식을 먼저 가른 뒤** 값을 뽑아야 한다.
#   r1 판은 `=`·`@` 를 무조건 구분자로 봐서 `-T/x/06-finance/year=2026/ledger.csv` 의 후보가
#   `2026/ledger.csv` 로 **잘렸고**(경로 앞부분 유실) 그래서 그냥 통과했다. 긴 옵션은 첫 `=` 까지가
#   이름이지만, 짧은 옵션은 이름과 값이 붙어 있어 값 안의 `=`·`@` 는 **경로의 일부**다.
def opt_value_targets(tok):
    """옵션 토큰에서 **값으로 보이는 부분**만 뽑는다(옵션 이름은 버린다)."""
    m_long = re.match(r'^--[A-Za-z0-9][-A-Za-z0-9]*=(.*)$', tok, re.S)
    if m_long:
        v = m_long.group(1)                  # `--upload-file=<값>` — 값 안의 `=` 는 보존된다
    elif re.match(r'^-[A-Za-z]', tok) and len(tok) > 2:
        v = tok[2:]                          # `-T<경로>` · `-d@<파일>` — 값 전체를 그대로 둔다
        if not (v[0] in '=@' or '/' in v):
            return []                        # `-rn` 같은 짧은 옵션 묶음은 값이 아니다
        v = v.lstrip('=')
    elif '@' in tok:
        v = tok.split('@', 1)[1]
    else:
        return []
    v = v.lstrip('@')        # `--data-binary=@file` 의 `@`
    return [v] if v else []


# ── M1 (2026-09-16): grep 계열의 **첫 위치 인자 = 검색 패턴**은 대상이 아니다 ────────────
#
# 갭(cr-final r1 M1): 같은 diff 가 Grep **도구**에서는 `pattern` 을 일부러 제외하면서
#   ("보면 하네스 문서 작업이 전부 막힌다") Bash `grep` 에는 같은 판단을 적용하지 않아
#   `grep -rn '\.ssh/' docs/` 가 차단됐다 — 두 레인이 모순이었다. 훅·문서를 고치는 작업이
#   자기 자신에게 막히는, 가장 고치기 어려운 자리의 오탐이다.
# 경계: **첫 위치 인자 하나만** 뺀다. 나머지 인자(경로)는 그대로 보므로
#   `grep -rn x ~/.ssh/` 는 계속 차단된다.
# ⚠️ `-e`/`-f`(패턴을 옵션으로 준 꼴)면 첫 위치 인자가 **경로**다 — 그때는 빼지 않는다
#   (빼면 `grep -e x ~/.ssh/id_rsa` 가 새는 구멍이 된다). 짧은 옵션 묶음(`-ne`)도
#   e·f 가 섞였으면 안전한 쪽(빼지 않음)으로 판정한다.
GREP_PATTERN_CMDS = ('grep', 'egrep', 'fgrep', 'rg')


# ⚠️ G1 (2026-09-16, r2 회귀): r1 판은 `-e` 를 **정확히 그 꼴일 때만** 패턴 소스로 봤다.
#   그래서 `grep -e'^' /x/06-finance/ledger.csv` 는 결합형이라 판별에 걸리지 않았고,
#   "첫 위치 인자를 뺀다" 규칙이 **진짜 파일 경로**를 빼버려 기존 4패턴까지 뚫렸다.
#   판정은 넓은 쪽(= 빼지 않는 쪽 = 더 막는 쪽)으로 기울여야 한다.
def grep_pattern_opt(tok):
    """패턴을 **옵션으로** 넘긴 꼴인가(그러면 첫 위치 인자는 패턴이 아니라 경로다)."""
    if tok.startswith('--regexp') or tok.startswith('--file'):
        return True                      # `--regexp=PAT` · `--file PAT` 둘 다
    return re.match(r'^-[A-Za-z]*[ef]', tok) is not None   # `-e` · `-ne` · `-e'^'` · `-f`


def write_cmd_targets(s0, write_cmds=WRITE_CMDS, sed_aware=True, opt_values=False):
    # opt_values — G3 (2026-09-16, r2 범위 회귀): 결합 표기 값 추출은 **읽기/반출 레인 전용**이다.
    #   r1 판은 이 공용 함수에 무조건 적용해서 H-2 범위 밖인 settings-json-lock 의 계약을 바꿨다:
    #   `truncate --reference=~/.claude/settings.json /tmp/x` 는 settings 를 **참조만** 하고
    #   /tmp/x 를 고치는 명령인데 차단됐다(이전 rc=0 → r1 rc=2). 쓰기 레인은 종전 판정을 유지한다.
    m0 = mask_quotes(s0)
    s, m = strip_comments(s0, m0)
    n = len(s)
    # 여기서 "스캔 수 vs 파싱 수" 를 세지 않는 이유(한 번 넣었다가 뺐다 — 2026-08-26):
    #   지워지는 구간은 위 strip_comments 가 **bash 와 같은 경계로** 지운 주석뿐이고,
    #   그건 애초에 실행되지 않는 텍스트다. 그 수를 세어 fail-closed 하면
    #   `sed -n … <settings> > out.txt   # cp 없음` 처럼 **주석에 쓰기 낱말이 있을 뿐인**
    #   읽기 명령이 다시 차단된다 — 이 PR 이 고치려는 바로 그 오탐이 되살아난다(실측 FAIL).
    #   실제 구멍이었던 `array=(#)` 는 경계 집합에서 `(` 를 빼는 것으로 근본이 닫혔다.
    out, miss, i = [], 0, 0
    while i < n:
        name = wcmd_at(m, i, n, write_cmds, sed_aware)
        if name is None:
            i += 1
            continue
        is_sed = (name == 'sed') and sed_aware
        is_grep = name in GREP_PATTERN_CMDS
        k = i + len(name)
        got, inplace = [], False
        # pos_entries — **위치 인자의 자리**를 순서대로 담는다(got 안의 인덱스, 빈 인자는 None).
        #   G1: `grep '' <경로> /dev/null` 의 첫 위치 인자는 **빈 패턴**이다. 그 자리를 세지 않으면
        #   뒤따르는 진짜 경로가 "첫 위치 인자"로 오인돼 대상에서 빠진다(= 유출).
        # after_redir — 리다이렉트로 들어온 파일은 위치 인자가 아니다.
        #   G1: `grep < <경로> '^'` 에서 그 경로를 패턴으로 오인해 빼면 그대로 샌다.
        pos_entries, pat_as_opt, after_redir = [], False, False
        while True:
            k_before = k
            tok, k = read_token(s, m, k)
            if not tok and k > k_before and not after_redir \
                    and ("'" in s[k_before:k] or '"' in s[k_before:k]):
                pos_entries.append(None)      # `''` — 자리는 차지하지만 대상은 아니다
            if tok:
                if tok.startswith('-') and not after_redir:
                    # sed 는 -i 계열이 있을 때만 쓰기다. `sed -n … settings` 는 읽기이므로
                    # 여기서 걸러야 한다 — 안 그러면 읽기를 차단하는 **새 오탐**이 생긴다.
                    # inplace 는 sed 에서만 읽는다(아래 `not is_sed or inplace`) —
                    # cp/mv/dd/truncate 는 존재 자체가 쓰기라 옵션을 따질 필요가 없다.
                    if is_sed and sed_inplace_opt(tok):
                        inplace = True
                    if is_grep and grep_pattern_opt(tok):
                        pat_as_opt = True
                    # H-2 R1: 옵션 이름은 버리되 `=`·`@` 뒤의 **값**은 대상으로 본다(위 주석).
                    if opt_values:
                        got.extend(opt_value_targets(tok))
                else:
                    if not after_redir:
                        pos_entries.append(len(got))
                    got.append(tok)
            after_redir = False
            # 리다이렉트·프로세스치환은 인자 나열을 **끊지 않는다**. bash 는 그 뒤에도
            # 같은 명령의 인자를 계속 받는다(`cp a > log b` 는 `cp a b` 다). 여기서
            # 루프를 끝내면 뒤따르는 진짜 대상을 못 본다 — 2026-08-26 적대적 검수가
            # `cp /tmp/a <(echo 1) <대상>` 으로 실증했다.
            #
            # **fd 복제까지 한 덩어리로** 건너뛴다(`>&2` · `2>&1` · `&>` · `>&-`).
            #   3라운드 실적발: `>` 만 건너뛰면 그 다음 글자가 `&` 라, 아래 구분자 검사가
            #   그것을 명령 끝으로 읽고 끊어버려 뒤의 진짜 대상을 놓쳤다. `&` 는 구분자이기도
            #   하고 리다이렉트의 일부이기도 하다 — 뒤 글자로 가른다.
            #   ⚠️ 이 판정이 무력화되는 입력: `>&` 뒤에 숫자·`-` 가 아닌 것이 오는 비표준
            #   형태는 여기서 안 걸러지고 구분자로 읽힌다(안전 방향으로는 기울지 않는다).
            if k < n and (m[k] in '<>' or (m[k] == '&' and k + 1 < n and m[k + 1] == '>')):
                if m[k] == '&':
                    k += 1                                  # `&>` 의 앞 글자
                while k < n and m[k] in '<>':
                    k += 1
                if k < n and m[k] == '&':                    # `>&2` · `>&-` 의 fd 복제부
                    k += 1
                    while k < n and (m[k].isdigit() or m[k] == '-'):
                        k += 1
                after_redir = True      # 다음 토큰은 리다이렉트 대상 — 위치 인자가 아니다(G1)
                continue
            if k >= n or m[k] in '\n;|&':
                break
            if k == k_before:
                break                      # 진전 없음 — 무한루프 방지
            # ⚠️ 여기서 `if not tok: break` 로 쓰면 **빈 따옴표 인자에서 파서가 멈춘다**.
            #   `truncate -s 0 '' <settings>` 는 빈 인자에서 오류를 내고도 **뒤 인자를 계속
            #   처리해 파일을 자른다** — 그런데 read_token 은 `''` 에서 빈 토큰을 돌려주므로
            #   토큰이 비었다는 것만 보고 끊으면 진짜 대상을 못 본다(2026-08-26 검수 2라운드
            #   실적발, 이 PR 이 만든 회귀였다). 끊는 기준은 **k 가 안 움직였는가**여야 한다.
        # M1: grep 계열의 첫 위치 인자(=검색 패턴)는 대상이 아니다(위 GREP_PATTERN_CMDS 주석).
        #   빼는 조건은 셋을 **모두** 만족할 때뿐이다(r2 회귀 G1 에서 좁혔다):
        #   ①패턴을 `-e`/`-f`/`--regexp`/`--file` 로 주지 않았고 ②첫 위치 인자가 실재하며
        #   ③그 자리가 빈 인자(`''`)가 아니다. 리다이렉트로 들어온 경로는 애초에 위치 인자가 아니다.
        if is_grep and not pat_as_opt and pos_entries and pos_entries[0] is not None:
            del got[pos_entries[0]]
        if not is_sed or inplace:
            out.extend(got)
            if not got:
                miss += 1
        i = max(k, i + 1)
    return out, miss


# G-15 (C3): 따옴표를 벗기고 역슬래시-탈출을 해제한 사본으로 리터럴 포함 여부만 판정한다.
# 배경 — 아래 OTHER_WRITE 최종 판정은 원문 cmd 를 그대로 텍스트 매칭하는데, 대상 경로
# 중간에 그 기호 하나만 끼워 넣어도 리터럴 비교가 어긋났다. 실행기는 그 기호를 지우고
# 진짜 경로에 쓴다. mask_quotes 와 같은 따옴표 중첩 규칙(다른 종류 따옴표는 안쪽에서
# 그냥 글자)을 따르되, 여기서는 지우는 대신 실제로 해제한다. 포함 여부만 쓰므로 안전한
# 방향(더 잘 잡힘)으로만 기운다.
def unescape_copy(s):
    out = []
    i, n = 0, len(s)
    q = None
    while i < n:
        ch = s[i]
        if q == "'":
            if ch == "'":
                q = None
            else:
                out.append(ch)
            i += 1
            continue
        if q == '"':
            if ch == chr(92) and i + 1 < n:
                out.append(s[i + 1])
                i += 2
                continue
            if ch == '"':
                q = None
                i += 1
                continue
            out.append(ch)
            i += 1
            continue
        if ch == chr(92) and i + 1 < n:
            out.append(s[i + 1])
            i += 2
            continue
        if ch in ("'", '"'):
            q = ch
            i += 1
            continue
        out.append(ch)
        i += 1
    return ''.join(out)


# 이름은 역사적으로 write_ 지만 하는 일은 "그 명령의 **비옵션 인자를 전부 모은다**"이다.
# 읽기 명령(cat/grep/head…)의 대상 판정도 축이 같아 그대로 쓴다 — 두 벌로 구현하면 한쪽만
# 고쳐지고 그 차이가 곧 구멍이거나 오탐이 된다(2026-08-29 같은 계열 오탐 5회의 교훈).
# ⚠️ 인자를 하나도 못 뽑은 호출 수(miss)를 함께 돌려주므로, 호출부는 miss>0 이면 fail-closed
#    해야 한다. 그러지 않으면 파서가 놓친 접근이 조용히 통과한다.
def cmd_arg_targets(s0, write_cmds=WRITE_CMDS, sed_aware=True):
    """읽기/반출 레인용 — 위와 같되 결합 표기(`--opt=값`·`-d@파일`·`-T경로`)의 값도 대상으로 본다.

    쓰기 레인(settings-json-lock)은 종전 계약을 그대로 쓴다 — G3(2026-09-16) 참조.
    """
    return write_cmd_targets(s0, write_cmds=write_cmds, sed_aware=sed_aware, opt_values=True)


def sens_dir_match(text, sens):
    """text 안에 민감 디렉터리 `sens` 가 **디렉터리 경계**로 나타나는가.

    왜 부분문자열 비교로는 안 되나(2026-08-29 실측): 패턴이 끝 슬래시를 품고 있어서
    (`06-finance/`) 경로가 슬래시 없이 끝나면(`~/out/06-finance`) 비교가 통째로 빗나갔다 —
    tar·zip·rsync·grep -r·cp 5종이 전부 그 표기로 샜다. 그런데 슬래시 없는 쪽이 **더 흔한
    표기**라, 이 가드는 사실상 슬래시를 붙인 사람에게만 작동하고 있었다.

    왜 슬래시만 떼면 안 되나: `06-finance` 를 맨 부분문자열로 찾으면 `06-financeX` ·
    `my-06-finance-notes.md` 같은 **무관한 이름이 걸린다**(새 오탐). 그래서 양쪽 경계를 본다 —
    앞은 문자열 시작이거나 이름문자가 아닌 것(`/` 포함), 뒤는 `/` 이거나 이름문자가 아닌 것
    이거나 문자열 끝.

    근거: 오늘 수리 3건은 "막지 말아야 할 것을 막던" 오탐이었고 이건 반대 방향이다 —
      가장 흔한 표기에서 새고 있었다(실측 5종 전부 pass).
    폐기조건: 민감 경로 접근이 파일시스템 레벨(ACL·마운트)에서 막히면 이 매처는 불필요해진다.

    ⚠️ 이 판정이 무력화되는 입력:
      ①대소문자가 다른 표기(`06-Finance`)는 매치하지 않는다 — 리눅스는 대소문자를 구분하니
        그게 옳지만, 대소문자를 무시하는 파일시스템(macOS 기본·Windows)에서는 구멍이 된다.
      ②경로를 변수·글롭·문자열 조립으로 감추면 리터럴이 없어 애초에 여기까지 오지 않는다.
      ③`06-finance` 로 가는 **심링크**를 다른 이름으로 만들어 두면 이름이 달라 못 잡는다
        (이 매처는 문자열만 본다 — realpath 해석은 하지 않는다).
    """
    base = sens.rstrip('/')
    if not base:
        return False
    return re.search(r'(?:^|[^A-Za-z0-9._-])' + re.escape(base) + r'(?:/|[^A-Za-z0-9._-]|$)',
                     text) is not None
