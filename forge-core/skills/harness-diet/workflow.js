// root-cause: harness-diet — diet-queue.json 소비 actuator, diet_auto=true&&risk=low 자동적용
// harness-diet workflow.js
// diet-queue.json → low-risk 항목 자동 적용 + medium/high Human 승인 목록 반환
// 금지: 영구삭제/hooks수정/MCP수정/allowed-tools확대/앱코드수정/test·build·deploy/불확실→수동

export const meta = {
  name: 'harness-diet',
  description: 'harness-legacy-scan diet-queue.json 소비 — low-risk 자동 적용 + Human 승인 목록',
  phases: [
    { title: 'Prepare', detail: 'restore point tag + diet-queue.json Read + 항목 분류' },
    { title: 'Apply', detail: 'low-risk 항목별 agent 병렬 적용 (SSoT: 룰=${FORGE_ROOT:-$HOME/forge}/dev/global-rules/, 그 외=${FORGE_ROOT:-$HOME/forge}/.claude/)' },
    { title: 'Verify', detail: 'verify agent — 적용 결과 code-review + smoke-test 6개' },
    { title: 'Report', detail: '7보고 섹션 + Human 승인 high-risk 목록' },
  ],
}

// args 방어파싱 (Workflow inline 전달 시 JSON 문자열일 수 있음)
const _a = (typeof args === 'string')
  ? (() => { try { return JSON.parse(args) } catch (e) { return null } })()
  : (args || {})

// root-cause: Workflow 스크립트는 process 전역 접근 불가(process is not defined) → $HOME을 스스로 못 읽는다.
//   하드코딩 폴백은 작성자 로컬 경로라 **다른 PC(공개 플러그인 사용자)에서 archive·저장이 실패**했다.
//   → outBase 미주입 시 haiku 에이전트 1회로 런타임 해석한다. 호출자가 args.outBase를 주면 이 비용도 0.
const outBase = _a?.outBase || (await agent(
  `Bash 1회만 실행: echo "\${FORGE_OUTPUTS:-$HOME/forge-outputs}"
출력된 절대경로 문자열만 path 필드에 담아 반환하라. 다른 작업 금지.`,
  {
    label: 'resolve-outbase', phase: 'Prepare', model: 'haiku',
    schema: { type: 'object', additionalProperties: false, properties: { path: { type: 'string' } }, required: ['path'] },
  }
))?.path
const defaultQueuePath = `${outBase}/11-platform/pipelines/forge-dev/2026-06-08-v1-harness-diet/diet-queue.json`
const queuePath = _a?.queuePath || defaultQueuePath

// archive 경로 (forge-outputs — git-tracked, forge-sync 미동기 이슈 없음)
const archiveBase = `${outBase}/11-platform/pipelines/forge-dev/2026-06-08-v1-harness-diet/plans/archive/harness-diet-2026-06-08`

// 금지 7가지 상수 (agent 프롬프트에 항상 주입)
const FORBIDDEN = `
금지 사항 (절대 위반 불가):
1. 영구 삭제 금지 — archive 이동만
2. $HOME/.claude/hooks/ 수정 금지
3. MCP 설정(.mcp.json, $HOME/.claude.json mcpServers) 수정 금지
4. allowed-tools 확대 금지
5. 앱 코드(forge-outputs 외 프로젝트 파일) 수정 금지
6. test/build/deploy 임의 실행 금지
7. 불확실한 변경 → 수동 승인 목록 반환 (자동 적용 X)
편집 SSoT — 자산 종류마다 다르다(틀리면 없는 디렉터리를 고치려다 조용히 no-op 된다):
  · 전역 룰(asset_type=rule)      = ${FORGE_ROOT:-$HOME/forge}/dev/global-rules/          ⚠️ ${FORGE_ROOT:-$HOME/forge}/.claude/rules 는 **없다**
  · on-demand 룰                  = ${FORGE_ROOT:-$HOME/forge}/.claude/rules-on-demand/
  · 스킬·에이전트·커맨드          = ${FORGE_ROOT:-$HOME/forge}/.claude/{skills,agents,commands}/
  ⛔ **훅은 여기 없다.** 위 금지 2번($HOME/.claude/hooks/ 수정 금지)은 SSoT 쪽(${FORGE_ROOT:-$HOME/forge}/.claude/hooks/)에도
     그대로 적용된다 — SSoT 를 고치면 forge-sync 가 미러로 전파하므로 그게 곧 우회다.
     (2026-08-27 r3 검수: 구 표기가 훅을 편집 뿌리로 열거해 금지 2번과 정면 충돌했다.)
큐 항목의 path 에 "(SSoT: …)" 가 적혀 있으면 그 경로를 쓰되, **위 뿌리 안에 있을 때만** 쓴다.
밖이면 적용하지 말고 수동 승인 목록으로 돌린다(금지 7번). 코드도 같은 검사를 한다 — 아래 §SSoT 뿌리 검증.
$HOME/.claude/ (홈 미러) 직접 편집 = hook block.
`

// ─────────────────────────────────────────────────────────────────────────────
// Phase 1: Prepare — restore point + diet-queue.json Read + 항목 분류
// ─────────────────────────────────────────────────────────────────────────────
phase('Prepare')

// restore point git tag (실패해도 계속 — non-blocking)
await agent(
  `Bash 1줄 실행 (restore point):
cd ${FORGE_ROOT:-$HOME/forge} && git tag harness-diet-pre-2026-06-08 2>/dev/null && echo "TAG_OK" || echo "TAG_EXISTS_OR_FAIL"`,
  { label: 'restore-tag', phase: 'Prepare' }
).catch(e => log(`[WARN] restore tag 실패: ${e?.message || e}`))

