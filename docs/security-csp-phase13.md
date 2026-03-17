# Phase 13 - Security/CSP Hardening

## 목표

- CSP strict 페이지(`script-src 'self'`, inline script 불가)에서 HGrid가 동작한다.
- 기본 렌더 경로는 XSS-safe(`textContent`)를 유지한다.
- HTML 렌더는 명시적 opt-in에서만 동작하고 sanitize 훅을 지원한다.
- `editCommit` 이벤트의 감사(audit) payload를 표준화한다.

## 코어 변경

### 1) CSP strict 보강

- CSP smoke fixture는 외부 script만 사용한다.
- `scripts/csp-smoke-test.mjs`에서 inline script 개수(`script:not([src])`)가 0인지 검증한다.
- `scripts/security-scan.mjs`를 추가하여 다음 패턴을 정적 검출한다.
  - `eval(...)`
  - `new Function(...)`
  - `setTimeout("...")`
  - `setInterval("...")`

### 2) XSS 기본값 + opt-in HTML

- 기본 셀 렌더는 기존과 동일하게 `textContent`를 사용한다.
- clipboard paste는 편집 overlay 밖에서는 `text/plain`만 소비하고, `text/html` only payload는 no-op + `preventDefault()`로 처리한다.
- 컬럼 단위 opt-in:
  - `ColumnDef.unsafeHtml?: boolean`
  - `ColumnDef.sanitizeHtml?: UnsafeHtmlSanitizer`
- 그리드 공통 sanitize 훅:
  - `GridOptions.sanitizeHtml?: UnsafeHtmlSanitizer`
- E5.1 secure-by-default 정책:
  - `GridOptions.htmlRendering?.unsafeHtmlPolicy?: "sanitizedOnly" | "allowRaw"`
  - 기본값은 `"sanitizedOnly"`
- 적용 우선순위:
  1. `column.sanitizeHtml`
  2. `grid.options.sanitizeHtml`
  3. 훅이 없고 policy가 `"sanitizedOnly"`면 literal text fallback
  4. 훅이 없고 policy가 `"allowRaw"`면 raw HTML 렌더

### 2.1) sanitizer reference implementation

```ts
function strictSanitize(unsafeHtml: string): string {
  return unsafeHtml
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '')
    .replace(/<img[\s\S]*?>/gi, '')
    .replace(/\son[a-z]+\s*=\s*(['"]).*?\1/gi, '')
    .replace(/javascript:/gi, '');
}
```

- 권장 정책:
  - `unsafeHtml: true`는 정말 필요한 컬럼에서만 켠다.
  - production에서는 `sanitizeHtml` 또는 `column.sanitizeHtml`를 항상 제공한다.
  - legacy migration이 필요할 때만 `htmlRendering.unsafeHtmlPolicy = "allowRaw"`를 제한적으로 사용한다.

### 3) styleNonce 옵션

- `GridOptions.styleNonce?: string`를 public option으로 추가했다.
- E5.2 결정:
  - 현재 core와 plugin에는 동적 `<style>` 태그 주입 경로가 없다.
  - 따라서 `styleNonce`는 reserved 상태로 유지하고, 실제 runtime effect는 없다.
  - future plugin이 style tag를 주입해야 할 때만 `nonce`를 필수로 연결한다.

### 3.1) Trusted Types 대응

- `GridOptions.htmlRendering?.trustedTypesPolicyName?: string`
- 동작:
  - browser가 `window.trustedTypes`를 제공하고
  - `trustedTypesPolicyName`이 주어지면
  - core는 그 이름으로 `createPolicy(name, { createHTML })`를 1회 생성해 HTML sink에 사용한다.
- 기본값:
  - policy는 자동 생성하지 않는다.
  - app이 TT 정책 이름과 CSP `trusted-types` directive를 소유한다.
- scope:
  - 현재 TT sink 지원은 `unsafeHtml` HTML cell path에 한정된다.
  - 기본 secure-by-default path(`sanitizedOnly` + no sanitizer fallback)는 TT가 없어도 text path로 안전하다.

### 3.2) strict CSP 지원 범위

- core / adapter / plugin은 다음을 사용하지 않는다.
  - `eval`
  - `new Function`
  - string timer
  - 동적 script tag 삽입
- examples는 개발용 데모라 inline script/style를 포함한다.
- strict CSP 검증은 example 페이지가 아니라 CSP smoke fixture를 기준으로 판단한다.

### 4) editCommit 감사 payload 표준화

- `editCommit` payload는 `EditCommitEventPayload`로 표준화한다.
- 필드:
  - `rowIndex`, `dataIndex`, `rowKey`
  - `columnId`, `previousValue`, `value`
  - `source: 'editor' | 'clipboard' | 'fillHandle' | 'undo' | 'redo'`
  - `commitId`, `transactionId`, `rootTransactionId`, `transactionKind`, `transactionStep`
  - `timestampMs`, `timestamp`
  - `rowCount`, `cellCount`, `changes[]`
- 엔터프라이즈 감사 훅:
  - `GridOptions.onAuditLog?: EditCommitAuditLogger`
  - payload: `EditCommitAuditPayload` (`schemaVersion = 1`, `eventName: 'editCommit'`, `changeIndex?` 포함)

## 테스트

- unit (`packages/grid-core/test/grid.spec.ts`)
  - 기본 text cell은 literal text 유지
  - html-only clipboard payload가 body paste 경로에서 무시되는지 검증
  - `unsafeHtml` + sanitizer 미제공 시 literal text fallback 검증
  - `unsafeHtml` + sanitize 훅 적용 시 HTML 렌더/유해 태그 제거 검증
  - `htmlRendering.unsafeHtmlPolicy = "allowRaw"`일 때만 raw HTML 허용 검증
  - `editCommit` 표준 payload/`onAuditLog` payload 검증
- e2e (`scripts/run-e2e.mjs`)
  - `example41.html`:
    - strict sanitize / strict no sanitizer / legacy raw 전환 시 HTML fallback 정책 검증
  - `example89.html`:
    - strict/sanitized/legacy 정책 매트릭스 검증
  - `example90.html`:
    - `trustedTypesPolicyName` + sanitizer 조합 smoke
- CSP smoke (`scripts/csp-smoke-test.mjs`)
  - strict CSP + no-inline-script 검증

## Plugin 규칙

- plugin 규칙은 [plugin-csp-phase-e5.md](./plugin-csp-phase-e5.md)에 고정한다.
- 검증 체계는 [security-verification-phase-e5.md](./security-verification-phase-e5.md)에 고정한다.
- 감사 스키마/incident/masking 운영 가이드는 [security-operations-phase-e5.md](./security-operations-phase-e5.md)에 고정한다.
