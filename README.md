# 국가유산 기상관측판 — 지도 기반 프로토타입

야외 국가유산의 재질별 기상 취약도를 지도 위에서 관측하는 웹앱. 계산 로직(재질별 가중치, 점수 공식,
4단계 경보 매핑, 권장조치 문구)은 [legacy/heritage-weather-watch.html](legacy/heritage-weather-watch.html)
프로토타입에서 그대로 이식했다.

## 폴더 구조

- `legacy/` — 원본 목록형 프로토타입 (계산 로직 원본 참조용, 보존)
- `frontend/` — Vite + React + TypeScript + Leaflet 지도 앱
  - `src/domain/` — 이식된 계산 로직 (`scoring.ts`, `advice.ts`, `constants.ts`) — 실시간/시뮬레이션 모드 공용, 수정 없음
  - `src/data/sites.mock.ts` — 예시 유산 16곳. 카탈로그(`/api/sites`)를 못 받았을 때의 대체 데이터이자 `build-sites.mjs`가 regionTag 등을 읽는 원본
  - `src/hooks/useSiteCatalog.ts`, `useHeritageData.ts` — 앱 시작 시 `/api/sites`(유산 1,617곳)를 1회 받아 시나리오·실시간 모드가 함께 쓴다
  - `src/hooks/useLiveWeather.ts` — 백엔드 `/api/live` 폴링(5분 주기) 훅
  - `src/components/` — MapView, ClusterLayer(leaflet.markercluster), SidePanel, ScenarioControls, ModeToggle, LiveStatusBar, SummaryPanel
- `backend/` — Node.js/Express, 공공데이터 프록시·캐시 서버
  - `src/domain/grid.ts` — 기상청 LCC 위경도→격자(nx,ny) 변환
  - `src/data/heritageSites.generated.ts` — 유산 1,617곳 카탈로그(자동 생성, `scripts/heritage/build-sites.mjs`)
  - `src/liveRegions.ts` — 시군구 191곳과 시군구별 대표 격자·산불 코드
  - `src/services/kmaClient.ts` — 기상청 초단기실황(`getUltraSrtNcst`) 호출 + 발표 시각 기준 캐시(최대 1시간), 일일 호출 상한
  - `src/services/forestFireClient.ts` — 국립산림과학원 산불위험예보(시군구) 호출 + 30분 캐시
  - `src/services/warningClient.ts` — 기상청 API허브 특보 조회 + 시군구↔특보 구역 매칭
  - `src/routes/live.ts`, `sites.ts` — `GET /api/live`(시군구별 weather+fireIdx+특보), `GET /api/sites`(유산 카탈로그)
- `docs/` — API 필드 매핑 메모

## 현재 진행 상태

**Phase 1 (mock 지도 UI)** 및 **Phase 2 (실시간 데이터 연동)** 완료.

- 시나리오 시뮬레이션 모드: mock 프리셋/슬라이더 기반 (Phase 1)
- 실시간 관측 모드: 기상청 초단기실황 + 국립산림과학원 산불위험예보 실제 API 연동 (Phase 2)
- 두 모드 모두 상단 토글로 전환, 동일한 `domain/scoring.ts` 계산 로직 사용

## 실행 방법

두 서버를 각각 다른 터미널에서 실행한다 (프런트는 `/api`를 백엔드로 프록시).

```bash
cd backend
npm install
npm run dev
```

```bash
cd frontend
npm install
npm run dev
```

`.env`(레포 루트)에 `KMA_API_KEY`, `FOREST_FIRE_API_KEY`를 채워야 실시간 모드가 동작한다. `.env.example` 참고.

## 실시간 데이터 연동 메모

- **기상청**: `VilageFcstInfoService_2.0/getUltraSrtNcst` (초단기실황). 매시 40분 발표, 배포 지연을 감안해
  45분 이전 요청 시 이전 시각 값을 사용한다. `RN1`(강수)·`T1H`(기온)·`WSD`(풍속)·`REH`(습도)를 사용.