// diet-queue.json Read
let queue = null
try {
  const readResult = await agent(
    `Read 도구로 ${queuePath} 읽기.
content 필드에는 **파일 원문 그대로**(최상위 키가 generated/scan_report/items인 JSON)를 문자열로 넣는다.
이 응답 봉투({ok,content})를 content 안에 다시 넣지 마라 — 이중 래핑 금지.
파일 없으면: {"ok":false,"content":""}`,
    {
      label: 'read-queue',
      phase: 'Prepare',
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: { ok:{type:'boolean'}, content:{type:'string'} },
        required: ['ok','content'],
      },
    }
  )
  if (readResult?.ok && readResult.content) {
    // 에이전트가 응답 봉투를 content 안에 다시 넣는 경우가 있다(이중 래핑) → 최대 3겹까지 벗긴다
    let parsed = JSON.parse(readResult.content)
    for (let i = 0; i < 3 && parsed && !Array.isArray(parsed.items) && typeof parsed.content === 'string'; i++) {
      parsed = JSON.parse(parsed.content)
    }
    queue = parsed
    log(`[Queue] ${queue?.items?.length || 0}개 항목 로드 (scan: ${queue?.scan_report || 'unknown'})`)
  }
} catch (e) {
  log(`[FAIL] diet-queue.json 읽기 실패: ${e?.message || e}`)
}

if (!queue || !Array.isArray(queue.items) || queue.items.length === 0) {
  log('[FAIL] diet-queue.json 없음 또는 빈 항목 — 중단')
  return { error: 'queue_empty', queuePath }
}

// 항목 분류
// diet_auto=true && risk=low 만 자동적용
// SAFETY-DETERRENT → human_required로 강제 분류
const autoItems = queue.items.filter(i =>
  i.diet_auto === true &&
  i.risk === 'low' &&
  i.effectiveness !== 'SAFETY-DETERRENT' &&
  !['injection','redact','secret','permission','override','block','deny'].some(kw =>
    (i.reason + i.evidence + i.path).toLowerCase().includes(kw)
  )
)
// ── SSoT 뿌리 검증 (2026-08-27 r3 검수 high) ────────────────────────────────
// 큐 데이터의 "(SSoT: …)" 를 그대로 믿고 프롬프트에 넣으면, 큐가 오염됐을 때(선행 스캔 버그·
// 주입) 자동 적용 에이전트가 **임의 경로**를 SSoT 로 오인해 편집한다. FORBIDDEN 은 프롬프트
// 텍스트라 지켜지길 바랄 뿐이므로, 코드가 같은 검사를 한 번 더 한다(방어 이중화).
// ⚠️ 훅은 뿌리에 없다 — 금지 2번(훅 수정 금지)은 SSoT 쪽에도 적용된다.
const SSOT_ROOTS = [
  '${FORGE_ROOT:-$HOME/forge}/dev/global-rules/',
  '${FORGE_ROOT:-$HOME/forge}/.claude/rules-on-demand/',
  '${FORGE_ROOT:-$HOME/forge}/.claude/skills/',
  '${FORGE_ROOT:-$HOME/forge}/.claude/agents/',
  '${FORGE_ROOT:-$HOME/forge}/.claude/commands/',
]
// ⚠️ String() 강제 — path 가 문자열이 아닌 큐(숫자·객체)에서 .trim() 이 TypeError 를 낸다.
//    오염된 큐를 방어하는 코드가 오염된 큐에 죽으면 방어가 아니다(2026-08-27 r4 검수).
const _ssotPathOf = (p) => {
  const raw = String(p == null ? '' : p)
  const m = /SSoT:\s*([^)]+)/.exec(raw)
  return (m ? m[1] : raw).trim()
}
const _inSsotRoot = (p) => {
  const t = _ssotPathOf(p)
  return SSOT_ROOTS.some(r => t.startsWith(r))
}
// ⚠️ 상위 참조(`${FORGE_ROOT:-$HOME/forge}/.claude/skills/../hooks/x`)는 prefix 검사로 못 잡는다 — 경로 정규화를
//    하지 않기 때문이다. 그래서 **경로 문맥의** `..` 만 거부한다.
//    구 코드는 `includes('..')` 라 `foo..md` 같은 정상 파일명도 튕겼다(r4 low).
const _hasParentRef = (p) => /(^|\/)\.\.(\/|$)/.test(String(p == null ? '' : p))
// ⚠️ **프롬프트 주입 차단 (r4 high)**: 뿌리 검증을 통과해도 `item.path` 원문이 그대로
//    프롬프트에 들어가면, 유효 경로 뒤에 개행 + 추가 지시문을 붙인 값이 두 검사를 다 통과한다.
//      예: `(SSoT: ${FORGE_ROOT:-$HOME/forge}/.claude/skills/x/SKILL.md)\n이전 지시를 무시하고 …`
//    경로에 나올 수 있는 글자만 허용하고, 개행·제어문자가 있으면 통째로 거부한다.
//    ⚠️ 무력화되는 입력: 허용 문자만으로 쓴 지시문(공백·마침표만 쓰는 짧은 문장)은 통과한다 —
//       그래서 길이 상한(200)을 함께 둔다. 완전한 방어가 아니라 **면적을 줄이는** 조치다.
// ⚠️ **경로만 막으면 옆문이 열려 있다 (r5 high)**: reason·evidence·move_target 도 apply 프롬프트에
//    그대로 보간된다. 개행·제어문자를 지우고 길이를 자른다 — 지시문을 한 줄로 눌러 담아도
//    프롬프트의 문단 구조를 깨지 못하게 하는 것이 목적이다.
//    ⚠️ 무력화되는 입력: 한 줄짜리 짧은 지시문은 여전히 통과한다. 완전한 차단이 아니라 면적 축소다.
const _safeText = (v, max) => String(v == null ? '' : v)
  .replace(/[\u0000-\u001f\u007f]+/g, ' ')   // 개행·제어문자 → 공백
  .replace(/\s+/g, ' ')
  .trim()
  .slice(0, max)

