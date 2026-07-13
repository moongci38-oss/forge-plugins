# Storage Management

Manage cookies, localStorage, sessionStorage, and browser storage state.

## Storage State

Save and restore complete browser state including cookies and storage.

### Save Storage State

```bash
# Save to auto-generated filename (storage-state-{timestamp}.json)
playwright-cli state-save

# Save to specific filename
playwright-cli state-save my-auth-state.json
```

### Restore Storage State

```bash
# Load storage state from file
playwright-cli state-load my-auth-state.json

# Reload page to apply cookies
playwright-cli open https://example.com
```

### Storage State File Format

The saved file contains:

```json
{
  "cookies": [
    {
      "name": "session_id",
      "value": "abc123",
      "domain": "example.com",
      "path": "/",
      "expires": 1735689600,
      "httpOnly": true,
      "secure": true,
      "sameSite": "Lax"
    }
  ],
  "origins": [
    {
      "origin": "https://example.com",
      "localStorage": [
        { "name": "theme", "value": "dark" },
        { "name": "user_id", "value": "12345" }
      ]
    }
  ]
}
```

## Cookies

### List All Cookies

```bash
playwright-cli cookie-list
```

### Filter Cookies by Domain

```bash
playwright-cli cookie-list --domain=example.com
```

### Filter Cookies by Path

```bash
playwright-cli cookie-list --path=/api
```

### Get Specific Cookie

```bash
playwright-cli cookie-get session_id
```

### Set a Cookie

```bash
# Basic cookie
playwright-cli cookie-set session abc123

# Cookie with options
playwright-cli cookie-set session abc123 --domain=example.com --path=/ --httpOnly --secure --sameSite=Lax

# Cookie with expiration (Unix timestamp)
playwright-cli cookie-set remember_me token123 --expires=1735689600
```

### Delete a Cookie

```bash
playwright-cli cookie-delete session_id
```

### Clear All Cookies

```bash
playwright-cli cookie-clear
```

### Advanced: Multiple Cookies or Custom Options

For complex scenarios like adding multiple cookies at once, use `run-code`:

```bash
playwright-cli run-code "async page => {
  await page.context().addCookies([
    { name: 'session_id', value: 'sess_abc123', domain: 'example.com', path: '/', httpOnly: true },
    { name: 'preferences', value: JSON.stringify({ theme: 'dark' }), domain: 'example.com', path: '/' }
  ]);
}"
```

## Local Storage

### List All localStorage Items

```bash
playwright-cli localstorage-list
```

### Get Single Value

```bash
playwright-cli localstorage-get token
```

### Set Value

```bash
playwright-cli localstorage-set theme dark
```

### Set JSON Value

```bash
playwright-cli localstorage-set user_settings '{"theme":"dark","language":"en"}'
```

### Delete Single Item

```bash
playwright-cli localstorage-delete token
```

### Clear All localStorage

```bash
playwright-cli localstorage-clear
```

### Advanced: Multiple Operations

For complex scenarios like setting multiple values at once, use `run-code`:

```bash
playwright-cli run-code "async page => {
  await page.evaluate(() => {
    localStorage.setItem('token', 'jwt_abc123');
    localStorage.setItem('user_id', '12345');
    localStorage.setItem('expires_at', Date.now() + 3600000);
  });
}"
```

## Session Storage

### List All sessionStorage Items

```bash
playwright-cli sessionstorage-list
```

### Get Single Value

```bash
playwright-cli sessionstorage-get form_data
```

### Set Value

```bash
playwright-cli sessionstorage-set step 3
```

### Delete Single Item

```bash
playwright-cli sessionstorage-delete step
```

### Clear sessionStorage

```bash
playwright-cli sessionstorage-clear
```

## IndexedDB

### List Databases

```bash
playwright-cli run-code "async page => {
  return await page.evaluate(async () => {
    const databases = await indexedDB.databases();
    return databases;
  });
}"
```

### Delete Database

```bash
playwright-cli run-code "async page => {
  await page.evaluate(() => {
    indexedDB.deleteDatabase('myDatabase');
  });
}"
```

## Common Patterns

### Authentication State Reuse

```bash
# Step 1: Login and save state
playwright-cli open https://app.example.com/login
playwright-cli snapshot
playwright-cli fill e1 "user@example.com"
playwright-cli fill e2 "password123"
playwright-cli click e3

# Save the authenticated state
playwright-cli state-save auth.json

# Step 2: Later, restore state and skip login
playwright-cli state-load auth.json
playwright-cli open https://app.example.com/dashboard
# Already logged in!
```

### Save and Restore Roundtrip

```bash
# Set up authentication state
playwright-cli open https://example.com
playwright-cli eval "() => { document.cookie = 'session=abc123'; localStorage.setItem('user', 'john'); }"

# Save state to file
playwright-cli state-save my-session.json

# ... later, in a new session ...

# Restore state
playwright-cli state-load my-session.json
playwright-cli open https://example.com
# Cookies and localStorage are restored!
```

## Security Notes

- Never commit storage state files containing auth tokens
- Add `*.auth-state.json` to `.gitignore`
- Delete state files after automation completes
- Use environment variables for sensitive data
- By default, sessions run in-memory mode which is safer for sensitive operations

## 비밀값 주입 (secret injection)

로그인 자동화 스크립트에 비밀번호·API 키·토큰을 **코드나 저장소에 평문으로 하드코딩하지 않는다.** (forge-core 보안: "하드코딩 시크릿 금지")

- **허용**: `.env` 참조 또는 secret manager ref로만 주입.
  ```bash
  # .env 참조 (환경변수 주입)
  PW_USER="$LOGIN_USER" PW_PASS="$LOGIN_PASS" playwright-cli run login.js
  ```
  ```js
  // login.js — 값은 env에서만 읽는다
  const user = process.env.PW_USER;
  const pass = process.env.PW_PASS;
  if (!user || !pass) throw new Error('missing credentials env');
  ```
- **금지**: `const pass = "myS3cret"` 같은 평문 상수, 저장소에 커밋되는 파일에 비밀값 기입.
- storage-state(쿠키·세션) 파일 자체도 비밀 자산 — `.gitignore` 등록, 커밋 금지.
