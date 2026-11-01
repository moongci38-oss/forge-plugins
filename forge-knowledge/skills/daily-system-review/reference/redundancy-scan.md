# Redundancy 스캔 상세 명령 (P2-1, 주간)

> SKILL.md에서 이관됨 — 매주 1회(weekly 실행 시) 수행하는 3개 체크의 실제 명령.

1. **신규 deprecated/orphan 스킬 감지**:
   `find $HOME/.claude/skills -name "eval_cases.jsonl" | xargs wc -l 2>/dev/null | awk '$1==0'` → 90일 미갱신 스킬 목록
   90일 이상 eval 0건인 스킬 → Redundancy 후보 등록

2. **Hook theater 신규 감지**:
   `grep -l "exit 0$" $HOME/.claude/hooks/*.sh 2>/dev/null` → WARN-only hook 수 변화 추적
   이전 주 대비 증가 시 → enforcement-theater 신호

3. **규칙 파일 수 추세**:
   `ls $HOME/.claude/rules/ $HOME/.claude/rules-on-demand/ 2>/dev/null | wc -l` → 파일 수 추적
   10% 이상 증가 시 → 중복 점검 권고

결과를 `01-research/daily/{date}/redundancy-scan.json`에 저장. 이상 감지 시 적용계획서에 "Redundancy 섹션" 추가.