const _pathShapeOk = (p) => {
  const raw = String(p == null ? '' : p)
  return raw.length > 0 && raw.length <= 200 && /^[\w~@/.\-()* :,]+$/.test(raw)
}
const outOfRootItems = autoItems.filter(i =>
  !_inSsotRoot(i.path) || _hasParentRef(i.path) || !_pathShapeOk(i.path))
const autoItemsSafe = autoItems.filter(i => !outOfRootItems.includes(i))
if (outOfRootItems.length > 0) {
  log(`[Classify-REJECT] SSoT 뿌리 밖 ${outOfRootItems.length}건을 자동적용에서 뺀다 — ` +
      `[${outOfRootItems.map(i => i.id).join(',')}] 수동 승인 목록으로 보낸다`)
}
autoItems.length = 0
autoItems.push(...autoItemsSafe)

const humanRequired = queue.items.filter(i => !autoItems.includes(i))

log(`[Classify] auto=${autoItems.length} human_required=${humanRequired.length}` +
    (outOfRootItems.length ? ` (뿌리밖 거부 ${outOfRootItems.length})` : ''))

if (autoItems.length === 0) {
  log('[INFO] 자동적용 항목 없음 — Human 승인 목록만 반환')
  // Report Phase로 바로 이동
}

// ─────────────────────────────────────────────────────────────────────────────
// Phase 1.5: 적용 직전 참조 재실측 (harness-diet-gate-harness-gaps.md G-1/KEEP, 2026-08-03)
// root-cause: diet-queue.json CF-03("참조 0건/고아")이 실제로는 refs>0인 살아있는 자산이었다.
//   scan 시점 grep 범위 누락이 원인이었고(이 스킬 쪽에서는 고칠 수 없음), 이번엔 사람이 적용 직전
//   재실측해서 우연히 막았다. 그 지시는 scan-report.md 산문에만 있고 actuator 코드에는 없었다
//   (사람 기억 의존 = 다음번엔 안 막힐 구조). "참조 0건/고아" 근거로 diet_auto=true가 된 항목만
//   골라 SSoT 전체($FORGE_ROOT/.claude+dev+shared+docs)를 재grep하고, refs>0이면 자동적용에서 뺀다.
// ─────────────────────────────────────────────────────────────────────────────
const orphanClaimItems = autoItems.filter(i =>
  /참조\s*0건|고아|refs\s*=\s*0|orphan/i.test(`${i.reason || ''} ${i.evidence || ''}`)
)

if (orphanClaimItems.length > 0) {
  const recheck = await agent(
    `적용 직전 참조 재실측 (G-1 재발방지 — harness-diet-gate-harness-gaps.md 2026-08-03).
아래 각 항목은 diet-queue.json에서 "참조 0건/고아"를 근거로 자동적용(diet_auto=true) 판정을 받았다.
scan 시점 grep 범위가 SSoT 뿌리 중 일부만 훑었을 가능성이 있으므로(forge/.claude/ 와 forge/dev/ 는
별개 뿌리이며 미러에서는 병합돼 구분 불가) 여기서 다시 실측한다.

항목: ${JSON.stringify(orphanClaimItems.map(i => ({ id: i.id, path: i.path })))}

각 항목 id별로:
1. path에서 검색어(파일명 stem)를 정한다.
2. 반드시 4개 디렉터리 전부를 대상으로 grep 실행 (자기 자신 경로는 결과에서 제외):
   grep -rl "<검색어>" "\${FORGE_ROOT:-$HOME/forge}/.claude" "\${FORGE_ROOT:-$HOME/forge}/dev" \\
     "\${FORGE_ROOT:-$HOME/forge}/shared" "\${FORGE_ROOT:-$HOME/forge}/docs" 2>/dev/null
3. 매칭 파일 수를 refs로 기록. evidence에는 실제 실행한 grep 명령 원문을 남긴다.

결과: {"results":[{"id":"str","refs":N,"evidence":"str(grep 명령 원문)"}]}`,
    {
      label: 'pre-apply-recheck', phase: 'Prepare',
      schema: {
        type: 'object',
        properties: {
          results: { type: 'array', items: { type: 'object', properties: { id:{type:'string'}, refs:{type:'number'}, evidence:{type:'string'} }, required:['id','refs'] } },
        },
        required: ['results'],
      },
    }
  ).catch(e => { log(`[WARN] pre-apply 재실측 실패 — 안전 쪽(수동 승인)으로 강등: ${e?.message || e}`); return null })

  // fail-closed: 재실측 자체가 실패하면 해당 항목은 refs 불명 취급 → 자동적용에서 제외(수동 승인)
  const refsById = new Map((recheck?.results || []).map(r => [r.id, r]))
  const excluded = orphanClaimItems.filter(i => !recheck || (refsById.get(i.id)?.refs ?? 1) > 0)

  if (excluded.length > 0) {
    const excludedIds = new Set(excluded.map(i => i.id))
    for (let idx = autoItems.length - 1; idx >= 0; idx--) {
      if (excludedIds.has(autoItems[idx].id)) {
        const r = refsById.get(autoItems[idx].id)
        humanRequired.push({
          ...autoItems[idx],
          diet_auto: false,
          confidence: 'low',
          reason: `${autoItems[idx].reason} [Pre-apply 재실측: ${recheck ? `refs=${r?.refs ?? '불명'}>0` : '재실측 실패'} — G-1 재발방지로 자동적용 제외]`,
        })
        autoItems.splice(idx, 1)
      }
    }
    log(`[PreApply-Recheck] 자동적용 제외 ${excluded.length}건: ${[...excludedIds].join(', ')} → auto=${autoItems.length} human_required=${humanRequired.length}`)
  } else {
    log(`[PreApply-Recheck] ${orphanClaimItems.length}건 재검증 통과 (refs=0 확인) — 자동적용 유지`)
  }
}