- **국립산림과학원 산불위험예보**: `forestPointV2/forestPointListSigunguSearchV2` (시·군·구 단위,
  `localAreas`에 5자리 시군구코드를 콤마로 여러 개 묶어 한 번에 조회 가능). 응답의 `meanavg`(0~100)를
  낮음(≤50)/다소높음(51~65)/높음(66~85)/매우높음(86~) 4등급으로 변환해 `fireIdx`(1~4)에 매핑한다.
  - 주의: 시군구 코드는 최신 행정구역 개편을 반영해야 한다 — 전북특별자치도 출범으로 익산시는
    `52140`(구 `45xxx` 아님), 전남·광주 통합특별시 출범으로 화순군은 `12760`(구 `46xxx` 아님)이다.
    두 값 모두 실제 API 호출로 검증했다. 나머지 지역 코드도 향후 행정구역 개편 시 재검증이 필요하다.
- 두 API 모두 서버(`backend/`)에서만 키를 사용하며, `/api/live` 응답에는 원본 키나 요청 URL이 노출되지
  않는다. 시군구 하나의 기상/산불 데이터 조회가 실패해도 그 시군구만 `null`("데이터 없음")로 표시되고
  나머지 응답에는 영향이 없다.
- **시군구 대표 격자**: 유산 1,617곳이 쓰는 기상청 5km 격자는 741개인데 초단기실황 일일 호출 한도가 10,000건이라
  (741×24=17,784건/일) 전부 조회할 수 없다. 그래서 시군구 191곳마다 대표 격자 1개(유산이 가장 많이 속한 격자, 겹치는
  것을 빼면 186개)만 조회하고 같은 시군구의 유산들이 그 값을 공유한다. 응답(`regions`)의 키는 시군구 5자리 코드이고,
  유산은 카탈로그의 `sigunguCode`로 자기 시군구 값을 찾는다.
- **산불 코드**: 카탈로그 시군구코드는 산불 API 코드와 같은 체계지만 여주시(41730)·청주시(43710)·당진시(44830)·
  창원시(48110)는 API에서 각각 41670·43110·44270·48120으로 조회해야 한다(`liveRegions.ts`의 별칭).
- **기상 결측**: 관측값이 없는 격자는 `-999`류 값이 내려온다. 이를 "데이터 없음"으로 다루고 가까운 대체 격자를 시도한다.
- **호출량 보호**: 격자 캐시는 발표 시각(매시)이 바뀔 때만 새로 조회하고, 하루 호출 수가 `KMA_DAILY_CALL_LIMIT`(기본 9,000)에
  닿으면 조회를 멈춘다. `/api/live`는 CDN에서 10분 공유 캐시(`s-maxage=600`)를 쓴다(배포 환경 동작은 미검증).

## 알려진 한계

- **서울 특보 권역**: 서울 특보는 4개 권역(동남·동북·서남·서북)으로 나뉘는데 구→권역 매핑이 없어, 어느 권역의 특보든 서울의
  모든 구가 받는다. 특보가 일부 권역에만 걸리는 날에는 다른 권역의 구(예: 종로구 71곳)에 과다하게 표시될 수 있다.
  다른 광역시의 동부/서부 권역도 마찬가지다. (`backend/src/services/warningClient.ts` 주석 참고, 의도적으로 미해결)
- **시군구 공유 날씨**: 대표 격자에서 먼 유산은 자기 격자와 다른 값을 받는다(전체의 약 56%, 중앙값 3.4km·최대 51km 차이).
- **시군구가 없는 유산 1건**(포항 여강이씨 달전재사)은 실시간 값을 찾을 수 없어 "데이터 없음"으로 표시된다.

## 다음 단계

1. 국가유산청 공간정보 Open API 연동(현재 mock 좌표/재질을 대체)
2. 배포 시 프런트 정적 파일을 백엔드에서 함께 서빙하거나 리버스 프록시 구성
