# Phase E5 - Security Verification

## 목표

- 보안 정책을 문서만이 아니라 자동 검증으로 고정한다.
- XSS / CSP / dependency / import-paste 회귀를 CI에서 잡는다.

## E5.3 범위

### 1) Static scan 확대

- `scripts/security-scan.mjs`
- 기존 금지:
  - `eval`
  - `new Function`
  - string timer
- E5.3 추가:
  - `dangerouslySetInnerHTML`
  - `innerHTML` assignment
  - `outerHTML` assignment
  - `insertAdjacentHTML`
  - `createContextualFragment`
- 정책:
  - production source의 HTML sink는 기본 금지
  - 현재 allowlist는 [dom-renderer-cell-binding.ts](../packages/grid-core/src/render/dom-renderer-cell-binding.ts) 1곳뿐이다.

### 2) Dependency scan 도입

- `scripts/dependency-scan.mjs`
- 실행:
  - `pnpm audit --json --prod --audit-level high --ignore-registry-errors`
- 규칙:
  - high / critical advisory는 기본 fail
  - 예외는 [dependency-allowlist.json](../tests/fixtures/security/dependency-allowlist.json)에 명시해야 한다.

### 3) XSS regression fixture 확대

- unit:
  - `unsafeHtml` strict fallback
  - `unsafeHtml` sanitizer path
  - legacy `allowRaw`
  - TT opt-in
  - clipboard malicious-looking TSV sanitize/parse regression
- browser smoke:
  - [example34.html](../examples/example34.html)
  - [example41.html](../examples/example41.html)
  - [example89.html](../examples/example89.html)
  - [example90.html](../examples/example90.html)

### 4) Clipboard / paste / import fuzz

- `scripts/security-fuzz.mjs`
- clipboard fuzz:
  - example34에 malicious-looking payload 여러 개를 paste
  - HTML node 미주입 / page error 0 확인
- import fuzz:
  - excel plugin import에 workbook fixture를 직접 주입
  - `<script>`, `javascript:`, `__proto__` header를 섞어도
    - literal value로 유지되고
    - prototype pollution이 생기지 않는지 확인

## 현재 예외

- `xlsx` high advisory 2건은 npm에 patched release가 없어 allowlist 처리했다.
- 이 예외는 temporary risk로 보고 [enterprise-known-limitations.md](./enterprise-known-limitations.md)에 남긴다.

## 운영 원칙

- 새 HTML sink가 필요하면:
  1. secure-by-default 정책 설명
  2. static scan allowlist 변경
  3. XSS regression fixture 추가
  4. docs/checklist 반영
  를 같이 해야 한다.