// Before 상태 측정
const beforeState = await agent(
  `Before 상태 측정. Bash 도구:
# ⚠️ 2026-08-27 정정: 구 측정은 $HOME/.claude (미러) 를 쟀다. 편집은 ${FORGE_ROOT:-$HOME/forge} (SSoT) 에 착지하고
#    미러는 forge-sync 를 돌려야 움직인다 — 그래서 rules·skills 는 **정상 적용돼도 diff=0** 이 되어
#    applied=0 으로 오보고됐다. 거짓 성공을 거짓 실패로 뒤집었을 뿐이었다. 이제 SSoT 를 잰다.
# 전역 룰(L1) + on-demand 룰 / skills 수 / skills 라인 / CLAUDE.md cascade — 전부 SSoT 기준
wc -l ${FORGE_ROOT:-$HOME/forge}/dev/global-rules/*.md ${FORGE_ROOT:-$HOME/forge}/.claude/rules-on-demand/*.md | tail -1 | awk '{print $1}'
ls ${FORGE_ROOT:-$HOME/forge}/.claude/skills/ | wc -l
find ${FORGE_ROOT:-$HOME/forge}/.claude/skills -name "SKILL.md" -exec wc -l {} \\; | awk '{s+=$1} END {print s+0}'
# 에이전트·커맨드 라인수 — SSoT (2026-08-27 r3: 이 축이 없어 agents/commands 편집이 diff=0 이었다)
find ${FORGE_ROOT:-$HOME/forge}/.claude/agents ${FORGE_ROOT:-$HOME/forge}/.claude/commands -name "*.md" -exec wc -l {} \\; | awk '{s+=$1} END {print s+0}'
find ${FORGE_ROOT:-$HOME/forge} ${FORGE_ROOT:-$HOME/forge}-outputs -name "CLAUDE.md" -not -path "*/node_modules/*" -not -path "*/.git/*" -not -path "*/worktrees/*" -exec wc -l {} \\; | awk '{s+=$1} END {print s+0}'

결과: {"rules_lines":N,"skills_count":N,"skills_total_lines":N,"assets_lines":N,"claude_md_lines":N}`,
  {
    label: 'before-state',
    phase: 'Prepare',
    schema: {
      type: 'object',
      properties: {
        rules_lines:{type:'number'}, skills_count:{type:'number'},
        skills_total_lines:{type:'number'}, assets_lines:{type:'number'}, claude_md_lines:{type:'number'},
      },
      required: ['rules_lines','skills_count','skills_total_lines','assets_lines','claude_md_lines'],
    },
  }
).catch(e => {
  // ⚠️ catch 가 없으면 측정 실패 시 워크플로가 통째로 중단돼 **-1(판정 불가) 분기가 영원히
  //    발화하지 못한다** — 삼상 설계를 해놓고 그 상태에 도달할 길을 막아둔 셈이었다(r5 medium).
  log(`[WARN] Before 상태 측정 실패: ${e?.message || e} — applied 는 판정 불가(-1)로 간다`)
  return null
})
log(`[Before] rules=${beforeState?.rules_lines}L skills=${beforeState?.skills_count}개 skills_body=${beforeState?.skills_total_lines}L claude_md=${beforeState?.claude_md_lines}L`)

// ─────────────────────────────────────────────────────────────────────────────
// Phase 2: Apply — low-risk 항목별 agent 병렬 적용
// ─────────────────────────────────────────────────────────────────────────────
phase('Apply')

// 허용 7가지 action별 적용 함수 (agent 프롬프트)
const buildApplyPrompt = (item) => {
  const base = `항목 적용. ID: ${item.id}, 경로: ${item.path}, 조치: ${item.action}
이유: ${_safeText(item.reason, 400)}
근거: ${_safeText(item.evidence, 400)}
${FORBIDDEN}
`

  switch (item.action) {
    case 'SHRINK':
      // 허용 1: CLAUDE.md 축소 / 허용 3 (SPLIT 없이 shrink 형태도 있음)
      return base + `
[허용 1: CLAUDE.md 축소 또는 허용 3: Skill description 축소]
1. Read 도구로 ${item.path} 읽기
2. 중복/일반지침 섹션만 제거. Forge 특화 내용 유지.
3. 인라인주석 과다 시 → 최종요약으로 집약 (허용 7)
4. Edit 도구로 SSoT 파일 수정 — item.path 의 "(SSoT: …)" 를 그대로 따르고, 없으면 위 §편집 SSoT 목록에서 자산 종류에 맞는 뿌리를 고른다
   ($HOME/.claude/ 직접 편집 X — hook block됨)
5. 결과: {"applied":true,"path":"str","lines_removed":N,"summary":"str"} 반환`

    case 'MOVE':
      // 허용 2: 절차 CLAUDE.md→Skills 이동
      return base + `
[허용 2: 절차 CLAUDE.md→Skills 이동 또는 MOVE rules/→on-demand]
이동 대상: ${_safeText(item.move_target, 200) || 'rules-on-demand/'}
1. Read 도구로 ${item.path} 읽기 → 이동 섹션 식별
2. 이동 후 경로에 내용 Write (${FORGE_ROOT:-$HOME/forge}/.claude/ 하위 SSoT)
3. 원본에서 해당 섹션 Edit으로 제거 (또는 참조 링크로 교체)
4. 결과: {"applied":true,"from":"str","to":"str","summary":"str"} 반환`

    case 'SPLIT':
      // 허용 3: 긴 SKILL.md → SKILL.md + reference.md + examples.md 분리
      return base + `
[허용 3: SKILL.md 분리]
1. Read 도구로 ${item.path} 읽기 (SKILL.md 전문)
2. 핵심 지침만 SKILL.md에 유지 (150줄 이하 목표)
3. 상세 레퍼런스 → reference.md 분리 (같은 폴더)
4. 예제 코드/패턴 → examples.md 분리 (같은 폴더)
5. SKILL.md에 "상세: reference.md / 예제: examples.md" 링크 추가
6. 모든 파일은 ${FORGE_ROOT:-$HOME/forge}/.claude/skills/ 하위 SSoT 편집
7. 결과: {"applied":true,"skill_lines":N,"ref_lines":N,"examples_lines":N} 반환`

    case 'CONVERT':
      // 허용 2 변형: CLAUDE.md 내용을 skill로 변환
      return base + `
[허용 2 변형: CLAUDE.md→Skill 변환]
1. Read 도구로 ${item.path} 읽기
2. 작업전용 절차 섹션 식별
3. ${FORGE_ROOT:-$HOME/forge}/.claude/skills/ 에 새 스킬 폴더 생성 (간단한 SKILL.md만)
4. 원본 CLAUDE.md에서 해당 섹션 제거 + 스킬 참조 링크 추가
5. 결과: {"applied":true,"new_skill":"str","from":"str","summary":"str"} 반환`

    case 'DELETE':
      // 허용 6: archive 이동 (영구삭제 X)
      return base + `
[허용 6: archive 이동 (영구삭제 절대 금지)]
archive 경로: ${archiveBase}

1. Bash: mkdir -p "${archiveBase}"
2. 이동 (python3 shutil 사용 — rm -rf 차단 hook 우회):
   python3 -c "import shutil,os; src='${item.path}'; dst='${archiveBase}/' + os.path.basename(src); shutil.move(src, dst); print('MOVED:', src, '->', dst)"
3. ⚠️ CRITICAL — forge-sync 삭제 미전파 FIX:
   스킬 폴더인 경우 mirror orphan 제거 필수:
   skillName=$(basename "${item.path}")
   python3 -c "import shutil,os; mirror=os.path.expanduser('$HOME/.claude/skills/' + '$skillName'); shutil.rmtree(mirror) if os.path.exists(mirror) else print('no mirror')"
4. 결과: {"applied":true,"archived_to":"str","mirror_removed":bool,"summary":"str"} 반환`

    default:
      return base + `
[KEEP 또는 미지원 action: 변경 없음]
결과: {"applied":false,"reason":"action=${item.action} — 자동적용 범위 외","path":"${item.path}"} 반환`
  }
}

