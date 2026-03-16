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
- 컬럼 단위 opt-in:
  - `ColumnDef.unsafeHtml?: boolean`
  - `ColumnDef.sanitizeHtml?: UnsafeHtmlSanitizer`
- 그리드 공통 sanitize 훅:
  - `GridOptions.sanitizeHtml?: UnsafeHtmlSanitizer`
- 적용 우선순위:
  1. `column.sanitizeHtml`
  2. `grid.options.sanitizeHtml`
  3. 훅이 없으면 raw HTML 렌더(명시적 opt-in 컬럼에서만)

### 3) styleNonce 옵션

- `GridOptions.styleNonce?: string`를 public option으로 추가했다.
- 현재 core는 동적 `<style>` 태그 주입이 없으므로 nonce는 미래 확장(플러그인/동적 스타일 주입 경로)용으로 예약한다.

### 4) editCommit 감사 payload 표준화

- `editCommit` payload는 `EditCommitEventPayload`로 표준화한다.
- 필드:
  - `rowIndex`, `dataIndex`, `rowKey`
  - `columnId`, `previousValue`, `value`
  - `source: 'editor' | 'clipboard' | 'fillHandle' | 'undo' | 'redo'`
  - `commitId`, `timestampMs`, `timestamp`
  - `rowCount`, `cellCount`, `changes[]`
- 엔터프라이즈 감사 훅:
  - `GridOptions.onAuditLog?: EditCommitAuditLogger`
  - payload: `EditCommitAuditPayload` (`eventName: 'editCommit'`, `changeIndex?` 포함)

## 테스트

- unit (`packages/grid-core/test/grid.spec.ts`)
  - 기본 text cell은 literal text 유지
  - `unsafeHtml` + sanitize 훅 적용 시 HTML 렌더/유해 태그 제거 검증
  - `editCommit` 표준 payload/`onAuditLog` payload 검증
- e2e (`scripts/run-e2e.mjs`)
  - `example41.html` 추가:
    - sanitize on/off 토글 시 unsafe img 노드 제거/복원 검증
- CSP smoke (`scripts/csp-smoke-test.mjs`)
  - strict CSP + no-inline-script 검증
