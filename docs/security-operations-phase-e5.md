# Phase E5 - Security Operations and Audit

## 목표

- 감사(audit) payload를 버전 고정된 운영 계약으로 만든다.
- 보안 incident 대응 시 어떤 지점을 로그로 남겨야 하는지 정리한다.
- 개인정보/민감정보가 audit/log sink에 raw로 남지 않도록 masking 가이드를 고정한다.

## Audit Payload Contract

- `GridOptions.onAuditLog` payload는 `EditCommitAuditPayload`다.
- 현재 schema는 `schemaVersion = 1`로 고정한다.
- core export:
  - `EDIT_COMMIT_AUDIT_SCHEMA_VERSION`
- payload 주요 필드:
  - `schemaVersion`
  - `eventName`
  - `rowKey`, `columnId`
  - `source`, `transactionId`, `rootTransactionId`
  - `transactionKind`, `transactionStep`
  - `timestampMs`, `timestamp`
  - `rowCount`, `cellCount`, `changes[]`
  - `changeIndex?`

## Incident 대응 로그 포인트

운영 환경에서는 아래 지점을 app-owned logger/SIEM으로 보낸다.

1. Boot / policy snapshot
- `htmlRendering.unsafeHtmlPolicy`
- `trustedTypesPolicyName` 사용 여부
- sanitizer 등록 여부
- `allowRaw` 사용 여부
- 주의: nonce/token/header 값 자체는 로그에 남기지 않는다.

2. Audit hook (`onAuditLog`)
- 편집/clipboard/fillHandle/undo/redo의 실제 데이터 변경 기록
- `schemaVersion`과 transaction metadata를 항상 같이 보낸다.

3. Save / discard / conflict path
- built-in action bar save 실패
- remote provider pending error / block retry
- distributed conflict merge는 future 범위지만, 실패/재시도는 현재도 운영 로그 포인트로 본다.

4. Security verification gates
- `pnpm test:security`
- `pnpm test:deps`
- `pnpm test:security:fuzz`
- CI에서 실패 시 배포 차단 신호로 사용한다.

## Masking Guide

core는 도메인별 민감정보를 알 수 없으므로 값을 자동 masking하지 않는다. audit/log consumer가 반드시 field policy를 가진다.

### 기본 원칙

- `value`, `previousValue`, `changes[]`를 raw로 외부 로그에 남기지 않는다.
- `rowKey`가 고객번호/이메일 등 식별자라면 그대로 쓰지 말고 hash/opaque key로 변환한다.
- 서버 응답 body, clipboard payload, import cell value를 에러 로그에 그대로 넣지 않는다.

### 권장 전략

1. allow-list column masking
- `email`: local-part 일부만 노출
- `phone`: 뒤 2~4자리만 노출
- `nationalId/account/card`: 마지막 2~4자리만 노출하거나 전부 `***`
- 자유 텍스트 메모: 길이만 남기고 본문 제거

2. structured log
- `schemaVersion`, `eventName`, `columnId`, `rowKeyHash`, `transactionId`, `transactionStep`
- `valueMasked`, `previousValueMasked`
- `cellCount`, `changeIndex`

3. environment separation
- 개발 콘솔과 운영 SIEM의 masking 정책을 분리하지 않는다.
- 운영에서 stricter policy를 쓰더라도 개발에서 raw payload를 남기지 않는다.

## Example

- [example91.html](../examples/example91.html)
  - `onAuditLog` consumer에서 `schemaVersion`을 읽고
  - `email`/`phone` 값을 masked summary로만 렌더한다.

## Current Limits

- core는 domain-specific PII classifier를 제공하지 않는다.
- `onAuditLog`는 edit transaction payload만 다루며, app server request/response audit는 범위 밖이다.
- strict Trusted Types default-on과 nonce-backed dynamic style path는 여전히 future 범위다.