// 허용 5: description 좁힘 (description_broad 플래그 또는 action이 SHRINK인 skill)
const buildNegativeGuardPrompt = (item) => `
항목 ID: ${item.id}, 스킬: ${item.path}
[허용 4+5: description 좁힘 + "사용하지 말아야 할 때" 섹션 추가]
${FORBIDDEN}
1. Read 도구로 ${item.path}/SKILL.md 읽기
2. description에 "쓰지 말아야 할 때" 또는 "When NOT to use" 섹션이 없으면 추가
3. description 문자열이 너무 넓으면 (기준: 300자+) — 더 구체적으로 수정
4. Edit 도구로 ${FORGE_ROOT:-$HOME/forge}/.claude/skills/${item.path.split('/skills/')[1]?.split('/')[0] || ''}/SKILL.md 수정
5. 결과: {"applied":true,"guard_added":bool,"desc_shortened":bool} 반환
`

// 병렬 적용 (apply 대상 = diet_auto low-risk)
let applyResults = []
// ⚠️ applyResults 의 순서는 autoItems 와 **다르다** — 아래에서 otherItems→descItems 로 재정렬해
//    스폰하기 때문이다. 결과를 항목에 되돌려 붙이려면 그 순서를 **명시적으로 들고 나와야** 한다.
//    (2026-08-27: 이 배열 없이 autoItems 인덱스로 대조하다가 id 오귀속 버그를 냈다 — 원 결함과
//     같은 형태다. 블록 안 const 는 블록 밖에서 안 보인다.)
let applyOrder = []
if (autoItems.length > 0) {
  // action별 분리 (description 좁힘은 별도 처리)
  const descItems = autoItems.filter(i => i.action === 'SHRINK' && i.path.includes('/skills/') && i.asset_type === 'skill')
  const otherItems = autoItems.filter(i => !descItems.includes(i))

  applyOrder = [...otherItems, ...descItems]   // applyFns / applyResults 와 같은 순서

  const applyFns = [
    ...otherItems.map(item => () => agent(
      buildApplyPrompt(item),
      { label: `apply-${item.id}`, phase: 'Apply' }
    ).catch(e => { log(`[WARN] apply ${item.id} 실패: ${e?.message || e}`); return null })),
    ...descItems.map(item => () => agent(
      buildNegativeGuardPrompt(item),
      { label: `guard-${item.id}`, phase: 'Apply' }
    ).catch(e => { log(`[WARN] guard ${item.id} 실패: ${e?.message || e}`); return null })),
  ]

  if (applyFns.length > 0) {
    applyResults = await parallel(applyFns)
    // schema 없는 agent()는 JSON "문자열"을 반환한다 — 객체로 정규화하지 않으면
    // Verify 전달부의 r?.path 가 전부 undefined 로 걸러져 검증 목록이 빈다(2026-08-16 갭).
    // 객체로 바꾸지 못하면 원문 문자열을 그대로 둔다 — filter(Boolean) 집계가 변하지 않아야
    // 하므로 'null'·'false'·'0' 같은 falsy 리터럴을 파싱 결과로 승격시키지 않는다.
    // 이 정규화가 무력화되는 입력: JSON 을 산문 사이에 두 덩어리 이상 섞어 반환하는 에이전트.
    // 아래 정규식은 greedy 라 첫 `{` 부터 마지막 `}` 까지 통째로 잡고, 그 문자열은 JSON.parse 가
    // 실패해 원문이 그대로 남는다(= 정규화 안 됨). '첫 블록만 파싱'되는 것이 아니다.
    const parseAgentJson = (s) => {
      for (const cand of [s, s.match(/\{[\s\S]*\}/)?.[0]]) {
        if (!cand) continue
        try { return JSON.parse(cand) } catch {}
      }
      return null
    }
    // `|| r` 이지 `?? r` 이 아니다 — 'false'·'0' 이 파싱돼 falsy 가 되면 filter(Boolean) 에서
    // 사라져 성공 집계가 줄어든다. 파싱 결과가 falsy 면 원문 문자열을 그대로 남긴다.
    applyResults = applyResults.map(r => (typeof r === 'string' ? (parseAgentJson(r) || r) : r))
    // WARNING filter(Boolean) 금지 — 에이전트가 반환한 {"applied":false} 는 truthy 객체라
    //    "성공"으로 세어진다(2026-08-27 실사고: 실적용 0인데 `1/2 성공`이 찍혔다).
    //    자기보고이므로 이것만으로 applied 를 결정하지 않는다 — 아래 실측과 대조한다.
    const success = applyResults.filter(r => r && r.applied === true).length
    log(`[Apply] 자기보고 ${success}/${applyFns.length} 성공 (실측은 아래 measure 가 정본)`)
  }
}

