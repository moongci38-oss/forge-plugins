## Markdown → DOCX 고품질 변환 (Korean / 한국어 문서)

**항상 이 스크립트 사용** (Claude Desktop 동일 스타일):

```bash
NODE_PATH=$(npm root -g) node scripts/md2docx.js <input.md> <output.docx>
# 폰트 사이즈 조정
NODE_PATH=$(npm root -g) node scripts/md2docx.js <input.md> <output.docx> --body-sz 19 --hdr-sz 21
```

### 레이아웃 기준

| 항목 | 값 |
|------|-----|
| 페이지 크기 | 19800×14040 DXA (13.75×9.75") |
| 여백 | 720 DXA (0.5") all sides |
| 콘텐츠 너비 | 18360 DXA |
| 폰트 | Arial (eastAsia=Arial) |
| 테이블 헤더 fill | `2E75B6` (파란색), CENTER, 흰 텍스트 |
| P레벨 테이블 교번색 | P0=`E2EFDA`, P1=`FFF2CC`, P2=`E2F0D9`, P3=`EAE0F0` |
| 일반 테이블 교번색 | `F5F5F5` / white |
| 셀 폰트 기본 | hdr=18 (9pt), body=16 (8pt) — `scripts/md2docx.js` 실제 기본값 · `--hdr-sz`/`--body-sz` 로 조정 |
| 셀 테두리 | `CCCCCC` single sz=1 |

### P레벨 자동 감지 규칙
- 첫 헤더 = "P" → 우선순위 정의 테이블 (행별 P레벨 색상)
- "P" 컬럼 존재 + 지배적 P레벨 감지 → 해당 P레벨 교번색
- 그 외 → F5F5F5/white 교번

### 특수 문서 (하드코딩 스크립트)

PLAN.md, OPEN-DECISIONS.md 등 복잡한 운영툴 문서는 전용 스크립트 사용:

```bash
# PLAN.md / OPEN-DECISIONS.md → DOCX (P레벨 색상 + 파란 헤더)
NODE_PATH=$(npm root -g) node scripts/generate_plan.js <input.md> <output.docx>
```

추가 문서 유형이 생기면 `scripts/generate_*.js` 형태로 별도 스크립트 작성.
`hdrCell`, `mkCell`, `buildTable`, `detectPLevel` 함수는 generate_plan.js에서 재사용 가능.
