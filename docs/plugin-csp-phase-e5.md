# Phase E5 - Plugin CSP Rules

## 목표

- core, adapter, plugin이 같은 보안 규칙을 따르도록 고정한다.
- strict CSP / Trusted Types 환경에서 plugin이 core 보안 경계를 깨지 않게 한다.

## 현재 상태

- 현재 저장소 기준 plugin package는 `packages/grid-plugins/excel` 하나다.
- 현재 plugin code에는 다음 경로가 없다.
  - `innerHTML`
  - `insertAdjacentHTML`
  - 동적 `<style>` 주입
  - `eval`, `new Function`, string timer

## Plugin 규칙

1. HTML sink
- plugin은 `innerHTML`, `outerHTML`, `insertAdjacentHTML`를 직접 사용하지 않는다.
- HTML이 꼭 필요하면 core의 `unsafeHtml` + sanitizer + `htmlRendering` 정책을 통해서만 렌더한다.
- strict Trusted Types 페이지에서 plugin이 HTML sink를 열어야 하면, app이 소유한 `trustedTypesPolicyName`을 사용해야 한다.

2. Script / code generation
- `eval`, `new Function`, `setTimeout("...")`, `setInterval("...")` 금지.
- 동적 script tag 삽입 금지.

3. Style 주입
- plugin은 기본적으로 class + CSS variable만 사용한다.
- 동적 `<style>` 태그가 꼭 필요하면:
  - app이 전달한 `GridOptions.styleNonce`를 전달받아 `nonce`를 설정해야 한다.
  - nonce가 없으면 style injection path를 열지 않는다.
- E5.2 기준 core/plugin에는 실제 style injection 경로가 없으므로 `styleNonce`는 reserved 상태다.

4. Clipboard / import / export
- plugin은 `text/html` paste payload를 신뢰하지 않는다.
- import preview / diff review UI를 future plugin으로 추가하더라도 raw HTML sink를 열지 않는다.

5. Adapter 경계
- React/Vue adapter는 plugin이 브라우저 DOM sink에 직접 접근하도록 우회 경로를 만들지 않는다.
- adapter는 core public API만 사용한다.

## 운영 원칙

- plugin PR은 CSP 관점에서 다음을 같이 검토한다.
  - new HTML sink 여부
  - dynamic style/script 주입 여부
  - nonce / Trusted Types 필요 여부
  - security scan 회귀 여부