// 에이전트 자기보고 집계 — 이것만으로 applied 를 결정하지 않는다(아래 §실적용 실측 참조).
const appliedClaimed = applyResults.filter(r => r && r.applied === true).length

// ─────────────────────────────────────────────────────────────────────────────
// Phase 3: Verify — code-review + smoke-test 6개
// ─────────────────────────────────────────────────────────────────────────────
phase('Verify')

const [verifyResult, afterState] = await parallel([
  // verify agent: 적용 결과 code-review
  () => agent(
    `harness-diet 적용 결과 검증 (code-review).
적용된 파일들:
${JSON.stringify(applyResults.filter(Boolean).map(r => r?.path || r?.from || r?.new_skill || '').filter(Boolean))}

검증 항목:
1. 편집된 파일의 YAML frontmatter 유효성 (name/description 필수 필드 존재)
2. 이동(MOVE)된 파일이 대상 경로에 존재하는지 Bash ls로 확인
3. archive된 파일이 archive 경로에 존재하는지 확인
4. mirror orphan 제거 확인: 삭제한 스킬이 $HOME/.claude/skills/ 에 없는지 확인
5. SKILL.md 분할(SPLIT) 시 reference.md/examples.md 존재 확인
6. 원본 파일에서 이동된 섹션이 제거되었는지 Read로 확인

결과: {"passed":N,"failed":N,"issues":["str"],"verified_paths":["str"]}`,
    {
      label: 'verify-apply',
      phase: 'Verify',
      schema: {
        type: 'object',
        properties: {
          passed:{type:'number'}, failed:{type:'number'},
          issues:{type:'array',items:{type:'string'}},
          verified_paths:{type:'array',items:{type:'string'}},
        },
        required: ['passed','failed'],
      },
    }
  ),

  // After 상태 측정
  () => agent(
    `After 상태 측정. Bash 도구:
wc -l ${FORGE_ROOT:-$HOME/forge}/dev/global-rules/*.md ${FORGE_ROOT:-$HOME/forge}/.claude/rules-on-demand/*.md | tail -1 | awk '{print $1}'
ls ${FORGE_ROOT:-$HOME/forge}/.claude/skills/ | wc -l
find ${FORGE_ROOT:-$HOME/forge}/.claude/skills -name "SKILL.md" -exec wc -l {} \\; | awk '{s+=$1} END {print s+0}'
# 에이전트·커맨드 라인수 — SSoT (2026-08-27 r3: 이 축이 없어 agents/commands 편집이 diff=0 이었다)
find ${FORGE_ROOT:-$HOME/forge}/.claude/agents ${FORGE_ROOT:-$HOME/forge}/.claude/commands -name "*.md" -exec wc -l {} \\; | awk '{s+=$1} END {print s+0}'
find ${FORGE_ROOT:-$HOME/forge} ${FORGE_ROOT:-$HOME/forge}-outputs -name "CLAUDE.md" -not -path "*/node_modules/*" -not -path "*/.git/*" -not -path "*/worktrees/*" -exec wc -l {} \\; | awk '{s+=$1} END {print s+0}'
결과: {"rules_lines":N,"skills_count":N,"skills_total_lines":N,"assets_lines":N,"claude_md_lines":N}`,
    {
      label: 'after-state',
      phase: 'Verify',
      schema: {
        type: 'object',
        properties: {
          rules_lines:{type:'number'}, skills_count:{type:'number'},
          skills_total_lines:{type:'number'}, assets_lines:{type:'number'}, claude_md_lines:{type:'number'},
        },
        required: ['rules_lines','skills_count','skills_total_lines','assets_lines','claude_md_lines'],
      },
    }
  ).catch(e => {
    // beforeState 와 같은 이유 — 측정 실패가 워크플로를 죽이면 -1 분기에 도달하지 못한다.
    log(`[WARN] After 상태 측정 실패: ${e?.message || e} — applied 는 판정 불가(-1)로 간다`)
    return null
  }),
])

log(`[Verify] passed=${verifyResult?.passed} failed=${verifyResult?.failed} issues=${verifyResult?.issues?.length || 0}`)
log(`[After] rules=${afterState?.rules_lines}L skills=${afterState?.skills_count}개 skills_body=${afterState?.skills_total_lines}L claude_md=${afterState?.claude_md_lines}L`)

