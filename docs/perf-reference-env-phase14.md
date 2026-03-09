# Phase 14.1 - Reference Devices/Browsers (Internal Baseline)

## 목적

성능 벤치 결과의 변동성을 줄이기 위해, HGrid 내부 기준 환경(디바이스/OS/브라우저)과 측정 절차를 고정한다.

## 기준 환경 (2026-03-09 확정)

### Primary Baseline (macOS)

- Device: MacBook Air M1 (8-core CPU)
- Memory: 16GB
- OS: macOS 14+
- Browser: Chrome Stable (latest major), headless/headed 모두 측정 가능
- Display: 기본 해상도(Scaled default)
- Power: 전원 연결 상태, 저전력 모드 해제

### Secondary Baseline (Windows)

- Device: Intel Core i5-12400 급 이상
- Memory: 16GB
- OS: Windows 11 23H2+
- Browser: Chrome Stable (latest major)
- Display: 1920x1080
- Power: 전원 연결 상태, 절전 모드 해제

## 실행 프로토콜

1. 브라우저/OS 업데이트 완료 후 재부팅
2. 백그라운드 고부하 앱 종료
3. `pnpm build` 후 벤치 실행
4. 각 시나리오 3회 측정, median을 대표값으로 사용
5. 이상치(일시적 long-task) 발생 시 1회 재측정 허용

## 벤치 데이터 생성 규칙

- 데이터셋은 결정적 생성(deterministic)을 사용한다.
- 동일한 `rows`/`seed` 인자면 항상 동일한 데이터를 만든다.
- 생성 스크립트:
  - `node scripts/generate-bench-data.mjs --rows 20000 --seed 20260309 --out /tmp/hgrid-bench-20k.json`

## 기본 명령

- 데이터 생성: `pnpm bench:data`
- 성능 스모크: `pnpm bench`

## 비고

- 14.1은 기준 정의 단계이며, 게이트 임계치 확정은 14.3에서 진행한다.
- 시나리오 확장은 14.2에서 별도 관리한다.
