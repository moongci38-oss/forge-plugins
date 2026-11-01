# forge#4135 sync-js-interp mutation

- 되돌림: `transform_line` 끝에 지운 '줄 전체 `${` 이스케이프'(`re.sub(r'(?<!\\)\$\{', …)`)를 되살린 사본으로 시험
```
  FAIL  ⑪-g 원래 JS 보간까지 이스케이프했다  log(`차단: \${host} \${FORGE_ROOT:-$HOME/forge}/a`)
PASS=66  FAIL=2  SKIP=0
```
- 복구(이 PR): ⑪-g PASS · PASS=68 FAIL=0

## 자기 적대
1. 만든 `${…}` 이스케이프가 빠졌나 → ⑪-d(ESM 실제 파싱)·⑪-g(`\${FORGE_ROOT:-$HOME/forge}` 확인) 둘 다 PASS.
2. 재동기화마다 백슬래시가 쌓이나 → 이미 바뀐 `\${FORGE_ROOT:-$HOME/forge}` 엔 `~/forge` 가 없어 다시 안 바뀐다 · ⑪-e PASS.
3. 비-JS 출력이 바뀌었나 → esc 는 js_mode 일 때만 · ⑪-f PASS · RE_CLAUDE·RE_HOME_ANY 는 `${` 를 안 만들어 그대로.