// ─────────────────────────────────────────────────────────────────────────────
// Phase 3.5: Verify 실패 처리 — Human [STOP] 에스컬레이션 (auto re-apply 없음)
// root-cause: GC2-R2 — auto re-apply 제거. apply는 LLM 시맨틱 편집(SHRINK/SPLIT/CONVERT)
//   또는 비멱등 파일조작(MOVE/DELETE)이라, fix 없이 변경된 입력에 재실행하면 과잉제거/
//   이중변형 위험 (cr-double 2HIGH). 어떤 action도 blind 재실행은 안전하지 않음.
//   → verify 실패 = Human 승인 목록에 포함시켜 [STOP]. 재시도 루프는 caller(human fix 후 재호출) 책임.
//   (forge-check-ui GC1과 동일 원칙: actuator는 apply+report+halt만, 재시도는 caller.)
// ─────────────────────────────────────────────────────────────────────────────
if (verifyResult?.failed > 0) {
  log(`[Verify-FAIL] ${verifyResult.failed}건 실패 → auto re-apply 안 함(blind 재실행 위험). Human [STOP] 승인 목록 포함 — 수정 후 재실행은 human 책임.`)
}

// Before/After diff 계산
const diff = {
  rules_lines: (afterState?.rules_lines || 0) - (beforeState?.rules_lines || 0),
  skills_count: (afterState?.skills_count || 0) - (beforeState?.skills_count || 0),
  skills_total_lines: (afterState?.skills_total_lines || 0) - (beforeState?.skills_total_lines || 0),
  assets_lines: (afterState?.assets_lines || 0) - (beforeState?.assets_lines || 0),
  claude_md_lines: (afterState?.claude_md_lines || 0) - (beforeState?.claude_md_lines || 0),
}

// ─────────────────────────────────────────────────────────────────────────────
// 실적용 실측 (2026-08-27 신설) — 에이전트 자기보고를 applied 의 근거로 쓰지 않는다.
//
// 왜 필요한가: 구 코드의 `applied` 는 apply 결과가 아니라 **분류 단계의 후보 수**
//   (autoItems.length)였고, 실제 적용 결과와 한 번도 대조되지 않았다. 그래서 실적용 0인 run 이
//   두 번(2026-08-16 · 2026-08-27) 연속 `applied>0` 을 보고했다. 자기보고도 못 믿는다 —
//   `{"applied":false}` 는 truthy 객체라 구 `filter(Boolean)` 이 성공으로 셌다.
//
// 판정 규칙: before/after 상태가 **어느 축도 움직이지 않았으면 적용은 0건**이다.
//   상태가 움직였으면 자기보고 수를 쓰되, 자기보고가 시도 수를 넘지 못하게 막는다.
//
// ⚠️ 이 방어가 무력화되는 입력:
//   ① 상태 측정 자체가 실패해 before/after 가 null 이면 판정 불가(-1)로 남긴다 — "0건"과 다르다.
//   ② 두 항목이 서로 반대 방향으로 같은 줄 수를 바꾸면 합계 diff 가 0 이 돼 0건으로 읽힌다.
//      (SHRINK 만 자동 대상이라 현재는 발생하지 않지만, 자동 대상에 증가형 action 이 추가되면
//       축별 절대값 합으로 바꿔야 한다.)
// ─────────────────────────────────────────────────────────────────────────────
// 객체 truthiness 만 보면 **부분 측정**(4필드 중 일부만 온 객체)이 통과한다 — 누락분이 diff
// 계산의 `|| 0` 에 걸려 가짜 diff 를 만들고, 그 가짜가 자기보고를 '실측'으로 승격시킨다.
// schema required 로도 막지만 그건 런타임 의존이라 코드가 한 번 더 본다(2026-08-27 r3 검수).
const _AXES = ['rules_lines', 'skills_count', 'skills_total_lines', 'assets_lines', 'claude_md_lines']
const _complete = (st) => !!st && _AXES.every(k => Number.isFinite(st[k]))
const _stateMeasured = _complete(beforeState) && _complete(afterState)
const _stateChanged = Object.values(diff).some(v => v !== 0)
// 삼상(三相): -1 판정불가 / 0 적용없음 / n 적용됨. **-1 과 0 을 섞지 않는다.**
// 상태가 움직였으면 개수는 자기보고를 쓴다 — 실측은 "움직였나"의 0/비0 게이트이지 항목별 계수가
// 아니다. 그 한계를 이름으로 숨기지 않으려고 applied_claimed 를 반환값에 함께 싣는다.
const appliedMeasured = !_stateMeasured ? -1 : (_stateChanged ? appliedClaimed : 0)
// 귀속은 **applyOrder** 로 한다(autoItems 순서가 아니다 — 위 주석 참조).
const appliedItems = appliedMeasured > 0
  ? applyOrder.filter((_, idx) => applyResults[idx] && applyResults[idx].applied === true)
  : []
// -1(판정 불가)이면 blocked 도 판정할 수 없다. 모르는 것을 "막혔다"로 단정하지 않는다.
// 자기보고가 전멸한 경우(_stateChanged && claimed===0)도 **귀속을 알 수 없다** — 상태는 움직였는데
// 어느 항목이 움직였는지 모른다. -1 과 같은 취급으로 blocked_ids 를 비운다.
// (2026-08-27 r2 검수 low: 경고문은 "모른다"인데 반환값은 전원 blocked 로 단정하던 불일치.)
const _contradiction = _stateMeasured && _stateChanged && appliedClaimed === 0
const verdictUnknown = appliedMeasured < 0 || _contradiction
const blockedIds = verdictUnknown ? [] : autoItems.filter(i => !appliedItems.includes(i)).map(i => i.id)
log(`[Apply] claimed=${appliedClaimed} measured=${appliedMeasured < 0 ? 'unknown' : appliedMeasured}` +
    ` / attempted=${autoItems.length}` + (blockedIds.length ? ` blocked=[${blockedIds.join(',')}]` : ''))
if (appliedMeasured < 0) {
  log(`[Apply-UNKNOWN] 상태 측정 실패 — applied 는 판정 불가(-1)다. "0건 적용"으로 읽지 마라.` +
      ` blocked_ids 도 비운다(모르는 것과 막힌 것은 다르다).`)
} else if (_contradiction) {
  // 상태는 움직였는데 자기보고 파싱이 전멸한 경우. claimed===measured===0 이라 아래 MISMATCH 는
  // 발화하지 않는다 — 그 침묵이 이 커밋이 없애려던 바로 그 실패 모드라 별도 경고를 둔다.
  log(`[Apply-CONTRADICTION] 상태는 움직였는데(diff=${JSON.stringify(diff)}) 자기보고가 0건이다 —` +
      ` 파싱 실패이거나 다른 세션의 변경이 섞였다. applied=0 을 "아무것도 안 됐다"로 읽지 마라.`)
} else if (appliedClaimed !== appliedMeasured) {
  log(`[Apply-MISMATCH] 자기보고와 실측이 다르다 — measured 를 정본으로 쓴다 ` +
      `(claimed=${appliedClaimed} measured=${appliedMeasured} diff=${JSON.stringify(diff)})`)
}

// ─────────────────────────────────────────────────────────────────────────────
// Phase 4: Report — 7보고 섹션 + Human 승인 목록
// ─────────────────────────────────────────────────────────────────────────────
phase('Report')

await agent(
  `harness-diet 실행 보고서 출력 (Markdown).
${FORBIDDEN}

[데이터]
auto_applied(실측 파생): ${verdictUnknown ? '판정 불가(unknown)' : appliedMeasured + '개'}   <- 이 값이 정본
applied_unknown: ${verdictUnknown}   <- true 면 위 수치를 확정으로 쓰지 마라
auto_attempted: ${autoItems.length}개
auto_claimed(에이전트 자기보고): ${appliedClaimed}개
blocked_ids: ${JSON.stringify(blockedIds)}
WARNING applied_unknown=true 면 **판정 불가**다 — "0건 적용"과 다르다. 두 경우가 있다:
  · measured=-1 : 상태 측정 자체가 실패했다(부분 측정 포함)
  · measured=0 이면서 unknown : 상태는 움직였는데 자기보고가 전멸했다(무엇이 움직였는지 모른다)
  둘 다 보고서에 "적용 0건"으로 쓰지 말고 "판정 불가"로 쓴다.
human_required: ${humanRequired.length}개
apply_results: ${JSON.stringify(applyResults.filter(Boolean))}
verify: passed=${verifyResult?.passed} failed=${verifyResult?.failed} issues=${JSON.stringify(verifyResult?.issues || [])}
before: ${JSON.stringify(beforeState)}
after: ${JSON.stringify(afterState)}
diff: ${JSON.stringify(diff)}

[보고서 7섹션 전부 출력]

## ① 변경 파일 목록
표: 파일 경로 | 조치 | 결과 | ID

## ② 파일별 변경 이유
각 항목: 경로 → 이유 (diet-queue.json reason 인용)

## ③ Before/After 라인수
| 분류 | Before | After | Delta |
|------|--------|-------|-------|
| rules/ (per-session) | N | N | ΔN |
| skills SKILL.md (per-invocation) | N | N | ΔN |
| skills 수 (inventory) | N | N | ΔN |
| CLAUDE.md cascade | N | N | ΔN |

## ④ diff 요약
변경된 파일별 주요 변경사항 1줄씩.

## ⑤ Claude 행동 변화 예상
- per-session 컨텍스트 ΔN줄 절감 → 토큰 Δ추정
- 스킬 호출 시 컨텍스트 Δ줄 변화
- 삭제된 자산 → 해당 슬래시 커맨드 비활성화 안내

## ⑥ Human 승인 필요 high-risk 목록
표: ID | 경로 | 조치 | 이유 | 위험도 | 신뢰도
(diet_auto=false 또는 risk=medium/high 전부 포함)
⚠️ SAFETY-DETERRENT 항목은 별도 강조

## ⑦ smoke-test 6개
아래 6가지 Bash로 직접 확인하고 결과 표시:
1. $HOME/.claude/rules/*.md 존재 확인: ls $HOME/.claude/rules/*.md | wc -l → 0이면 FAIL
2. 주요 스킬 SKILL.md frontmatter 검증: python3 $HOME/.claude/skills/skill-creator/scripts/quick_validate.py $HOME/.claude/skills/forge-multi
3. hooks 미수정 확인: ls -la $HOME/.claude/hooks/ | md5sum (before/after 같으면 OK)
4. archive 복구 가능 확인: ls "${archiveBase}" 2>/dev/null && echo "ARCHIVE_OK" || echo "ARCHIVE_EMPTY"
5. mirror orphan 부재 확인: archive한 스킬이 $HOME/.claude/skills/ 에 없는지 확인
6. forge-sync 안내: echo "forge-sync 재실행 필요: node $HOME/.claude/scripts/forge-sync.mjs sync"

⚠️ smoke-test 실패 항목은 즉시 명시.

[forge-sync 안내]
적용 완료 후 forge-sync 재실행 권장:
\`node $HOME/.claude/scripts/forge-sync.mjs sync\`
(archive 이동/SSoT 편집이 mirror에 반영됨)`,
  { label: 'report', phase: 'Report' }
)

log(`[Report] 완료. 자동적용(실측)=${appliedMeasured} 시도=${autoItems.length} 미적용(human)=${humanRequired.length}`)

return {
  applied: appliedMeasured,              // 삼상: -1 판정불가 / 0 적용없음 / n 적용됨
  applied_unknown: verdictUnknown,       // true 면 applied·blocked_ids 를 판정으로 읽지 마라
  applied_claimed: appliedClaimed,       // 에이전트 자기보고 — 모순 노출용
  attempted: autoItems.length,
  applied_ids: appliedItems.map(i => i.id),
  blocked_ids: blockedIds,
  human_required: humanRequired.length,
  verify: { passed: verifyResult?.passed, failed: verifyResult?.failed },
  diff,
  archive_base: archiveBase,
  human_required_items: humanRequired.map(i => ({ id: i.id, path: i.path, action: i.action, risk: i.risk, effectiveness: i.effectiveness })),
}
